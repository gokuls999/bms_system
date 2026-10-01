#!/bin/sh
set -e

# Apply schema changes, then seed demo data (seed_demo skips if data already exists).
python manage.py migrate --noinput
python manage.py seed_demo

exec gunicorn config.wsgi:application \
    --bind 0.0.0.0:8000 \
    --workers "${GUNICORN_WORKERS:-3}" \
    --timeout 60 \
    --access-logfile -
