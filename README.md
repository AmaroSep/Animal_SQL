# Bioterio Management System

A web-based animal colony management platform for research laboratories. Track animals across racks and cages, manage breeding pairs, visualize inventory statistics, and import/export colony data via CSV.

![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)
![Docker](https://img.shields.io/badge/Docker-required-blue)
![Python](https://img.shields.io/badge/Python-3.11-blue)
![React](https://img.shields.io/badge/React-18-61DAFB)

---

## Features

- **Visual rack/cage grid** — 10×7 grid per rack, color-coded by occupancy and breeding status
- **Animal registration** — ID, sex, date of birth, ear mark, genotype
- **Status tracking** — Alive / Dead / Eliminated with elimination reason log
- **Breeding wizard** — 3-step wizard to create Pair (1M+1F) or Trio (1M+2F) breeding groups
- **Statistics dashboard** — Live inventory breakdown by genotype, sex, and age range (0–3m, 3–6m, 6–9m, >9m)
- **Animal history** — Full log of decommissioned animals
- **Cage merge** — Relocate all animals from one cage to another in one action
- **CSV import/export** — Bulk load or download full colony data

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Backend | FastAPI + SQLAlchemy + PostgreSQL |
| Frontend | React 18 + Vite + Tailwind CSS |
| Deployment | Docker Compose |

---

## Prerequisites

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) (Mac/Windows) **or** Docker Engine + Docker Compose v2 (Linux)

No Python or Node.js installation required — everything runs inside containers.

---

## Quick Start

```bash
# 1. Clone the repository
git clone https://github.com/<your-username>/Animal_SQL.git
cd Animal_SQL

# 2. Configure environment variables
cp .env.example .env
# Edit .env and set a secure POSTGRES_PASSWORD

# 3. Start all services
docker compose up --build

# 4. Open the application
# Frontend:  http://localhost:5173
# API docs:  http://localhost:8000/docs
```

On first startup, the backend automatically creates the database tables and initializes the rack/cage structure (see [Rack Configuration](#rack-configuration) below).

---

## Rack Configuration

The system ships pre-configured for **3 racks** (named `RACK 3`, `RACK 4`, `RACK 5`), each with a **10-row × 7-column** grid (70 cages per rack, 210 total).

### Changing rack names or count

Edit `backend/main.py`, lines 49–58 — the `startup_event` function:

```python
# backend/main.py  (lines 49–58)
if db.query(models.Rack).count() == 0:
    for i in [3, 4, 5]:                        # ← rack name suffixes
        rack = models.Rack(name=f"RACK {i}")   # ← name format
        db.add(rack)
        db.flush()

        for row in range(1, 11):               # ← 10 rows  (change upper limit)
            for col in range(1, 8):            # ← 7 columns (change upper limit)
                cage = models.Cage(rack_id=rack.id, row=row, column=col)
                db.add(cage)
```

**Example — 2 racks named A and B, each 8×6:**

```python
for name in ["RACK A", "RACK B"]:
    rack = models.Rack(name=name)
    db.add(rack)
    db.flush()
    for row in range(1, 9):     # 8 rows
        for col in range(1, 7): # 6 columns
            cage = models.Cage(rack_id=rack.id, row=row, column=col)
            db.add(cage)
```

### Matching the frontend

The "Add Animal" form uses a numeric offset to calculate cage IDs. If you change the rack count or starting number, update `frontend/src/App.jsx` line 101:

```js
// App.jsx line 101 — current formula for 3 racks starting at suffix 3
const cageId = (parseInt(newAnimal.rack_id) - 3) * 70 + parseInt(newAnimal.cage_num);
//              ↑ subtract the first rack's suffix     ↑ cages per rack (rows × cols)
```

Adjust the `- 3` offset and `* 70` multiplier to match your rack configuration.

> **Note:** These changes only take effect on a fresh database. If data already exists, the racks will not be re-initialized. To reset, stop the stack and run `docker compose down -v` to delete the database volume, then `docker compose up --build`.

---

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `POSTGRES_USER` | PostgreSQL username | `postgres` |
| `POSTGRES_PASSWORD` | PostgreSQL password | `postgres` |
| `POSTGRES_DB` | Database name | `bioterio` |
| `DATABASE_URL` | Full SQLAlchemy connection string | `postgresql://postgres:postgres@db:5432/bioterio` |

> The `DATABASE_URL` must use the service name `db` as the host — this is the Docker Compose internal hostname for the database container.

---

## API Reference

The full interactive API documentation is available at `http://localhost:8000/docs` (Swagger UI) when the backend is running.

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/racks` | List all racks with live animals |
| `GET` | `/racks/{rack_id}` | Get a single rack with cage details |
| `GET` | `/cages/{cage_id}/animals` | List live animals in a cage |
| `PATCH` | `/cages/{cage_id}/breeding_status` | Toggle breeding pair flag |
| `POST` | `/cages/merge` | Move all animals from source to destination cage |
| `GET` | `/animals/history` | List dead and eliminated animals |
| `GET` | `/statistics` | Inventory breakdown by genotype, sex, and age |
| `POST` | `/animals` | Register a new animal |
| `PUT` | `/animals/{animal_id}` | Update animal data |
| `PATCH` | `/animals/{animal_id}/status` | Change animal status (Dead/Eliminated) |
| `POST` | `/breeding/create` | Create a breeding group and move animals |
| `POST` | `/breeding/end/{cage_id}` | End breeding and return animals to home cages |
| `GET` | `/export/animals/csv` | Download full colony as CSV |
| `POST` | `/import/animals/csv` | Bulk import/update animals from CSV |

---

## CSV Import Format

The import endpoint accepts CSV files exported by this system or manually prepared with these columns:

| Column | Required | Example |
|--------|----------|---------|
| `Animal ID` | Yes | `MOUSE-001` |
| `Rack` | No | `RACK 3` |
| `Cage` | No | `A1-R3` |
| `Sex` | Yes | `M` or `F` |
| `Date of Birth` | Yes | `01/15/2025` or `2025-01-15` |
| `Mark` | No | `R-EAR` |
| `Genotype` | Yes | `WT` |
| `Status` | No | `Vivo` / `Muerto` / `Eliminado` |

Dates are accepted in `MM/DD/YYYY`, `MM/DD/YY`, and `YYYY-MM-DD` formats.

---

## License

MIT — see [LICENSE](LICENSE) for full text.
