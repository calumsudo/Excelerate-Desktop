# Excelerate: Local Files → Supabase Migration Plan

_Audit date: 2026-07-09. Sources: full codebase trace + formula/chart dump of `Alder_Portfolio_Updated_2026-06-30.xlsx` (White Rabbit workbook is structurally identical with fewer funders) + direct query of the live Supabase database (schema dump via CLI, row counts via psql)._

## Goal

Turn Excelerate from a local file pipeline (CSV pivots + SQLite + Pyodide workbook edits) into a Supabase-backed app that the client can run themselves: import each portfolio workbook **once**, upload monthly funder files thereafter, see the workbook's analytics on the dashboard, and export a full Excel workbook on demand.

---

## Current Architecture (as audited)

**The monthly flow today:**

1. Funder monthly file uploaded → Rust parser (`src-tauri/src/parsers/`) → `PivotTable` (advance_id, merchant, gross, fee, net)
2. Pivot saved as **CSV on disk**, record in **local SQLite** (`database.rs`)
3. Portfolio workbook uploaded weekly → versioned copy on disk + SQLite record; merchants extracted into SQLite
4. "Update workbook" → **Pyodide** (in-browser Python + openpyxl, loaded from CDN) opens the workbook and writes a `Net RTR M/D/YY` column into each funder sheet
5. Dashboard computes merchant counts client-side from SQLite merchants

**Supabase usage today:** auth only (`user_profiles`). The app never queries any other table.

**Live database (queried directly on 2026-07-09 via `supabase db dump` + psql):**

| Table | Rows | Notes |
|---|---|---|
| `portfolios` | 2 | Alder + White Rabbit |
| `funders` | 5 | workbook has 11 — incomplete; no `management_fee_rate` or `sheet_name` columns |
| `portfolio_funders` | 0 | join table, empty |
| `deals` | 0 | good column shape (see below), no data loaded yet |
| `merchants` | 0 | normalized: name/industry_id/state_id/website FKs |
| `industries` | 1 | lookup, effectively empty |
| `states` | 51 | lookup, fully seeded |
| `user_profiles` | 1 | you |

RLS is enabled on everything, but policies are permissive ("any authenticated user can select/insert/update") — no per-portfolio access control.

**Key findings from the live query:**

1. **`net_rtr_payments` does not exist** — even though `scripts/migrate-workbook.py` inserts into it and `reset-tables.py` deletes from it. The migration script would fail at the payments step if run today.
2. **`supabase.types.ts` is wrong in both directions.** It declares `portfolio_access`, `file_versions`, `funder_uploads`, `funder_pivot_tables`, and a denormalized `merchants` — none of which exist live (merchants exists with a completely different normalized shape). It's missing `deals`, `funders`, `portfolios`, `portfolio_funders`, `states`, `industries`.
3. **The normalized core you built is right**: `portfolios` / `funders` / `portfolio_funders` / `merchants` / `deals` with integer/uuid FKs is a better shape than the flat portfolio_name/funder_name strings in the types file. It just needs completion, not redesign.
4. **Script/schema drift**: `migrate-workbook.py` maps headers to `sell_rate`, `total_rtr`, `term_months` — live `deals` has none of those (it has `deal_length_months`, and sell rate/total RTR are derivable anyway).

---

## Workbook Deep Dive (Alder)

### Funder deal sheets (BHB, BIG, CV, EFin, InAd, PayVa, R'bull, ACS, Boom, Kings, VSPR)

One row per deal. Three kinds of columns:

**Inputs (must be stored):**

| Column | Field |
|---|---|
| A | Date Funded |
| B–C | Merchant Name, Website |
| D–E | AdvanceID (internal, e.g. `Boom-001`), Funder Advance ID |
| F–H | Industry (NAICS/SIC), State, FICO |
| I, J | Buy Rate, Commission % |
| L | Total Funded Amount |
| O, P | # Daily Payments / # Weekly Payments |
| R | R&H Participation Amount |
| S, T | New $ / RTR flag (funding source) |
| AH | Date Closed |
| `B1` cell | **Funder management fee rate** (3% most funders, 4% Boom/BIG) |

