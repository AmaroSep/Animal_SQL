#!/usr/bin/env bash
# Run on the server from the repository folder:  ./deploy/install.sh
# Creates .env.prod (random database password) if missing, builds and starts the stack.
set -euo pipefail
cd "$(dirname "$0")/.."

command -v docker >/dev/null || { echo "Docker is not installed"; exit 1; }
docker compose version >/dev/null || { echo "Docker Compose v2 is required"; exit 1; }

if [ ! -f .env.prod ]; then
  cp .env.prod.example .env.prod
  pw=$(openssl rand -base64 24 | tr -d '/+=' | cut -c1-28)
  sed -i.bak "s|^POSTGRES_PASSWORD=.*|POSTGRES_PASSWORD=${pw}|" .env.prod && rm -f .env.prod.bak
  chmod 600 .env.prod
  echo "Created .env.prod with a random database password. Review PUBLIC_URL / WEB_BIND before going on."
fi
mkdir -p backups

COMPOSE="docker compose -f docker-compose.prod.yml --env-file .env.prod"
profile=""
grep -q '^TUNNEL_TOKEN=.\+' .env.prod && profile="--profile tunnel"
grep -q '^QUICK_TUNNEL=true' .env.prod && profile="$profile --profile quicktunnel"
$COMPOSE $profile up -d --build

echo "Waiting for the API..."
for i in $(seq 1 30); do
  # First status line of the response (wget also prints an error line for 401)
  code=$($COMPOSE exec -T web wget -q -O /dev/null -S http://localhost/api/auth/me 2>&1 | awk '$1 ~ /^HTTP\// {print $2; exit}' || true)
  [ "$code" = "401" ] && { echo "Up: the API answers (401 = sign-in required, as expected)."; break; }
  sleep 2
done
$COMPOSE ps
cat <<MSG

Next steps:
  1. Load your data:        ./deploy/restore.sh <file.dump>
  2. Create an admin user:  $COMPOSE exec backend python manage_users.py create <username> --role admin
  3. Open the app at the address in PUBLIC_URL
MSG
