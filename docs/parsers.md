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
| net | Sum of all "Total Paid" columns (detected from headers) |

fee_rate comes from column Q (Management Fee %).

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

## Portfolio (`portfolio_parser.rs`)

Not a funder report parser. Reads XLSX portfolio workbooks (e.g. `ALDER.xlsx`) that contain one sheet per funder and extracts merchant data.

Sheet-name → funder mapping: `BHB→BHB`, `BIG→BIG`, `CV→Clear View`, `EFin→eFin`, `InAd→In Advance`, `Kings→Kings`, `Boom→Boom`

Flexible column aliases supported: `Date Funded | Funded Date`, `Merchant Name | Business Name`, `Advance ID | Deal ID`, etc.

Output goes to the `merchants` table, not a `PivotTable`.
