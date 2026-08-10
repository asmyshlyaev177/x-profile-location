# Shared location cache

A tiny, crowdsourced cache for X profile **locations**, backing the
[X Profile Location](../) extension. It runs on either of two backends from one
set of request handlers:

| Backend                       | Entry point                      | When                                                                   |
| ----------------------------- | -------------------------------- | ---------------------------------------------------------------------- |
| **Cloudflare Worker + D1**    | `wrangler.toml` → `src/index.ts` | Default. $0, no ops, but the free plan's 100k rows written/day caps it |
| **Node + SQLite** (self-host) | `src/node-server.ts`             | Past that ceiling, or to own the data. Runs on a 1 vCPU / 1 GB VPS     |

The second row has two deploy shapes for the same code — a systemd unit
([Deploy: Node + SQLite on a VPS](#deploy-node--sqlite-on-a-vps)) or a container
([Deploy: Docker](#deploy-docker)). Pick either; they differ only in packaging.

[`src/index.ts`](src/index.ts) is shared verbatim: it reaches the database only
through the small interface in [`src/db-types.ts`](src/db-types.ts), which D1
and the better-sqlite3 adapter in [`src/sqlite.ts`](src/sqlite.ts) both satisfy.
Keep it that way — no Worker globals, no `node:` imports in that file.

## What it does (and doesn't)

The server **never talks to X**. Clients fetch a profile's location from X's own
`AboutAccountQuery` (rate-limited, on hover) and contribute the result here.
Other clients query the cache first and skip the X call when the location is
already known — which is what keeps everyone under X's rate limit.

Only the three fields that cost a rate-limited X call are stored:

- `location` (e.g. `JP`, `EUR`, or `null`)
- `source` (e.g. `Japan Android App`, or `null`)
- `locationAccurate` (X's "may be inaccurate" flag)

**Bio and display name are deliberately not stored** — clients already get those
for free from the timeline JSON, so there is nothing to share.

## Anti-poisoning: consensus

Anyone can POST a fake location. The endpoint and its body shape are documented
below, so this section is written to be useful to someone deciding whether to
trust the cache — including where it does not currently protect you.

Each install sends an anonymous random `clientId`. The `location_votes` table
keeps one (latest) vote per client per username, so a single client cannot stuff
votes for a handle; `location_confidence` is the number of distinct clients
backing the winning `(location, source, accurate)` tuple. Because the data comes
from X's own API, honest clients all report an identical tuple. See
[`src/consensus.ts`](src/consensus.ts).

Clients then decide how much agreement to require before believing a value.
**That threshold currently ships at 1, not 2** — i.e. a single unverified report
is served and used. This is a deliberate trade, and the numbers are the reason:
confidence only accrues when two installs independently look up the same handle,
and at the current user count feeds barely overlap. Measured on the live server
on 2026-07-27, **52 of 4242 profiles had reached 2**. Requiring two votes today
would discard about 99% of what the cache can answer — and the cache exists to
spare X's 50-lookups-per-15-minutes budget, so a threshold that empties it costs
users more than it protects them.

It is a stored setting (`sharedCacheMinConfidence`), not a compiled-in constant,
so it can be raised on one install and measured without shipping a build to
everyone. The extension exposes it under Advanced (open the options page as
`options.html?advanced=1`). Re-run the query below and raise the default once
the second figure is a majority of the first:

```sh
sqlite3 /var/lib/x-loc-cache/x-loc-cache.db \
  'SELECT COUNT(*) AS profiles, SUM(location_confidence >= 2) AS ready FROM profiles;'
```

Votes are also **capped per username** (`VOTE_CAP`, 10, pruned once a handle
exceeds 15). Without it `location_votes` grows as _users × profiles each user
sees_ — the only superlinear term in the system, and the first thing that
exhausts a small disk. The cap makes it _distinct profiles × 10_, flat in user
count. Eviction is oldest-first, so the surviving window is the most recent
observers and a relocation can propagate instead of being outvoted by stale
data. The trade-off is that poisoning gets cheaper: forged clients only have to
fill the window rather than out-number every honest vote ever cast.

### Contribution budget

What actually bounds an honest client is X, not this server: an install gets
~50 `AboutAccountQuery` lookups per 15 minutes, so it physically cannot report
many distinct handles. A poisoner skips that step, which is what makes the two
paragraphs above weaker than they look.

[`src/contrib-limit.ts`](src/contrib-limit.ts) caps how many **distinct handles**
one `clientId` may contribute per 15-minute window (200 — four times what X
allows an honest client). Over-budget entries are dropped silently and the
response is still `{ ok: true }`, so a poisoner gets no signal telling it when to
rotate. Re-reporting a handle the client already paid for is free, since that is
what revalidation and genuine relocations do.

This is a guardrail, not a security boundary, and it is worth being explicit
about the gap: **it does not stop an attacker who mints a fresh `clientId` per
request.** Nothing short of attestation would, and attestation is not compatible
with the privacy guarantee below. What it does is make the cost of poisoning
scale with the number of ids an attacker has to manufacture and rotate, where
today one id poisons without limit.

The budget is held in memory rather than in SQLite deliberately. Counting a
client's recent handles from `location_votes` would need an index on
`client_id`, and the measurements in [`schema.sql`](schema.sql) show why a second
index on that table is the wrong trade — slower inserts, a slower retention
pass, and a 20% larger file, to defend a guardrail. On the Node/SQLite backend
there is one process, so the count is exact; on Workers each isolate keeps its
own, which weakens it but does not break it.

## API

All endpoints are CORS-open and take/return JSON; no credentials.

| Method + path        | Body                             | Response                 |
| -------------------- | -------------------------------- | ------------------------ |
| `POST /v1/loc/batch` | `{ usernames: string[] }` (≤100) | `{ profiles: Served[] }` |
| `POST /v1/loc`       | `{ clientId, entries: Vote[] }`  | `{ ok: true }`           |
| `GET /v1/stats`      | —                                | `{ profiles: number }`   |
| `GET /healthz`       | —                                | `ok` (Node backend only) |

```ts
// Vote (contribution) — sent only after a real AboutAccountQuery
{ u: string; loc: string | null; src: string | null; acc: boolean }
// Served — compact so batches stay small
{ u: string; loc: string | null; src: string | null; acc: boolean; conf: number; rev?: boolean }
```

`rev: true` is a stochastic (~5%) hint asking the client to re-verify against X,
so relocations propagate without every client hammering the API.

`GET /v1/stats` is how many accounts the cache can answer for — the extension's
toolbar popup shows it, and asks again every 30s for as long as that popup is
open. It is the only endpoint whose traffic tracks popups rather than reading,
so it is the only one shaped against a crowd all asking the same question:

- The count is memoised for 60s (`STATS_TTL_MS`), so the database is asked once
  a minute however many clients turn up.
- The response carries `Cache-Control: public, max-age=60`, which is what keeps
  most of those repeats inside the browser. On the Worker backend this is the
  part that matters: module state is per isolate, so the memo alone does not
  bound it to one query per window, and an unfiltered `COUNT(*)` reads every
  row of `profiles` against D1's 5M rows/day.
- The query is a bare `COUNT(*)`, not `WHERE location_confidence > 0`, though
  it is the latter that `/v1/loc/batch` serves. They are the same number —
  `pickConsensus` never returns a confidence below 1, so no row is written
  below it — and the filtered form cannot use the `username` index: 5.3ms
  against 0.05ms over 200k rows, which better-sqlite3 makes an event-loop stall
  rather than a slow query. Do not add an index to "fix" that; see
  [Indexes](#indexes-dont-add-any).

It counts as its own line (`statsReads`) in the daily stats, so `other` still
means what it did: scanners.

## Pointing the extension at a backend

Which backend a build talks to is a build-time variable
([`../src/scripts/constants.ts`](../src/scripts/constants.ts)), never a source
edit:

```bash
pnpm build         # self-hosted Node+SQLite  (the default)
pnpm build:worker  # the Cloudflare Worker
pnpm build:nocache # shared cache compiled out entirely
VITE_CACHE_API_BASE=https://xloc.example.com pnpm build   # any other server
```

The default is the self-hosted deployment; D1's free plan caps out around 150
users on rows-written/day, which is the ceiling that motivated the move. The
Worker path stays supported and one command away.

The nocache case is reachable on purpose: the fallback only applies to an
_unset_ `VITE_CACHE_API_BASE`, so an explicitly empty value ships a build that
never contacts any server and hides the options-page toggle.

---

## Deploy: Cloudflare Worker + D1

```bash
cd server
pnpm install
pnpm db:create          # prints database_id -> paste into wrangler.toml
pnpm db:init            # applies schema.sql to remote D1
pnpm deploy             # prints the Worker URL
```

Free tiers: Workers 100k req/day, D1 5 GB storage, 5M rows read/day, **100k rows
written/day**. That last one is the binding constraint — measured at ~670 rows
written per user per day, it caps out around **150 users**. Workers paid is
$5/mo and lifts it to 50M rows written/month.

---

## Deploy: Node + SQLite on a VPS

Sized for the smallest boxes: one process, one file, no build step. Storage is
the first ceiling and lands around **10k users** with the vote cap in place;
1 TB/month of bandwidth covers roughly 50k. (Prefer a container? Skip to
[Deploy: Docker](#deploy-docker) — steps 1, 2 and 7 still apply.)

**Requirements:** Node **≥ 22.6** and a domain pointed at the box. The server
runs its TypeScript sources directly — nothing to compile, nothing to bundle —
via `--experimental-strip-types`, which the unit file passes unconditionally. The
flag is _required_ on 22.6–22.17 and _accepted and silent_ on 22.18+ and 24+,
where stripping is already the default. Verified on 22.12.0 and 24.10.0.

The walkthrough below is written against **Vultr + Ubuntu 22.04**, but only steps
1 and 2 are provider-specific. Each step ends with something to verify before
moving on.

### 1. DNS (first — it needs to propagate)

Point a subdomain at the instance. Use a subdomain rather than the apex if
anything already serves the domain:

```text
A    xloc    <your.vps.ip>    TTL 300
```

```bash
dig +short xloc.example.com    # must return the VPS IP before step 6
```

### 2. Firewall

Vultr has a firewall layer _above_ the OS that `ufw` cannot see. In the panel
under **Products → Firewall**, check whether a Firewall Group is attached to the
instance; if one is, it must allow inbound TCP 22, 80 and 443. If none is
attached, that layer is fully open and only `ufw` matters:

```bash
sudo ufw status
sudo ufw allow 80/tcp && sudo ufw allow 443/tcp    # only if ufw is active
```

Never open 8787 — the Node server binds to loopback and is reached only through
the reverse proxy.

### 3. Swap

Vultr instances ship with none, and 1 GB of RAM plus a 256 MB SQLite page cache
is close enough to the edge that a spike becomes an OOM kill rather than a
slowdown:

```bash
sudo fallocate -l 2G /swapfile && sudo chmod 600 /swapfile
sudo mkswap /swapfile && sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
echo 'vm.swappiness=10' | sudo tee /etc/sysctl.d/99-swap.conf && sudo sysctl -p /etc/sysctl.d/99-swap.conf
free -h    # a 2Gi Swap row
```

### 4. Node

Ubuntu 22.04's apt Node is far too old. Install system-wide from NodeSource —
that puts it at `/usr/bin/node`, which is what the hardened unit expects:

```bash
curl -fsSL https://deb.nodesource.com/setup_24.x | sudo -E bash -
sudo apt install -y nodejs
/usr/bin/node -v
```

> **Do not run the service off an nvm install.** It is not just the two unit-file
> edits (absolute interpreter path, `ProtectHome=read-only`) — nvm under `/root`
> is a hard blocker, because `/root` is mode 700 and the service runs as the
> unprivileged `xloc` user, which cannot traverse it at all. nvm under a normal
> `/home/<user>` can be made to work, but system-wide Node is the path of least
> resistance and keeps the hardening intact. Keep nvm for your interactive shell
> if you like; the unit ignores `$PATH` entirely.
>
> **Native module ABI.** `better-sqlite3` compiles against one Node ABI, so
> `npm install` must run under the **same** Node that `ExecStart` names, and any
> Node **major** upgrade means reinstalling it (22 → 24 moves
> `NODE_MODULE_VERSION` 127 → 137). Skipping that gives `ERR_DLOPEN_FAILED` at
> startup. Patch and minor upgrades within a major are safe.

### 5. Code and dependencies

**Private repo?** Give the box a read-only **deploy key** rather than an account
credential — it is scoped to this one repository and revocable from the repo's
own settings:

```bash
sudo ssh-keygen -t ed25519 -C "x-loc-cache deploy" -f /root/.ssh/x-loc-deploy -N ""
# >/dev/null matters: without it, tee also prints github.com's host keys, which
# look like public keys but start with a hostname — paste one of those into
# GitHub and it answers "Key is invalid. You must supply a key in OpenSSH
# public key format".
sudo ssh-keyscan github.com | sudo tee -a /root/.ssh/known_hosts >/dev/null

sudo ssh-keygen -l -f /root/.ssh/x-loc-deploy.pub   # valid? → "256 SHA256:… (ED25519)"
sudo cat /root/.ssh/x-loc-deploy.pub                # ← paste exactly this one line
```

Paste that public key into **GitHub → the repo → Settings → Deploy keys → Add
deploy key**, and leave _Allow write access_ **unchecked**. It is a single line
beginning `ssh-ed25519 AAAAC3NzaC1lZDI1NTE5…`; if what you copied begins with
`github.com`, or with `-----BEGIN OPENSSH PRIVATE KEY-----`, or wrapped onto two
lines, that is the error. Then teach ssh to use it, under a host alias so it
can't collide with any other GitHub key on the box:

```bash
sudo tee -a /root/.ssh/config >/dev/null <<'EOF'
Host github.com-xloc
  HostName github.com
  User git
  IdentityFile /root/.ssh/x-loc-deploy
  IdentitiesOnly yes
EOF
sudo chmod 600 /root/.ssh/config
# → "Hi <owner>/<repo>! You've successfully authenticated…"; it exits 1, which is normal
sudo ssh -T git@github.com-xloc
```

Now clone and install:

```bash
sudo useradd --system --home /opt/x-loc-cache --shell /usr/sbin/nologin xloc

# Sparse + partial clone: the server only ever reads server/, while the repo also
# carries ~345 MB of Playwright HAR recordings under e2e/. A plain clone drags all
# of it onto the box and re-materialises it on every pull.
sudo git clone --filter=blob:none --sparse \
  git@github.com-xloc:asmyshlyaev177/x-profile-location.git /opt/x-loc-cache
cd /opt/x-loc-cache
sudo git sparse-checkout set server

cd server
# Explicit PATH so npm binds the native module to /usr/bin/node, whatever the
# shell's own `node` resolves to.
sudo env PATH=/usr/bin:/bin /usr/bin/npm install --omit=dev
du -sh /opt/x-loc-cache        # ~25 MB, vs ~410 MB for a full clone
```

(For a public repo, skip the key and use the `https://` URL.)

An existing full clone converts in place — no re-clone needed, though `.git`
keeps the blobs it already fetched:

```bash
cd /opt/x-loc-cache
sudo git sparse-checkout init --cone
sudo git sparse-checkout set server
```

The tree stays **root-owned on purpose** — do not `chown` it to `xloc`. A root
clone is world-readable (755/644), which is all the service needs, and it means
the service user cannot modify the code it executes, `git pull` needs no
ownership fix-ups afterwards, and the only path the service can write to is its
`StateDirectory`.

No compiler is needed — `prebuild-install` fetches a binary for the running Node
ABI (watch for `prebuild-install ... Done`). If it ever falls back to `node-gyp`,
`sudo apt install -y build-essential python3` first.

Verify the module loads under the interpreter systemd will actually use, before
systemd tries:

```bash
/usr/bin/node -e "new (require('/opt/x-loc-cache/server/node_modules/better-sqlite3'))(':memory:'); console.log('abi ok')"
```

### 6. Service

```bash
sudo cp deploy/x-loc-cache.env.example /etc/x-loc-cache.env
sudo cp deploy/x-loc-cache.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now x-loc-cache
sudo systemctl status x-loc-cache   # Active: running, plus a Memory: line
curl localhost:8787/healthz         # → ok
```

The database is created and the schema applied on first boot — `schema.sql` is
all `CREATE TABLE IF NOT EXISTS`, so there is no migration step to forget. On
failure, `sudo journalctl -u x-loc-cache -n 50` says why; it is almost always the
`ExecStart` path or `/var/lib/x-loc-cache` ownership.

A full round trip, before TLS is even involved:

```bash
curl -s -X POST localhost:8787/v1/loc -H 'content-type: application/json' \
  -d '{"clientId":"setup-test","entries":[{"u":"jack","loc":"United States","src":"web","acc":true}]}'
curl -s -X POST localhost:8787/v1/loc/batch -H 'content-type: application/json' \
  -d '{"usernames":["jack"]}'
# → {"profiles":[{"u":"jack","loc":"United States",...,"conf":1}]}
```

### 7. TLS

Confirm nothing already owns the ports — use a port filter, not a grep, since
`:80` also matches `:8080`:

```bash
sudo ss -tlnp '( sport = :80 or sport = :443 )'
```

Empty output means both are free, and Caddy can have them:

```bash
sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https curl
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' \
  | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' \
  | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt update && sudo apt install -y caddy
sudo cp deploy/Caddyfile /etc/caddy/Caddyfile    # edit the hostname first
sudo systemctl reload caddy
sudo journalctl -u caddy -n 30                   # watch the certificate issue
```

If nginx or apache already holds `:443`, don't install Caddy — add a vhost to it
instead, proxying to `127.0.0.1:8787`. It must set `X-Forwarded-For` the way
[`deploy/Caddyfile`](deploy/Caddyfile) does, or the rate limiter buckets every
user together. Caddy obtains and renews its certificate on its own.

Then, from somewhere off the box:

```bash
curl -s -X POST https://xloc.example.com/v1/loc/batch \
  -H 'content-type: application/json' -d '{"usernames":["jack"]}'
```

### 8. Point the extension at it

```bash
VITE_CACHE_API_BASE=https://xloc.example.com pnpm build
```

**Keep the Worker running.** Only new builds talk to the VPS; everyone on the
store version keeps hitting Cloudflare until they update.

### 9. Migrating the existing D1 data

Worth doing rather than starting cold — those rows are real user contributions,
and `profiles` in particular represents X API calls that were already spent. Both
backends speak SQLite, so this is an export and a replay, not a conversion.

**Export from D1.** `--no-schema` matters: first boot already created the tables,
and a dump carrying `CREATE TABLE` fails on the replay.

```bash
cd server
npx wrangler d1 export x-loc-cache --remote --no-schema --output=d1-data.sql
head -5 d1-data.sql          # sanity check: INSERT INTO statements, no DDL
grep -c '^INSERT' d1-data.sql
```

Note the row counts you are starting from, so the import can be checked against
them:

```bash
npx wrangler d1 execute x-loc-cache --remote --command \
  "SELECT (SELECT COUNT(*) FROM profiles) AS profiles, (SELECT COUNT(*) FROM location_votes) AS votes"
```

**Replay onto the VPS.** `sqlite3` may not be installed; it is worth having
anyway for the operating commands below.

```bash
scp d1-data.sql root@<vps>:/tmp/
# on the VPS
sudo apt install -y sqlite3
sudo systemctl stop x-loc-cache
sudo -u xloc sqlite3 /var/lib/x-loc-cache/x-loc-cache.db < /tmp/d1-data.sql
sudo -u xloc sqlite3 /var/lib/x-loc-cache/x-loc-cache.db \
  "SELECT (SELECT COUNT(*) FROM profiles) AS profiles, (SELECT COUNT(*) FROM location_votes) AS votes"
sudo systemctl start x-loc-cache
curl -s -X POST localhost:8787/v1/loc/batch -H 'content-type: application/json' \
  -d '{"usernames":["<a handle you know is in there>"]}'
```

The counts should match the D1 side. Stopping the service first is not strictly
required — SQLite's WAL handles concurrent writers — but it removes any chance of
a contribution landing mid-import and confusing the comparison.

If the import fails partway, don't patch it up. The database is disposable at
this point: delete it and start over, since first boot recreates the schema.

```bash
sudo systemctl stop x-loc-cache
sudo rm -f /var/lib/x-loc-cache/x-loc-cache.db*    # also clears -wal and -shm
sudo systemctl start x-loc-cache && sudo systemctl stop x-loc-cache
sudo -u xloc sqlite3 /var/lib/x-loc-cache/x-loc-cache.db < /tmp/d1-data.sql
```

Two things worth knowing about the result. **This is a copy, not a cutover** —
D1 keeps serving every already-installed extension until those users update, so
the two databases diverge from this moment on, and re-exporting later will carry
rows that have since moved on independently on the VPS. And **the dump is not
replayable twice**: it is plain `INSERT` statements, and both tables have primary
keys (`profiles.username`, `location_votes(username, client_id)`), so a second
replay fails on the first row that already exists. Re-importing means the wipe
above, not another replay.

Check `wrangler d1 export --help` if `--no-schema` has moved in your version; I
have not run it against your database.

### Tuning

Every knob is an `XLOC_*` environment variable, documented inline in
[`deploy/x-loc-cache.env.example`](deploy/x-loc-cache.env.example). The two that
matter on a small box:

- `XLOC_CACHE_MB` (default 256) — SQLite's page cache. Real resident memory once
  the database outgrows it; keep it in step with `MemoryMax` in the unit file.
- `XLOC_MMAP_MB` (default 512) — memory-mapped I/O ceiling. Address space backed
  by the OS page cache, so it is reclaimable and can safely exceed free RAM.

The Node backend also owns three things the Workers platform used to provide:
retention runs on an interval instead of a cron trigger, and there is a body-size
limit plus a per-IP rate limit, because a bare origin has no edge in front of it.

#### Indexes: don't add any

`schema.sql` carries no secondary indexes, and that stays true on SQLite. The
comment in the schema justifies it by D1's write budget, which does not apply
here — so it was re-measured on this hardware instead (better-sqlite3, WAL,
`synchronous=NORMAL`, votes spread over 61 days, one daily retention pass
deleting the ~1/61 that just aged out):

| Rows | `seen_at` index | Insert | DB size | Retention DELETE |
| ---- | --------------- | ------ | ------- | ---------------- |
| 1M   | no              | 1.7 s  | 78 MB   | 234 ms           |
| 1M   | yes             | 2.9 s  | 94 MB   | 233 ms           |
| 5M   | no              | 8.3 s  | 404 MB  | 1138 ms          |
| 5M   | yes             | 22.4 s | 483 MB  | 1492 ms          |

The index is a straight loss. It does make the planner switch from `SCAN` to
`SEARCH ... USING INDEX`, which looks like the win you were after — but the scan
was never the expensive part. Removing 82k rows means updating every index those
rows appear in, so a second index adds work to the delete itself, and at 5M rows
that outweighs the cheaper lookup. Meanwhile every vote insert pays for it, on
the hot path, forever.

The read paths need nothing either: `profiles.username` is a `TEXT PRIMARY KEY`
and `location_votes` has `PRIMARY KEY (username, client_id)`, so both
`WHERE username IN (…)` queries already ride an existing index on its leading
column.

Worth revisiting only if `location_votes` reaches the tens of millions of rows,
where the once-a-day DELETE starts blocking long enough to notice —
better-sqlite3 is synchronous, so that pause is time the server isn't answering.
The fix then is chunked deletion _plus_ the index (chunking alone re-scans the
table for every chunk), not the index on its own. At 5M rows the pause is ~1 s
once a day, against a client that waits 5 s before giving up.

`XLOC_RATE_LIMIT` deserves a note: **one IP is not one user.** Offices,
universities and mobile CGNAT put many installs behind a single address, and the
client treats a 429 as a failure — three in a row open its circuit breaker for
ten minutes, so clipping a legitimate burst costs that user the shared cache far
longer than the burst lasted. The default (600/min, ~20 simultaneously-active
users on one IP) is deliberately far above real traffic while still capping a
single host at 10 req/s. It is a flood ceiling, not a fair-use quota. 429s carry
`Retry-After`; the client IP is taken from the **last** `X-Forwarded-For` hop, so
a forged header can't mint a fresh bucket as long as the proxy appends its own.

### Operating

```bash
sudo systemctl status x-loc-cache
sudo journalctl -u x-loc-cache -f
sudo -u xloc sqlite3 /var/lib/x-loc-cache/x-loc-cache.db 'SELECT COUNT(*) FROM profiles'
```

Backups are covered in [their own section](#backups) below.

To update:

```bash
cd /opt/x-loc-cache && sudo git pull
sudo systemctl restart x-loc-cache
```

Shutdown is graceful — the listener closes, WAL is checkpointed, then the process
exits. Re-run `npm install` after a pull only if `server/package.json` changed,
and re-run it always after a Node **major** upgrade (see the ABI note in step 4).

### Backups

Nightly, verified, rotated. Three files in [`deploy/`](deploy/) wire it up:

```bash
cd /opt/x-loc-cache/server
sudo apt install -y sqlite3    # already there if you did step 9
sudo cp deploy/x-loc-backup.service deploy/x-loc-backup.timer /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now x-loc-backup.timer

# Take the first one now rather than finding out at 23:30 whether it works.
sudo systemctl start x-loc-backup.service
systemctl status x-loc-backup.service --no-pager   # → Result: success
ls -lh /var/lib/x-loc-cache/backups/               # → one .db.gz
systemctl list-timers x-loc-backup --no-pager      # → a NEXT / LEFT time
```

Only the two unit files are copied. `backup.sh` runs in place from the checkout
(`ExecStart=/opt/x-loc-cache/server/deploy/backup.sh`), so `git pull` updates it
along with the rest of the server and there is nothing to re-copy. Beyond
`sqlite3` it needs `flock` and `gzip`, both already on any Ubuntu; it checks for
`flock` and refuses to run unserialised rather than skipping the lock.

Each run ([`deploy/backup.sh`](deploy/backup.sh)) takes a snapshot with
`VACUUM INTO`, verifies it, gzips it, checks the live database, and only then
prunes to the newest `XLOC_BACKUP_KEEP` (default 7). Nothing here needs the
server stopped, and none of it runs on the server's event loop.

**Why `VACUUM INTO` and not `.backup`.** Both are consistent against a live WAL
database where a plain `cp` reads torn pages mid-write, but SQLite's backup API
**restarts from scratch whenever another connection writes**, so under a steady
stream of contributions it never converges. Measured here on a 236 MB database,
holding its size constant and varying only the concurrent write rate:

| Concurrent writes | `.backup` | `VACUUM INTO` |
| ----------------- | --------- | ------------- |
| none              | 0.21 s    | 0.54 s        |
| 2 writes/s        | 0.25 s    | —             |
| 10 writes/s       | **88 s**  | 0.57 s        |
| 200 writes/s      | **88 s**  | 0.56 s        |
| saturated         | **88 s**  | 0.59 s        |

Those 88 s are not slowness — they are exactly how long the writer had left to
live. `.backup` finished only once writes stopped, so on a server busy enough to
matter it would produce no backup at all. `VACUUM INTO` holds a single read
snapshot and is flat from idle to saturation. It also rebuilds rather than
copying pages, so the file lands compacted and in rollback-journal mode, with no
WAL flag to carry into a restore. The one cost is that its read snapshot defers
WAL checkpointing while it runs — sub-second, so the WAL grows by whatever
arrives in that window.

**Three checks, because each misses what the others catch.** `integrity_check`
calls an _empty_ database "ok"; a `COUNT(*)` probe proves the tables actually
arrived, since a failed `VACUUM INTO` leaves a valid file with no tables in it;
and comparing that count against the source's own from before the run catches a
short copy (profiles are only ever inserted or updated — retention deletes
votes, never profiles — so a snapshot can never legitimately hold fewer). A
failure prunes nothing, fails the unit, and keeps the rejected snapshot as
evidence — **one** copy, gzipped, at `backups/corrupt-evidence.db.gz`.

That it is one and not one-per-night is deliberate, and was a bug before it was
a feature. Whatever fails verification is usually permanent, so the branch runs
again every night; a stamped, uncompressed file per run added a
database-sized file nightly to the disk the live database writes to. A full
disk turns "corrupt but still serving reads" into "cannot accept a single
contribution" — with `/healthz` still green, since it never touches the
database — and leaves no room for `restore.sh` to unpack into. The first copy
is kept rather than the newest, being closest to the onset; delete it by hand
and the next failure captures a fresh one.

**The live database is checked separately**, after the snapshot is stored,
because neither check subsumes the other. `VACUUM INTO` repacks, so faults in
free-page accounting are rebuilt away in the copy and left in place on the
original. But it is **not** the wholesale index rebuild it looks like: an index
out of sync with its table is carried across verbatim, so that class fails the
snapshot check instead. Measured on sqlite 3.37 and 3.53 — 102 table rows
against 100 index entries in, and exactly the same out.

The live check is the corruption monitor: `systemctl --failed` (or
`journalctl -u x-loc-backup`, or an email if [Alerting](#alerting) is set up) is
where a silently corrupt database first becomes visible, a day after it happens
rather than months. When it fires, the run keeps that night's snapshot and
prunes nothing.

The unit runs as `xloc`, never root — and so must anything else that touches
the database. The sqlite3 CLI creates `-wal`/`-shm` beside a WAL database when
they are absent, and root-owned ones stop the service writing its own database.
`backup.sh` refuses to run as root rather than trusting that. Runs are
serialised with `flock`, so a hand-run alongside the timer cannot collide.

Two things the rotation does not cover, both cheap:

- Backups land on the same disk as the database, so they insure against
  corruption and operator error, not against losing the box. They are plain
  files — `rsync`/`rclone`/`scp` the directory somewhere else if the deployment
  has grown worth that. (Pulling copies off the box needs nothing; pointing
  `XLOC_BACKUP_DIR` itself at another disk needs a `ReadWritePaths=` drop-in on
  the backup unit, whose sandbox writes only under `/var/lib/x-loc-cache` — see
  the note in [`deploy/x-loc-cache.env.example`](deploy/x-loc-cache.env.example).)
- `/etc/x-loc-cache.env` is the only other state on the machine; copy it once.

### Restore

```bash
ls -lh /var/lib/x-loc-cache/backups/
sudo /opt/x-loc-cache/server/deploy/restore.sh \
  /var/lib/x-loc-cache/backups/x-loc-cache-<newest>.db.gz
```

[`deploy/restore.sh`](deploy/restore.sh) verifies the archive and its
`integrity_check` **before** stopping the service — a bad backup costs no
downtime — then swaps the database in atomically, restarts, and confirms
`/healthz` plus the row counts. Whatever was in place is kept beside it as
`*.replaced-<stamp>`; delete those once the restore has proven out.

Corruption announces itself in one of two places: the nightly backup unit
failing its integrity check, or `SQLITE_CORRUPT` in
`journalctl -u x-loc-cache`. Either way, don't repair in place — restore the
newest good backup. The loss is bounded at a day of contributions, and losing
even the whole database is recoverable, not fatal: clients re-contribute what
they hold in IndexedDB as they browse, so the cache refills on its own.

Set up [Alerting](#alerting) and neither of those has to be noticed by hand.

### Alerting

Email on failure, and a weekly heartbeat. Optional: with no config file the
alert unit logs "nothing to send" and exits 0, so nothing here fails a
deployment that does not want email.

```bash
cd /opt/x-loc-cache/server
sudo cp deploy/x-loc-alert@.service /etc/systemd/system/

# Holds an SMTP password, so unlike x-loc-cache.env this one is not
# world-readable — root writes it, the xloc service user reads it.
sudo install -m 0640 -o root -g xloc deploy/x-loc-alert.env.example /etc/x-loc-alert.env
sudo editor /etc/x-loc-alert.env
sudo systemctl daemon-reload

# Prove it before trusting it. This sends a real email.
sudo systemctl start x-loc-heartbeat.service   # after the heartbeat step below
```

`OnFailure=x-loc-alert@%n.service` is already on `x-loc-backup.service` and
`x-loc-cache.service`, so installing the template above is all the wiring
needed. Doing it through systemd rather than emailing from inside `backup.sh`
is what makes it cover the failures a script cannot report about its own death
— an OOM kill, a missing interpreter, a timeout, a bad `ExecStart`. The main
service only reaches a failed state once systemd gives up restarting it, so an
email from that one means a crash loop, not a blip.

The subject distinguishes the two things worth knowing apart:

```text
[x-pat-cache] x-loc-backup.service failed on vps-1     ← the run broke
[x-pat-cache] DATABASE CORRUPTION on vps-1             ← the data is suspect
```

The second is chosen by matching what `backup.sh` prints when verification
fails, and a corruption email leads with the restore command and the fact that
nothing was pruned. A test asserts those strings still exist in `backup.sh`, so
rewording a message there cannot silently downgrade the alert.

Credentials use the ordinary nodemailer variable names
([`deploy/x-loc-alert.env.example`](deploy/x-loc-alert.env.example)) — copy
them from an existing notifier if you have one. Gmail needs an
[App Password](https://myaccount.google.com/apppasswords), not the account
password. `SMTP_HOST` alone turns alerting on; setting it while leaving
`SMTP_USER` / `SMTP_PASS` / `NOTIFY_TO` empty fails loudly on purpose, because
half-configured alerting looks like it is working.

#### The weekly heartbeat

`OnFailure=` can only fire if something ran. A backup timer that was never
enabled, or got masked, fails **silently and forever** — no email, no backups.
The heartbeat closes that: one message a week, and its absence is the signal.

```bash
sudo cp deploy/x-loc-heartbeat.service deploy/x-loc-heartbeat.timer /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now x-loc-heartbeat.timer
sudo systemctl start x-loc-heartbeat.service    # send one now
```

It reads the backups directory and nothing else — no database access, so it
cannot itself be blocked by whatever is wrong with the database:

```text
Subject: [x-pat-cache] backups healthy on vps-1
Archives kept:   7
Newest:          x-loc-cache-20260806-030000.db.gz
Newest age:      6.2h
Total on disk:   271.4 MB
```

Past 48 hours without a fresh archive the subject becomes
`backups are STALE`, which catches a timer that stopped without ever failing.

The alerter deliberately touches no SQLite. `nodemailer` is pure JavaScript
with no native module, so it still sends when `better-sqlite3` is the thing
that broke — a Node major upgrade without `npm install` takes the server down,
and that is exactly the outage the email has to survive.

To rehearse a restore without touching the service:

```bash
gunzip -c /var/lib/x-loc-cache/backups/x-loc-cache-<stamp>.db.gz > /tmp/rehearse.db
sqlite3 /tmp/rehearse.db 'PRAGMA integrity_check; SELECT COUNT(*) FROM profiles;'
```

### Performance at 10k users

`pnpm bench` builds a database the size a ~10k-user deployment reaches and times
every operation the server performs against it. Defaults: **2M profiles / 5.4M
votes / 603 MB**, 10k distinct installs. Sizing rationale is in
[`bench/load.ts`](bench/load.ts) — profiles grow far slower than users because
timelines overlap heavily, and votes are capped at 10 per handle.

Measured on Node 24.10, `cache_size` 256 MB, `mmap` 512 MB. The numbers that
matter are the **single-core** column — a Ryzen 7 7735HS pinned to one core with
`taskset -c 0` under a 640 MB cgroup, standing in for a 1 vCPU VPS:

| Operation                           | 1 core p50 | 1 core p99 | 16 cores p50 |
| ----------------------------------- | ---------- | ---------- | ------------ |
| lookup, 100 names, all hits         | 0.45 ms    | 9.46 ms    | 0.40 ms      |
| lookup, 100 names, 50% miss         | 0.26 ms    | 1.16 ms    | 0.25 ms      |
| contribute, 50 entries              | 3.32 ms    | 8.26 ms    | 1.80 ms      |
| `COUNT(*)` both tables (stats)      | 7.82 ms    | —          | 6.88 ms      |
| `COUNT(DISTINCT client_id)` (stats) | 252 ms     | 1005 ms    | 217 ms       |
| retention pass, one day's votes     | 1469 ms    | —          | 199 ms       |

Over HTTP, that single core sustained, with **zero errors**:

| Load                            | Throughput | p50     | p99      |
| ------------------------------- | ---------- | ------- | -------- |
| lookups, 16 concurrent          | 1411 req/s | 9.4 ms  | 28.4 ms  |
| lookups, 64 concurrent          | 1700 req/s | 35.3 ms | 74.6 ms  |
| 75/25 read/write, 64 concurrent | 916 req/s  | 67.8 ms | 149.7 ms |

The request path barely moves between 50k profiles and 2M, or between 1 core and
16 — both handlers are primary-key seeks, so they scale with the batch size, not
the table.

For scale: 10k users generate on the order of **5–10 req/s** averaged and tens at
peak, since lookups are batched 100 at a time and deduped for 15 minutes while
contributions are buffered 30 s. Against ~900 req/s of measured write-heavy
capacity that is **two orders of magnitude of headroom on one vCPU**. CPU is
nowhere near the binding constraint; storage is, as in the sizing note above.

**How long the daily stats line takes.** Measured on one core at 10k-user scale
(5.4M votes): **~530 ms total** — `users24h` 228 ms + `users7d` 298 ms + the two
`COUNT(*)`s 7 ms (626 ms on the first run, before the page cache is warm). It
scales linearly with the votes table, so at the few-thousand-vote scale a new
deployment starts at, it is under a millisecond.

Because better-sqlite3 is synchronous, that time is a stall rather than a slow
query. Under a realistic 10 req/s load the effect is contained: p50 stayed
2.6 ms, and the worst request that landed inside the tick took **525 ms** —
nowhere near the client's 5 s timeout, and a timeout would degrade to "no data"
and a direct X call anyway. Once a day, this is a fine trade.

Two slow operations, both once a day and both deliberate:

- **`COUNT(DISTINCT client_id)`** backs `users24h` / `users7d`. There is no index
  on `seen_at` (see `schema.sql`), so it is a full scan that grows linearly with
  the votes table. better-sqlite3 is synchronous, so 217 ms is an event-loop
  stall — every in-flight request waits. Fine daily; **do not shorten
  `XLOC_STATS_INTERVAL_HOURS` to minutes without dropping these two fields** and
  keeping the free per-window `users` count, which is derived from the clientId
  already on the wire and costs nothing.
- **The retention pass** at 199 ms, for the same reason and with the same
  verdict.

**Memory holds.** With a 603 MB database, RSS reads ~900 MB, which looks alarming
against `MemoryMax=640M` — but the run completes unharmed under exactly that
cgroup limit, with latencies unchanged. Most of that RSS is `mmap`'d file pages,
which are file-backed and reclaimed under pressure rather than counted against an
OOM. The 256 MB `cache_size` is the part that is genuinely anonymous. Raise the
two together or not at all.

### Usage stats

D1's dashboard is not there once you self-host, so the server reports its own —
one JSON line per window (daily by default, `XLOC_STATS_INTERVAL_HOURS`), plus
one on shutdown so a restart doesn't discard the partial window.

```bash
sudo journalctl -u x-loc-cache | grep 'stats ' | sed 's/.*stats //' | jq .
# containers: docker compose logs | grep 'stats ' | sed 's/.*stats //' | jq .
```

```json
{
  "reason": "interval",
  "since": "2026-07-27T00:00:00.000Z",
  "windowS": 86400,
  "lookups": 2140,
  "lookupNames": 51203,
  "lookupHits": 40655,
  "hitRate": 0.794,
  "contributions": 388,
  "contributedEntries": 9012,
  "statsReads": 219,
  "other": 6,
  "users": 34,
  "rateLimited": 0,
  "tooLarge": 0,
  "errors": 0,
  "avgMs": 2.6,
  "maxMs": 41,
  "users24h": 37,
  "users7d": 112,
  "profiles": 44210,
  "votes": 91884,
  "dbMb": 19.4,
  "rssMb": 128
}
```

| Field                                 |                                                                                                                                                             |
| ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `lookups` / `contributions`           | **reads / writes** — request counts for `/v1/loc/batch` and `/v1/loc`                                                                                       |
| `lookupNames` / `lookupHits`          | usernames asked about, and how many the cache could answer                                                                                                  |
| `hitRate`                             | `lookupHits / lookupNames` — the number that says whether any of this is working. `null` when nothing was asked, so an idle night doesn't read as an outage |
| `users`                               | distinct anonymous installs that contributed **during this window** — counted in-process from the clientId already on the wire, so it costs nothing         |
| `users24h` / `users7d`                | the same figure over a trailing 24h / 7d, from SQL. Survives restarts and is independent of the log cadence, but costs a full scan — see Performance above  |
| `usersCapped`                         | present only if the in-process set hit its 50k ceiling, meaning `users` is a floor                                                                          |
| `statsReads`                          | `GET /v1/stats` — popups asking how much the cache holds. Its own line so `other` still means scanners                                                      |
| `profiles` / `votes` / `dbMb`         | current totals, not window deltas                                                                                                                           |
| `rateLimited` / `tooLarge` / `errors` | rejections; these never reached a handler, so they're excluded from the request counts above                                                                |

Counters are per-window and reset when logged. `/healthz` is deliberately not
counted — at one probe every 30 s it would be most of the traffic.

**What `users24h` actually measures.** Contributions carry an anonymous
per-install `clientId`, already stored in `location_votes`, so this is a query
against existing data — it adds no tracking. It counts installs that
_contributed_, which is a **floor** on active users: a session served entirely
from the cache contributes nothing and is invisible here.

Counting readers instead would mean having clients send an identifier on
lookups, and that is the one change that would let this server correlate an
install with the handles it viewed — the thing the design promises not to do.
The undercount is what buys that guarantee, so it is deliberate rather than a
gap to close later.

Nothing here is written to disk beyond the log line, and journald/`docker
compose logs` rotation is what bounds it (the compose file caps logs at
3 × 10 MB). For history, `grep` the lines into a file — one line a day is
nothing — rather than reaching for a metrics stack.

---

## Deploy: Docker

The same SQLite backend, packaged. Use this instead of steps 3–6 above when you
would rather not install Node on the host or manage a unit file; steps 1, 2 and 7
(DNS, firewall, Caddy) are unchanged, because the container listens on loopback
and Caddy still terminates TLS in front of it.

```bash
cd server
docker compose up -d --build
curl -s localhost:8787/healthz     # → ok
```

That is the whole deploy. [`compose.yaml`](compose.yaml) publishes to
`127.0.0.1:8787`, keeps the database in a named volume, and sets the same limits
as the systemd unit (`mem_limit: 640m`, `stop_grace_period: 15s`).

Without compose:

```bash
docker build -t x-loc-cache .
docker run -d --name x-loc-cache \
  -p 127.0.0.1:8787:8787 \
  -v x-loc-data:/data \
  --restart unless-stopped \
  x-loc-cache
```

**What the image changes**, versus running the process directly:

|                | Bare metal                                          | Container                                                                                                          |
| -------------- | --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `XLOC_HOST`    | `127.0.0.1`                                         | `0.0.0.0` — loopback inside a network namespace reaches nothing; Docker's port mapping does the confining instead  |
| `XLOC_DB`      | `/var/lib/x-loc-cache/…`                            | `/data/x-loc-cache.db`                                                                                             |
| Node           | installed on the host, ABI must match `npm install` | pinned by the base image; `better-sqlite3` is compiled in a builder stage on the same base, so the ABI can't drift |
| Restart / logs | `systemctl`, `journalctl`                           | `restart: unless-stopped`, `docker compose logs` (capped at 3 × 10 MB)                                             |

Everything else is the same `XLOC_*` set — put overrides in `environment:`.

A few details that are easy to get wrong:

- **Publish to `127.0.0.1`, not `0.0.0.0`.** Docker writes its own iptables rules,
  and **UFW does not filter them** — a bare `-p 8787:8787` is reachable from the
  internet no matter what step 2 says. The explicit loopback bind in
  `compose.yaml` is what keeps Caddy the only client.
- **Named volume, not a bind mount**, unless you chown first. The image creates
  `/data` owned by `node` (uid 1000) before dropping privileges, and a named
  volume inherits that; a bind mount keeps the host directory's owner, so
  `-v /srv/xloc:/data` needs `sudo chown 1000:1000 /srv/xloc` or the container
  can't write.
- **`docker stop` is graceful.** The exec-form `CMD` makes node PID 1, so it gets
  SIGTERM directly and runs its own drain + WAL checkpoint — no `tini` needed.
- **Upgrades** are `git pull && docker compose up -d --build`. The volume is
  untouched.

Migrating a D1 dump into the container (step 9's SQLite half):

```bash
docker compose stop
docker run --rm -i -v x-loc-data:/data alpine \
  sh -c 'apk add -q sqlite && sqlite3 /data/x-loc-cache.db' < dump.sql
docker compose start
```

The volume is named `x-loc-data` in both deploy shapes because `compose.yaml`
pins it — compose would otherwise call it `server_x-loc-data` after the project
directory, and every command above would quietly address a different, empty
database.

### Backups (container)

The image ships the **same** [`deploy/backup.sh`](deploy/backup.sh) the systemd
timer runs, plus the `sqlite3` CLI it needs (`flock` and `gzip` are already in
the base). It is the same script on purpose — the two deploy shapes cannot
drift in how they take a backup. No stop, no flags: `XLOC_DB` and
`XLOC_BACKUP_DIR` are set in the image and `docker exec` inherits them.

```bash
docker compose exec x-loc-cache /app/deploy/backup.sh
# backup ok: /data/backups/x-loc-cache-20260806-182459.db.gz (4.0K, 3 profiles / 3 votes), 1 kept
docker compose exec x-loc-cache ls -lh /data/backups
```

Snapshots land in `/data/backups`, inside the same named volume as the
database — so they survive `docker compose down`, and sit on the same disk,
with the same caveat as the bare-metal deploy. Verification, rotation and the
corruption monitor all behave as described under [Backups](#backups);
`XLOC_BACKUP_KEEP` goes in `compose.yaml`'s `environment:` block.

There is no timer inside the container. Schedule it from the host, which is
also where the exit status is visible:

```bash
# /etc/cron.d/x-loc-backup
17 4 * * * root docker compose -f /opt/x-loc-cache/server/compose.yaml exec -T x-loc-cache /app/deploy/backup.sh
```

`-T` is required: without it `exec` wants a TTY and fails under cron.

### Restore (container)

`restore.sh` is deliberately **not** in the image — it drives `systemctl`. The
container equivalent is the same shape: verify first, then stop, swap, start.

```bash
docker compose stop
docker run --rm -v x-loc-data:/data x-loc-cache:latest sh -c '
  set -e
  gunzip -c /data/backups/x-loc-cache-<stamp>.db.gz > /data/restore.tmp.db
  sqlite3 /data/restore.tmp.db "PRAGMA integrity_check;"
  mv /data/x-loc-cache.db /data/x-loc-cache.db.replaced
  rm -f /data/x-loc-cache.db-wal /data/x-loc-cache.db-shm
  mv /data/restore.tmp.db /data/x-loc-cache.db'
docker compose start
curl -s localhost:8787/healthz
```

⚠ **Removing `-wal`/`-shm` is not tidiness — skip it and you lose the
database.** They describe the file being replaced, and SQLite will happily
recover those frames over the one you just restored. Measured: a restored
database with a foreign WAL beside it does not open at all, failing with
`database disk image is malformed`. This is why `restore.sh` moves them aside
on the bare-metal path.

Running it through the `x-loc-cache` image rather than `alpine` is what
supplies `sqlite3`, and writes the new file as uid 1000 so the server can open
it. Keep `x-loc-cache.db.replaced` until the restore has proven out.

### Alerting (container)

`deploy/alert.ts` is in the image too, so the weekly heartbeat works the same
way — put the SMTP variables from
[`deploy/x-loc-alert.env.example`](deploy/x-loc-alert.env.example) in an
`env_file:` on the service (not `environment:`, which lands the password in
`docker inspect`), and run it from the host:

```bash
docker compose exec -T x-loc-cache node --experimental-strip-types deploy/alert.ts --report
```

Failure alerting has no `OnFailure=` here, because there is no systemd in the
container. Chain it off the backup's exit status in the same host cron entry:

```bash
17 4 * * * root cd /opt/x-loc-cache/server && docker compose exec -T x-loc-cache /app/deploy/backup.sh \
  || docker compose exec -T x-loc-cache node --experimental-strip-types deploy/alert.ts x-loc-backup
```

One honest limitation: the container has no journal, so that email carries the
subject and context but an empty journal section — the backup's own output is
in `docker compose logs` instead. On a host that does run systemd, wrapping the
`docker compose exec` in a `.service` with `OnFailure=` gets the full bare-metal
behaviour back.

## Dev / test

```bash
pnpm test        # consensus + full SQLite round-trip against the real handlers
pnpm test:deploy # the backup/restore scripts, including under write load
pnpm typecheck
pnpm dev         # local Worker at http://localhost:8787 (uses local D1)
pnpm db:init:local
pnpm start       # local Node+SQLite server, db in ./data (XLOC_* env vars apply)
```

[`src/sqlite.test.ts`](src/sqlite.test.ts) drives `worker.fetch` through a real
in-memory SQLite database, so it covers the handlers and the D1 adapter together
— that is what keeps the two backends honest about behaving identically.

[`deploy/backup.test.ts`](deploy/backup.test.ts) runs the shipped shell scripts
against real databases on disk — sqlite3, gzip, flock and dash included, since
the thing under test _is_ the script. It has its own config
(`vitest.deploy.config.ts`) and is **not** part of `pnpm test` or CI: it takes
tens of seconds and needs those binaries present. It skips itself where they
are not.

The load cases are why the file exists. They start a writer against the
database and assert the backup finishes **while writes are still arriving** —
the failure `.backup` had, which no idle test can see, because with an idle
database the broken and the fixed version are both fast and both correct.
