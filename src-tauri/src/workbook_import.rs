// Phase 3: one-time portfolio workbook import.
//
// Parses the client's portfolio workbook (Alder / White Rabbit) into the
// structures the frontend pushes to Supabase via the import_funder_sheet RPC.
// Each funder deal sheet has: row 1 = funder label + B1 management fee rate,
// row 2 = headers, row 3+ = one deal per row, with the weekly Net RTR payment
// matrix starting around column AW ("Net RTR M/D[/YY]" headers).
//
// Header quirks handled here (verified against both real workbooks):
// - "Commission" appears twice: first occurrence is the rate (col J), second
//   is the derived dollar amount (col M) — only the first is an input.
// - PayVa inserts an extra "PAYVA RECORDS" column after "Date Closed", so all
//   matching is header-based, never positional (except the "DATE" default-date
//   column, which shares its name with nothing but only appears at index 39+).
// - "New $" / "RTR" funding-source flags hold text like "New  ", "NEW $",
//   "RTR" or a lone space — any non-blank trimmed value means the flag is set.
// - "# of Monthly Payments" (PayVa) is stored as num_weekly_payments, matching
//   the legacy migration script and the workbook's own term formula.
// - Net RTR headers may omit the year ("Net RTR 2/9"); the year is inferred
//   from the previous column's date, wrapping to the next year when the month
//   decreases. R'bull uses "HIDE" placeholder columns instead (no payments).

