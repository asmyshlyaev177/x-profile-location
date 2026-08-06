#!/bin/sh
# Nightly snapshot of the cache database, verified and rotated.
#
# Runs from x-loc-backup.timer as the xloc user — never root: the sqlite3 CLI
# creates -wal/-shm beside a WAL database when they are absent, and root-owned
# ones stop the service writing its own database.
#
# Order matters: snapshot → verify → compress → check the source → prune.
# Pruning happens last and only if everything passed, so neither a corrupt
# source nor a bad snapshot can age out the good backups you are about to need.

set -eu

# Same env file systemd feeds the server, so a hand-run agrees with the timer.
# It wins over the caller's environment on purpose: this script's job is to back
# up the database the *service* uses, not whatever a stale export points at.
# XLOC_ENV_FILE redirects that for a second instance, or for the tests.
ENV_FILE="${XLOC_ENV_FILE:-/etc/x-loc-cache.env}"
if [ -f "$ENV_FILE" ]; then . "$ENV_FILE"; fi

DB="${XLOC_DB:-/var/lib/x-loc-cache/x-loc-cache.db}"
BACKUP_DIR="${XLOC_BACKUP_DIR:-/var/lib/x-loc-cache/backups}"
KEEP="${XLOC_BACKUP_KEEP:-7}"

# A root run "works" and quietly breaks the nightly unit: mkdir -p on a first
# run leaves the backups dir root-owned, so every xloc run after fails.
if [ "$(id -u)" -eq 0 ]; then
  echo "refusing to run as root — use: sudo systemctl start x-loc-backup.service" >&2
  echo "(or sudo -u xloc $0)" >&2
  exit 1
fi

# Not [ -lt 1 ]: dash treats a non-number there as a test *error*, which an if
# suppresses — and the $((KEEP + 1)) it would later break sits in a pipeline,
# where the failure is swallowed and the prune silently never runs again.
case "$KEEP" in
  '' | *[!0-9]* | 0*)
    echo "XLOC_BACKUP_KEEP must be a positive integer without a leading zero, got '$KEEP'" >&2
    exit 1 ;;
esac

mkdir -p "$BACKUP_DIR"

# One run at a time. systemd won't start the oneshot twice, but a hand-run
# alongside the timer would — and two runs share the orphan sweep below, so the
# second would delete the first's snapshot mid-write.
LOCK="$BACKUP_DIR/.backup.lock"
if [ -z "${XLOC_BACKUP_LOCKED:-}" ]; then
  if ! command -v flock >/dev/null 2>&1; then
    echo "flock not found — install util-linux; refusing to run unserialised" >&2
    exit 1
  fi
  XLOC_BACKUP_LOCKED=1
  export XLOC_BACKUP_LOCKED
  # Not `exec`: that would replace this shell, and the busy case could never
  # explain itself. -E gives "lock held" a status of its own, so it is not
  # mistaken for a real failure from the re-executed script.
  rc=0
  flock -n -E 75 "$LOCK" "$0" "$@" || rc=$?
  if [ "$rc" -eq 75 ]; then
    echo "another backup is already running ($LOCK)" >&2
  fi
  exit "$rc"
fi

STAMP="$(date -u +%Y%m%d-%H%M%S)"
SNAP="$BACKUP_DIR/x-loc-cache-$STAMP.db"
# Deliberately unstamped, and deliberately not matching x-loc-cache-*.db.gz:
# there is at most one, and neither the prune, the orphan sweep, the kept-count
# nor restore.sh's "available:" listing may see it as an archive.
EVIDENCE="$BACKUP_DIR/corrupt-evidence.db.gz"

# A run killed too hard for its traps (SIGKILL, power loss) leaves working
# files nothing else would ever touch — any present now are orphans. The
# ?-globs match only stamped names, so a kept archive is never at risk.
rm -f "$BACKUP_DIR"/x-loc-cache-????????-??????.db \
  "$BACKUP_DIR"/x-loc-cache-????????-??????.db.gz.part \
  "$EVIDENCE.part"

trap 'rm -f "$SNAP" "$SNAP.gz.part"' EXIT
# dash runs the EXIT trap on exit and SIGINT but not on SIGTERM — which is what
# systemd sends when a stop or reboot lands mid-backup. Route the signals
# through exit so the trap fires instead of leaking a DB-sized snapshot.
trap 'exit 143' TERM
trap 'exit 130' INT
trap 'exit 129' HUP

# Profiles are only ever inserted or updated — retention deletes votes, never
# profiles (src/index.ts) — so the snapshot can never hold fewer than the source
# did before it started. That is what catches a truncated or partial copy.
BEFORE="$(sqlite3 "$DB" 'SELECT COUNT(*) FROM profiles;')"

