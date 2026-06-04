use super::base_parser::*;
use calamine::{open_workbook, Data, Reader, Xlsx};
use std::collections::HashMap;
use std::path::Path;

pub struct BigParser {
    funder_name: String,
    /// Report month in YYYY-MM-DD format. When set, only weekly "Total Paid"
    /// columns whose end-date falls within this month are summed.
    report_date: Option<String>,
}

impl Default for BigParser {
    fn default() -> Self {
        Self::new()
    }
}

impl BigParser {
    pub fn new() -> Self {
        BigParser {
            funder_name: "BIG".to_string(),
            report_date: None,
        }
    }

    pub fn with_report_date(report_date: &str) -> Self {
        BigParser {
            funder_name: "BIG".to_string(),
            report_date: Some(report_date.to_string()),
        }
    }

    /// Extract (year, month) from the report_date string ("YYYY-MM-DD").
    fn report_year_month(&self) -> Option<(i32, u32)> {
        let date = self.report_date.as_deref()?;
        let mut parts = date.split('-');
        let year = parts.next()?.parse::<i32>().ok()?;
        let month = parts.next()?.parse::<u32>().ok()?;
        Some((year, month))
    }

    /// Parse the end-date out of a "Total Paid m/d/yy - m/d/yy" header.
    /// Returns (year, month) of the end date. Two-digit years are mapped to 2000+yy.
    fn parse_total_paid_end_date(header: &str) -> Option<(i32, u32)> {
        let after_prefix = header.trim().strip_prefix("Total Paid")?.trim();
        let end_str = after_prefix.split('-').next_back()?.trim();
        let mut parts = end_str.split('/');
        let month = parts.next()?.trim().parse::<u32>().ok()?;
        let _day = parts.next()?.trim().parse::<u32>().ok()?;
        let year_raw = parts.next()?.trim().parse::<i32>().ok()?;
        let year = if year_raw < 100 {
            2000 + year_raw
        } else {
            year_raw
        };
        Some((year, month))
    }

    fn detect_portfolio_sheet(&self, file_path: &Path) -> ParserResult<(String, String)> {
        let workbook: Xlsx<_> = open_workbook(file_path)
            .map_err(|_| ParserError::ProcessingError("Failed to open workbook".to_string()))?;

        // Look for sheets containing "R&H" (Alder) or "White Rabbit"
        for sheet_name in workbook.sheet_names() {
            if sheet_name.contains("R&H") {
                return Ok(("Alder".to_string(), sheet_name.to_string()));
            } else if sheet_name.contains("White Rabbit") {
                return Ok(("White Rabbit".to_string(), sheet_name.to_string()));
            }
        }

        Err(ParserError::ProcessingError(
            "Could not find portfolio sheet (R&H or White Rabbit)".to_string(),
        ))
    }

    fn clean_advance_id(&self, value: &Data) -> Option<String> {
        match value {
            Data::Empty => None,
            Data::String(s) => {
                let trimmed = s.trim();
                if trimmed.is_empty() {
                    None
                } else {
                    Some(trimmed.to_string())
                }
            }
            Data::Float(f) => {
                // Convert float to integer string if it's a whole number
                if f.fract() == 0.0 {
                    Some((*f as i64).to_string())
                } else {
                    Some(f.to_string())
                }
            }
            Data::Int(i) => Some(i.to_string()),
            _ => Some(value.to_string()),
        }
    }

