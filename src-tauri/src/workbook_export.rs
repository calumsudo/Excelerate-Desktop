// Phase 5: values-only export of a portfolio workbook from Supabase data.
//
// The frontend assembles the payload from the Phase 1 analytics views
// (deal_computed, monthly_vintage_stats, portfolio_monthly, weekly_rtr_matrix,
// funder_allocation_current, deal_payments) and this command writes it as an
// .xlsx mirroring the client's workbook layout: one deal sheet per funder
// (inputs + derived columns + the "Net RTR M/D/YY" payment matrix), one "-P"
// vintage rollup per funder, the portfolio rollup, the RTR week matrix, and
// the current-allocation snapshot.
//
// Deal-sheet headers are chosen so the export survives a round-trip through
// `parse_portfolio_workbook` (workbook_import.rs): "Commission" appears first
// as the rate column, flag columns hold non-blank text, the lone default
// "Date" header lands at column index >= 39, and no derived column's header
// starts with "Net RTR" (that prefix is reserved for payment-matrix columns).

use rust_xlsxwriter::{ExcelDateTime, Format, FormatAlign, Workbook, Worksheet, XlsxError};
use serde::{Deserialize, Serialize};

#[derive(Debug, Deserialize)]
pub struct ExportDeal {
    pub date_funded: Option<String>,
    pub merchant_name: String,
    pub website: Option<String>,
    pub advance_id: Option<String>,
    pub funder_advance_id: Option<String>,
    pub industry: Option<String>,
    pub state: Option<String>,
    pub fico: Option<i64>,
    pub buy_rate: Option<f64>,
    pub commission: Option<f64>,
    pub sell_rate: Option<f64>,
    pub total_amount_funded: Option<f64>,
    pub commission_dollars: Option<f64>,
    pub total_rtr: Option<f64>,
    pub num_daily_payments: Option<i64>,
    pub num_weekly_payments: Option<i64>,
    pub term_months: Option<f64>,
    pub participation_on_amount: Option<f64>,
    pub new_dollars: bool,
    pub rtr: bool,
    pub new_dollars_at_work: Option<f64>,
    pub rtr_dollars_at_work: Option<f64>,
    pub rh_pct_of_deal: Option<f64>,
    pub pro_rata_commission: Option<f64>,
    pub cost_basis: Option<f64>,
    pub rh_rtr: Option<f64>,
    pub net_rtr: Option<f64>,
    pub all_in_factor: Option<f64>,
    pub points_per_month: Option<f64>,
    pub gross_payment_expected: Option<f64>,
    pub net_payment_expected: Option<f64>,
    pub weekly_payment_expected: Option<f64>,
    pub date_closed: Option<String>,
    pub total_net_received: Option<f64>,
    pub net_rtr_balance: Option<f64>,
    pub pct_rtr_paid: Option<f64>,
    pub return_on_cost_basis: Option<f64>,
    pub is_default: bool,
    pub bad_debt_rtr: Option<f64>,
    pub default_dollars_lost: Option<f64>,
    pub default_date: Option<String>,
    /// Sparse payment matrix: (index into the sheet's payment_dates, net)
    pub payments: Vec<(usize, f64)>,
}

#[derive(Debug, Deserialize)]
pub struct FunderSheetExport {
    pub sheet_name: String,
    /// A1 label (funder name)
    pub funder_label: String,
    /// B1 — the funder's management fee rate for this portfolio
    pub management_fee_rate: Option<f64>,
    /// ISO dates for the payment-matrix columns, ascending
    pub payment_dates: Vec<String>,
    pub deals: Vec<ExportDeal>,
}

/// One row of a '-P' vintage sheet or the portfolio rollup sheet
/// (monthly_vintage_stats / portfolio_monthly share these columns).
#[derive(Debug, Deserialize)]
pub struct VintageRowExport {
    /// ISO first-of-month
    pub month: Option<String>,
    pub deal_count: Option<i64>,
    pub new_invested: Option<f64>,
    pub rtr_invested: Option<f64>,
    pub total_participation: Option<f64>,
    pub total_commissions: Option<f64>,
    pub cost_basis: Option<f64>,
    pub initial_net_rtr: Option<f64>,
    pub weighted_avg_factor: Option<f64>,
    pub principal_pct: Option<f64>,
    pub profit_pct: Option<f64>,
    pub rtr_received: Option<f64>,
    pub principal_returned: Option<f64>,
    pub profit_returned: Option<f64>,
    pub cost_basis_after_principal: Option<f64>,
    pub cost_basis_final: Option<f64>,
    pub net_rtr_outstanding: Option<f64>,
    pub bad_debt_rtr: Option<f64>,
    pub net_rtr_outstanding_after_bad_debt: Option<f64>,
    pub expected_weekly_payments: Option<f64>,
    pub weighted_avg_term_months: Option<f64>,
    pub avg_cost_basis_per_deal: Option<f64>,
    pub vintage_return: Option<f64>,
    pub bad_debt_pct: Option<f64>,
    pub points_per_month: Option<f64>,
    pub profit_share: Option<f64>,
    pub wrc_net: Option<f64>,
    pub wrc_net_vintage_return: Option<f64>,
}

