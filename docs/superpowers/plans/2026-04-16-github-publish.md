# GitHub Publication Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prepare the Bioterio Management System for public GitHub publication with proper repo hygiene and complete English documentation.

**Architecture:** No code changes — create five new files at the repo root (`.gitignore`, `.env.example`, `LICENSE`, `README.md`, `CONTRIBUTING.md`). All files are standalone; tasks are independent and can be done in any order after Task 1.

**Tech Stack:** Markdown, standard Git conventions, MIT License

---

## File Map

| File | Action | Responsibility |
|------|--------|---------------|
| `.gitignore` | Create | Prevent credentials and generated files from being committed |
| `.env.example` | Create | Document all required environment variables with placeholders |
| `LICENSE` | Create | MIT license text |
| `README.md` | Create | Full installation and configuration documentation |
| `CONTRIBUTING.md` | Create | Brief contributor guide |

---

## Task 1: Create .gitignore

**Files:**
- Create: `.gitignore`

- [ ] **Step 1: Create the file**

`/Users/armando/Documents/Animal_SQL/.gitignore`:

```gitignore
# Environment & secrets
.env
*.env

# Real colony data
animals_export.csv

# Python
__pycache__/
*.pyc
*.pyo
*.pyd
.Python
*.egg-info/
dist/
build/
.venv/
venv/
env/

# Node
node_modules/
frontend/dist/
frontend/.vite/

# macOS
.DS_Store
.AppleDouble
.LSOverride

# IDE
.vscode/
.idea/
*.swp
*.swo
```

- [ ] **Step 2: Verify .env and animals_export.csv are excluded**

Run from `/Users/armando/Documents/Animal_SQL/`:
```bash
echo "test" > test_secret.env && git check-ignore -v test_secret.env && rm test_secret.env
```
Expected output: `.gitignore:2:.env	test_secret.env`

- [ ] **Step 3: Commit**

```bash
cd /Users/armando/Documents/Animal_SQL
git init  # only if repo not already initialized
git add .gitignore
git commit -m "chore: add .gitignore"
```

---

## Task 2: Create .env.example

**Files:**
- Create: `.env.example`

- [ ] **Step 1: Create the file**

`/Users/armando/Documents/Animal_SQL/.env.example`:

```dotenv
# ─── PostgreSQL ───────────────────────────────────────────────────────────────
# Credentials for the database container.
# Change these values before deploying in any shared or production environment.
POSTGRES_USER=postgres
POSTGRES_PASSWORD=your_secure_password_here
POSTGRES_DB=bioterio

# ─── Backend ──────────────────────────────────────────────────────────────────
# Full connection string used by the FastAPI container.
# Replace <POSTGRES_USER>, <POSTGRES_PASSWORD>, and <POSTGRES_DB>
# with the values you set above.
DATABASE_URL=postgresql://postgres:your_secure_password_here@db:5432/bioterio
```

- [ ] **Step 2: Commit**

```bash
cd /Users/armando/Documents/Animal_SQL
git add .env.example
git commit -m "chore: add .env.example template"
```

---

## Task 3: Create LICENSE

**Files:**
- Create: `LICENSE`

- [ ] **Step 1: Create the file**

`/Users/armando/Documents/Animal_SQL/LICENSE`:

```
MIT License

Copyright (c) 2026 Armando

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

- [ ] **Step 2: Commit**

```bash
cd /Users/armando/Documents/Animal_SQL
git add LICENSE
git commit -m "chore: add MIT license"
```

---

## Task 4: Create README.md

**Files:**
- Create: `README.md`

- [ ] **Step 1: Create the file**

`/Users/armando/Documents/Animal_SQL/README.md`:

````markdown
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
    for row in range(1, 9):    # 8 rows
        for col in range(1, 7): # 6 columns
            cage = models.Cage(rack_id=rack.id, row=row, column=col)
            db.add(cage)
```

### Matching the frontend

The "Add Animal" form uses a numeric offset to calculate cage IDs. If you change the rack count or starting number, update `frontend/src/App.jsx` line 101:

