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

This workspace is for local/demo use, not production deployment. Curriculum import from PDF/JSON, verified real curriculum seed data, email verification, and production operations are outside the MVP. Use only synthetic or manually verified data and do not place real student records in the demo database.