#[derive(Debug, Deserialize)]
pub struct VintageSheetExport {
    pub sheet_name: String,
    pub rows: Vec<VintageRowExport>,
}

#[derive(Debug, Deserialize)]
pub struct RtrFunderRowExport {
    pub name: String,
    /// One value per date in RtrExport::dates
    pub values: Vec<f64>,
}

#[derive(Debug, Deserialize)]
pub struct RtrExport {
    pub dates: Vec<String>,
    pub funders: Vec<RtrFunderRowExport>,
}

#[derive(Debug, Deserialize)]
pub struct AllocationRowExport {
    pub funder_name: String,
    pub initial_cost_basis: Option<f64>,
    pub pct_initial_cost_basis: Option<f64>,
    pub current_cost_basis: Option<f64>,
    pub pct_current_cost_basis: Option<f64>,
    pub rtr_received: Option<f64>,
    pub factor: Option<f64>,
    pub weighted_avg_term_months: Option<f64>,
    pub weighted_term_contribution: Option<f64>,
}

#[derive(Debug, Deserialize)]
pub struct WorkbookExportData {
    pub portfolio_name: String,
    pub funder_sheets: Vec<FunderSheetExport>,
    pub vintage_sheets: Vec<VintageSheetExport>,
    pub portfolio_rows: Vec<VintageRowExport>,
    pub rtr: RtrExport,
    pub allocations: Vec<AllocationRowExport>,
}

#[derive(Debug, Serialize)]
pub struct ExportSummary {
    pub file_path: String,
    pub sheet_count: usize,
    pub deal_count: usize,
    pub payment_count: usize,
}

/// Cell formats shared across sheets.
struct Formats {
    title: Format,
    header: Format,
    money: Format,
    pct: Format,
    rate: Format,
    factor: Format,
    term: Format,
    ppm: Format,
    int: Format,
    date: Format,
    month: Format,
    total_money: Format,
    total_label: Format,
}

impl Formats {
    fn new() -> Self {
        let header = Format::new()
            .set_bold()
            .set_text_wrap()
            .set_align(FormatAlign::Center);
        Formats {
            title: Format::new().set_bold(),
            header,
            money: Format::new().set_num_format("$#,##0.00"),
            pct: Format::new().set_num_format("0.0%"),
            rate: Format::new().set_num_format("0.00%"),
            factor: Format::new().set_num_format("0.000"),
            term: Format::new().set_num_format("0.0"),
            ppm: Format::new().set_num_format("0.00"),
            int: Format::new().set_num_format("0"),
            date: Format::new().set_num_format("m/d/yy"),
            month: Format::new().set_num_format("mmm yy"),
            total_money: Format::new().set_bold().set_num_format("$#,##0.00"),
            total_label: Format::new().set_bold(),
        }
    }
}

/// Column picker for totals rows.
type Pick<T> = fn(&T) -> Option<f64>;

fn excel_date(iso: &str) -> Result<ExcelDateTime, XlsxError> {
    ExcelDateTime::parse_from_str(iso)
}

/// "2026-06-30" -> "Net RTR 6/30/26" (no leading zeros, two-digit year).
fn net_rtr_header(iso: &str) -> String {
    let parts: Vec<&str> = iso.split('-').collect();
    if parts.len() != 3 {
        return format!("Net RTR {}", iso);
    }
    let year = &parts[0][parts[0].len().saturating_sub(2)..];
    let month = parts[1].trim_start_matches('0');
    let day = parts[2].trim_start_matches('0');
    format!("Net RTR {}/{}/{}", month, day, year)
}

fn write_opt_money(
    ws: &mut Worksheet,
    row: u32,
    col: u16,
    value: Option<f64>,
    fmt: &Format,
) -> Result<(), XlsxError> {
    if let Some(v) = value {
        ws.write_number_with_format(row, col, v, fmt)?;
    }
    Ok(())
}

fn write_opt_int(
    ws: &mut Worksheet,
    row: u32,
    col: u16,
    value: Option<i64>,
    fmt: &Format,
) -> Result<(), XlsxError> {
    if let Some(v) = value {
        ws.write_number_with_format(row, col, v as f64, fmt)?;
    }
    Ok(())
}

fn write_opt_str(
    ws: &mut Worksheet,
    row: u32,
    col: u16,
    value: &Option<String>,
) -> Result<(), XlsxError> {
    if let Some(v) = value {
        ws.write_string(row, col, v)?;
    }
    Ok(())
}

