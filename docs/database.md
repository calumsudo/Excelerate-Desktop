# Database

Excelerate is mid-migration from SQLite to Supabase. Both stores are live simultaneously.

---

## SQLite

Managed by `src-tauri/src/database.rs`. Schema is created/migrated in `run_migrations()` at startup — no external migration files.

### Tables

**file_versions** — one row per uploaded portfolio workbook version.
`id, portfolio_name, report_date, original_filename, version_filename, file_path, file_size, upload_timestamp, is_active`
Indexes: `idx_portfolio_date`, `idx_report_date`, `idx_active`

**funder_uploads** — one row per funder report file upload.
`id, portfolio_name, funder_name, report_date, upload_type, original_filename, stored_filename, file_path, file_size, upload_timestamp`
Unique: `(portfolio_name, funder_name, report_date, upload_type, original_filename)`
Index: `idx_funder_portfolio_date`

**funder_pivot_tables** — parsed summary for each funder upload.
`id, upload_id (FK→funder_uploads), portfolio_name, funder_name, report_date, upload_type, pivot_file_path, total_gross, total_fee, total_net, row_count, created_timestamp`
Index: `idx_pivot_upload_id`

**merchants** — one row per merchant/advance, extracted from portfolio workbooks.
`id, portfolio_name, funder_name, date_funded, merchant_name, website, advance_id, funder_advance_id, industry_naics_or_sic, state, fico, buy_rate, commission, total_amount_funded, created_timestamp, updated_timestamp`
Unique: `(portfolio_name, funder_name, merchant_name, advance_id)`
Indexes: `idx_merchants_portfolio_funder`, `idx_merchants_advance_id`

---

## Supabase

Types defined in `src/services/supabase.types.ts` (**manually written** — not auto-generated; edit directly when schema changes).
Client: `src/services/supabase.ts`. Auth: `src/services/auth-service.ts`.

Schema is managed by CLI migrations in `supabase/migrations/` (`supabase migration new …` → write SQL → `supabase db push` → update `supabase.types.ts` by hand). The `2026-03-31`-stamped files plus `20260710005902_remote_schema.sql` are the Phase 0 baseline; the `phase1_*` files complete the schema.

### Tables

**user_profiles** — `id (FK→auth.users), email, full_name, role (admin|member)`; row auto-created by the `on_auth_user_created` trigger.

**portfolios** — `id, name, profit_share_rate (default 0.20), dividend_rate (default 0.03)`. Seeded: Alder, White Rabbit.

**funders** — `id, name, code, sheet_name` (workbook sheet key, unique). Seeded with all 11 funders.

**portfolio_funders** — `portfolio_id, funder_id, management_fee_rate` (the funder sheet's `B1` cell — per portfolio-funder pair because the same funder can charge portfolios differently, e.g. BIG is 4% for Alder and 3% for White Rabbit). Seeded: 11 Alder links, 7 White Rabbit links.

**merchants** — normalized: `id, name, industry_id (FK), state_id (FK), website, funder_id, portfolio_id`.

**deals** — inputs only (derived values live in views): rates, funded amount, payment counts, participation, `new_dollars`/`rtr` flags, `date_funded`, `date_closed`, default fields.

**net_rtr_payments** — `deal_id, payment_date, gross, fee, net, source_upload_id`; unique `(deal_id, payment_date)`. Historical workbook rows are weekly-grained; go-forward rows monthly.

**funder_uploads** — `portfolio_id, funder_id, report_date, upload_type, original_filename, storage_path, file_size, uploaded_by`; unique `(portfolio_id, funder_id, report_date, upload_type)` (re-upload idempotency at the DB level).

**funder_pivot_tables** — one per upload (`upload_id` unique): `total_gross/fee/net, row_count`.

**funder_pivot_rows** — parser output rows: `advance_id, merchant_name, gross, fee, net, matched_deal_id`.

**portfolio_access** — `(user_id, portfolio_id)` grants; drives RLS.

**industries** (seeded from the workbook's curated Keep list, 171 rows), **states** (51 rows) — lookups.

### Views (workbook formulas in SQL, all `security_invoker`)

- **deal_computed** — the derived columns of a funder deal sheet (sell rate, cost basis, net RTR, factor, balances, bad debt)
- **monthly_vintage_stats** — the per-funder `-P` sheets (per portfolio × funder × vintage month)
- **portfolio_monthly** — the `ALDER Portfolio` sheet (per portfolio × vintage month)
- **weekly_rtr_matrix** — the `RTR` sheet in long form (funder × payment date)
- **funder_allocation_current** — the `R&H-ALDER-P` allocation snapshot

### RLS

`has_portfolio_access(portfolio_id)` + `is_admin()` (both `SECURITY DEFINER`) gate all portfolio-scoped tables via `portfolio_access`. Tables without a `portfolio_id` scope through their parent (`net_rtr_payments` via `deals`, `funder_pivot_rows` via `funder_pivot_tables`). Lookups (`funders`, `industries`, `states`) remain readable by any authenticated user; anon sees nothing.

---

## Which store owns what

| Data | Current owner |
|------|--------------|
| Portfolio workbook versions | SQLite |
| Funder uploads | SQLite (Supabase tables ready, cutover in Phase 2) |
| Pivot tables | SQLite (Supabase tables ready, cutover in Phase 2) |
| Merchant records | SQLite (Supabase table ready, populated in Phase 3) |
| Deals & payments | Supabase (empty until the Phase 3 workbook import) |
| User profiles & auth | Supabase |
| Portfolio access control | Supabase (`portfolio_access` + RLS) |

The Supabase schema is complete but the app's write paths still target SQLite. Moving them is Phase 2.

---

## Legacy Excel workbook

Portfolio workbooks (e.g. `ALDER.xlsx`) are the source-of-truth for merchant data. `PortfolioParser` reads them to populate the `merchants` SQLite table. The BIG parser also detects portfolio by looking for sheet names containing `"R&H"` or `"White Rabbit"`.
