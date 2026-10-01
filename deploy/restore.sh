#!/usr/bin/env bash
# Run on the server: load a dump (from export_data.sh or a nightly backup) into the
# production database, replacing what is there.
#   ./deploy/restore.sh lab_export_2026-10-01.dump
set -euo pipefail
cd "$(dirname "$0")/.."
DUMP="${1:?usage: deploy/restore.sh <file.dump>}"
ENV_FILE="${ENV_FILE:-.env.prod}"
COMPOSE="docker compose ${COMPOSE_PROJECT:+-p $COMPOSE_PROJECT} -f docker-compose.prod.yml --env-file $ENV_FILE"
set -a; . "$ENV_FILE"; set +a

read -r -p "This REPLACES all data in the production database with $DUMP. Type 'restore' to continue: " ok
[ "$ok" = "restore" ] || { echo "Cancelled"; exit 1; }

$COMPOSE stop backend backup
$COMPOSE exec -T db pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --clean --if-exists --no-owner --no-privileges < "$DUMP"
$COMPOSE start backend backup
echo "Restored. Counts:"
$COMPOSE exec -T db psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -tAc \
  "select 'animals ' || count(*) from animals union all select 'em_grids ' || count(*) from em_grids
   union all select 'ln_vials ' || count(*) from ln_vials union all select 'm80_tubes ' || count(*) from m80_tubes
   union all select 'users ' || count(*) from users"