# VACUUM INTO, *not* .backup. Both are consistent snapshots of a live WAL
# database where a plain cp is not — but the backup API restarts from scratch
# whenever another connection writes, so under a steady stream of contributions
# it never converges: measured on a 236 MB database, .backup took 0.2 s idle and
# 58 s at 10 writes/s, finishing only once the writer stopped. VACUUM INTO holds
# one read snapshot instead and is flat at 0.6 s from idle to saturation. It
# also rebuilds rather than copying pages, so the file comes out compacted and
# in rollback-journal mode, with no WAL flag to carry into a restore.
#
# The cost is that its read snapshot defers WAL checkpointing for its duration —
# sub-second here, so the WAL grows by whatever arrives in that window.
sqlite3 -cmd '.timeout 5000' "$DB" "VACUUM INTO '$SNAP'"

# Three checks, because each misses what the others catch: integrity_check calls
# an *empty* database "ok", the count query proves the tables actually arrived
# (a failed VACUUM INTO leaves a valid file with no tables at all), and BEFORE
# proves the copy is not short.
CHECK="$(sqlite3 "$SNAP" 'PRAGMA integrity_check;' 2>&1)" || true
COUNTS="$(sqlite3 "$SNAP" 'SELECT COUNT(*) FROM profiles; SELECT COUNT(*) FROM location_votes;' 2>&1)" || COUNTS=''
PROFILES="$(printf '%s\n' "$COUNTS" | sed -n 1p)"
VOTES="$(printf '%s\n' "$COUNTS" | sed -n 2p)"
# Validate before comparing: dash treats `[ notanumber -lt 5 ]` as a test
# *error*, which an `if` reads as false — so a garbled count would sail through
# the very check meant to catch it.
SHORT=no
case "$PROFILES" in
  '' | *[!0-9]*) SHORT=yes ;;
  *) if [ "$PROFILES" -lt "$BEFORE" ]; then SHORT=yes; fi ;;
esac
if [ "$CHECK" != "ok" ] || [ -z "$COUNTS" ] || [ "$SHORT" = yes ]; then
  echo "snapshot verification FAILED." >&2
  echo "integrity_check: $CHECK" >&2
  echo "profiles: $PROFILES in snapshot vs $BEFORE in the source before it started" >&2
  # ONE compressed copy, not one per night. Whatever gets here is usually
  # permanent — an index out of sync with its table is copied across verbatim
  # (measured) and nothing in the server ever REINDEXes — so a stamped,
  # uncompressed file per run would add a database-sized file every night, on
  # the same disk the live database writes to, until it fills. A full disk
  # turns "corrupt but still serving reads" into "cannot accept a single
  # contribution", and leaves no room for restore.sh to unpack into either.
  # The first copy is the one worth keeping: it is closest to the onset.
  if [ -e "$EVIDENCE" ]; then
    echo "Evidence from an earlier failure is already at $EVIDENCE — kept that one." >&2
  else
    gzip -c "$SNAP" > "$EVIDENCE.part" && mv "$EVIDENCE.part" "$EVIDENCE"
    echo "Evidence kept at $EVIDENCE (never auto-pruned; delete by hand)." >&2
  fi
  exit 1
fi

gzip -c "$SNAP" > "$SNAP.gz.part"
mv "$SNAP.gz.part" "$SNAP.gz"
rm -f "$SNAP"
trap - EXIT

# Now check the source itself, because neither check subsumes the other.
# VACUUM INTO repacks, so faults in free-page accounting are rebuilt away in the
# copy and left in place here; but it is not the wholesale index rebuild it
# looks like — an index out of sync with its table comes across verbatim, so
# that class fails the snapshot check above (measured on sqlite 3.37 and 3.53:
# 102 rows / 100 index entries in, the same out). This is the corruption
# monitor, so it is the thorough check rather than quick_check (~1.2 s per
# 236 MB, once a day, in its own process — never on the server's event loop).
# It runs *after* the snapshot is stored: a copy of a failing database is worth
# keeping.
LIVE="$(sqlite3 "$DB" 'PRAGMA integrity_check;' 2>&1)" || true
if [ "$LIVE" != "ok" ]; then
  echo "the LIVE database failed integrity_check — it is corrupt." >&2
  echo "Tonight's snapshot is stored at $SNAP.gz and nothing was pruned." >&2
  echo "Restore per README 'Restore'; do not repair in place." >&2
  echo "$LIVE" >&2
  exit 1
fi

# Names embed a UTC timestamp, so lexical order is age order. The arithmetic
# stays outside the pipeline: dash runs each element in a subshell, where an
# expansion error would kill only that element and read as a successful prune.
PRUNE_FROM=$((KEEP + 1))
ls -1 "$BACKUP_DIR"/x-loc-cache-*.db.gz | sort -r | tail -n +"$PRUNE_FROM" \
  | while read -r old; do rm -f -- "$old"; done

KEPT="$(ls -1 "$BACKUP_DIR"/x-loc-cache-*.db.gz | wc -l)"
echo "backup ok: $SNAP.gz ($(du -h "$SNAP.gz" | cut -f1), $PROFILES profiles / $VOTES votes), $KEPT kept"
