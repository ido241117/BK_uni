# BK Uni local/demo

## Requirements

- Node.js 20 or newer and npm.
- PostgreSQL available locally.
- Two databases: `bk_uni` for the demo and `bk_uni_test` for tests. Keep the test database separate from any local data you need to preserve.

Create the databases with PostgreSQL tools, for example:

```powershell
createdb -U postgres bk_uni
createdb -U postgres bk_uni_test
```

Copy the example environment files from the workspace root:

```powershell
Copy-Item BK_uni/backend/.env.example BK_uni/backend/.env
Copy-Item BK_uni/frontend/.env.example BK_uni/frontend/.env
```

Set the PostgreSQL credentials in `backend/.env`. Keep `DB_NAME=bk_uni` and `DB_TEST_NAME=bk_uni_test`; they must be different. Set `ADMIN_SEED_EMAIL` and an `ADMIN_SEED_PASSWORD` of at least 8 characters. The seed also creates synthetic rule-test profiles; set `DEMO_SEED_PASSWORD` to give them a separate password, or leave it blank to use `ADMIN_SEED_PASSWORD`. Do not commit `.env` files or share the demo password.

## Install and migrate

```powershell
Push-Location BK_uni/backend
npm ci
npm run migration:run
npm run seed
Pop-Location

Push-Location BK_uni/frontend
npm ci
Pop-Location
```

The seed command creates or updates the admin account and inserts three small synthetic rule-test curricula with six student profiles. These are test data, not verified programs of study. The five-course fixture at `backend/src/fixtures/synthetic-curriculum.json` remains the automated engine fixture. See `docs/manual-test/04-rule-testcases.md` for accounts and expected outputs.

## Run

Start each process in a separate terminal from the workspace root:

```powershell
Push-Location BK_uni/backend
npm run dev
```

```powershell
Push-Location BK_uni/frontend
npm run dev
```

Open `http://127.0.0.1:5174`. The frontend sends `/api/v1` requests through Vite to the backend on port `3200`. Sign in with the admin email and password configured for the seed, or register a student account.

## Agent demo (Sprint 2)

The Python service uses Python 3.13 and runs without database access. Install it in its own virtual environment:

```powershell
Push-Location BK_uni/python
py -3.13 -m venv .venv
.venv\Scripts\python.exe -m pip install -e ".[dev]"
if (!(Test-Path .env)) { Copy-Item .env.example .env }
Pop-Location
```

Keep an existing `BK_uni/python/.env`; add the required values instead of copying over it. Set `SERVICE_TOKEN` to the same value as backend `AGENT_SERVICE_TOKEN`, and `GATEWAY_SERVICE_TOKEN` to backend `AGENT_GATEWAY_SERVICE_TOKEN`. The Python and backend public-key settings must contain the same Ed25519 public key; keep its private key only in backend `.env`. Set `AGENT_SYNTHETIC_USER_IDS` to IDs of synthetic test accounts only. DeepSeek requires `DEEPSEEK_API_KEY`; a configured key alone does not enable non-allowlisted users.

Run the service in a third terminal:

```powershell
Push-Location BK_uni/python
.venv\Scripts\python.exe -m uvicorn bk_agent.main:app --app-dir src --reload --port 8001
```

Open `/chat` as an allowlisted synthetic student. Until DeepSeek processing/retention terms and the allowed data fields are approved, do not add real student IDs to the allowlist. The UI/API remain available, but the agent will return an unavailable status for other accounts.

## Verify

Run backend tests from `BK_uni/backend`:

```powershell
npm test -- --runInBand
npm run test:e2e -- --runInBand
npm run migration:verify
npm run build
```

Run frontend checks from `BK_uni/frontend`:

```powershell
npm test
npm run lint
npm run build
```

The PostgreSQL e2e suite and migration verifier require the dedicated `DB_TEST_NAME`. They reject a missing test database name, a name that does not contain `test`, or a value equal to `DB_NAME`. E2e creates a random schema in that database, runs migrations there, and drops the schema afterward; it does not use or modify the demo database.

## Demo limits

This workspace is for local/demo use, not production deployment. Curriculum import from PDF/JSON and learner-owned editable curriculum plans are not implemented in the current app; verified real curriculum seed data, email verification, and production operations are also outside the MVP. Student accounts can currently edit their own profile/course statuses, but cannot edit canonical curriculum data. Use only synthetic or manually verified data and do not place real student records in the demo database.
