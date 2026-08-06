#!/bin/sh
# Restore the cache database from a backup taken by backup.sh:
#
#   sudo /opt/x-loc-cache/server/deploy/restore.sh \
#     /var/lib/x-loc-cache/backups/x-loc-cache-<stamp>.db.gz
#
# Verifies the backup BEFORE stopping the service — a bad archive costs no
# downtime — then swaps it in atomically, restarts, and health-checks. Whatever
# was in place is kept beside it as *.replaced-<stamp>; delete those once the
# restore has proven out.

set -eu

# Wins over the caller's environment on purpose — the point is to restore the
# database the service actually reads. XLOC_ENV_FILE redirects it for a second
# instance, or for the tests.
ENV_FILE="${XLOC_ENV_FILE:-/etc/x-loc-cache.env}"
if [ -f "$ENV_FILE" ]; then . "$ENV_FILE"; fi

DB="${XLOC_DB:-/var/lib/x-loc-cache/x-loc-cache.db}"
BACKUP_DIR="${XLOC_BACKUP_DIR:-/var/lib/x-loc-cache/backups}"
PORT="${XLOC_PORT:-8787}"
SERVICE=x-loc-cache
OWNER=xloc

BACKUP="${1:-}"
if [ -z "$BACKUP" ] || [ ! -f "$BACKUP" ]; then
  echo "usage: $0 <backup.db.gz>" >&2
  echo "available:" >&2
  # >&2 before 2>/dev/null — reversed, the listing lands in /dev/null too.
  ls -1 "$BACKUP_DIR"/x-loc-cache-*.db.gz >&2 2>/dev/null || true
  exit 1
fi

if [ "$(id -u)" -ne 0 ]; then
  echo "run as root — it drives systemctl and chowns the database" >&2
  exit 1
fi

STAMP="$(date -u +%Y%m%d-%H%M%S)"
# Same directory as $DB, so the final mv is atomic (one filesystem).
TMP="$(dirname "$DB")/restore-$STAMP.db"
trap 'rm -f "$TMP" "$TMP-wal" "$TMP-shm"' EXIT
# dash skips the EXIT trap on an untrapped SIGTERM; route signals through exit
# so an interrupted restore doesn't leave a DB-sized temp beside the live file.
trap 'exit 143' TERM
trap 'exit 130' INT
trap 'exit 129' HUP

gunzip -c "$BACKUP" > "$TMP"
# Both checks, for the same reason backup.sh runs both: integrity_check calls
# an empty database "ok", so the count query is what proves the tables exist.
CHECK="$(sqlite3 "$TMP" 'PRAGMA integrity_check;' 2>&1)" || true
COUNTS="$(sqlite3 "$TMP" 'SELECT COUNT(*) FROM profiles; SELECT COUNT(*) FROM location_votes;' 2>&1)" || COUNTS=''
if [ "$CHECK" != "ok" ] || [ -z "$COUNTS" ]; then
  echo "backup failed verification, service untouched." >&2
  echo "integrity_check: $CHECK" >&2
  exit 1
fi

systemctl stop "$SERVICE"

# Keep what is being replaced — corrupt evidence, or the state being rolled back.
for suffix in '' '-wal' '-shm'; do
  if [ -f "$DB$suffix" ]; then
    mv "$DB$suffix" "$DB$suffix.replaced-$STAMP"
  fi
done

chown "$OWNER:$OWNER" "$TMP"
mv "$TMP" "$DB"
trap - EXIT

systemctl start "$SERVICE"

tries=0
until curl -fsS "localhost:$PORT/healthz" >/dev/null 2>&1; do
  tries=$((tries + 1))
  if [ "$tries" -ge 10 ]; then
    echo "healthz FAILED — journalctl -u $SERVICE -n 50" >&2
    exit 1
  fi
  sleep 1
done
echo "healthz ok"

sudo -u "$OWNER" sqlite3 "$DB" \
  'SELECT (SELECT COUNT(*) FROM profiles) AS profiles, (SELECT COUNT(*) FROM location_votes) AS votes;'
echo "restored $BACKUP -> $DB; previous files kept as $DB.replaced-$STAMP"
