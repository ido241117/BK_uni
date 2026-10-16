# BK Uni Agent

FastAPI/LangGraph service for the Sprint 2 academic-advising prototype. It has no database access or durable conversation store. Provider calls are restricted to requests whose NestJS-signed delegated assertion is explicitly classified as `synthetic`.

## Local setup

```powershell
py -3.13 -m venv .venv
.venv\Scripts\python.exe -m pip install -e ".[dev]"
if (!(Test-Path .env)) { Copy-Item .env.example .env }
.venv\Scripts\python.exe -m uvicorn bk_agent.main:app --app-dir src --reload --port 8001
```

Set local service credentials and the NestJS Ed25519 public key in `.env`. Do not put private keys, database credentials, student data, or real provider payloads in fixtures. `/health/live` and `/health/ready` do not require provider credentials.

If `.env` already exists, keep it and add only the required local variables; do not overwrite it with `.env.example`.

Run offline tests with `.venv\Scripts\python.exe -m pytest`.