    fn process_sheet_data(
        &self,
        file_path: &Path,
        sheet_name: &str,
    ) -> ParserResult<Vec<ProcessedData>> {
        let mut workbook: Xlsx<_> = open_workbook(file_path)
            .map_err(|_| ParserError::ProcessingError("Failed to open workbook".to_string()))?;

        let range = workbook.worksheet_range(sheet_name).map_err(|e| {
            ParserError::ProcessingError(format!("Failed to read sheet '{}': {:?}", sheet_name, e))
        })?;

        let mut processed_data = Vec::new();

        // Find the header row (look for "Funding ID" or similar in column A)
        let mut header_row_idx = 2; // Default header row
        let header_values = [
            "funding id",
            "fundingid",
            "funding_id",
            "id",
            "advance id",
            "advanceid",
        ];

        for (row_idx, row) in range.rows().enumerate().take(10) {
            if let Some(first_cell) = row.first() {
                let cell_str = first_cell.to_string().to_lowercase();
                if header_values.iter().any(|h| cell_str.contains(h)) {
                    header_row_idx = row_idx;
                    break;
                }
            }
        }

        // Parse headers to find all "Total Paid" column indices
        let header_row = range
            .rows()
            .nth(header_row_idx)
            .ok_or_else(|| ParserError::ProcessingError("Header row not found".to_string()))?;

        // Collect all "Total Paid" weekly columns. When a report month is set,
        // restrict to columns whose end-date falls within that month so we don't
        // sum every historical week in the workbook.
        let target_year_month = self.report_year_month();
        let total_paid_columns: Vec<usize> = header_row
            .iter()
            .enumerate()
            .filter(|(_, cell)| {
                let text = cell.to_string();
                if !text.trim().to_lowercase().starts_with("total paid") {
                    return false;
                }
                match (target_year_month, Self::parse_total_paid_end_date(&text)) {
                    (Some(target), Some(end)) => end == target,
                    (Some(_), None) => false,
                    (None, _) => true,
                }
            })
            .map(|(idx, _)| idx)
            .collect();

        if total_paid_columns.is_empty() {
            let msg = match target_year_month {
                Some((y, m)) => format!(
                    "No 'Total Paid' columns found for report month {:04}-{:02}",
                    y, m
                ),
                None => "No 'Total Paid' columns found in headers".to_string(),
            };
            return Err(ParserError::ProcessingError(msg));
        }

        // Locate the "Management Fee %" column dynamically by header name.
        // Older parser code hardcoded index 16 which is "Installment" in the
        // current BIG schema, so the lookup silently fell back to a 3% default.
        let management_fee_col = header_row.iter().position(|cell| {
            cell.to_string()
                .trim()
                .to_lowercase()
                .contains("management fee")
        });

        let data_start_row = header_row_idx + 1;

        // Process data rows
        for (_row_idx, row) in range.rows().enumerate().skip(data_start_row) {
            // Column A (0): Funding ID / Advance ID
            let advance_id = row.first().and_then(|cell| self.clean_advance_id(cell));

            if advance_id.is_none() {
                continue; // Skip rows without valid advance ID
            }

            // Column D (3): Business Name / Merchant Name
            let merchant_name = row.get(3).map(|cell| cell.to_string()).unwrap_or_default();

            let management_fee_pct = management_fee_col
                .and_then(|idx| row.get(idx))
                .and_then(|cell| match cell {
                    Data::Float(f) => Some(*f),
                    Data::Int(i) => Some(*i as f64),
                    Data::String(s) => {
                        let cleaned = s.trim().replace('%', "");
                        cleaned.parse::<f64>().ok()
                    }
                    _ => None,
                })
                .unwrap_or(3.0); // Default to 3% if column missing or unparseable

            // Convert to decimal if it's a whole number percentage (e.g., 3 -> 0.03)
            let fee_rate = if management_fee_pct > 1.0 {
                management_fee_pct / 100.0
            } else {
                management_fee_pct
            };

            // Sum all "Total Paid" columns to get the monthly net amount
            let mut net_amount = 0.0;
            for &col_idx in &total_paid_columns {
                if let Some(cell) = row.get(col_idx) {
                    match cell {
                        Data::Float(f) => net_amount += f,
                        Data::Int(i) => net_amount += *i as f64,
                        _ => {}
                    }
                }
            }

            // Skip rows with zero amounts (no payment made)
            if net_amount == 0.0 {
                continue;
            }

            // Calculate gross and fees from net using the actual management fee % from column Q
            // If net = gross * (1 - fee_rate), then gross = net / (1 - fee_rate)
            let gross_amount = net_amount / (1.0 - fee_rate);
            let management_fee = gross_amount * fee_rate;

            processed_data.push(ProcessedData {
                advance_id: advance_id.unwrap(),
                merchant_name,
                gross_payment: gross_amount,
                fees: management_fee,
                net: net_amount,
            });
        }

        Ok(processed_data)
    }
}