**Derived (pure formulas — become generated columns / views):**

| Column | Formula | Meaning |
|---|---|---|
| K | `=I+J` | Sell Rate |
| M | `=L*J` | Commission $ |
| N | `=L*K` | Total RTR |
| Q | `=IF(daily, O/20, P/4.3)` | Term (months) |
| W | `=R/L` | R&H % of deal |
| X | `=M*W` | Pro-rata commission paid |
| Y | `=R+X` | **R&H Cost Basis** |
| Z | `=N*W` | R&H pro-rata RTR |
| AA | `=Z*(1−mgmt fee)` | **R&H Net RTR (fee-adjusted)** |
| AB | `=AA/Y` | "All-in" factor |
| AC | `=((AB−1)/Q)*100` | Points per month |
| AD–AG | payment ÷ term math | Expected daily/weekly payment |
| AI | `=SUM(AW…)` | Total Net RTR received |
| AJ | `=AA−AI` | Net RTR balance outstanding |
| AK, AL | `AI/AA`, `AI/Y` | % of RTR paid, return on cost basis |
| AR/AT/AU/AV | default flags | Bad debt / closed-deal adjustments |

**Payment matrix (columns AW→ onward):** one column per week-ending date containing that week's net RTR received per deal. This is what the app appends monthly — it becomes the `net_rtr_payments` table.

### Aggregation sheets (all derivable → SQL views, not tables)

- **`-P` sheets** (one per funder): monthly vintage rollups over deal-row ranges — deal count, new $/RTR $ invested, funded total, commissions, cost basis, initial RTR, weighted factor, RTR received, principal/profit split, cost basis after returns, RTR outstanding, bad debt, expected weekly payments, weighted term, vintage return, points per month. Profit share 20% in `AB1`.
- **`ALDER Portfolio`**: sums the `-P` sheets by vintage month; adds weighted avg factor, bad-debt-adjusted outstanding, profit share, WRC net return, 3% dividend (`Z1`), points per month.
- **`RTR`**: funder × week matrix, `=SUM` over each funder sheet's weekly columns; row 12/13 = weekly totals.
- **`R&H-ALDER-P`** (+ a TESTING copy): current allocation snapshot — % of cost basis, current cost basis, allocation %, weighted factor per funder.
- **`Cash`**: manually keyed daily bank ledger (accounts, $ in/out, RTR available for reinvestment, fees, distributions). **Not derivable from deals** — the only sheet needing its own decision (see Open Questions).
- **`Industries`**: lookup list (already a live Supabase table).
- **`XIRR` / `XIRR WORKING`** (hidden): IRR over cashflows.

### Charts (dashboard spec)

| Chart | Source |
|---|---|
| Allocations $ by Month, stacked by funder | Graphs B2:M31 ← `-P` cost basis per month |
| Allocations % by Month | same, normalized |
| Current-month allocation pie | Graphs row for latest month |
| Current Allocation: Cost Basis pie | `R&H-ALDER-P` row 5 |
| Commissions Paid by month | Graphs B34:E62 ← `ALDER Portfolio` E/F |
| Growth of Weekly RTR Received | `RTR` totals row |
| Weekly RTR by funder (stacked) | `RTR` matrix rows |
| Term vs Weighted Avg Net Factor (per vintage) | `ALDER Portfolio` I3:I35 |
| Points per Month (per vintage) | `ALDER Portfolio` AE / `-P` AA |

---

## Dead Code Inventory

Verified by tracing every frontend `invoke()` against `generate_handler![]` in `src-tauri/src/lib.rs`.

**Remove now:**

| Item | Location | Why dead |
|---|---|---|
| `greet` | `lib.rs` | Never invoked |
| `get_dashboard_stats`, `get_funder_distribution`, `get_monthly_funding_trends` | `file_handler.rs` + TS wrappers in `dashboard-service.ts` | Dashboard imports only the client-side helpers (`calculateMetrics`, `groupByFunder`, `getMonthlyTrends`) |
| `getPortfolioSummaries` | `dashboard-service.ts:96` | Invokes `get_portfolio_summaries`, **which has no Rust implementation** — silently fails at runtime today |
| `big-weekly-upload.tsx`, `clearview-daily-upload.tsx` | `src/components/portfolio/` | Never imported |
| `extract_merchants_from_portfolio`, `get_merchants_by_funder`, `clear_merchants_for_portfolio` | registered in `lib.rs` | No frontend caller |

