# Database

Supabase is the only store. The SQLite database, local file/version
management, and the Pyodide workbook updater were retired in Phase 5 —
`~/Excelerate/` is no longer read or written by the app.

Types defined in `src/services/supabase.types.ts` (**manually written** — not auto-generated; edit directly when schema changes).
Client: `src/services/supabase.ts`. Auth: `src/services/auth-service.ts`.

Schema is managed by CLI migrations in `supabase/migrations/` (`supabase migration new …` → write SQL → `supabase db push` → update `supabase.types.ts` by hand). The `2026-03-31`-stamped files plus `20260710005902_remote_schema.sql` are the Phase 0 baseline; the `phase1_*` files complete the schema, `phase2_*` add the cloud write path, `phase3_*` the workbook import, and `phase5_*` the export's `deal_payments` view.

## Tables

**user_profiles** — `id (FK→auth.users), email, full_name, role (admin|member)`; row auto-created by the `on_auth_user_created` trigger.

**portfolios** — `id, name, profit_share_rate (default 0.20), dividend_rate (default 0.03)`. Seeded: Alder, White Rabbit.

**funders** — `id, name, code, sheet_name` (workbook sheet key, unique). Seeded with all 11 funders.

**portfolio_funders** — `portfolio_id, funder_id, management_fee_rate` (the funder sheet's `B1` cell — per portfolio-funder pair because the same funder can charge portfolios differently, e.g. BIG is 4% for Alder and 3% for White Rabbit). Seeded: 11 Alder links, 7 White Rabbit links.

**merchants** — normalized: `id, name, industry_id (FK), state_id (FK), website, funder_id, portfolio_id`.

**deals** — inputs only (derived values live in views): rates, funded amount, payment counts, participation, `new_dollars`/`rtr` flags, `date_funded`, `date_closed`, default fields.

**net_rtr_payments** — `deal_id, payment_date, gross, fee, net, source_upload_id`; unique `(deal_id, payment_date)`. Historical workbook rows are weekly-grained; go-forward rows monthly. `source_upload_id IS NULL` marks workbook-import rows; monthly-flow rows carry their upload id (used for replace-on-re-upload and for deleting an upload's payments).

**funder_uploads** — `portfolio_id, funder_id, report_date, upload_type, original_filename, storage_path, file_size, uploaded_by`; unique `(portfolio_id, funder_id, report_date, upload_type)` (re-upload idempotency at the DB level).

**funder_pivot_tables** — one per upload (`upload_id` unique): `total_gross/fee/net, row_count`.

**funder_pivot_rows** — parser output rows: `advance_id, merchant_name, gross, fee, net, matched_deal_id`. Plus optional Receivabull fee-split columns `originator_fee, rb_fee, fee_discrepancy` (NULL for single-fee funders; `fee_discrepancy = gross − (originator + rb) − net`).

**portfolio_access** — `(user_id, portfolio_id)` grants; drives RLS.

**industries** (seeded from the workbook's curated Keep list, 171 rows), **states** (51 rows + PR) — lookups.

## Soft delete (deletion protection)

`industries`, `states`, `funders`, `portfolios`, `merchants`, `deals` carry
`is_deleted` + `deleted_at`; the app never hard-deletes them (the client
DELETE policies on deals/merchants are dropped — RLS blocks hard deletes
entirely). "Deleting" flips `is_deleted`; a trigger
(`sync_soft_delete_timestamp`) stamps/clears `deleted_at`. Deleted rows stay
SELECTable — the Database page's Recently Deleted tab lists them with a
restore button — but are excluded from the analytics views (`deal_computed`
filters `deals`, the rollup views inherit it; `weekly_rtr_matrix` /
`deal_payments` filter their own join), from pivot matching in
`commit_funder_pivot` / `resolve_pivot_row`, and from selection dropdowns.
Unique keys (`industries.name`, `states.code/name`,
`funders.name/code/sheet_name`, `portfolios.name`) are partial (`WHERE NOT
is_deleted`) so a deleted name can be re-created — which also means restore
fails while a live twin holds the name. `import_funder_sheet`'s upserts
resurrect soft-deleted merchants/deals they hit.

`purge_soft_deleted()` (SECURITY DEFINER, not client-executable) hard-deletes
rows soft-deleted 30+ days, skipping rows still referenced by anything;
a daily pg_cron job (`purge-soft-deleted-daily`, 08:00 UTC) runs it. Derived
data (`net_rtr_payments`, pivots, uploads) keeps real deletes — it is rebuilt
from uploads and replace-on-re-upload depends on them.

## Views (workbook formulas in SQL, all `security_invoker`)

- **deal_computed** — the derived columns of a funder deal sheet (sell rate, cost basis, net RTR, factor, balances, bad debt)
- **monthly_vintage_stats** — the per-funder `-P` sheets (per portfolio × funder × vintage month)
- **portfolio_monthly** — the `ALDER Portfolio` sheet (per portfolio × vintage month)
- **weekly_rtr_matrix** — the `RTR` sheet in long form (funder × payment date)
- **funder_allocation_current** — the `R&H-ALDER-P` allocation snapshot
- **deal_payments** — per-deal payment rows with portfolio/funder scope (Phase 5, feeds the export's payment matrix)

## Functions (write paths)

- **commit_funder_pivot(upload_id, rows jsonb, total_gross, total_fee, total_net, dry_run)** — the single write path from parser output to the DB. Replaces the upload's `funder_pivot_tables`/`funder_pivot_rows`, matches rows to `deals` on `funder_advance_id` (scoped to portfolio + funder; ambiguous matches flagged as duplicates), and unless `dry_run` writes `net_rtr_payments` — aborting unless matched + unmatched + duplicate nets equal the parser's `total_net` within a cent. Returns a reconciliation JSON. `SECURITY INVOKER`, so RLS applies.
- **resolve_pivot_row(row_id, deal_id)** — resolves one unmatched pivot row to a deal and (re)writes that deal's payment for the pivot's report date; idempotent. Unmatched rows live in `funder_pivot_rows` with `matched_deal_id IS NULL` (their dollars are excluded from `net_rtr_payments` until resolved); the Deal Lookup page's Unmatched tab lists them all for later reconciliation — match to an existing deal or create the deal and auto-resolve.
- **import_funder_sheet(portfolio_id, funder_id, management_fee_rate, deals jsonb, total_net_payments)** — one-time onboarding import of a workbook funder sheet (merchants, deals, import-sourced payments); idempotent per sheet.

Deal CRUD from the Deal Lookup page (`deal-editor-service.ts`) writes `deals`/`merchants` directly — the phase 1 RLS policies allow insert/update for users with portfolio access. Deleting a deal soft-deletes it (see Soft delete above); its payments are hidden by the views until it's restored or purged. Lookup CRUD lives on the Database page (`database-admin-service.ts`, admin-only writes).

## Monthly flow (cloud-only since Phase 5)

`pivot-sync-service.ts` + `use-cloud-sync.ts`: the uploaded file's bytes go to
the Rust `parse_funder_pivot` command (validate + parse, nothing kept
locally), the raw file goes to the private `funder-uploads` Storage bucket
(`{portfolio_id}/{funder_id}/{report_date}/{filename}`, RLS on the first path
segment), `funder_uploads` is upserted, then a dry-run of
`commit_funder_pivot` feeds the reconciliation modal; confirming re-runs it
for real. Clear View syncs both portfolios from one upload. Deleting an
upload removes its payments (`source_upload_id`), the Storage object, and the
`funder_uploads` row (pivot tables/rows cascade).

## Export (Phase 5)

`workbook-export-service.ts` pages through the views (`deal_computed`,
`deal_payments`, `monthly_vintage_stats`, `portfolio_monthly`,
`weekly_rtr_matrix`, `funder_allocation_current`) plus the lookup tables,
shapes one payload, and the Rust `export_portfolio_workbook` command writes a
values-only .xlsx matching the client workbook layout. Deal-sheet headers are
chosen so an exported workbook re-imports cleanly through
`parse_portfolio_workbook` (round-trip covered by a Rust test).

## RLS

`has_portfolio_access(portfolio_id)` + `is_admin()` (both `SECURITY DEFINER`) gate all portfolio-scoped tables via `portfolio_access`. Tables without a `portfolio_id` scope through their parent (`net_rtr_payments` via `deals`, `funder_pivot_rows` via `funder_pivot_tables`). Lookups (`funders`, `industries`, `states`) remain readable by any authenticated user; anon sees nothing.

`user_profiles`: users can view/update their own row; admins can view/update every row (drives the User Management page). A `BEFORE UPDATE OF role` trigger (`enforce_admin_role_change`) rejects role changes by non-admins, so a member cannot self-promote through the "update own profile" policy. New accounts are created from the app via a stateless auth client (`AuthService.inviteUser`) so signing up an invitee never replaces the admin's session; the profile row comes from `on_auth_user_created` with role `member` and is promoted afterwards if needed.
