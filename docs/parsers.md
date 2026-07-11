# Parsers

All parsers live in `src-tauri/src/parsers/`. Each implements `BaseParser` and produces a `PivotTable` with columns `(advance_id, merchant_name, gross, fee, net)` plus totals.

Helpers: `read_csv_file()` and `read_excel_file()` from `base_parser.rs` — don't re-implement file I/O.

---

## BHB (`bhb_parser.rs`)

Format: CSV or XLSX (Sheet1)

| Output | Source column |
|--------|--------------|
| advance_id | Deal Id |
| merchant_name | Deal Name |
| gross | Participator Gross Amount |
| fee | Fee (absolute value) |
| net | Net Payment Amount |

Required columns: `Deal Id`, `Deal Name`, `Participator Gross Amount`, `Non Qualifying Collections`, `Fee`, `Res. Commission`, `Net Payment Amount`, `Balance`

---

## BIG (`big_parser.rs`)

Format: XLSX only. Detects sheet by name containing `"R&H"` or `"White Rabbit"`. Uses column positions, not header names.

| Output | Source |
|--------|--------|
| advance_id | Column A (Funding ID) |
| merchant_name | Column D (Business Name) |
| gross | Derived: net / (1 − fee_rate) |
| fee | Derived: gross × fee_rate |
| net | Sum of the report's weekly "Total Paid" columns |

fee_rate comes from column Q (Management Fee %).

**Which "Total Paid" weeks are summed:** BIG highlights the report's weeks yellow and sums them in a grand-total formula (e.g. `=BH374+BP374+BX374+CF374+CN374`). The parser reads that additive formula and sums exactly those columns — this stays correct when a report's weeks straddle a calendar-month boundary (the trailing week can end in the prior month). If no such formula is present, it falls back to selecting "Total Paid" columns whose end-date falls in the report month.

No required-columns validation — layout is positional.

---

## Boom (`boom_parser.rs`)

Format: XLSX only. Headers expected at Excel row 11, data from row 12. Fixed column positions.

| Output | Column index | Header |
|--------|-------------|--------|
| advance_id | B (1) | Advance Name |
| merchant_name | D (3) | Merchant |
| gross | N (13) | Gross Amount |
| fee | O (14) | Management Fee |
| net | P (15) | Amount (Net) |

No required-columns validation — layout is positional.

---

## ClearView Daily (`clear_view_parser.rs`)

Format: CSV. Supports multiple files. Filters rows to active advances only.

| Output | Source column |
|--------|--------------|
| advance_id | AdvanceID |
| merchant_name | AdvanceID (no merchant name in this report) |
| gross | Syn Gross Amount |
| fee | Derived: (gross − net).abs() |
| net | Syn Net Amount |

Required columns: `Syn Net Amount`, `Syn Gross Amount`, `AdvanceID`, `Advance Status`

---

## ClearView Weekly (`clear_view_weekly_parser.rs`)

Format: CSV.

| Output | Source column |
|--------|--------------|
| advance_id | Deal Id |
| merchant_name | Deal Id (no merchant name in this report) |
| gross | Participator Gross Amount |
| fee | Fee |
| net | Net Payment Amount |

Required columns: `Deal Id`, `Participator Gross Amount`, `Fee`, `Net Payment Amount`

---

## ClearView Monthly (`clear_view_monthly_parser.rs`)

Format: XLSX. Parses two sheet layouts depending on portfolio:

**LendSaaS sheet** (`"R&H LENDSAAS"` / `"WHITE RABBIT LENDSAAS"`):

| Output | Source column |
|--------|--------------|
| advance_id | Deal ID |
| merchant_name | _(empty — no merchant name in report)_ |
| gross | Gross Payable |
| fee | Management Fee (absolute value) |
| net | Net Payment |

**Centrex sheet** (`"R&H CENTREX"` / `"WHITE RABBIT CENTREX"`):

| Output | Source column |
|--------|--------------|
| advance_id | Advance ID |
| merchant_name | _(empty)_ |
| gross | Payable Amt (Gross) |
| fee | Servicing Fee $ (absolute value) |
| net | Payable Amt (Net) |

---

## eFin (`efin_parser.rs`)

Format: XLSX (first sheet) or CSV.

| Output | Source column |
|--------|--------------|
| advance_id | Advance ID |
| merchant_name | Business Name |
| gross | Payable Amt (Gross) |
| fee | Servicing Fee $ (absolute value) |
| net | Payable Amt (Net) |

Required columns: `Funding Date`, `Advance ID`, `Business Name`, `Advance Status`, `Payable Amt (Gross)`, `Servicing Fee $`, `Payable Amt (Net)`, `Payable Status`

---

## InAdvance (`in_advance_parser.rs`)

Format: CSV or XLSX (Sheet1).

| Output | Source column |
|--------|--------------|
| advance_id | Advance Id |
| merchant_name | Contact ID |
| gross | Gross Amount |
| fee | Mgmt Fee (absolute value) |
| net | Amount |

Required columns: `Status`, `Mgmt Fee`, `Advance Id`, `Amount`, `Gross Amount`, `Contact ID`

---

## Kings (`kings_parser.rs`)

Format: CSV.

| Output | Source column |
|--------|--------------|
| advance_id | Advance ID |
| merchant_name | Business Name |
| gross | Payable Amt (Gross) |
| fee | Servicing Fee $ |
| net | Payable Amt (Net) |

Required columns: `Advance ID`, `Business Name`, `Payable Amt (Gross)`, `Servicing Fee $`, `Payable Amt (Net)`

---

## Workbook import (`src-tauri/src/workbook_import.rs`)

Not a funder report parser (and not in `parsers/`). One-time onboarding
import: reads a full portfolio workbook (one deal sheet per funder), extracts
the `B1` management fee, the deal input columns, and the `Net RTR M/D/YY`
payment matrix for the `import_funder_sheet` RPC. Sheet names come from
`funders.sheet_name` in Supabase.
