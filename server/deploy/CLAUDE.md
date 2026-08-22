# `server/deploy` — what we already know

Five Node scripts, run by the systemd units beside them: `backup.ts`
(x-loc-backup.timer), `restore.ts`, `vacuum.ts` and `update.ts` (by hand, as
root), `alert.ts` (OnFailure= and the weekly heartbeat). Operator docs are in
[`../README.md`](../README.md) — "Backups", "Restore", "Compacting the database",
"Operating", "Alerting". This file is what a change here can quietly break.

`lib.ts` is shared plumbing only: env loading, `sqlite`, `inspect`, `uid`, stamps,
sizes, `moveAside`, `guardSwap`, healthz polling. Policy stays in the scripts.

## Four things that look incidental and are not

- **Node, so `backup.ts` can import `VOTE_RETENTION_MS`** from `../src/index.ts`.
  Its verification baseline is only correct while that number and the retention
  pass agree, and a shell script can only restate it.
- **SQLite through the `sqlite3` CLI, not better-sqlite3.** A Node major upgrade
  without a rebuild takes the native module down — the exact outage where backups
  and restores still have to work. `alert.ts` avoids SQLite entirely for the same
  reason.
- **`systemctl`, `sudo`, `chown`, `mv`, `curl`, `flock`, `id` are spawned.** Each
  is a privileged step the tests put a PATH stub in front of. `renameSync`
  instead of `mv` makes the swap-fails rollback untestable; `process.getuid()`
  instead of `id` makes every root path unreachable from a test.
- **`#!/usr/bin/env -S node --experimental-strip-types` plus mode 755.** Both
  `ExecStart=` and `docker exec /app/deploy/backup.ts` invoke the file directly.
  `backup.ts` imports `lib.ts`, so the image has to copy both.

## `update.ts` is the only script that reads the unit files

The units live in git and run from `/etc/systemd/system`, so a pull that changes
an `ExecStart=` changes nothing until they are copied and systemd is reloaded —
which is how a `.sh` → `.ts` rename became `status=203/EXEC` on a timer that
only fires at 23:30. `update.ts` copies **only units this box already has**, by
name, and reports the rest: `x-loc-heartbeat` and `x-loc-alert@` are opt-in and
need `/etc/x-loc-alert.env`.

Two other things it holds:

- The ABI probe runs on **every** pass, not only when `package.json` moved. A
  Node major upgrade breaks better-sqlite3 without touching the repo, and the
  failure surfaces at startup as ERR*DLOPEN_FAILED. `/usr/bin/node` is named
  explicitly (`XLOC_NODE`) because it is what `ExecStart=` names — the module
  has to load under \_that* interpreter, not the shell's.
- A failed `/healthz` resets the tree to the commit the run started from, syncs
  the units and restarts again. Only then does it exit 1, and it says which of
  the two versions is serving. Rolling back the source without the units would
  leave the box on a mismatched pair.

## The two "is this copy short" baselines differ

Retention deletes profiles ([`../src/index.ts`](../src/index.ts) `scheduled()`),
so `profiles` shrinks on its own and the two scripts cannot check a copy the same
way.

| Script      | Baseline                                                  | Why                                                                                                              |
| ----------- | --------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `backup.ts` | profiles with a vote inside `VOTE_RETENTION_MS`           | The service is up; retention can run mid-copy and legitimately take rows. This counts only what it cannot touch. |
| `vacuum.ts` | `COUNT(*) FROM profiles`, read **after** `systemctl stop` | Nothing can change it, so any shortfall is a bad rebuild.                                                        |

A plain `COUNT(*)` in `backup.ts` false-alarms whenever a retention pass lands
inside the ~0.6 s copy: verification fails, the archive is thrown away, an alert
fires and an evidence copy is kept — for a good backup.

## What each script refuses to do

**`backup.ts`** runs snapshot → verify → compress → check the source → prune, and prunes
**only on a clean run**, so neither a corrupt source nor a bad snapshot can age out the
archives you are about to need. It keeps ONE compressed corruption-evidence copy, not one
per night — whatever lands there is usually permanent, and it shares a disk with the live
database.

