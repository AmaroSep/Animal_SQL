#!/usr/bin/env bash
# Run on the Mac: dump the development database (container bioterio_db) to a file
# that deploy/restore.sh can load on the server.
#   ./deploy/export_data.sh            -> lab_export_YYYY-MM-DD.dump
set -euo pipefail
OUT="${1:-lab_export_$(date +%F).dump}"
DB_CONTAINER="${DB_CONTAINER:-bioterio_db}"
docker exec "$DB_CONTAINER" pg_dump -U "${POSTGRES_USER:-postgres}" -d "${POSTGRES_DB:-bioterio}" -Fc --no-owner --no-privileges > "$OUT"
echo "Wrote $OUT ($(du -h "$OUT" | cut -f1))"
docker exec "$DB_CONTAINER" psql -U "${POSTGRES_USER:-postgres}" -d "${POSTGRES_DB:-bioterio}" -tAc \
  "select 'animals ' || count(*) from animals union all select 'em_grids ' || count(*) from em_grids
   union all select 'ln_vials ' || count(*) from ln_vials union all select 'm80_tubes ' || count(*) from m80_tubes
   union all select 'users ' || count(*) from users"
