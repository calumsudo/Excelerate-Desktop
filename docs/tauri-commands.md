# Tauri Commands

All commands are registered in `tauri::generate_handler![…]` inside `run()` in `src-tauri/src/lib.rs`. TypeScript wrappers live in `src/services/`.

Forgetting `generate_handler` registration compiles fine but the frontend `invoke()` call silently fails at runtime.

---

## Portfolio Workbook

| Command | What it does | TS wrapper |
|---------|-------------|-----------|
| `save_portfolio_workbook_with_version` | Saves workbook file and creates a version record | `file-service.ts` → `uploadPortfolioWorkbook` |
| `save_portfolio_workbook_validated` | Validates then saves portfolio workbook (async) | `file-service.ts` → `savePortfolioWorkbookValidated` |
| `get_portfolio_workbook_path` | Returns path to the active portfolio workbook | `file-service.ts` → `getPortfolioWorkbookPath` |
| `check_workbook_exists` | Returns whether a portfolio workbook exists | `file-service.ts` → `checkWorkbookExists` |
| `get_active_workbook_path` | Returns path to active workbook | _(not wrapped)_ |

---

## Version Management

| Command | What it does | TS wrapper |
|---------|-------------|-----------|
| `get_portfolio_versions` | Returns full version history for a portfolio | `file-service.ts` → `getPortfolioVersions` |
| `get_versions_by_date` | Returns versions for a specific report date | `file-service.ts` → `getVersionsByDate` |
| `get_active_version` | Returns the currently active version | `file-service.ts` → `getActiveVersion` |
| `check_version_exists` | Checks whether a version exists for a portfolio/date | `file-service.ts` → `checkVersionExists` |
| `restore_version` | Restores a previous version as active | `file-service.ts` → `restoreVersion` |
| `delete_version` | Deletes a specific version | `file-service.ts` → `deleteVersion` |

---

## Funder Uploads

| Command | What it does | TS wrapper |
|---------|-------------|-----------|
| `save_funder_upload` | Saves a funder report file and generates a pivot table | `file-service.ts` → `saveFunderUpload` |
| `save_funder_upload_validated` | Validates then saves funder upload (async) | `file-service.ts` → `saveFunderUploadValidated` |
| `get_funder_upload_info` | Returns metadata for a specific funder upload | `file-service.ts` → `getFunderUploadInfo` |
| `get_funder_uploads_for_date` | Returns all funder uploads for a report date | `file-service.ts` → `getFunderUploadsForDate` |
| `check_funder_upload_exists` | Returns whether an upload already exists | `file-service.ts` → `checkFunderUploadExists` |
| `delete_funder_upload` | Deletes upload and its associated pivot table | `file-service.ts` → `deleteFunderUpload` |
| `get_all_database_files` | Returns all uploaded files from the database | _(not wrapped)_ |
| `get_pivot_tables_for_update` | Returns pivot tables for a report date | _(not wrapped)_ |
| `get_pivot_for_report` | Returns one pivot's rows + parser totals for the cloud sync | `pivot-sync-service.ts` → `PivotSyncService` (private helper) |

---

## Merchants

| Command | What it does | TS wrapper |
|---------|-------------|-----------|
| `find_unmatched_deals` | Returns deals with no matching merchant record | `file-service.ts` → `findUnmatchedDeals` |
| `find_unmatched_deals_by_portfolio` | Same, scoped to one portfolio | `file-service.ts` → `findUnmatchedDealsByPortfolio` |
| `find_unmatched_deals_by_date` | Same, scoped to one report date | `file-service.ts` → `findUnmatchedDealsByDate` |

The dashboard has no Tauri commands: it reads the Supabase analytics views
(`portfolio_monthly`, `monthly_vintage_stats`, `funder_allocation_current`,
`weekly_rtr_matrix`) directly via `analytics-service.ts`.

---

## File I/O Utilities

| Command | What it does | TS wrapper |
|---------|-------------|-----------|
| `read_csv_file` | Reads a CSV file and returns its contents | _(internal use)_ |
| `read_excel_file` | Reads an Excel file and returns contents as JSON | _(internal use)_ |

---

## Other

| Command | What it does | TS wrapper |
|---------|-------------|-----------|
| `greet` | Example greeting command | _(unused)_ |
