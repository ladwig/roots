#!/bin/sh
# Make an existing account a platform admin (superadmin).
# Usage: npm run admin:grant -- you@example.com
set -e
[ -n "$1" ] || { echo "usage: npm run admin:grant -- <email>"; exit 1; }
set -a; . ./.env.local; set +a
email=$(printf %s "$1" | tr '[:upper:]' '[:lower:]' | tr -d "'\\\\ ")
npx supabase db query --db-url "$DATABASE_URL" \
  "insert into public.platform_admins (user_id) select id from auth.users where email = '$email' on conflict (user_id) do nothing returning user_id" 2>&1 | tail -n +2
echo "If no user_id is listed above: sign up as $email first (or they are already an admin)."
