# Tauri Commands

All commands are registered in `tauri::generate_handler![…]` inside `run()` in `src-tauri/src/lib.rs`. TypeScript wrappers live in `src/services/`.

Forgetting `generate_handler` registration compiles fine but the frontend `invoke()` call silently fails at runtime.

Since Phase 5 the app is cloud-only: Supabase holds all state, and the Rust
side is reduced to three stateless commands (parse in, spreadsheet out).

---

| Command | Module | What it does | TS wrapper |
|---------|--------|-------------|-----------|
| `parse_funder_pivot` | `funder_pivot.rs` | Validates + parses an uploaded monthly funder file (bytes in) into pivot rows + parser totals for the cloud commit. Returns validation errors instead of a pivot when the file structure is wrong; returns `pivot: null` for funders without a parser (Payva). | `pivot-sync-service.ts` → `PivotSyncService.preview` |
| `parse_portfolio_workbook` | `workbook_import.rs` | One-time onboarding import: parses a portfolio workbook's funder sheets (deals, B1 fee rates, Net RTR payment matrix) for the `import_funder_sheet` RPC. | `workbook-import-service.ts` → `WorkbookImportService.preview` |
| `export_portfolio_workbook` | `workbook_export.rs` | Writes a values-only .xlsx mirroring the client workbook layout (funder deal sheets + payment matrix, per-funder `-P` vintage sheets, portfolio rollup, RTR matrix, allocation snapshot) from a payload the frontend assembles out of the Supabase views. | `workbook-export-service.ts` → `WorkbookExportService.exportPortfolio` |

The monthly upload flow is otherwise pure Supabase (no Tauri commands):
`pivot-sync-service.ts` uploads the raw file to the `funder-uploads` Storage
bucket, upserts `funder_uploads`, and calls the `commit_funder_pivot` RPC
(dry-run first, then the real commit from the reconciliation modal).

The dashboard also has no Tauri commands: it reads the Supabase analytics
views (`portfolio_monthly`, `monthly_vintage_stats`,
`funder_allocation_current`, `weekly_rtr_matrix`) directly via
`analytics-service.ts`.
