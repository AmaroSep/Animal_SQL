#!/bin/sh
# Nightly database dump, kept for BACKUP_KEEP_DAYS days.
# Runs inside the "backup" service of docker-compose.prod.yml (postgres image).
set -eu

BACKUP_DIR=/backups
BACKUP_HOUR="${BACKUP_HOUR:-3}"            # local hour of the daily dump
BACKUP_KEEP_DAYS="${BACKUP_KEEP_DAYS:-30}"

dump() {
  stamp=$(date +%Y-%m-%d_%H%M)
  file="$BACKUP_DIR/lab_${stamp}.dump"
  # Custom format: compressed, restorable with pg_restore (see deploy/restore.sh)
  if pg_dump -h db -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc -f "$file.partial"; then
    mv "$file.partial" "$file"
    echo "$(date '+%F %T') backup written: $file ($(du -h "$file" | cut -f1))"
  else
    rm -f "$file.partial"
    echo "$(date '+%F %T') BACKUP FAILED" >&2
  fi
  find "$BACKUP_DIR" -name 'lab_*.dump' -mtime +"$BACKUP_KEEP_DAYS" -delete
}

# One dump at start-up, then every day at BACKUP_HOUR:00
sleep 20
dump
while true; do
  now=$(date +%s)
  next=$(date -d "$(date +%F) $(printf %02d "$BACKUP_HOUR"):00" +%s 2>/dev/null || echo $((now + 86400)))
  [ "$next" -le "$now" ] && next=$((next + 86400))
  sleep $((next - now))
  dump
done
