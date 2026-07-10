# TODO

## Clear View monthly upload — double-upload deletes existing pivots

### Behavior

When a **Clear View monthly** report is uploaded, the handler
(`process_clearview_monthly_file` in `src-tauri/src/file_handler.rs`) generates
pivot tables for **both** portfolios from the single file:

- Upload the monthly into the **Alder** portfolio → pivot tables are created for
  **both Alder and White Rabbit** (the file contains `AL …` and `WR …` sheets,
  so both are parsed and split automatically).

The problem shows up on the **second** upload:

- If you then upload the **same monthly report** into the **White Rabbit**
  portfolio (the same report already processed via Alder), it **deletes /
  overwrites the pivot table that was already created**, rather than recognizing
  it as a duplicate and leaving it in place.

Net effect: re-uploading the same monthly into the other portfolio destroys
work that the first upload already produced.

### Why it happens (current understanding)

- The handler always loops over `["Alder", "White Rabbit"]` and regenerates
  pivots for both on every monthly upload, regardless of which portfolio the
  user selected.
- The pivot CSV is written to a path keyed **only** by `report_date`
  (`Funder Pivot Tables/Monthly/Clear View/{report_date}.csv`), so a second run
  for the same `report_date` overwrites the first.
- Each upload also creates fresh `FunderUpload` / `FunderPivotTable` DB records
  (new UUIDs) for the "other" portfolio, so duplicate uploads are not detected
  and de-duplicated. The delete of the prior pivot appears to come from the
  re-upload path replacing the existing record/file for that `report_date`.

### What to fix

**Fixed 2026-07-09** (`file_handler.rs` + `database.rs`):

- [x] Re-uploads are now idempotent: `save_funder_upload` and the ClearView
      "other portfolio" branch look up the existing upload record for
      `(portfolio, funder, report_date, upload_type)` and reuse its id, so
      `INSERT OR REPLACE` updates the row in place instead of deleting it and
      orphaning its pivot records.
- [x] Chosen UX: re-uploading the same monthly cleanly regenerates pivots for
      both portfolios (never leaves fewer pivots than before). Stale pivot
      records for the same report are replaced via
      `delete_pivot_tables_for_report` before each insert.
- [x] Each portfolio is processed independently
      (`process_clearview_portfolio`); a parse failure in one no longer wipes
      out the other's result — errors are collected and reported together.
