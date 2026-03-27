use std::collections::HashMap;
use std::path::Path;
use calamine::{open_workbook, Reader, Xlsx};
use crate::parsers::base_parser::{ParserError, ParserResult, PivotTable};

/// Monthly ClearView XLSX parser.
///
/// The file has 4 sheets with two different schemas:
///
/// LendSaaS sheets ("R&H LendSaaS", "WR LendSaaS"):
///   key cols: Deal ID, Gross Payable, Management Fee, Net Payment
///
/// Centrex sheets ("R&H Centrex", "WR Centrex"):
///   key cols: Advance ID, Payable Amt (Gross), Servicing Fee $, Payable Amt (Net)
///
/// Merchant name is not present in either sheet format.
pub struct ClearViewMonthlyParser {
    portfolio_name: String,
}

impl ClearViewMonthlyParser {
    /// `portfolio_name` must be either "Alder" or "White Rabbit"
    pub fn new(portfolio_name: &str) -> Self {
        ClearViewMonthlyParser {
            portfolio_name: portfolio_name.to_string(),
        }
    }

    fn sheet_names(&self) -> (&'static str, &'static str) {
        if self.portfolio_name == "White Rabbit" {
            ("WR LendSaaS", "WR Centrex")
        } else {
            // Default to Alder / R&H
            ("R&H LendSaaS", "R&H Centrex")
        }
    }

    pub fn validate_file_structure(&self, file_path: &Path) -> bool {
        let workbook: Xlsx<_> = match open_workbook(file_path) {
            Ok(wb) => wb,
            Err(_) => return false,
        };
        let names = workbook.sheet_names();
        let required = ["R&H LendSaaS", "WR LendSaaS", "R&H Centrex", "WR Centrex"];
        required.iter().all(|r| names.iter().any(|n| n == r))
    }

    fn parse_lendsaas_sheet(
        &self,
        workbook: &mut Xlsx<std::io::BufReader<std::fs::File>>,
        sheet_name: &str,
    ) -> ParserResult<Vec<(String, f64, f64, f64)>> {
        let range = workbook
            .worksheet_range(sheet_name)
            .map_err(|e| ParserError::ProcessingError(format!("Failed to read sheet '{}': {:?}", sheet_name, e)))?;

        let mut rows_iter = range.rows();
        let headers: Vec<String> = match rows_iter.next() {
            Some(r) => r.iter().map(|c| c.to_string()).collect(),
            None => return Ok(vec![]),
        };

        let col = |name: &str| -> ParserResult<usize> {
            headers.iter().position(|h| h == name).ok_or_else(|| {
                ParserError::MissingColumns { columns: vec![name.to_string()] }
            })
        };

        let id_col = col("Deal ID")?;
        let gross_col = col("Gross Payable")?;
        let fee_col = col("Management Fee")?;
        let net_col = col("Net Payment")?;

        let mut records = Vec::new();
        for row in rows_iter {
            let advance_id = row.get(id_col).map(|c| c.to_string()).unwrap_or_default();
            let advance_id = advance_id.trim().to_string();
            if advance_id.is_empty() {
                continue;
            }
            let gross = parse_cell_currency(row.get(gross_col));
            let fee = parse_cell_currency(row.get(fee_col)).abs();
            let net = parse_cell_currency(row.get(net_col));
            if gross == 0.0 && fee == 0.0 && net == 0.0 {
                continue;
            }
            records.push((advance_id, gross, fee, net));
        }
        Ok(records)
    }

    fn parse_centrex_sheet(
        &self,
        workbook: &mut Xlsx<std::io::BufReader<std::fs::File>>,
        sheet_name: &str,
    ) -> ParserResult<Vec<(String, f64, f64, f64)>> {
        let range = workbook
            .worksheet_range(sheet_name)
            .map_err(|e| ParserError::ProcessingError(format!("Failed to read sheet '{}': {:?}", sheet_name, e)))?;

        let mut rows_iter = range.rows();
        let headers: Vec<String> = match rows_iter.next() {
            Some(r) => r.iter().map(|c| c.to_string()).collect(),
            None => return Ok(vec![]),
        };

        let col = |name: &str| -> ParserResult<usize> {
            headers.iter().position(|h| h == name).ok_or_else(|| {
                ParserError::MissingColumns { columns: vec![name.to_string()] }
            })
        };

        let id_col = col("Advance ID")?;
        let gross_col = col("Payable Amt (Gross)")?;
        let fee_col = col("Servicing Fee $")?;
        let net_col = col("Payable Amt (Net)")?;

        let mut records = Vec::new();
        for row in rows_iter {
            let advance_id = row.get(id_col).map(|c| c.to_string()).unwrap_or_default();
            let advance_id = advance_id.trim().to_string();
            if advance_id.is_empty() {
                continue;
            }
            let gross = parse_cell_currency(row.get(gross_col));
            let fee = parse_cell_currency(row.get(fee_col)).abs();
            let net = parse_cell_currency(row.get(net_col));
            if gross == 0.0 && fee == 0.0 && net == 0.0 {
                continue;
            }
            records.push((advance_id, gross, fee, net));
        }
        Ok(records)
    }

    pub fn process(&self, file_path: &Path) -> ParserResult<PivotTable> {
        let (lendsaas_sheet, centrex_sheet) = self.sheet_names();

        let mut workbook: Xlsx<_> = open_workbook(file_path)
            .map_err(|_| ParserError::ProcessingError("Failed to open ClearView monthly Excel file".to_string()))?;

        let mut all_rows: Vec<(String, f64, f64, f64)> = Vec::new();
        all_rows.extend(self.parse_lendsaas_sheet(&mut workbook, lendsaas_sheet)?);
        all_rows.extend(self.parse_centrex_sheet(&mut workbook, centrex_sheet)?);

        // Aggregate by advance_id
        let mut grouped: HashMap<String, (f64, f64, f64)> = HashMap::new();
        for (advance_id, gross, fee, net) in all_rows {
            let entry = grouped.entry(advance_id).or_insert((0.0, 0.0, 0.0));
            entry.0 += gross;
            entry.1 += fee;
            entry.2 += net;
        }

        let mut pivot = PivotTable::new();
        for (advance_id, (gross, fee, net)) in grouped {
            // merchant_name left blank - caller should populate from DB lookup
            pivot.add_row(advance_id, String::new(), gross, fee, net);
        }
        pivot.add_totals_row();

        Ok(pivot)
    }
}

fn parse_cell_currency(cell: Option<&calamine::Data>) -> f64 {
    let s = match cell {
        Some(c) => c.to_string(),
        None => return 0.0,
    };
    let cleaned = s
        .replace('$', "")
        .replace(',', "")
        .replace('(', "-")
        .replace(')', "")
        .trim()
        .to_string();
    if cleaned.is_empty() {
        return 0.0;
    }
    cleaned.parse::<f64>().unwrap_or(0.0)
}