impl BaseParser for BigParser {
    fn get_funder_name(&self) -> &str {
        &self.funder_name
    }

    fn get_required_columns(&self) -> Vec<String> {
        // BIG files don't have standardized column names, so we work with positions
        vec![]
    }

    fn parse_file(&self, _file_path: &Path) -> ParserResult<Vec<HashMap<String, String>>> {
        // For BIG parser, we'll override the process method directly
        // since the format is too different from standard CSV parsers
        Err(ParserError::ProcessingError(
            "BIG parser uses custom processing, call process() directly".to_string(),
        ))
    }

    fn validate_columns(&self, _headers: &[String]) -> ParserResult<()> {
        // BIG files are validated differently (by sheet names)
        Ok(())
    }

    fn process_row(&self, _row: &HashMap<String, String>) -> ParserResult<Option<ProcessedData>> {
        // Not used for BIG parser
        Err(ParserError::ProcessingError(
            "BIG parser uses custom row processing".to_string(),
        ))
    }

    fn create_pivot_table(&self, data: Vec<ProcessedData>) -> ParserResult<PivotTable> {
        // Group by Advance ID and Merchant Name, summing the values
        let mut grouped_data: HashMap<(String, String), (f64, f64, f64)> = HashMap::new();

        for row in data {
            let key = (row.advance_id, row.merchant_name);
            let entry = grouped_data.entry(key).or_insert((0.0, 0.0, 0.0));
            entry.0 += row.gross_payment;
            entry.1 += row.fees;
            entry.2 += row.net;
        }

        let mut pivot = PivotTable::new();

        // Sort by Advance ID
        let mut sorted_entries: Vec<_> = grouped_data.into_iter().collect();
        sorted_entries.sort_by(|a, b| a.0 .0.cmp(&b.0 .0));

        // Add data rows (skip any entries with zero net amount)
        for ((advance_id, merchant_name), (gross, fee, net)) in sorted_entries {
            if net != 0.0 {
                pivot.add_row(advance_id, merchant_name, gross, fee, net);
            }
        }

        // Add totals row
        pivot.add_totals_row();

        Ok(pivot)
    }

    fn process(&self, file_path: &Path) -> ParserResult<PivotTable> {
        // Check file extension
        let extension = file_path
            .extension()
            .and_then(|e| e.to_str())
            .ok_or(ParserError::UnsupportedFormat)?;

        if extension.to_lowercase() != "xlsx" && extension.to_lowercase() != "xls" {
            return Err(ParserError::UnsupportedFormat);
        }

        // Detect portfolio and get sheet name
        let (_portfolio, sheet_name) = self.detect_portfolio_sheet(file_path)?;

        // Process the sheet data
        let processed_data = self.process_sheet_data(file_path, &sheet_name)?;

        if processed_data.is_empty() {
            return Err(ParserError::ProcessingError(
                "No valid data found".to_string(),
            ));
        }

        // Create pivot table
        self.create_pivot_table(processed_data)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_two_digit_year_end_date() {
        assert_eq!(
            BigParser::parse_total_paid_end_date("Total Paid 4/18/26 - 4/24/26"),
            Some((2026, 4))
        );
    }

    #[test]
    fn parses_end_date_spanning_month_boundary() {
        assert_eq!(
            BigParser::parse_total_paid_end_date("Total Paid 3/28/26 - 4/3/26"),
            Some((2026, 4))
        );
    }

    #[test]
    fn rejects_non_total_paid_header() {
        assert_eq!(
            BigParser::parse_total_paid_end_date("Payments 5/1/26 :"),
            None
        );
    }

    #[test]
    fn report_year_month_parses_iso_date() {
        let p = BigParser::with_report_date("2026-04-30");
        assert_eq!(p.report_year_month(), Some((2026, 4)));
    }

    #[test]
    fn report_year_month_none_when_unset() {
        let p = BigParser::new();
        assert_eq!(p.report_year_month(), None);
    }
}
