#!/bin/sh
set -eu
cd /app/backend

python - <<'PY'
import time
from sqlalchemy import create_engine, text
from app.config import get_settings
settings=get_settings()
url=settings.database_url
for attempt in range(1,31):
    try:
        engine=create_engine(url,pool_pre_ping=True)
        with engine.connect() as conn: conn.execute(text('SELECT 1'))
        print(f'Database ready; schema={settings.database_schema}')
        break
    except Exception as exc:
        if attempt == 30: raise
        print(f'Waiting for database ({attempt}/30): {exc}')
        time.sleep(2)
PY

alembic upgrade head
exec uvicorn app.main:app --host 0.0.0.0 --port "${PORT:-8000}" --proxy-headers --forwarded-allow-ips='*'