- **`VACUUM INTO`, not the `.backup` API.** `.backup` restarts whenever another connection
  writes, so it never converges under load: 236 MB, 0.2 s idle against 58 s at 10
  writes/s, versus a flat 0.6 s here. It also rebuilds, so the file lands compacted with
  no WAL flag to carry into a restore. Cost: one deferred checkpoint.
- **`integrity_check`, not `quick_check`, and on the source as well as the copy.** Neither
  subsumes the other: `VACUUM INTO` repacks free-page faults away in the copy while
  leaving them in the source, and an index out of sync with its table crosses over
  verbatim (measured on sqlite 3.37 and 3.53). ~1.2 s per 236 MB, in its own process,
  after the snapshot is stored — a copy of a failing database is worth having.
- The snapshot _is_ the database rebuilt, so the gap between the two file sizes is what a
  VACUUM would hand back: measured, free, and written to a plain text file the heartbeat
  reads without opening SQLite.

**`vacuum.ts`** is never on a timer. Retention frees pages exactly where new votes land,
so the file plateaus on its own; real free pages come from one-offs (a shortened window, a
tightened cap, a peak that did not return). It rebuilds into a new file and swaps, so the
result is verified before anything is replaced and the original stays as
`*.replaced-<stamp>`. The service is stopped for the whole rebuild on purpose — a live
snapshot would silently drop every contribution arriving before the swap, where a client
that cannot reach the server keeps its votes. It is also the one script that can fill the
disk the server writes to.

**`restore.ts`** verifies the archive _before_ stopping the service, so a bad one costs no
downtime.

**The swap rollback** in `lib.ts` covers a window one `mv` wide: dying between moving the
old database aside and the new one in leaves no database at all, and a restart there has
SQLite create an empty one and answer from it. The original goes back first, and the
service is restarted whatever happened. Moves take `-wal`/`-shm` along, or SQLite replays
a stale WAL over the file that replaced it.

**`alert.ts`** has two modes, both from systemd: `alert.ts <unit>` from `OnFailure=`
(catching what `backup.ts` cannot report about itself — an OOM kill, a missing
interpreter, a timeout), and `alert.ts --report`, the weekly heartbeat whose _absence_ is
the signal, since a failure alert can only fire if something ran. Unconfigured is not an
error: it logs and exits 0, so a deployment wanting no email does not collect a failed
unit every week. It matches archives by their exact stamped name — a looser `.db.gz` would
count `corrupt-evidence.db.gz` as a healthy archive, which is precisely backwards — and
mentions reclaimable disk only when the backups themselves are fine.

`DATA_FAULT_MESSAGES` in `alert.ts` are strings `backup.ts` prints when the _data_ is at
fault rather than the run; `alert.test.ts` holds them to the source. Renaming one without
the other downgrades a corruption alert to a generic failure, which is the difference
between "look now" and "look later".

## Testing

`pnpm test:deploy` only ([`vitest.deploy.config.ts`](../vitest.deploy.config.ts)) —
not `pnpm test`, not CI. It shells the real scripts against real databases and
needs `sqlite3`, `gzip` and `flock`; it skips itself when they are missing.

`update.test.ts` runs the script against a real two-repository git clone with a
throwaway unit directory (`XLOC_UNIT_DIR`) and a stub interpreter (`XLOC_NODE`),
so the rollback path is exercised for real rather than asserted about.

`helpers.test.ts` is the other half: the exported pure functions (`parseKeep`,
`archivesToPrune`, `isOrphan`, `snapshotIsGood`, `parseArgs`,
`availableArchives`, and lib.ts's arithmetic and env loader) with no processes
and no service. It says what a decision _is_; `backup.test.ts` says what a run
does.

Stubs are executable shims on PATH (`stubs()` in `backup.test.ts`). The load-bearing
ones: `id: echo 0` to reach the root paths, `sudo: shift 2; exec "$@"` to pass
through, `sqlite3` wrappers that intercept one query and `exec` the real binary for
the rest, and `mv` failing only on the swap's source name.

What the suite pins, and what breaking it would cost: pruning never runs on a
failed verify; the evidence file is one copy however many nights fail, and never
counts as an archive; a `/healthz` that never answers exits 1 instead of reporting
success; and both swap scripts put the original database back and restart the
service if the one `mv` fails.
