# Deploying on the lab server

The production stack (`docker-compose.prod.yml`) runs four services:

| Service | Role | Exposed |
|---|---|---|
| `web` | Caddy: compiled frontend + `/api` proxy, security headers | `WEB_BIND:WEB_PORT` (default `127.0.0.1:8080`) |
| `backend` | FastAPI, no auto-reload | inside the stack only |
| `db` | PostgreSQL 15 | inside the stack only |
| `backup` | nightly `pg_dump` to `./backups`, keeps 30 days | — |
| `cloudflared` | optional public access (`--profile tunnel`) | outbound only |

Commands below use `C="docker compose -f docker-compose.prod.yml --env-file .env.prod"`.

## 1. First install (on the server)

```bash
git clone <repository> lab && cd lab
./deploy/install.sh          # creates .env.prod with a random DB password, builds, starts
```

Edit `.env.prod` before or after (then run `./deploy/install.sh` again):

- **Tailscale access**: `WEB_BIND=0.0.0.0`, `PUBLIC_URL=http://<server-tailscale-name>:8080`, `COOKIE_SECURE=false`
  (Tailscale already encrypts the connection).
- **Cloudflare Tunnel**: create a tunnel in the Cloudflare dashboard (Zero Trust → Networks → Tunnels),
  route your hostname to `http://web:80`, then set `TUNNEL_TOKEN=...`, `PUBLIC_URL=https://lab.yourdomain`,
  `COOKIE_SECURE=true`, `TRUST_CF_HEADER=true`. Keep `WEB_BIND=127.0.0.1`.

## 2. Move the data from the Mac

On the Mac (development copy running):

```bash
./deploy/export_data.sh              # -> lab_export_YYYY-MM-DD.dump, prints record counts
scp lab_export_*.dump <user>@<server>:lab/
```

On the server:

```bash
./deploy/restore.sh lab_export_YYYY-MM-DD.dump   # asks for confirmation, prints the same counts
```

User accounts travel with the data. To add or reset one:

```bash
$C exec backend python manage_users.py create <username> --role admin|editor|viewer
$C exec backend python manage_users.py reset-password <username>
```

## 3. Everyday operations

```bash
$C ps                          # status
$C logs -f backend             # API log
git pull && ./deploy/install.sh   # update to a new version (data is kept)
ls -lh backups/                # nightly dumps
./deploy/restore.sh backups/lab_<date>.dump   # roll back to a backup
```

Copy `backups/` off the server (e.g. Synology Hyper Backup) so a disk failure does not lose data.