fn write_opt_date(
    ws: &mut Worksheet,
    row: u32,
    col: u16,
    value: &Option<String>,
    fmt: &Format,
) -> Result<(), XlsxError> {
    if let Some(v) = value {
        match excel_date(v) {
            Ok(d) => {
                ws.write_datetime_with_format(row, col, d, fmt)?;
            }
            Err(_) => {
                ws.write_string(row, col, v)?;
            }
        }
    }
    Ok(())
}

/// Deal-sheet fixed columns. The lone default-date "Date" header must sit at
/// a 0-based index >= 39 for `parse_portfolio_workbook` to pick it up on
/// re-import, and nothing before the payment matrix may start with "Net RTR".
const DEAL_HEADERS: [&str; 41] = [
    "Date Funded",
    "Merchant Name",
    "Website",
    "Advance ID",
    "Funder Advance ID",
    "Industry",
    "State",
    "FICO",
    "Buy Rate",
    "Commission",
    "Sell Rate",
    "Total Funded Amount",
    "Commission $",
    "Total RTR",
    "# of Daily Payments",
    "# of Weekly Payments",
    "Term (Months)",
    "R&H Participation Amount",
    "New $",
    "RTR",
    "New $ At Work",
    "RTR $ At Work",
    "R&H % of Deal",
    "Pro-Rata Commission",
    "R&H Cost Basis",
    "R&H Pro-Rata RTR",
    "R&H Net RTR",
    "All-In Factor",
    "Points Per Month",
    "Gross Payment Expected",
    "Net Payment Expected",
    "Weekly Payment Expected",
    "Date Closed",
    "Total Net RTR Received",
    "Outstanding Net RTR",
    "% of RTR Paid",
    "Return on Cost Basis",
    "Default",
    "Bad Debt RTR",
    "Default $ Lost",
    "Date",
];

