#!/bin/sh
# Compact the cache database — reclaim the free pages a long run of retention
# passes left behind:
#
#   sudo /opt/x-loc-cache/server/deploy/vacuum.sh [-y]
#
# Run it when the weekly heartbeat reports a reclaimable share worth the stop,
# not on a timer. Steady state does not need it: retention deletes votes by
# seen_at while the table is keyed (username, client_id), so the space it frees
# is scattered exactly where new contributions land, and the file plateaus
# instead of growing. What leaves real free pages behind is a one-off —
# shortening the 60-day vote window, a tightened cap, a sustained drop in
# traffic after a peak. Those are events, not a calendar. backup.sh measures
# the result of each one nightly; see "Compacting the database" in README.md.
#
# It rebuilds into a new file and swaps it in, rather than running VACUUM in
# place. The rebuild is verified before anything is replaced, and what it
# replaces is kept beside it as *.replaced-<stamp>; an in-place VACUUM offers
# neither, and cannot be rolled back once it has started rewriting.
#
# The service is stopped for the whole rebuild, on purpose. VACUUM INTO against
# the live database would be faster — 0.6 s flat under write load, which is why
# backup.sh does it that way — but every contribution arriving between that
# snapshot and the swap would be silently dropped. A few seconds of downtime
# drops none, and a client that cannot reach the server keeps its votes in
# IndexedDB and re-contributes them.

set -eu

# Same env file systemd feeds the server, so a hand-run agrees with the units.
# It wins over the caller's environment on purpose: the point is to compact the
# database the *service* uses, not whatever a stale export points at.
ENV_FILE="${XLOC_ENV_FILE:-/etc/x-loc-cache.env}"
if [ -f "$ENV_FILE" ]; then . "$ENV_FILE"; fi

DB="${XLOC_DB:-/var/lib/x-loc-cache/x-loc-cache.db}"
PORT="${XLOC_PORT:-8787}"
SERVICE=x-loc-cache
OWNER=xloc

ASSUME_YES=no
case "${1:-}" in
  -y | --yes) ASSUME_YES=yes ;;
  '') ;;
  *)
    echo "usage: $0 [-y]" >&2
    exit 1 ;;
esac

if [ "$(id -u)" -ne 0 ]; then
  echo "run as root — it drives systemctl and chowns the database" >&2
  exit 1
fi

if [ ! -f "$DB" ]; then
  echo "no database at $DB" >&2
  exit 1
fi

# Never as root. The sqlite3 CLI creates -wal/-shm beside a WAL database when
# they are absent, and root-owned ones stop the service writing its own
# database — the same reason backup.sh refuses to run as root at all. This
# script has to be root for systemctl, so it drops back down for every query.
sq() {
  sudo -u "$OWNER" sqlite3 "$@"
}

bytes() {
  # wc -c rather than stat: stat's flags differ between GNU and BSD, and the
  # arithmetic strips the padding wc adds on some of them.
  if [ -f "$1" ]; then echo $(($(wc -c < "$1"))); else echo 0; fi
}

# Main file plus the WAL that has not been checkpointed yet — what the database
# occupies now, and what a rebuild hands back. Matches dbBytes() in
# src/node-server.ts.
BEFORE_BYTES=$(($(bytes "$DB") + $(bytes "${DB}-wal")))

# Free space on the database's own filesystem. The rebuild is a second copy of
# the database beside the first, and this is the one script that can fill the
# disk that the server writes to — a full disk turns "serving reads" into
# "cannot accept a single contribution".
FREE_KB="$(df -Pk "$(dirname "$DB")" | awk 'NR==2 {print $4}')"
NEED_KB=$((BEFORE_BYTES / 1024))
case "$FREE_KB" in
  '' | *[!0-9]*)
    echo "could not read free space for $(dirname "$DB") — refusing to guess" >&2
    exit 1 ;;
esac
if [ "$FREE_KB" -lt "$NEED_KB" ]; then
  echo "not enough free space: the rebuild needs ${NEED_KB}KB beside the database, ${FREE_KB}KB free" >&2
  exit 1
fi

# Before anything else, and before the service is stopped. Compacting a corrupt
# database is the one thing you must never do here: the rebuild would carry the
# fault across (an index out of sync with its table copies over verbatim) while
# destroying the file that holds the evidence. Restore instead.
LIVE="$(sq "$DB" 'PRAGMA integrity_check;' 2>&1)" || true
if [ "$LIVE" != "ok" ]; then
  echo "the live database failed integrity_check — do NOT compact it." >&2
  echo "Restore the newest backup per README 'Restore'; the service is untouched." >&2
  echo "$LIVE" >&2
  exit 1
fi

# Profiles are only ever inserted or updated — retention deletes votes, never
# profiles (src/index.ts) — so the rebuilt file can never hold fewer than this.
# That is what catches a truncated or partial rebuild.
BEFORE_PROFILES="$(sq "$DB" 'SELECT COUNT(*) FROM profiles;')"

if [ "$ASSUME_YES" = no ]; then
  if [ ! -t 0 ]; then
    echo "not a terminal — re-run with -y if you meant this non-interactively" >&2
    exit 1
  fi
  printf 'Stop %s, rebuild %s (%s), and restart? [y/N] ' \
    "$SERVICE" "$DB" "$(du -h "$DB" | cut -f1)"
  reply=''
  read -r reply
  case "$reply" in
    [yY] | [yY][eE][sS]) ;;
    *)
      echo "aborted; nothing was touched."
      exit 1 ;;
  esac
