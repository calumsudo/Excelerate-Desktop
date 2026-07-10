#!/usr/bin/env bash
# Run the Tauri app against the LOCAL Supabase stack (Docker) instead of prod.
#
# Starts the stack if it isn't running (first run pulls images and applies
# supabase/migrations + supabase/seed.sql), then launches `tauri dev` with
# VITE_SUPABASE_* pointed at localhost. Process env beats .env in Vite, so the
# plain `npm run tauri dev` keeps using the production values from .env.
#
# Local login: dev@excelerate.local / excelerate-dev (see supabase/seed.sql)
set -euo pipefail
cd "$(dirname "$0")/.."

if ! supabase status >/dev/null 2>&1; then
  echo "Starting local Supabase stack (first run downloads Docker images)…"
  supabase start
fi

eval "$(supabase status -o env 2>/dev/null | grep -E '^(API_URL|ANON_KEY)=')"

export VITE_SUPABASE_URL="$API_URL"
export VITE_SUPABASE_ANON_KEY="$ANON_KEY"
echo "Supabase: $VITE_SUPABASE_URL (local) — login dev@excelerate.local / excelerate-dev"

exec npm run tauri dev
