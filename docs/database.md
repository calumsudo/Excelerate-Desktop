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

`supabase/migrations/` does not exist — no CLI migrations have been applied yet.

### Tables

**user_profiles** — `id, email, full_name, role, created_at, updated_at`

**portfolio_access** — `id, user_id, portfolio_name, access_level, granted_at, granted_by`

**file_versions** — mirrors SQLite schema plus `user_id`

**funder_uploads** — mirrors SQLite schema plus `user_id`

**funder_pivot_tables** — mirrors SQLite schema plus `user_id`

**merchants** — mirrors SQLite schema plus `user_id`

---

## Which store owns what

| Data | Current owner |
|------|--------------|
| Portfolio workbook versions | SQLite |
| Funder uploads | SQLite |
| Pivot tables | SQLite |
| Merchant records | SQLite |
| User profiles & auth | Supabase |
| Portfolio access control | Supabase |

The Supabase table definitions exist but writes still go to SQLite. Migration of write paths is in-flight.

---

## Legacy Excel workbook

Portfolio workbooks (e.g. `ALDER.xlsx`) are the source-of-truth for merchant data. `PortfolioParser` reads them to populate the `merchants` SQLite table. The BIG parser also detects portfolio by looking for sheet names containing `"R&H"` or `"White Rabbit"`.