fn write_funder_sheet(
    ws: &mut Worksheet,
    sheet: &FunderSheetExport,
    f: &Formats,
) -> Result<usize, XlsxError> {
    ws.set_name(&sheet.sheet_name)?;

    // Row 1: funder label + management fee rate (the workbook's B1 input)
    ws.write_string_with_format(0, 0, &sheet.funder_label, &f.title)?;
    if let Some(fee) = sheet.management_fee_rate {
        ws.write_number_with_format(0, 1, fee, &f.rate)?;
    }

    // Row 2: headers
    for (i, header) in DEAL_HEADERS.iter().enumerate() {
        ws.write_string_with_format(1, i as u16, *header, &f.header)?;
    }
    let matrix_start = DEAL_HEADERS.len() as u16;
    for (i, date) in sheet.payment_dates.iter().enumerate() {
        ws.write_string_with_format(1, matrix_start + i as u16, net_rtr_header(date), &f.header)?;
    }

    // Rows 3+: one deal per row
    let mut payment_count = 0usize;
    for (i, deal) in sheet.deals.iter().enumerate() {
        let r = 2 + i as u32;
        write_opt_date(ws, r, 0, &deal.date_funded, &f.date)?;
        ws.write_string(r, 1, &deal.merchant_name)?;
        write_opt_str(ws, r, 2, &deal.website)?;
        write_opt_str(ws, r, 3, &deal.advance_id)?;
        write_opt_str(ws, r, 4, &deal.funder_advance_id)?;
        write_opt_str(ws, r, 5, &deal.industry)?;
        write_opt_str(ws, r, 6, &deal.state)?;
        write_opt_int(ws, r, 7, deal.fico, &f.int)?;
        write_opt_money(ws, r, 8, deal.buy_rate, &f.factor)?;
        write_opt_money(ws, r, 9, deal.commission, &f.rate)?;
        write_opt_money(ws, r, 10, deal.sell_rate, &f.factor)?;
        write_opt_money(ws, r, 11, deal.total_amount_funded, &f.money)?;
        write_opt_money(ws, r, 12, deal.commission_dollars, &f.money)?;
        write_opt_money(ws, r, 13, deal.total_rtr, &f.money)?;
        write_opt_int(ws, r, 14, deal.num_daily_payments, &f.int)?;
        write_opt_int(ws, r, 15, deal.num_weekly_payments, &f.int)?;
        write_opt_money(ws, r, 16, deal.term_months, &f.term)?;
        write_opt_money(ws, r, 17, deal.participation_on_amount, &f.money)?;
        if deal.new_dollars {
            ws.write_string(r, 18, "New")?;
        }
        if deal.rtr {
            ws.write_string(r, 19, "RTR")?;
        }
        write_opt_money(ws, r, 20, deal.new_dollars_at_work, &f.money)?;
        write_opt_money(ws, r, 21, deal.rtr_dollars_at_work, &f.money)?;
        write_opt_money(ws, r, 22, deal.rh_pct_of_deal, &f.pct)?;
        write_opt_money(ws, r, 23, deal.pro_rata_commission, &f.money)?;
        write_opt_money(ws, r, 24, deal.cost_basis, &f.money)?;
        write_opt_money(ws, r, 25, deal.rh_rtr, &f.money)?;
        write_opt_money(ws, r, 26, deal.net_rtr, &f.money)?;
        write_opt_money(ws, r, 27, deal.all_in_factor, &f.factor)?;
        write_opt_money(ws, r, 28, deal.points_per_month, &f.ppm)?;
        write_opt_money(ws, r, 29, deal.gross_payment_expected, &f.money)?;
        write_opt_money(ws, r, 30, deal.net_payment_expected, &f.money)?;
        write_opt_money(ws, r, 31, deal.weekly_payment_expected, &f.money)?;
        write_opt_date(ws, r, 32, &deal.date_closed, &f.date)?;
        write_opt_money(ws, r, 33, deal.total_net_received, &f.money)?;
        write_opt_money(ws, r, 34, deal.net_rtr_balance, &f.money)?;
        write_opt_money(ws, r, 35, deal.pct_rtr_paid, &f.pct)?;
        write_opt_money(ws, r, 36, deal.return_on_cost_basis, &f.pct)?;
        if deal.is_default {
            ws.write_string(r, 37, "Yes")?;
        }
        write_opt_money(ws, r, 38, deal.bad_debt_rtr, &f.money)?;
        write_opt_money(ws, r, 39, deal.default_dollars_lost, &f.money)?;
        write_opt_date(ws, r, 40, &deal.default_date, &f.date)?;

        for (idx, net) in &deal.payments {
            if *idx < sheet.payment_dates.len() {
                ws.write_number_with_format(r, matrix_start + *idx as u16, *net, &f.money)?;
            }
        }
        payment_count += deal.payments.len();
    }

    // Totals row for the payment matrix + received/balance columns. The
    // label goes in column A: a re-import skips rows with a blank Merchant
    // Name, so the totals row must leave column B empty.
    let total_row = 2 + sheet.deals.len() as u32;
    ws.write_string_with_format(total_row, 0, "Totals", &f.total_label)?;
    for money_col in [11u16, 17, 24, 26, 33, 34] {
        let sum: f64 = sheet
            .deals
            .iter()
            .map(|d| match money_col {
                11 => d.total_amount_funded.unwrap_or(0.0),
                17 => d.participation_on_amount.unwrap_or(0.0),
                24 => d.cost_basis.unwrap_or(0.0),
                26 => d.net_rtr.unwrap_or(0.0),
                33 => d.total_net_received.unwrap_or(0.0),
                34 => d.net_rtr_balance.unwrap_or(0.0),
                _ => 0.0,
            })
            .sum();
        ws.write_number_with_format(total_row, money_col, sum, &f.total_money)?;
    }
    let mut matrix_totals = vec![0.0f64; sheet.payment_dates.len()];
    for deal in &sheet.deals {
        for (idx, net) in &deal.payments {
            if let Some(slot) = matrix_totals.get_mut(*idx) {
                *slot += net;
            }
        }
    }
    for (i, total) in matrix_totals.iter().enumerate() {
        ws.write_number_with_format(total_row, matrix_start + i as u16, *total, &f.total_money)?;
    }

    // Readability: freeze label/header rows + identity columns, size key columns
    ws.set_freeze_panes(2, 5)?;
    ws.set_column_width(1, 32)?;
    for col in 2..=6u16 {
        ws.set_column_width(col, 16)?;
    }
    for col in 8..matrix_start + sheet.payment_dates.len() as u16 {
        ws.set_column_width(col, 13)?;
    }

    Ok(payment_count)
}

const VINTAGE_HEADERS: [&str; 28] = [
    "Month",
    "Deals",
    "New $ Invested",
    "RTR $ Invested",
    "Participation",
    "Commissions",
    "Cost Basis",
    "Initial Net RTR",
    "Weighted Avg Factor",
    "Principal %",
    "Profit %",
    "RTR Received",
    "Principal Returned",
    "Profit Returned",
    "Cost Basis After Principal",
    "Cost Basis Final",
    "Net RTR Outstanding",
    "Bad Debt RTR",
    "Outstanding After Bad Debt",
    "Expected Weekly Payments",
    "Weighted Avg Term (Months)",
    "Avg Cost Basis Per Deal",
    "Vintage Return",
    "Bad Debt %",
    "Points Per Month",
    "Profit Share",
    "WRC Net $",
    "WRC Net Vintage Return",
];

