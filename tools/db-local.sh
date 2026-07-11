#!/usr/bin/env bash
# Quick ways to look at the LOCAL Supabase stack while testing:
#
#   tools/db-local.sh studio   open Supabase Studio in the browser
#   tools/db-local.sh psql     interactive psql shell on the local DB
#   tools/db-local.sh peek     row counts + latest uploads in the terminal
#
# npm shortcuts: db:studio:local / db:psql:local / db:peek:local
set -euo pipefail
cd "$(dirname "$0")/.."

if ! supabase status >/dev/null 2>&1; then
  echo "Local Supabase stack is not running — start it with: npm run dev:local" >&2
  exit 1
fi

eval "$(supabase status -o env 2>/dev/null | grep -E '^(DB_URL|STUDIO_URL)=')"

case "$DB_URL" in
  *127.0.0.1* | *localhost*) ;;
  *)
    echo "Refusing to touch non-local database: $DB_URL" >&2
    exit 1
    ;;
esac

case "${1:-peek}" in
  studio)
    echo "Opening Supabase Studio at $STUDIO_URL"
    open "$STUDIO_URL"
    ;;

  psql)
    exec psql "$DB_URL"
    ;;

  peek)
    psql "$DB_URL" --quiet <<'SQL'
\echo '-- Row counts --'
SELECT (SELECT count(*) FROM public.deals)              AS deals,
       (SELECT count(*) FROM public.merchants)          AS merchants,
       (SELECT count(*) FROM public.net_rtr_payments)   AS payments,
       (SELECT count(*) FROM public.funder_uploads)     AS uploads,
       (SELECT count(*) FROM public.funder_pivot_rows)  AS pivot_rows,
       (SELECT count(*) FROM storage.objects
         WHERE bucket_id = 'funder-uploads')            AS stored_files;

\echo '-- Deals / payments per portfolio+funder --'
SELECT p.name AS portfolio,
       f.name AS funder,
       count(DISTINCT d.id) AS deals,
       count(n.id)          AS payments,
       to_char(COALESCE(sum(n.net), 0), 'FM$999,999,990.00') AS net_received
FROM public.deals d
JOIN public.portfolios p ON p.id = d.portfolio_id
JOIN public.funders f    ON f.id = d.funder_id
LEFT JOIN public.net_rtr_payments n ON n.deal_id = d.id
GROUP BY p.name, f.name
ORDER BY p.name, f.name;

\echo '-- Latest uploads --'
SELECT p.name AS portfolio,
       f.name AS funder,
       u.report_date,
       u.original_filename,
       u.created_at::timestamp(0) AS uploaded_at
FROM public.funder_uploads u
JOIN public.portfolios p ON p.id = u.portfolio_id
JOIN public.funders f    ON f.id = u.funder_id
ORDER BY u.created_at DESC
LIMIT 10;
SQL
    ;;

  *)
    echo "Usage: tools/db-local.sh [studio|psql|peek]" >&2
    exit 1
    ;;
esac
