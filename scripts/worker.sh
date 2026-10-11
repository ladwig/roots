#!/bin/sh
# Local stand-in for the cron: sends due event deliveries (and polls Telegram) every 10 s.
# Needs the dev server running and CRON_SECRET in .env.local.
set -a; . ./.env.local; set +a
while true; do
  curl -s -H "Authorization: Bearer $CRON_SECRET" "${NEXT_PUBLIC_APP_URL:-http://localhost:3000}/api/cron/events"; echo
  sleep 10
done