```js
// App.jsx line 101 — current formula for 3 racks starting at index 3
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
````

- [ ] **Step 2: Commit**

```bash
cd /Users/armando/Documents/Animal_SQL
git add README.md
git commit -m "docs: add comprehensive README"
```

---

## Task 5: Create CONTRIBUTING.md

**Files:**
- Create: `CONTRIBUTING.md`

- [ ] **Step 1: Create the file**

`/Users/armando/Documents/Animal_SQL/CONTRIBUTING.md`:

```markdown
# Contributing

Thank you for your interest in improving Bioterio Management System.

## Development Setup

```bash
git clone https://github.com/<your-username>/Animal_SQL.git
cd Animal_SQL
cp .env.example .env
docker compose up --build
```

The backend hot-reloads on file save (volume-mounted). The frontend (Vite) also hot-reloads at `http://localhost:5173`.

## Making Changes

1. Fork the repository and create a branch: `git checkout -b feat/your-feature`
2. Make your changes
3. Test manually by running `docker compose up --build` and verifying the affected features
4. Commit with a descriptive message using [conventional commits](https://www.conventionalcommits.org/): `feat:`, `fix:`, `docs:`, `chore:`
5. Open a pull request with a description of what changed and why

## Project Structure

```
Animal_SQL/
├── backend/          # FastAPI application
│   ├── main.py       # API routes
│   ├── models.py     # SQLAlchemy ORM models
│   ├── schemas.py    # Pydantic request/response schemas
│   └── database.py   # DB connection setup
├── frontend/
│   └── src/
│       ├── App.jsx                        # Main application shell
│       ├── components/
│       │   ├── CageModal.jsx              # Cage detail & animal actions
│       │   ├── AnimalDetailModal.jsx      # Animal detail view
│       │   └── StatisticsDashboard.jsx    # Charts and stats
│       └── services/api.js               # All backend API calls
└── docker-compose.yml
```

## Reporting Issues

Open a GitHub Issue with:
- Steps to reproduce
- Expected vs actual behavior
- Docker and OS version
```

- [ ] **Step 2: Commit**

```bash
cd /Users/armando/Documents/Animal_SQL
git add CONTRIBUTING.md
git commit -m "docs: add CONTRIBUTING guide"
```

---

## Task 6: Initialize Git repo and push to GitHub

- [ ] **Step 1: Initialize git if needed and verify .gitignore is working**

```bash
cd /Users/armando/Documents/Animal_SQL
git status
```

Confirm that `.env` and `animals_export.csv` do NOT appear in the untracked/modified list.

- [ ] **Step 2: Stage all new files**

```bash
git add .gitignore .env.example LICENSE README.md CONTRIBUTING.md docs/
git status
```

Verify only these files are staged. If `animals_export.csv` or `.env` appear, stop and check `.gitignore`.

- [ ] **Step 3: Create GitHub repository**

Go to https://github.com/new and create a new **public** repository named `Animal_SQL` (or your preferred name). Do **not** initialize with README or .gitignore (you already have them).

- [ ] **Step 4: Push**

```bash
git remote add origin https://github.com/<your-username>/Animal_SQL.git
git branch -M main
git push -u origin main
```

- [ ] **Step 5: Verify on GitHub**

Open the repo URL in a browser. Confirm:
- README renders correctly
- `.env` file is NOT visible in the file tree
- `animals_export.csv` is NOT visible in the file tree
- LICENSE tab shows MIT

---

## Self-Review Notes

- **Spec coverage**: All 5 files from the spec are covered (`.gitignore`, `.env.example`, `LICENSE`, `README.md`, `CONTRIBUTING.md`). Rack configuration section points to exact line numbers in `backend/main.py` (49–58) and `frontend/src/App.jsx` (101). Environment variables table covers all 4 variables in `.env`. API reference covers all 14 endpoints from `backend/main.py`.
- **No placeholders**: All content is complete. The only `<your-username>` references are intentional — the user must supply their own GitHub username.
- **Consistency**: No cross-task type references.
