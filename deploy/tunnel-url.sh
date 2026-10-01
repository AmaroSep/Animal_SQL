#!/usr/bin/env bash
# Print the current public address of the quick tunnel (it changes when the tunnel restarts)
cd "$(dirname "$0")/.."
docker compose -f docker-compose.prod.yml --env-file "${ENV_FILE:-.env.prod}" logs quicktunnel 2>/dev/null \
  | grep -oE 'https://[a-z0-9-]+\.trycloudflare\.com' | tail -1
