#!/bin/bash
set -euo pipefail

echo "[entrypoint] Running database migrations..."
alembic upgrade head

echo "[entrypoint] Starting application..."
exec uvicorn app.main:app --host 0.0.0.0 --port "${APP_PORT:-8000}"