use calamine::{open_workbook, Data, Reader, Xlsx};
use chrono::{Datelike, NaiveDate};
use serde::{Deserialize, Serialize};
use std::path::Path;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ImportPayment {
    pub payment_date: String,
    pub net: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ImportDeal {
    /// 1-based workbook row, for error reporting in the wizard
    pub row: u32,
    pub merchant_name: String,
    pub website: Option<String>,
    pub advance_id: Option<String>,
    pub funder_advance_id: Option<String>,
    pub industry: Option<String>,
    pub state: Option<String>,
    pub fico: Option<i64>,
    pub buy_rate: Option<f64>,
    pub commission_rate: Option<f64>,
    pub total_funded_amount: Option<f64>,
    pub num_daily_payments: Option<i64>,
    pub num_weekly_payments: Option<i64>,
    pub participation_amount: Option<f64>,
    pub new_dollars: bool,
    pub rtr: bool,
    pub is_default: bool,
    pub date_funded: Option<String>,
    pub date_closed: Option<String>,
    pub default_date: Option<String>,
    pub payments: Vec<ImportPayment>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SheetImport {
    pub sheet_name: String,
    /// B1 cell — the funder's management fee rate for this portfolio
    pub management_fee_rate: Option<f64>,
    pub deals: Vec<ImportDeal>,
    /// Distinct parsed Net RTR column dates (ISO), in column order
    pub payment_dates: Vec<String>,
    pub payment_count: u32,
    pub total_net_payments: f64,
    pub warnings: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WorkbookImport {
    pub sheets: Vec<SheetImport>,
    /// Requested sheet names not present in the workbook
    pub missing_sheets: Vec<String>,
    /// Every sheet name found in the workbook (for diagnostics)
    pub workbook_sheet_names: Vec<String>,
}

const EXCEL_EPOCH: (i32, u32, u32) = (1899, 12, 30);

fn excel_serial_to_date(serial: f64) -> Option<NaiveDate> {
    let days = serial.trunc() as i64;
    if !(1..=200_000).contains(&days) {
        return None;
    }
    NaiveDate::from_ymd_opt(EXCEL_EPOCH.0, EXCEL_EPOCH.1, EXCEL_EPOCH.2)
        .and_then(|epoch| epoch.checked_add_signed(chrono::Duration::days(days)))
}

fn parse_date_string(s: &str) -> Option<NaiveDate> {
    let s = s.trim();
    if s.is_empty() {
        return None;
    }
    for fmt in ["%m/%d/%Y", "%m/%d/%y", "%Y-%m-%d", "%m-%d-%Y"] {
        if let Ok(d) = NaiveDate::parse_from_str(s, fmt) {
            return Some(d);
        }
    }
    None
}

fn cell_date(cell: &Data) -> Option<NaiveDate> {
    match cell {
        Data::DateTime(dt) => excel_serial_to_date(dt.as_f64()),
        Data::Float(f) => excel_serial_to_date(*f),
        Data::Int(i) => excel_serial_to_date(*i as f64),
        Data::String(s) => parse_date_string(s),
        _ => None,
    }
}

/// Trimmed non-empty text; integral numbers render without a decimal point
/// (advance ids like 7948392 arrive as Float cells).
fn cell_str(cell: &Data) -> Option<String> {
    let s = match cell {
        Data::String(s) => s.trim().to_string(),
        Data::Float(f) => {
            if f.fract() == 0.0 && f.abs() < 1e15 {
                format!("{}", *f as i64)
            } else {
                f.to_string()
            }
        }
        Data::Int(i) => i.to_string(),
        Data::Bool(b) => b.to_string(),
        _ => return None,
    };
    if s.is_empty() {
        None
    } else {
        Some(s)
    }
}

fn cell_f64(cell: &Data) -> Option<f64> {
    match cell {
        Data::Float(f) => Some(*f),
        Data::Int(i) => Some(*i as f64),
        Data::String(s) => {
            let cleaned = s.replace(['$', ',', ' '], "");
            if cleaned.is_empty() || cleaned == "-" {
                None
            } else {
                cleaned.parse().ok()
            }
        }
        _ => None,
    }
}

fn cell_i64(cell: &Data) -> Option<i64> {
    cell_f64(cell).map(|f| f.round() as i64)
}

/// Funding-source flag columns ("New $" / "RTR"): any non-blank value counts.
fn cell_flag(cell: &Data) -> bool {
    match cell {
        Data::Empty => false,
        Data::String(s) => !s.trim().is_empty(),
        Data::Float(f) => *f != 0.0,
        Data::Int(i) => *i != 0,
        Data::Bool(b) => *b,
        _ => false,
    }
}

/// "Default" column: Yes/yes/YES in the real workbooks; accept common truthy
/// spellings but treat anything else (e.g. "No") as false.
fn cell_yes(cell: &Data) -> bool {
    match cell {
        Data::String(s) => matches!(
            s.trim().to_lowercase().as_str(),
            "yes" | "y" | "true" | "x" | "1"
        ),
        Data::Float(f) => *f != 0.0,
        Data::Int(i) => *i != 0,
        Data::Bool(b) => *b,
        _ => false,
    }
}

/// Parse "Net RTR M/D", "Net RTR M/D/YY", or "Net RTR M/D/YYYY". Without a
/// year, infer from the previous column's date (same year, or next year when
/// the month wraps); the matrix started in 2025.
fn parse_net_rtr_header(header: &str, prev: Option<NaiveDate>) -> Option<NaiveDate> {
    let rest = header.strip_prefix("Net RTR")?.trim();
    let mut parts = rest.split('/');
    let month: u32 = parts.next()?.trim().parse().ok()?;
    let day: u32 = parts.next()?.trim().parse().ok()?;
    let year = match parts.next() {
        Some(y) => {
            let y: i32 = y.trim().parse().ok()?;
            if y < 100 {
                y + 2000
            } else {
                y
            }
        }
        None => match prev {
            Some(p) if month < p.month0() + 1 => p.year() + 1,
            Some(p) => p.year(),
            None => 2025,
        },
    };
    NaiveDate::from_ymd_opt(year, month, day)
}

/// Semantic column indices resolved from the header row.
#[derive(Default)]
struct ColumnMap {
    merchant_name: Option<usize>,
    website: Option<usize>,
    advance_id: Option<usize>,
    funder_advance_id: Option<usize>,
    industry: Option<usize>,
    state: Option<usize>,
    fico: Option<usize>,
    buy_rate: Option<usize>,
    commission_rate: Option<usize>,
    total_funded_amount: Option<usize>,
    num_daily_payments: Option<usize>,
    num_weekly_payments: Option<usize>,
    participation_amount: Option<usize>,
    new_dollars: Option<usize>,
    rtr: Option<usize>,
    is_default: Option<usize>,
    date_funded: Option<usize>,
    date_closed: Option<usize>,
    default_date: Option<usize>,
    /// (column index, parsed week-ending date)
    net_rtr: Vec<(usize, NaiveDate)>,
}

fn build_column_map(header_row: &[Data], warnings: &mut Vec<String>) -> ColumnMap {
    let mut map = ColumnMap::default();
    let mut prev_net_rtr_date: Option<NaiveDate> = None;

    for (idx, cell) in header_row.iter().enumerate() {
        let Some(raw) = cell_str(cell) else { continue };
        let norm = raw.to_lowercase();

        if raw.starts_with("Net RTR") {
            if raw.to_uppercase().contains("EMPTY") {
                continue;
            }
            match parse_net_rtr_header(&raw, prev_net_rtr_date) {
                Some(date) => {
                    map.net_rtr.push((idx, date));
                    prev_net_rtr_date = Some(date);
                }
                None => warnings.push(format!("Unparseable Net RTR header: '{}'", raw)),
            }
            continue;
        }

        let slot = match norm.as_str() {
            "date funded" => &mut map.date_funded,
            "merchant name" => &mut map.merchant_name,
            "website" => &mut map.website,
            "advance id" | "advanceid" => &mut map.advance_id,
            "funder advance id" => &mut map.funder_advance_id,
            "state" => &mut map.state,
            "fico" => &mut map.fico,
            "buy rate" => &mut map.buy_rate,
            // first "Commission" is the rate; the second is the derived $
            "commission" => &mut map.commission_rate,
            "total funded amount" => &mut map.total_funded_amount,
            "# of daily payments" => &mut map.num_daily_payments,
            "# of weekly payments" | "# of monthly payments" => &mut map.num_weekly_payments,
            "r&h participation amount" => &mut map.participation_amount,
            "new $" => &mut map.new_dollars,
            "rtr" => &mut map.rtr,
            "default" => &mut map.is_default,
            "date closed" => &mut map.date_closed,
            _ if norm.starts_with("industry") => &mut map.industry,
            // lone "DATE"/"Date" header in the default-flags block (idx 39+)
            "date" if idx >= 39 => &mut map.default_date,
            _ => continue,
        };
        if slot.is_none() {
            *slot = Some(idx);
        }
    }

    map
}

fn get(row: &[Data], idx: Option<usize>) -> Option<&Data> {
    idx.and_then(|i| row.get(i))
}

fn parse_sheet(range: &calamine::Range<Data>, sheet_name: &str) -> SheetImport {
    let mut warnings = Vec::new();
    let mut rows = range.rows();

    // Row 1: funder label in A1, management fee rate in B1
    let management_fee_rate = rows.next().and_then(|r| r.get(1)).and_then(cell_f64);

    let Some(header_row) = rows.next() else {
        return SheetImport {
            sheet_name: sheet_name.to_string(),
            management_fee_rate,
            deals: Vec::new(),
            payment_dates: Vec::new(),
            payment_count: 0,
            total_net_payments: 0.0,
            warnings: vec!["Sheet has no header row".to_string()],
        };
    };
    let map = build_column_map(header_row, &mut warnings);

    if map.merchant_name.is_none() {
        return SheetImport {
            sheet_name: sheet_name.to_string(),
            management_fee_rate,
            deals: Vec::new(),
            payment_dates: Vec::new(),
            payment_count: 0,
            total_net_payments: 0.0,
            warnings: vec!["No 'Merchant Name' header found".to_string()],
        };
    }

    let mut deals = Vec::new();
    let mut payment_count: u32 = 0;
    let mut total_net_payments = 0.0;

    for (i, row) in rows.enumerate() {
        let workbook_row = (i + 3) as u32; // rows 1-2 are label + headers
        let Some(merchant_name) = get(row, map.merchant_name).and_then(cell_str) else {
            continue;
        };

        let advance_id = get(row, map.advance_id).and_then(cell_str);
        if advance_id.is_none() {
            warnings.push(format!(
                "Row {}: '{}' has no Advance ID — skipped",
                workbook_row, merchant_name
            ));
            continue;
        }

        let mut payments = Vec::new();
        for &(col, date) in &map.net_rtr {
            let Some(net) = row.get(col).and_then(cell_f64) else {
                continue;
            };
            if net == 0.0 {
                continue;
            }
            payments.push(ImportPayment {
                payment_date: date.format("%Y-%m-%d").to_string(),
                net,
            });
            payment_count += 1;
            total_net_payments += net;
        }

        let iso = |idx| {
            get(row, idx)
                .and_then(cell_date)
                .map(|d: NaiveDate| d.format("%Y-%m-%d").to_string())
        };

        deals.push(ImportDeal {
            row: workbook_row,
            merchant_name,
            website: get(row, map.website).and_then(cell_str),
            advance_id,
            funder_advance_id: get(row, map.funder_advance_id).and_then(cell_str),
            industry: get(row, map.industry).and_then(cell_str),
            state: get(row, map.state).and_then(cell_str),
            fico: get(row, map.fico).and_then(cell_i64),
            buy_rate: get(row, map.buy_rate).and_then(cell_f64),
            commission_rate: get(row, map.commission_rate).and_then(cell_f64),
            total_funded_amount: get(row, map.total_funded_amount).and_then(cell_f64),
            num_daily_payments: get(row, map.num_daily_payments).and_then(cell_i64),
            num_weekly_payments: get(row, map.num_weekly_payments).and_then(cell_i64),
            participation_amount: get(row, map.participation_amount).and_then(cell_f64),
            new_dollars: get(row, map.new_dollars).map(cell_flag).unwrap_or(false),
            rtr: get(row, map.rtr).map(cell_flag).unwrap_or(false),
            is_default: get(row, map.is_default).map(cell_yes).unwrap_or(false),
            date_funded: iso(map.date_funded),
            date_closed: iso(map.date_closed),
            default_date: iso(map.default_date),
            payments,
        });
    }

    SheetImport {
        sheet_name: sheet_name.to_string(),
        management_fee_rate,
        deals,
        payment_dates: map
            .net_rtr
            .iter()
            .map(|(_, d)| d.format("%Y-%m-%d").to_string())
            .collect(),
        payment_count,
        total_net_payments,
        warnings,
    }
}

/// Parse a portfolio workbook: for each requested funder sheet, extract the
/// B1 management fee, the deal input columns, and the Net RTR payment matrix.
#[tauri::command]
pub fn parse_portfolio_workbook(
    file_path: String,
    sheet_names: Vec<String>,
) -> Result<WorkbookImport, String> {
    let path = Path::new(&file_path);
    if !path.exists() {
        return Err(format!("Workbook not found: {}", file_path));
    }

    let mut workbook: Xlsx<_> = open_workbook(path)
        .map_err(|e| format!("Failed to open workbook '{}': {}", file_path, e))?;
    let workbook_sheet_names = workbook.sheet_names().to_vec();

    let mut sheets = Vec::new();
    let mut missing_sheets = Vec::new();

    for sheet_name in &sheet_names {
        if !workbook_sheet_names.iter().any(|s| s == sheet_name) {
            missing_sheets.push(sheet_name.clone());
            continue;
        }
        let range = workbook
            .worksheet_range(sheet_name)
            .map_err(|e| format!("Failed to read sheet '{}': {}", sheet_name, e))?;
        sheets.push(parse_sheet(&range, sheet_name));
    }

    Ok(WorkbookImport {
        sheets,
        missing_sheets,
        workbook_sheet_names,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn d(y: i32, m: u32, day: u32) -> NaiveDate {
        NaiveDate::from_ymd_opt(y, m, day).unwrap()
    }

    #[test]
    fn net_rtr_header_explicit_years() {
        assert_eq!(
            parse_net_rtr_header("Net RTR 6/30/26", None),
            Some(d(2026, 6, 30))
        );
        assert_eq!(
            parse_net_rtr_header("Net RTR 4/30/2026", None),
            Some(d(2026, 4, 30))
        );
        assert_eq!(
            parse_net_rtr_header("Net RTR 8/29/25", None),
            Some(d(2025, 8, 29))
        );
    }

    #[test]
    fn net_rtr_header_inferred_years() {
        // No context: default 2025
        assert_eq!(
            parse_net_rtr_header("Net RTR 2/9", None),
            Some(d(2025, 2, 9))
        );
        // Same year while months ascend
        assert_eq!(
            parse_net_rtr_header("Net RTR 9/5", Some(d(2025, 8, 29))),
            Some(d(2025, 9, 5))
        );
        // Month wraps -> next year
        assert_eq!(
            parse_net_rtr_header("Net RTR 1/3", Some(d(2025, 12, 27))),
            Some(d(2026, 1, 3))
        );
    }

    #[test]
    fn net_rtr_header_rejects_non_matches() {
        assert_eq!(parse_net_rtr_header("HIDE", None), None);
        assert_eq!(parse_net_rtr_header("Net RTR", None), None);
        assert_eq!(parse_net_rtr_header("Total RTR 2/9", None), None);
    }

    #[test]
    fn excel_serial_dates() {
        // 2024-02-08 = serial 45330
        assert_eq!(excel_serial_to_date(45330.0), Some(d(2024, 2, 8)));
        assert_eq!(excel_serial_to_date(0.0), None);
        assert_eq!(excel_serial_to_date(300000.0), None);
    }

    #[test]
    fn numeric_ids_render_without_decimal() {
        assert_eq!(
            cell_str(&Data::Float(7948392.0)),
            Some("7948392".to_string())
        );
        assert_eq!(
            cell_str(&Data::String("  BHB-001 ".to_string())),
            Some("BHB-001".to_string())
        );
        assert_eq!(cell_str(&Data::String("   ".to_string())), None);
    }

    #[test]
    fn funding_source_flags() {
        assert!(cell_flag(&Data::String("New  ".to_string())));
        assert!(cell_flag(&Data::String("RTR".to_string())));
        assert!(!cell_flag(&Data::String(" ".to_string())));
        assert!(!cell_flag(&Data::Empty));
    }

    /// Baseline counts from a Python/openpyxl probe of the real workbook
    /// (2026-07-10). Requires the gitignored examples/ directory:
    /// `cargo test parses_real_alder_workbook -- --ignored`
    #[test]
    #[ignore]
    fn parses_real_alder_workbook() {
        let result = parse_portfolio_workbook(
            "../examples/Alder_Portfolio_Updated_2026-06-30.xlsx".to_string(),
            vec![
                "BHB", "BIG", "CV", "EFin", "InAd", "PayVa", "R'bull", "ACS", "Boom", "Kings",
                "VSPR",
            ]
            .into_iter()
            .map(String::from)
            .collect(),
        )
        .expect("workbook should parse");

        assert!(result.missing_sheets.is_empty());

        // (sheet, fee, deals, payments)
        let expected = [
            ("BHB", 0.03, 400, 8164),
            ("BIG", 0.04, 383, 4070),
            ("CV", 0.03, 235, 4359),
            ("EFin", 0.03, 244, 5369),
            ("InAd", 0.035, 62, 541),
            ("PayVa", 0.05, 206, 556),
            ("R'bull", 0.03, 18, 0),
            ("ACS", 0.03, 46, 993),
            ("Boom", 0.04, 31, 789),
            ("Kings", 0.03, 38, 738),
            ("VSPR", 0.03, 24, 548),
        ];
        assert_eq!(result.sheets.len(), expected.len());
        for (sheet, (name, fee, deals, payments)) in result.sheets.iter().zip(expected) {
            assert_eq!(sheet.sheet_name, name);
            assert_eq!(sheet.management_fee_rate, Some(fee), "{} fee", name);
            assert_eq!(sheet.deals.len(), deals, "{} deal count", name);
            assert_eq!(sheet.payment_count, payments, "{} payment count", name);
            // No real row lacks an advance id, so nothing may be skipped
            assert!(
                sheet.warnings.iter().all(|w| !w.contains("skipped")),
                "{}: {:?}",
                name,
                sheet.warnings
            );
        }

        // Spot-check the first BHB deal against the raw sheet values
        let bhb = &result.sheets[0].deals[0];
        assert_eq!(bhb.advance_id.as_deref(), Some("BHB-001"));
        assert_eq!(bhb.funder_advance_id.as_deref(), Some("40538"));
        assert_eq!(bhb.merchant_name, "MARCUS TRAILERS LLC");
        assert_eq!(bhb.date_funded.as_deref(), Some("2024-02-08"));
        assert_eq!(bhb.date_closed.as_deref(), Some("2026-03-31"));
        assert_eq!(bhb.fico, Some(675));
        assert_eq!(bhb.buy_rate, Some(1.29));
        assert_eq!(bhb.commission_rate, Some(0.14));
        assert_eq!(bhb.total_funded_amount, Some(15000.0));
        assert_eq!(bhb.num_weekly_payments, Some(32));
        assert_eq!(bhb.participation_amount, Some(2000.0));
        assert!(bhb.new_dollars); // "New"
        assert!(!bhb.rtr);
        assert!(!bhb.is_default);
        assert_eq!(bhb.state.as_deref(), Some("NE"));
        assert_eq!(bhb.industry.as_deref(), Some("Automotive: Trailer Sales"));
    }

    #[test]
    fn default_column_truthiness() {
        assert!(cell_yes(&Data::String("Yes".to_string())));
        assert!(cell_yes(&Data::String("YES ".to_string())));
        assert!(!cell_yes(&Data::String("No".to_string())));
        assert!(!cell_yes(&Data::Empty));
    }
}
