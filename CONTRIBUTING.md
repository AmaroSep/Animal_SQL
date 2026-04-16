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
