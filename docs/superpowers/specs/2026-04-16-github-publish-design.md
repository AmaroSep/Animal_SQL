# Design: Prepare Animal_SQL for GitHub Publication

**Date:** 2026-04-16  
**Approach:** Option B — Standard open-source (docs only, no code changes)  
**Scope:** Add repo hygiene files and comprehensive English documentation

---

## Goal

Publish the Bioterio Management System to a public GitHub repo with proper documentation so other labs can discover, install, and adapt the platform.

---

## Files to Create

### Root-level repo files

| File | Purpose |
|------|---------|
| `.gitignore` | Exclude `.env`, `animals_export.csv`, `__pycache__`, `.DS_Store`, `node_modules`, `*.pyc`, `dist/` |
| `.env.example` | All environment variables with placeholder values and inline comments |
| `LICENSE` | MIT license |
| `README.md` | Full English documentation (see structure below) |
| `CONTRIBUTING.md` | Brief contributor guide |

### No code changes

The business logic is left untouched. Rack configuration is documented by pointing to exact lines in source files.

---

## README.md Structure

1. **Header** — title, one-line description, badges (MIT license, Docker, Python, React)
2. **Features** — bulleted list of all capabilities
3. **Tech Stack** — FastAPI · PostgreSQL · React · Vite · Tailwind CSS · Docker Compose
4. **Prerequisites** — Docker Desktop (or Docker + Docker Compose v2)
5. **Quick Start** — 4-step clone → configure → run flow
6. **Rack Configuration** — how to change rack names, count, and grid dimensions:
   - `backend/main.py` lines 49–58: `startup_event` defines racks and cage grid
   - `frontend/src/App.jsx` line 101: `(parseInt(rack_id) - 3) * 70` encodes the offset; must match
7. **Environment Variables** — table documenting each variable in `.env`
8. **API Reference** — table of all backend endpoints with method, path, description
9. **License** — MIT

---

## .env.example Content

```
# PostgreSQL credentials
POSTGRES_USER=postgres
POSTGRES_PASSWORD=your_secure_password_here
POSTGRES_DB=bioterio

# Full connection string used by the backend container
DATABASE_URL=postgresql://<POSTGRES_USER>:<POSTGRES_PASSWORD>@db:5432/<POSTGRES_DB>
```

---

## .gitignore Key Exclusions

- `.env` — contains real credentials
- `animals_export.csv` — may contain real colony data
- `__pycache__/`, `*.pyc` — Python bytecode
- `.DS_Store` — macOS metadata
- `node_modules/` — frontend dependencies
- `frontend/dist/` — build artifacts

---

## Constraints

- README must be entirely in English
- License: MIT
- No refactoring of rack configuration (documented, not changed)
- `animals_export.csv` excluded from repo (real data)

---

## Success Criteria

- A new user can clone the repo and run `docker compose up` with no prior knowledge of the codebase
- The rack configuration section is precise enough that a lab with different rack counts can adapt it in under 10 minutes
- No credentials or real animal data are committed to the repo