/// Write a '-P' vintage rollup sheet (also used for the portfolio rollup,
/// which shares its column shape). Ends with a totals row whose ratio
/// columns are recomputed from the summed columns, as the workbook does.
fn write_vintage_sheet(
    ws: &mut Worksheet,
    sheet_name: &str,
    title: &str,
    rows: &[VintageRowExport],
    f: &Formats,
) -> Result<(), XlsxError> {
    ws.set_name(sheet_name)?;
    ws.write_string_with_format(0, 0, title, &f.title)?;

    for (i, header) in VINTAGE_HEADERS.iter().enumerate() {
        ws.write_string_with_format(1, i as u16, *header, &f.header)?;
    }

    for (i, row) in rows.iter().enumerate() {
        let r = 2 + i as u32;
        write_opt_date(ws, r, 0, &row.month, &f.month)?;
        write_opt_int(ws, r, 1, row.deal_count, &f.int)?;
        write_opt_money(ws, r, 2, row.new_invested, &f.money)?;
        write_opt_money(ws, r, 3, row.rtr_invested, &f.money)?;
        write_opt_money(ws, r, 4, row.total_participation, &f.money)?;
        write_opt_money(ws, r, 5, row.total_commissions, &f.money)?;
        write_opt_money(ws, r, 6, row.cost_basis, &f.money)?;
        write_opt_money(ws, r, 7, row.initial_net_rtr, &f.money)?;
        write_opt_money(ws, r, 8, row.weighted_avg_factor, &f.factor)?;
        write_opt_money(ws, r, 9, row.principal_pct, &f.pct)?;
        write_opt_money(ws, r, 10, row.profit_pct, &f.pct)?;
        write_opt_money(ws, r, 11, row.rtr_received, &f.money)?;
        write_opt_money(ws, r, 12, row.principal_returned, &f.money)?;
        write_opt_money(ws, r, 13, row.profit_returned, &f.money)?;
        write_opt_money(ws, r, 14, row.cost_basis_after_principal, &f.money)?;
        write_opt_money(ws, r, 15, row.cost_basis_final, &f.money)?;
        write_opt_money(ws, r, 16, row.net_rtr_outstanding, &f.money)?;
        write_opt_money(ws, r, 17, row.bad_debt_rtr, &f.money)?;
        write_opt_money(ws, r, 18, row.net_rtr_outstanding_after_bad_debt, &f.money)?;
        write_opt_money(ws, r, 19, row.expected_weekly_payments, &f.money)?;
        write_opt_money(ws, r, 20, row.weighted_avg_term_months, &f.term)?;
        write_opt_money(ws, r, 21, row.avg_cost_basis_per_deal, &f.money)?;
        write_opt_money(ws, r, 22, row.vintage_return, &f.pct)?;
        write_opt_money(ws, r, 23, row.bad_debt_pct, &f.pct)?;
        write_opt_money(ws, r, 24, row.points_per_month, &f.ppm)?;
        write_opt_money(ws, r, 25, row.profit_share, &f.money)?;
        write_opt_money(ws, r, 26, row.wrc_net, &f.money)?;
        write_opt_money(ws, r, 27, row.wrc_net_vintage_return, &f.pct)?;
    }

    let total_row = 2 + rows.len() as u32;
    ws.write_string_with_format(total_row, 0, "Total", &f.total_label)?;
    let sum = |pick: fn(&VintageRowExport) -> Option<f64>| -> f64 {
        rows.iter().map(|r| pick(r).unwrap_or(0.0)).sum()
    };
    let deal_total: i64 = rows.iter().map(|r| r.deal_count.unwrap_or(0)).sum();
    ws.write_number_with_format(total_row, 1, deal_total as f64, &f.total_label)?;
    let additive: [(u16, Pick<VintageRowExport>); 15] = [
        (2, |r| r.new_invested),
        (3, |r| r.rtr_invested),
        (4, |r| r.total_participation),
        (5, |r| r.total_commissions),
        (6, |r| r.cost_basis),
        (7, |r| r.initial_net_rtr),
        (11, |r| r.rtr_received),
        (12, |r| r.principal_returned),
        (13, |r| r.profit_returned),
        (14, |r| r.cost_basis_after_principal),
        (15, |r| r.cost_basis_final),
        (16, |r| r.net_rtr_outstanding),
        (17, |r| r.bad_debt_rtr),
        (18, |r| r.net_rtr_outstanding_after_bad_debt),
        (25, |r| r.profit_share),
    ];
    for (col, pick) in additive {
        ws.write_number_with_format(total_row, col, sum(pick), &f.total_money)?;
    }
    // Ratios recomputed over the sums (the sheet's own bottom-line style)
    let cost_basis = sum(|r| r.cost_basis);
    let initial_net_rtr = sum(|r| r.initial_net_rtr);
    let rtr_received = sum(|r| r.rtr_received);
    if cost_basis != 0.0 {
        let total_factor = Format::new().set_bold().set_num_format("0.000");
        let total_pct = Format::new().set_bold().set_num_format("0.0%");
        ws.write_number_with_format(total_row, 8, initial_net_rtr / cost_basis, &total_factor)?;
        ws.write_number_with_format(total_row, 22, rtr_received / cost_basis - 1.0, &total_pct)?;
        if initial_net_rtr != 0.0 {
            ws.write_number_with_format(
                total_row,
                23,
                sum(|r| r.bad_debt_rtr) / initial_net_rtr,
                &total_pct,
            )?;
        }
    }

    ws.set_freeze_panes(2, 1)?;
    for col in 0..VINTAGE_HEADERS.len() as u16 {
        ws.set_column_width(col, 14)?;
    }
    Ok(())
}