fi

STAMP="$(date -u +%Y%m%d-%H%M%S)"
# Same directory as $DB, so the final mv is atomic (one filesystem).
TMP="$(dirname "$DB")/vacuum-$STAMP.db"
STOPPED=no
SWAPPED=no

cleanup() {
  rm -f "$TMP" "${TMP}-wal" "${TMP}-shm"

  # Moved aside but never replaced — the window is one mv wide, and dying
  # inside it would otherwise restart the server onto no database at all,
  # where it creates an empty one and starts answering from it while the real
  # one sits next to it under another name. Put it back first.
  if [ "$SWAPPED" = no ] && [ ! -f "$DB" ] && [ -f "$DB.replaced-$STAMP" ]; then
    echo "putting the original database back" >&2
    for suffix in '' '-wal' '-shm'; do
      if [ -f "$DB$suffix.replaced-$STAMP" ]; then
        mv "$DB$suffix.replaced-$STAMP" "$DB$suffix" || true
      fi
    done
  fi

  if [ "$STOPPED" = yes ]; then
    if [ "$SWAPPED" = no ]; then
      echo "the database was not modified — restarting $SERVICE" >&2
    else
      echo "the compacted database is in place — restarting $SERVICE" >&2
    fi
    systemctl start "$SERVICE" || true
  fi
}
trap cleanup EXIT
# dash skips the EXIT trap on an untrapped SIGTERM, which is what a reboot
# lands mid-run. Route the signals through exit so the service is never left
# stopped and the temp file never left beside the live database.
trap 'exit 143' TERM
trap 'exit 130' INT
trap 'exit 129' HUP

systemctl stop "$SERVICE"
STOPPED=yes

# The rebuild. Stopped, this is the idle case backup.sh measured at 0.6 s on a
# 236 MB database; it scales with the file, and it is the whole of the downtime.
sq -cmd '.timeout 5000' "$DB" "VACUUM INTO '$TMP'"

# The same three checks backup.sh runs on a snapshot, for the same reasons:
# integrity_check calls an *empty* database "ok", the counts prove the tables
# actually arrived, and BEFORE_PROFILES proves the rebuild is not short.
CHECK="$(sq "$TMP" 'PRAGMA integrity_check;' 2>&1)" || true
COUNTS="$(sq "$TMP" 'SELECT COUNT(*) FROM profiles; SELECT COUNT(*) FROM location_votes;' 2>&1)" || COUNTS=''
PROFILES="$(printf '%s\n' "$COUNTS" | sed -n 1p)"
VOTES="$(printf '%s\n' "$COUNTS" | sed -n 2p)"
# Validated as a case, not with [ -lt ]: dash treats a non-number there as a
# test *error*, which an `if` reads as false — so a garbled count would sail
# through the check meant to catch it and a short file would be swapped in.
SHORT=no
case "$PROFILES" in
  '' | *[!0-9]*) SHORT=yes ;;
  *) if [ "$PROFILES" -lt "$BEFORE_PROFILES" ]; then SHORT=yes; fi ;;
esac
if [ "$CHECK" != "ok" ] || [ -z "$COUNTS" ] || [ "$SHORT" = yes ]; then
  echo "the rebuilt database failed verification — keeping the original." >&2
  echo "integrity_check: $CHECK" >&2
  echo "profiles: $PROFILES rebuilt vs $BEFORE_PROFILES live" >&2
  exit 1
fi

# Everything that can still fail happens before the database moves. From here
# to the swap is a single mv, which is the smallest the window gets.
chown "$OWNER:$OWNER" "$TMP"

# Move aside rather than delete, and take -wal/-shm with it: left in place, a
# stale WAL belongs to a file that no longer exists and SQLite would try to
# replay it over the new one.
for suffix in '' '-wal' '-shm'; do
  if [ -f "$DB$suffix" ]; then
    mv "$DB$suffix" "$DB$suffix.replaced-$STAMP"
  fi
done

mv "$TMP" "$DB"
SWAPPED=yes

systemctl start "$SERVICE"
STOPPED=no

tries=0
until curl -fsS "localhost:$PORT/healthz" >/dev/null 2>&1; do
  tries=$((tries + 1))
  if [ "$tries" -ge 10 ]; then
    echo "healthz FAILED — journalctl -u $SERVICE -n 50" >&2
    echo "To put the original back: systemctl stop $SERVICE" >&2
    echo "  mv $DB.replaced-$STAMP $DB && systemctl start $SERVICE" >&2
    exit 1
  fi
  sleep 1
done
trap - EXIT
echo "healthz ok"

AFTER_BYTES="$(bytes "$DB")"
RECLAIMED=$((BEFORE_BYTES - AFTER_BYTES))
PCT=0
if [ "$BEFORE_BYTES" -gt 0 ] && [ "$RECLAIMED" -gt 0 ]; then
  # Rounded like backup.sh's, so the number here and the one that sent you
  # here are the same number.
  PCT=$(((RECLAIMED * 100 + BEFORE_BYTES / 2) / BEFORE_BYTES))
fi
echo "compacted $DB: $BEFORE_BYTES -> $AFTER_BYTES bytes (${PCT}% reclaimed), $PROFILES profiles / $VOTES votes"
echo "the original is kept as $DB.replaced-$STAMP — delete it once this has proven out"