**Weekly-flow dead code (the app was originally weekly-cadence, switched to monthly per the customer; verified no frontend path ever sends `"weekly"` or `"daily"` as an upload type):**

| Item | Location | Evidence |
|---|---|---|
| `process_clearview_pivots`, `process_clearview_daily_pivot`, `delete_clearview_file` | `file_handler.rs:1145,1272,1332` | `pub fn`s never registered in `generate_handler!`, no callers anywhere |
| `clearview_pivot_processor.rs` (424 lines), `clearview_weekly_parser.rs` (149), `clearview_daily_parser.rs` (178) | `src-tauri/src/parsers/` | Only reachable from the three dead functions above; live ClearView flow uses `clearview_monthly_parser.rs` via `process_clearview_monthly_file` |
| `big_aggregator.rs` (60 lines) | `src-tauri/src/parsers/` | Aggregated multiple weekly BIG files into a month; not exported in `mod.rs`, zero callers |
| `friday-date-picker.tsx` | `src/components/date/` | Week-ending picker, never imported (live flow uses `monthly-date-picker.tsx`) |
| `weeklyErrorStates` branch | `src/hooks/use-file-error-state.ts` | State bucket no caller ever selects |
| `"weekly"`/`"daily"` union members + `upload_type` enum values | `file-service.ts`, `funder-upload-section.tsx`, `file-viewer/types.ts`, `supabase.types.ts`, `database.rs`, `file_handler.rs` path branches (`Weekly` directories) | Vestigial cadence plumbing |
| ClearView daily tests | `src-tauri/tests/parsers.rs` | Delete alongside `ClearViewDailyParser` |

⚠️ **Not dead despite the name:** the weekly logic inside `big_parser.rs` (weekly "Total Paid" column selection) is live monthly-flow code — BIG's *monthly* report contains weekly columns that the parser scopes to the report month. Same for the workbook's weekly `Net RTR` columns: historical data is weekly-grained and must import as such.

**Retire after cloud cutover (load-bearing until then — do NOT delete now):**

- `database.rs` (~1,260 lines, all of SQLite)
- Most of `file_handler.rs` (~2,000 lines of local file/version management)
- `validated_file_handler.rs` local-path logic
- `pyodide-service.ts` (~670 lines) once export is DB-driven
- `file_versions` concept (versioning existed because the workbook was the database)

---

## Schema Assessment (against the live database)

**Verdict on what you built: the normalized core is sound — keep it.** `portfolios` ← `portfolio_funders` → `funders`, `merchants` (name/industry/state/website), and `deals` (inputs only, derived values excluded) is the right model for this domain. What's needed is completion:

| Live table | Verdict |
|---|---|
| `user_profiles` | ✅ Keep as-is |
| `portfolios` | ✅ Keep; add config columns: `profit_share_rate` (20%, `-P` sheet `AB1`), `dividend_rate` (3%, `Z1`) |
| `funders` | ⚠️ Keep; add **`management_fee_rate`** (the funder sheet `B1` cell — 3% most, 4% Boom/BIG — the linchpin of the net RTR calculation) and `sheet_name` (workbook sheet mapping). Seed the missing 6 funders (5 of 11 present) |
| `portfolio_funders` | ✅ Keep; possibly move `management_fee_rate` here if the same funder charges different portfolios differently |
| `deals` | ✅ Keep shape (inputs only, derive sell rate / total RTR / cost basis / net RTR in views). Empty — populated by the workbook import (Phase 3) |
| `merchants` | ✅ Keep (normalized, FK'd from deals) |
| `industries`, `states` | ✅ Keep lookups; seed industries from the workbook's `Industries` sheet |
| **Missing: `net_rtr_payments`** | ❌ Must be created — the scripts already assume it exists. `(deal_id, payment_date, gross, fee, net)`, unique on `(deal_id, payment_date)`. Use `payment_date` rather than `week_ending`: historical workbook columns are weekly-grained, but the flow is monthly going forward — one date column covers both cadences |
| **Missing: `funder_uploads` + `funder_pivot_tables`/`funder_pivot_rows`** | Typed in `supabase.types.ts` but never created — needed for the monthly flow (Phase 2): upload audit + pivot rows in the DB instead of CSVs on disk |
| **Missing: `portfolio_access`** | Typed but never created. Decide: per-portfolio grants (create it, tighten RLS) vs. "all authenticated users see both portfolios" (current permissive policies). For distributing to one client team, permissive may be fine initially |

**Also:** `supabase.types.ts` needs a full rewrite to match reality (it currently describes 4 tables that don't exist and misses 6 that do), and the current permissive RLS ("any authenticated user can insert/update everything") should be revisited before the client gets accounts.

---

## Phased Plan

### Phase 0 — Foundation ✅ Completed 2026-07-09

- [x] `supabase db pull` → baseline the live schema into `supabase/migrations/` (restored the 8 migration files from unmerged branch `feat/moving-database-to-supabase` commit `e685b4b` that the remote history expected, then pulled drift baseline `20260710005902_remote_schema.sql` capturing the dashboard-created `user_profiles` + trigger)
- [x] Rewrite `supabase.types.ts` to match the live schema (now describes the 8 real tables; the 4 phantom tables are gone)
- [x] Delete dead code (list above); removed broken `getPortfolioSummaries`; extra find: unregistered `get_clearview_daily_files_for_week` also removed
- [x] Fix TODO.md ClearView double-upload bug — fixed in the SQLite layer: upload-id reuse + pivot replace keyed on `(portfolio, funder, report_date, upload_type)`, per-portfolio independent processing; the DB-row unique constraint version still lands in Phase 2

### Phase 1 — Schema completion (CLI migrations) ✅ Completed 2026-07-09

Five migrations (`20260710_phase1_*`), pushed to the live DB and verified (seeds queried back; view math smoke-tested against BHB row 3 inside a rolled-back transaction; RLS tested as anon and as an authenticated JWT).

- [x] New tables: `net_rtr_payments` (unique on `(deal_id, payment_date)`), `funder_uploads` (unique on `(portfolio_id, funder_id, report_date, upload_type)`, `storage_path`), `funder_pivot_tables` (one per upload), `funder_pivot_rows` (with `matched_deal_id` for the unmatched-deals flow)
- [x] `funders.sheet_name` added; **`management_fee_rate` went on `portfolio_funders`, not `funders`** — the workbooks show the same funder charging portfolios differently (BIG `B1` = 0.04 in Alder, 0.03 in White Rabbit). Also found: InAd is 3.5% and PayVa 5% (the "3% most, 4% Boom/BIG" summary above was incomplete). All 6 missing funders seeded; 18 `portfolio_funders` rows seeded with fees read from both workbooks' `B1` cells
- [x] `portfolios.profit_share_rate` (0.20) + `dividend_rate` (0.03)
- [x] `deals.date_closed` added (workbook column AH was an input the table lacked; expected-payment math needs open/closed status)
- [x] `industries` seeded from the workbook's curated Keep=YES column (171 distinct names)
- [x] Decided: created `portfolio_access` (the plan's own RLS bullet presumed it). Helper fns `has_portfolio_access()` / `is_admin()`; existing user seeded with both portfolios (already `admin` role)
- [x] Views (formulas transcribed from a live dump of the deal-sheet/`-P`/portfolio-sheet formulas, not from the prose above): `deal_computed`, `monthly_vintage_stats`, `portfolio_monthly`, `weekly_rtr_matrix`, `funder_allocation_current` — all `security_invoker`. Deviation: portfolio-level weighted term uses cost-basis weighting instead of the sheet's plain `AVERAGE()` across funders
- [x] RLS via `portfolio_access` on all portfolio-scoped tables (`net_rtr_payments` scopes through `deals`, `funder_pivot_rows` through `funder_pivot_tables`); lookups stay authenticated-read; anon sees nothing

### Phase 2 — Move saves to the cloud (monthly flow) ✅ Completed 2026-07-10

Two migrations (`20260710131919/20`), pushed live. RPC logic behaviorally tested in a scratch Postgres 16 cluster (dry-run/commit/re-commit idempotency, duplicate advance-ids, tolerance abort, cross-funder resolve rejection — all pass).

- [x] Parsers unchanged; new `get_pivot_for_report` Tauri command returns rows + parser totals from the local pivot; `pivot-sync-service.ts` pushes raw file → Storage bucket `funder-uploads` (`{portfolio_id}/{funder_id}/{report_date}/{filename}`, per-portfolio RLS on path prefix), upserts `funder_uploads`, then commits the pivot via RPC. **Dual-write**: local SQLite/CSV flow untouched — the Pyodide workbook update still needs it until Phase 5
- [x] `commit_funder_pivot` matches rows to `deals.funder_advance_id` (scoped to portfolio+funder); ambiguous matches are flagged `duplicate` and skipped, mirroring the workbook updater. `resolve_pivot_row(row_id, deal_id)` RPC + `PivotSyncService.resolveRow` ready for the resolution UI (deals is empty until Phase 3, so everything reports unmatched for now)
- [x] **Validation RPC**: `SECURITY INVOKER`, two guards — rows-vs-parser-total on entry, matched+unmatched+duplicate = `total_net` (±$0.01) before commit; payments written per-deal with replace-on-re-upload semantics (`source_upload_id` scoped delete + upsert)
- [x] Reconciliation modal (`pivot-reconciliation-modal.tsx` + `use-cloud-sync.ts`): dry-run first, shows pivot/matched/unmatched/duplicate totals + unmatched rows, then user confirms the real commit. Clear View produces one preview per portfolio from the single upload

### Phase 3 — One-time workbook import (kills the weekly workbook upload)

- [ ] Port `scripts/migrate-workbook.py` (618 lines — header quirks, `Net RTR M/D/YY` date inference, batch upserts already solved) into an in-app "Import portfolio workbook" wizard using the existing Rust xlsx reading (calamine). Note: the script has drifted from the live `deals` schema (`sell_rate`/`total_rtr`/`term_months` columns don't exist; live column is `deal_length_months`) — reconcile during the port
- [ ] Import populates `deals` + `net_rtr_payments` + `funders` (reading each sheet's `B1` fee) per portfolio
- [ ] Run once per portfolio at onboarding; monthly funder files only from then on

### Phase 4 — Dashboard buildout

- [ ] Replace merchant-count dashboard with the workbook's charts, each backed by a Phase 1 view (see Charts table above)
- [ ] KPI cards from `portfolio_monthly`: total dollars at work, cost basis, net RTR outstanding, principal/profit returned, vintage return %, bad debt %
- [ ] Portfolio switcher driven by `portfolio_access`

### Phase 5 — Excel export & retirement

- [ ] "Export portfolio as workbook": generate the full workbook from Supabase (`rust_xlsxwriter`, or repoint the existing openpyxl/Pyodide runtime at DB data). Values-only sheets matching the workbook layout first; live formulas later if the client keeps editing in Excel
- [ ] Then delete: `pyodide-service.ts`, `database.rs` + SQLite, version-management bulk of `file_handler.rs`, local paths in `validated_file_handler.rs`

---

## Open Questions

1. **Offline:** moving saves to Supabase makes the app online-required — a real change from "fully offline." Recommendation: accept it; an offline fallback is where the complexity hides.
2. **`Cash` sheet:** manually keyed bank ledger, not derivable from deals. In scope (own `cash_transactions` table + entry UI) or stays in Excel? Recommendation: defer past Phase 5.
3. **Export fidelity:** values-only export, or reproduce live formulas/charts? Recommendation: values-only first; it satisfies "export the portfolio," and formula reproduction is a large, separable effort.
4. **XIRR sheets:** hidden, cashflow-based. Worth replicating on the dashboard, or drop?
