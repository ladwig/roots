#!/bin/sh
# Let Supabase (pg_cron) call the worker every minute: npm run worker:schedule -- https://app.example.com
# Stop it: npm run worker:schedule -- off. Uses CRON_SECRET from .env.local (must match the deployment's).
set -e
[ -n "$1" ] || { echo "usage: npm run worker:schedule -- <app-url>|off"; exit 1; }
set -a; . ./.env.local; set +a
url=$(printf %s "$1" | tr -d "'\\\\ ")
secret=$(printf %s "$CRON_SECRET" | tr -d "'\\\\ ")
npx supabase db query --db-url "$DATABASE_URL" "select public.schedule_worker('$url', nullif('$secret', ''))" 2>&1 | tail -n +2