fn write_rtr_sheet(ws: &mut Worksheet, rtr: &RtrExport, f: &Formats) -> Result<(), XlsxError> {
    ws.set_name("RTR")?;
    ws.write_string_with_format(0, 0, "Net RTR Received", &f.title)?;
    ws.write_string_with_format(1, 0, "Funder", &f.header)?;
    for (i, date) in rtr.dates.iter().enumerate() {
        match excel_date(date) {
            Ok(d) => {
                let header_date = Format::new()
                    .set_bold()
                    .set_align(FormatAlign::Center)
                    .set_num_format("m/d/yy");
                ws.write_datetime_with_format(1, 1 + i as u16, d, &header_date)?;
            }
            Err(_) => {
                ws.write_string_with_format(1, 1 + i as u16, date, &f.header)?;
            }
        }
    }
    ws.write_string_with_format(1, 1 + rtr.dates.len() as u16, "Total", &f.header)?;

    for (i, funder) in rtr.funders.iter().enumerate() {
        let r = 2 + i as u32;
        ws.write_string(r, 0, &funder.name)?;
        let mut row_total = 0.0;
        for (j, value) in funder.values.iter().enumerate() {
            if *value != 0.0 {
                ws.write_number_with_format(r, 1 + j as u16, *value, &f.money)?;
            }
            row_total += value;
        }
        ws.write_number_with_format(r, 1 + rtr.dates.len() as u16, row_total, &f.total_money)?;
    }

    let total_row = 2 + rtr.funders.len() as u32;
    ws.write_string_with_format(total_row, 0, "Total", &f.total_label)?;
    let mut grand_total = 0.0;
    for j in 0..rtr.dates.len() {
        let col_total: f64 = rtr
            .funders
            .iter()
            .map(|fu| fu.values.get(j).copied().unwrap_or(0.0))
            .sum();
        ws.write_number_with_format(total_row, 1 + j as u16, col_total, &f.total_money)?;
        grand_total += col_total;
    }
    ws.write_number_with_format(
        total_row,
        1 + rtr.dates.len() as u16,
        grand_total,
        &f.total_money,
    )?;

    ws.set_freeze_panes(2, 1)?;
    ws.set_column_width(0, 16)?;
    for col in 1..=(rtr.dates.len() + 1) as u16 {
        ws.set_column_width(col, 12)?;
    }
    Ok(())
}

fn write_allocation_sheet(
    ws: &mut Worksheet,
    sheet_name: &str,
    allocations: &[AllocationRowExport],
    f: &Formats,
) -> Result<(), XlsxError> {
    ws.set_name(sheet_name)?;
    ws.write_string_with_format(0, 0, "Current Allocation", &f.title)?;

    const HEADERS: [&str; 9] = [
        "Funder",
        "Initial Cost Basis",
        "% of Initial Cost Basis",
        "Current Cost Basis",
        "% of Current Cost Basis",
        "RTR Received",
        "Weighted Avg Factor",
        "Weighted Avg Term (Months)",
        "Term Contribution",
    ];
    for (i, header) in HEADERS.iter().enumerate() {
        ws.write_string_with_format(1, i as u16, *header, &f.header)?;
    }

    for (i, row) in allocations.iter().enumerate() {
        let r = 2 + i as u32;
        ws.write_string(r, 0, &row.funder_name)?;
        write_opt_money(ws, r, 1, row.initial_cost_basis, &f.money)?;
        write_opt_money(ws, r, 2, row.pct_initial_cost_basis, &f.pct)?;
        write_opt_money(ws, r, 3, row.current_cost_basis, &f.money)?;
        write_opt_money(ws, r, 4, row.pct_current_cost_basis, &f.pct)?;
        write_opt_money(ws, r, 5, row.rtr_received, &f.money)?;
        write_opt_money(ws, r, 6, row.factor, &f.factor)?;
        write_opt_money(ws, r, 7, row.weighted_avg_term_months, &f.term)?;
        write_opt_money(ws, r, 8, row.weighted_term_contribution, &f.term)?;
    }

    let total_row = 2 + allocations.len() as u32;
    ws.write_string_with_format(total_row, 0, "Total", &f.total_label)?;
    let sums: [(u16, Pick<AllocationRowExport>); 4] = [
        (1, |r| r.initial_cost_basis),
        (3, |r| r.current_cost_basis),
        (5, |r| r.rtr_received),
        (8, |r| r.weighted_term_contribution),
    ];
    for (col, pick) in sums {
        let total: f64 = allocations.iter().map(|r| pick(r).unwrap_or(0.0)).sum();
        ws.write_number_with_format(total_row, col, total, &f.total_money)?;
    }

    for col in 0..9u16 {
        ws.set_column_width(col, 18)?;
    }
    Ok(())
}

