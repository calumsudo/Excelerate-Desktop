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
- `npm run tauri dev` - Run Tauri app in development mode
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

**In-flight migration**: moving from SQLite + Excel workbook (ALDER.xlsx) to Supabase.

Current Supabase tables (defined in `src/services/supabase.types.ts`, manually written):
`user_profiles`, `portfolio_access`, `file_versions`, `funder_uploads`, `funder_pivot_tables`, `merchants`

SQLite still handles: portfolio workbook versioning, funder uploads, pivot table storage, merchant data.

`supabase/migrations/` does not exist yet — no CLI migrations have been applied.
`src/services/supabase.types.ts` is **manually written** (not auto-generated). Edit it directly if the schema changes.

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
- **Modules**: `parsers/`, `file_handler`, `database`, `notification`, `validated_file_handler`
- **Plugins**: tauri-plugin-opener, tauri-plugin-fs, tauri-plugin-dialog

## Do NOT Touch
- `dist/`, `node_modules/`, `target/` — build artifacts
- `src/services/supabase.types.ts` — manually maintained, not auto-generated; edit intentionally
- `pro-examples/`, `examples/`, `monthlys/` — gitignored data directories
- `src-tauri/src/parsers/big_aggregator.rs` — utility, not a parser; don't treat as a parser template
