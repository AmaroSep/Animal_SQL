# Lab Management System

A web platform for research laboratories: the animal colony (Bioterio) and the lab's sample storage (EM grids, the LN2 tank and the -80 °C freezers), behind one sign-in, with per-user responsibility and a full audit trail.

![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)
![Docker](https://img.shields.io/badge/Docker-required-blue)
![Python](https://img.shields.io/badge/Python-3.11-blue)
![React](https://img.shields.io/badge/React-18-61DAFB)

---

## Modules

### Bioterio — animal colony

- **Rack grid** — 10×7 grid per rack. Each cage shows its number, animal count, position (e.g. `D4`), facility cage card and the responsible user's colour; breeding cages are pink.
- **Animals** — sex, date of birth, ear mark, genotype, Animal Code, origin cage, notes and parents (Parent 1 / Parent 2 suggest existing Animal Codes). Status Alive / Dead / Eliminated, with the reason and date.
- **Breeding** — a 3-step wizard sets up a Pair (1M+1F) or Trio (1M+2F) in a free cage, with its pairing date. Ending the breeding sends the animals back to their home cages or to a new one.
- **Litters and weaning** — each breeding cage records its current litter's birth date. The rack shows a countdown to weaning at 21 days (`Wean 9d`; amber within 3 days, red when due or late), or the days since pairing while there is no litter. *Pups weaned* records the wean date on the breeders and clears the litter.
- **Cage handling** — drag a cage onto another position to swap them, move a whole cage (animals, card, responsible user, breeding state) to a free position in any rack, merge two cages, hand cages over to another user. *Fit to screen* shows the whole rack at once.
- **Family tree** — an animal's parents and grandparents and its offspring, linked by Animal Code.
- **Statistics** — live animals by genotype, sex and age range (0–3m, 3–6m, 6–9m, >9m), and an age "river" view. Your cages by default; admins can switch to the whole colony.
- **History** — dead and eliminated animals, which keep their responsible user and last cage card.
- **Excel import / export** in the lab's shared colony workbook layout:
  - *Breeders* — Cage Position, BCM Cage, Animal Code, ID, DOB, Sex, Genotype, Age (W), Age (M), Parents ×2, Responsible, Elimination Reason, Wean Date, Paired, Litter DOB
  - *Colony* — Cage Position, BCM Cage, Animal Code, ID, DOB, Sex, Genotype, Age, Status, Parents ×2, Responsible, Elimination Reason

  Both sections use the same columns up to Elimination Reason, so they line up in one sheet. The import (admins) shows a dry run row by row before saving, and also reads older sheets without Cage Position / Paired / Litter DOB in Breeders.

### EM Grids

Grid boxes (Quantifoil and EMS layouts drawn as the physical box), positions, samples and grid types; staining steps (washes, stain, times, drying) and preparation conditions. Status Stored / Imaged / Used / Discarded — grids keep their slot until the record is deleted. Excel export.

### LN2 tank

Racks, boxes and vials in the liquid nitrogen tank: freeze (batch), thaw/remove and restore vials, cells per vial, passage comments, master stocks that must not be thawed without asking, box labels and use restrictions. The lab's existing tank spreadsheets can be loaded with `scripts/import_ln2_excel.py`.

### -80 °C freezers

Configurable hierarchy: freezer → compartment → rack (levels × depth) → box → tubes. **Sample types** (CSF, brain, …) define their own fields — text, number, date, choice, a link to an animal, or a formula — and fields marked *restricted* (clinical data) are shown only to admins and users with restricted access. Aliquot numbers, reserved tubes, used/removed tubes with date and user. Excel import (one sample type per file, used-up aliquots imported as Used) and inventory export.

### Users and access

- Sign-in with a session cookie; repeated failed attempts are locked out for a while.
- Roles: **admin** (everything, including user management), **editor** (create and change records), **viewer** (read only).
- In the Bioterio, a cage belongs to its responsible user: only they or an admin can change it and its animals. An empty cage is taken by whoever puts animals in it, and released when it is empty again.
- EM grids, LN2 vials and -80 tubes show who created and last edited them. Admins see the users and the log of every change under account menu → *Users & activity*.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Backend | FastAPI + SQLAlchemy + PostgreSQL 15 |
| Frontend | React 18 + Vite + Tailwind CSS (SheetJS for Excel) |
| Deployment | Docker Compose; Caddy in production |

---

## Quick Start (development)

Requires [Docker Desktop](https://www.docker.com/products/docker-desktop/) (Mac/Windows) or Docker Engine + Compose v2 (Linux). No Python or Node.js installation is needed.

```bash
# 1. Clone the repository
git clone https://github.com/AmaroSep/Animal_SQL.git
cd Animal_SQL

# 2. Configure environment variables (set a secure POSTGRES_PASSWORD, also in DATABASE_URL)
cp .env.example .env

# 3. Start all services
docker compose up --build

# 4. Create the first administrator (asks for the password)
docker exec -it bioterio_backend python manage_users.py create <username> --role admin

# 5. Open the application
#   Frontend:  http://localhost:5173
#   API docs:  http://localhost:8000/docs
```

The development stack mounts the source code into the containers, so backend and frontend changes reload on their own.

On startup the backend creates the tables, adds any new columns to an existing database (safe to run on every start, data is kept) and, on an empty database, creates the racks and cages (see [Rack configuration](#rack-configuration)), the LN2 tank structure and the default -80 sample types.

### User accounts

```bash
docker exec -it bioterio_backend python manage_users.py create <username> --role admin|editor|viewer
docker exec -it bioterio_backend python manage_users.py reset-password <username>
docker exec -it bioterio_backend python manage_users.py list
docker exec -it bioterio_backend python manage_users.py assign-cages <username>
```

Passwords are typed at a hidden prompt (at least 10 characters). Admins can also manage users from the app (account menu → *Users & activity*).

---

## Production

`docker-compose.prod.yml` runs the compiled frontend behind Caddy (`web`), the API without auto-reload, PostgreSQL, nightly `pg_dump` backups (kept 30 days) and, optionally, a Cloudflare Tunnel. Only `web` publishes a port.

```bash
./deploy/install.sh    # first install or update: creates .env.prod if missing, builds and starts
```

Updates keep the data: copy the new code to the server and run `./deploy/install.sh` again (or `docker compose -f docker-compose.prod.yml --env-file .env.prod up -d --build backend web`). Access through Tailscale or Cloudflare Tunnel, moving data from a development copy, backups and restores are described in [deploy/README.md](deploy/README.md).

---

## Rack configuration

The Bioterio starts with **3 racks** (`RACK 3`, `RACK 4`, `RACK 5`), each a **10-row × 7-column** grid. To change their names, count or size, edit the seed in `startup_event` in `backend/main.py`:

```python
if db.query(models.Rack).count() == 0:
    for i in [3, 4, 5]:                        # ← rack name suffixes
        rack = models.Rack(name=f"RACK {i}")   # ← name format
        ...
        for row in range(1, 11):               # ← 10 rows
            for col in range(1, 8):            # ← 7 columns (A–G)
```

The Excel import finds cages by rack number and position (`Rack 5: D4`), so keep a number at the end of each rack name. The seed only runs on an empty database; to start over, `docker compose down -v` deletes the database volume.

---

## Environment Variables

Development (`.env`, see `.env.example`):

| Variable | Description | Default |
|----------|-------------|---------|
| `POSTGRES_USER` / `POSTGRES_PASSWORD` / `POSTGRES_DB` | Database credentials | `postgres` / `postgres` / `bioterio` |
| `DATABASE_URL` | SQLAlchemy connection string (host `db`, the Compose service) | `postgresql://postgres:postgres@db:5432/bioterio` |
| `CORS_ORIGINS` | Origins allowed to call the API with the session cookie (comma separated) | `http://localhost:5173` |
| `COOKIE_SECURE` | `true` when served over HTTPS | `false` |
| `SESSION_HOURS` | Session length | `12` |

Production (`.env.prod`, see `.env.prod.example`) adds `PUBLIC_URL`, `WEB_PORT`, `WEB_BIND`, `TUNNEL_TOKEN`, `TRUST_CF_HEADER` and the backup settings `BACKUP_DIR`, `BACKUP_HOUR`, `BACKUP_KEEP_DAYS`, `TZ`.

---

## API

Every endpoint except sign-in requires a session. The full interactive reference is at `http://localhost:8000/docs` (Swagger UI) when the development stack is running.

| Area | Prefix / main endpoints |
|------|-------------------------|
| Auth and users | `/auth/login`, `/auth/logout`, `/auth/me`, `/auth/users` (admin), `/auth/audit` (admin) |
| Racks and cages | `/racks`, `/cages/{id}/…` (breeding status, breeding dates, number, card, move), `/cages/swap-positions`, `/cages/merge`, `/cages/owner` |
| Animals | `/animals`, `/animals/{id}`, `/animals/{id}/status`, `/animals/history`, `/animals/family`, `/animals/codes`, `/statistics` |
| Breeding | `/breeding/create`, `/breeding/end/{cage_id}` |
| Colony Excel | `/animals/export`, `/import/animals/rows` (dry run by default) |
| EM grids | `/em/boxes`, `/em/grids` |
| LN2 tank | `/ln2/tank`, `/ln2/boxes/{id}`, `/ln2/vials`, `/ln2/import` |
| -80 freezers | `/m80/sample-types`, `/m80/freezers`, `/m80/compartments`, `/m80/racks`, `/m80/boxes`, `/m80/tubes`, `/m80/import` |

The older CSV endpoints (`/export/animals/csv`, `/import/animals/csv`) are still available; the app uses the Excel format above.

---

## License

MIT — see [LICENSE](LICENSE) for full text.