/// Write the full portfolio workbook (values only) to `file_path`.
#[tauri::command]
pub fn export_portfolio_workbook(
    file_path: String,
    data: WorkbookExportData,
) -> Result<ExportSummary, String> {
    let formats = Formats::new();
    let mut workbook = Workbook::new();

    let mut deal_count = 0usize;
    let mut payment_count = 0usize;

    let result: Result<(), XlsxError> = (|| {
        for sheet in &data.funder_sheets {
            let ws = workbook.add_worksheet();
            payment_count += write_funder_sheet(ws, sheet, &formats)?;
            deal_count += sheet.deals.len();
        }
        for sheet in &data.vintage_sheets {
            let ws = workbook.add_worksheet();
            write_vintage_sheet(
                ws,
                &sheet.sheet_name,
                &sheet.sheet_name,
                &sheet.rows,
                &formats,
            )?;
        }
        let portfolio_sheet_name = format!("{} Portfolio", data.portfolio_name.to_uppercase());
        let ws = workbook.add_worksheet();
        write_vintage_sheet(
            ws,
            &portfolio_sheet_name,
            &portfolio_sheet_name,
            &data.portfolio_rows,
            &formats,
        )?;
        let ws = workbook.add_worksheet();
        write_rtr_sheet(ws, &data.rtr, &formats)?;
        let allocation_sheet_name = format!("R&H-{}-P", data.portfolio_name.to_uppercase());
        let ws = workbook.add_worksheet();
        write_allocation_sheet(ws, &allocation_sheet_name, &data.allocations, &formats)?;
        workbook.save(&file_path)?;
        Ok(())
    })();

    result.map_err(|e| format!("Failed to write workbook: {}", e))?;

    Ok(ExportSummary {
        file_path,
        sheet_count: data.funder_sheets.len() + data.vintage_sheets.len() + 3,
        deal_count,
        payment_count,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::workbook_import::parse_portfolio_workbook;

    fn sample_deal() -> ExportDeal {
        ExportDeal {
            date_funded: Some("2024-02-08".to_string()),
            merchant_name: "MARCUS TRAILERS LLC".to_string(),
            website: Some("marcustrailers.com".to_string()),
            advance_id: Some("BHB-001".to_string()),
            funder_advance_id: Some("40538".to_string()),
            industry: Some("Automotive: Trailer Sales".to_string()),
            state: Some("NE".to_string()),
            fico: Some(675),
            buy_rate: Some(1.29),
            commission: Some(0.14),
            sell_rate: Some(1.43),
            total_amount_funded: Some(15000.0),
            commission_dollars: Some(2100.0),
            total_rtr: Some(21450.0),
            num_daily_payments: None,
            num_weekly_payments: Some(32),
            term_months: Some(7.44),
            participation_on_amount: Some(2000.0),
            new_dollars: true,
            rtr: false,
            new_dollars_at_work: Some(2280.0),
            rtr_dollars_at_work: Some(0.0),
            rh_pct_of_deal: Some(0.1333),
            pro_rata_commission: Some(280.0),
            cost_basis: Some(2280.0),
            rh_rtr: Some(2860.0),
            net_rtr: Some(2774.2),
            all_in_factor: Some(1.2167),
            points_per_month: Some(2.91),
            gross_payment_expected: Some(89.4),
            net_payment_expected: Some(86.7),
            weekly_payment_expected: Some(86.7),
            date_closed: None,
            total_net_received: Some(160.0),
            net_rtr_balance: Some(2614.2),
            pct_rtr_paid: Some(0.06),
            return_on_cost_basis: Some(0.07),
            is_default: false,
            bad_debt_rtr: None,
            default_dollars_lost: None,
            default_date: None,
            payments: vec![(0, 100.0), (1, 60.0)],
        }
    }

    /// End-to-end round trip: export a workbook, then re-parse it with the
    /// Phase 3 importer and check the inputs survive intact.
    #[test]
    fn exported_workbook_reimports_cleanly() {
        let path = std::env::temp_dir().join("excelerate_export_roundtrip_test.xlsx");
        let data = WorkbookExportData {
            portfolio_name: "Alder".to_string(),
            funder_sheets: vec![FunderSheetExport {
                sheet_name: "BHB".to_string(),
                funder_label: "BHB".to_string(),
                management_fee_rate: Some(0.03),
                payment_dates: vec!["2025-01-03".to_string(), "2025-02-07".to_string()],
                deals: vec![sample_deal()],
            }],
            vintage_sheets: vec![],
            portfolio_rows: vec![],
            rtr: RtrExport {
                dates: vec!["2025-01-03".to_string()],
                funders: vec![RtrFunderRowExport {
                    name: "BHB".to_string(),
                    values: vec![100.0],
                }],
            },
            allocations: vec![],
        };

        let summary = export_portfolio_workbook(path.to_string_lossy().to_string(), data)
            .expect("export should succeed");
        assert_eq!(summary.deal_count, 1);
        assert_eq!(summary.payment_count, 2);

        let parsed =
            parse_portfolio_workbook(path.to_string_lossy().to_string(), vec!["BHB".to_string()])
                .expect("re-import should parse");
        let _ = std::fs::remove_file(&path);

        assert!(parsed.missing_sheets.is_empty());
        let sheet = &parsed.sheets[0];
        assert_eq!(sheet.management_fee_rate, Some(0.03));
        assert_eq!(sheet.deals.len(), 1);
        assert_eq!(sheet.payment_count, 2);
        assert!((sheet.total_net_payments - 160.0).abs() < 1e-9);
        assert!(sheet.warnings.is_empty(), "warnings: {:?}", sheet.warnings);

        let deal = &sheet.deals[0];
        assert_eq!(deal.advance_id.as_deref(), Some("BHB-001"));
        assert_eq!(deal.funder_advance_id.as_deref(), Some("40538"));
        assert_eq!(deal.merchant_name, "MARCUS TRAILERS LLC");
        assert_eq!(deal.date_funded.as_deref(), Some("2024-02-08"));
        assert_eq!(deal.industry.as_deref(), Some("Automotive: Trailer Sales"));
        assert_eq!(deal.state.as_deref(), Some("NE"));
        assert_eq!(deal.fico, Some(675));
        assert_eq!(deal.buy_rate, Some(1.29));
        assert_eq!(deal.commission_rate, Some(0.14));
        assert_eq!(deal.total_funded_amount, Some(15000.0));
        assert_eq!(deal.num_weekly_payments, Some(32));
        assert_eq!(deal.participation_amount, Some(2000.0));
        assert!(deal.new_dollars);
        assert!(!deal.rtr);
        assert!(!deal.is_default);
        assert_eq!(deal.payments.len(), 2);
        assert_eq!(deal.payments[0].payment_date, "2025-01-03");
        assert_eq!(deal.payments[1].payment_date, "2025-02-07");
    }

    #[test]
    fn net_rtr_headers_match_workbook_convention() {
        assert_eq!(net_rtr_header("2026-06-30"), "Net RTR 6/30/26");
        assert_eq!(net_rtr_header("2025-12-05"), "Net RTR 12/5/25");
        assert_eq!(net_rtr_header("2025-01-01"), "Net RTR 1/1/25");
    }

    /// The exported deal sheet must survive a round-trip through the Phase 3
    /// importer: `parse_portfolio_workbook` matches these headers exactly
    /// (see build_column_map in workbook_import.rs).
    #[test]
    fn deal_headers_roundtrip_through_importer() {
        // The lone default-date "Date" header only registers at index >= 39
        let date_idx = DEAL_HEADERS.iter().position(|h| *h == "Date").unwrap();
        assert!(date_idx >= 39, "default Date column at {} < 39", date_idx);

        // "Commission" (the rate) must appear before any other header that
        // lowercases to "commission"
        let commission_idx = DEAL_HEADERS
            .iter()
            .position(|h| h.to_lowercase() == "commission")
            .unwrap();
        assert_eq!(DEAL_HEADERS[commission_idx], "Commission");
        assert!(
            commission_idx
                < DEAL_HEADERS
                    .iter()
                    .position(|h| *h == "Commission $")
                    .unwrap()
        );

        // Nothing outside the payment matrix may claim the "Net RTR" prefix
        assert!(DEAL_HEADERS.iter().all(|h| !h.starts_with("Net RTR")));

        // Headers the importer requires
        for required in [
            "Date Funded",
            "Merchant Name",
            "Advance ID",
            "Funder Advance ID",
            "Buy Rate",
            "Total Funded Amount",
            "# of Daily Payments",
            "# of Weekly Payments",
            "R&H Participation Amount",
            "New $",
            "RTR",
            "Default",
            "Date Closed",
        ] {
            assert!(DEAL_HEADERS.contains(&required), "missing {}", required);
        }
    }
}
