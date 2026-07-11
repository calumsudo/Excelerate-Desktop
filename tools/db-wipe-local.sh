#!/usr/bin/env bash
# Wipe all portfolio DATA from the LOCAL Supabase stack, keeping schema and
# seeds intact — much faster than `npm run db:reset:local` for repeated
# import/upload testing.
#
# Deletes: deals, merchants, net_rtr_payments, funder_uploads,
#          funder_pivot_tables/_rows, and the funder-uploads Storage objects.
# Keeps:   portfolios, funders, portfolio_funders (fee rates), industries,
#          states, the dev login, and portfolio_access.
#
# Also applies any pending migrations first (`supabase migration up`), so a
# freshly written migration doesn't require a full reset to show up locally.
set -euo pipefail
cd "$(dirname "$0")/.."

if ! supabase status >/dev/null 2>&1; then
  echo "Local Supabase stack is not running — start it with: npm run dev:local" >&2
  exit 1
fi

eval "$(supabase status -o env 2>/dev/null | grep -E '^DB_URL=')"

# Refuse to run against anything that isn't the local Docker stack.
case "$DB_URL" in
  *127.0.0.1* | *localhost*) ;;
  *)
    echo "Refusing to wipe non-local database: $DB_URL" >&2
    exit 1
    ;;
esac

echo "Applying pending migrations..."
supabase migration up

# The local stack's PostgREST doesn't watch DDL — new tables/views 404 with
# "not in the schema cache" until it reloads.
psql "$DB_URL" --quiet -c "NOTIFY pgrst, 'reload schema';"

echo "Wiping portfolio data in ${DB_URL}..."
psql "$DB_URL" --quiet <<'SQL'
BEGIN;

-- storage.objects has a protect_delete() trigger ("use the Storage API");
-- replica mode skips it — fine for a local test-data wipe.
SET LOCAL session_replication_role = replica;

TRUNCATE
  public.net_rtr_payments,
  public.funder_pivot_rows,
  public.funder_pivot_tables,
  public.funder_uploads,
  public.deals,
  public.merchants
  RESTART IDENTITY CASCADE;

DELETE FROM storage.objects WHERE bucket_id = 'funder-uploads';

COMMIT;

SELECT (SELECT count(*) FROM public.deals)            AS deals,
       (SELECT count(*) FROM public.merchants)        AS merchants,
       (SELECT count(*) FROM public.net_rtr_payments) AS payments,
       (SELECT count(*) FROM public.funder_uploads)   AS uploads,
       (SELECT count(*) FROM storage.objects
         WHERE bucket_id = 'funder-uploads')          AS stored_files;
SQL

echo "Done — schema, seeds, and dev login untouched."
