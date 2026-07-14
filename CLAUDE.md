# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Excelerate is a desktop application built with Tauri (Rust backend) and React + TypeScript (frontend). It processes MCA (Merchant Cash Advance) funder files and aggregates them into a portfolio workbook. Uses HeroUI, Tailwind CSS, and Vite.

## Development Commands

### Frontend (React/TypeScript)
- `npm run dev` - Start development server (port 1420)
- `npm run build` - Build for production (TypeScript check + Vite build)
- `npm run lint` - ESLint (max 17 warnings)
- `npm run lint:fix` - ESLint with auto-fix
- `npm run format` - Prettier write
- `npm run format:check` - Prettier check (CI gate)

### Tauri Application
- `npm run tauri dev` - Run Tauri app in development mode (against the **production** Supabase project via `.env`)
- `npm run dev:local` - Run against the **local** Supabase stack in Docker (login: `dev@excelerate.local` / `excelerate-dev`; see [`docs/local-dev.md`](docs/local-dev.md))
- `npm run db:reset:local` - Wipe the local stack DB, re-apply migrations + `supabase/seed.sql`
- `npm run tauri build` - Build production desktop app

### Rust
- `cargo fmt` (in `src-tauri/`) - Format Rust code
- `cargo fmt --check` - Check formatting (CI gate)
- `cargo clippy --all-targets -- -D warnings` - Lint (CI gate)
- `cargo check` - Type-check without full build

## CI Gates — Run These After Edits

After editing TypeScript/TSX: `npm run lint && npm run format:check`
After editing Rust: `cd src-tauri && cargo fmt --check && cargo clippy --all-targets -- -D warnings`
Full check (matches CI exactly): `npm run lint && npm run format:check && npm run build && (cd src-tauri && cargo fmt --check && cargo clippy --all-targets -- -D warnings)`

## Commit Format

Conventional commits enforced by commitlint + husky. Format: `type(scope): message`
Types: `feat`, `fix`, `chore`, `refactor`, `docs`, `test`, `ci`
Violations block the commit hook — don't skip with `--no-verify`.

## Parser Conventions (src-tauri/src/parsers/)

All parsers implement the `BaseParser` trait (`base_parser.rs`). The trait requires:
- `get_funder_name(&self) -> &str`
- `get_required_columns(&self) -> Vec<String>` — column names to validate
- `parse_file(&self, path) -> ParserResult<Vec<HashMap<String, String>>>` — read CSV or XLSX to row maps
- `validate_columns(&self, headers) -> ParserResult<()>`
- `process_row(&self, row) -> ParserResult<Option<ProcessedData>>`
- `create_pivot_table(&self, data) -> ParserResult<PivotTable>`

Output shape is always `PivotTable` (`base_parser.rs`): rows of `(advance_id, merchant_name, gross, fee, net)` plus totals.

**To add a new parser:**
1. Create `src-tauri/src/parsers/<funder>_parser.rs` implementing `BaseParser`
2. Register the module in `src-tauri/src/parsers/mod.rs` (`pub mod` + `pub use`)
3. Add the Tauri command(s) to the `invoke_handler![…]` list in `src-tauri/src/lib.rs`

Validation errors use `notification::ValidationError` (field, expected, found, line, column).
Use `read_csv_file()` or `read_excel_file()` helpers from `base_parser.rs` rather than implementing file I/O directly.

## Tauri Command Pattern

Every Rust function exposed to the frontend must be:
1. Annotated with `#[tauri::command]`
2. Added to `tauri::generate_handler![…]` inside `run()` in `src-tauri/src/lib.rs`

Forgetting step 2 compiles fine but the frontend call will silently fail at runtime.

Frontend calls commands via `@tauri-apps/api/core` `invoke()`. TypeScript wrappers live in `src/services/`.

## Supabase / Database State

**Supabase is the only store** (Phase 5 retired SQLite, local file/version management, and the Pyodide workbook updater). All data lives in Supabase tables/views; raw funder files go to the `funder-uploads` Storage bucket.

Schema is managed by CLI migrations in `supabase/migrations/`: `supabase migration new <name>` → write SQL → `supabase db push` → update `src/services/supabase.types.ts` by hand.
`src/services/supabase.types.ts` is **manually written** (not auto-generated). Edit it directly if the schema changes.

Write paths are RPCs: `commit_funder_pivot` (monthly flow), `import_funder_sheet` (one-time workbook import), `resolve_pivot_row`. Reads go through the analytics views (`deal_computed`, `monthly_vintage_stats`, `portfolio_monthly`, `weekly_rtr_matrix`, `funder_allocation_current`, `deal_payments`); page reads at 1000 rows (PostgREST cap).

Supabase client: `src/services/supabase.ts`. Auth service: `src/services/auth-service.ts`.

## Architecture

### Frontend Structure
- **Framework**: React 18 with TypeScript
- **UI Library**: @heroui/react
- **Styling**: Tailwind CSS
- **Build Tool**: Vite
- **Path Aliases**: `@/`, `@components/`, `@features/`, `@services/`, `@utils/`, `@pages/`, `@assets/`

### Backend Structure
- **Framework**: Tauri v2 (Rust)
- **Main Binary**: `src-tauri/src/main.rs`
- **Library**: `src-tauri/src/lib.rs` (exported as `excelerate_lib`)
- **Modules**: `parsers/`, `funder_pivot` (validate + parse monthly uploads), `workbook_import` (one-time onboarding), `workbook_export` (values-only xlsx export), `notification`
- **Plugins**: tauri-plugin-opener, tauri-plugin-fs, tauri-plugin-dialog

## Detail Docs

- [`docs/parsers.md`](docs/parsers.md) — column mappings per funder, source format, output fields
- [`docs/database.md`](docs/database.md) — Supabase schema, views, RPCs, RLS, monthly flow + export
- [`docs/tauri-commands.md`](docs/tauri-commands.md) — every command in `lib.rs`, what it does, which TS service wraps it

## Do NOT Touch
- `dist/`, `node_modules/`, `target/` — build artifacts
- `src/services/supabase.types.ts` — manually maintained, not auto-generated; edit intentionally
- `examples/`, `monthlys/` — gitignored data directories
