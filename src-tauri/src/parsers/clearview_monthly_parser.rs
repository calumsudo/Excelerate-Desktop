use crate::parsers::base_parser::{ParserError, ParserResult, PivotTable};
use calamine::{open_workbook, Reader, Xlsx};
use std::collections::HashMap;
use std::path::Path;

/// Monthly ClearView XLSX parser.
///
/// The file has 4 sheets with two different schemas:
///
/// LendSaaS sheets ("AL LENDSAAS", "WR LendSaas"):
///   key cols: Deal ID, Gross Payable, Management Fee, Net Payment
///
/// Centrex sheets ("AL Centrex", "WR CENTREX"):
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

    /// Lowercase substring patterns identifying which sheets belong to this parser's
    /// portfolio. ClearView has changed the human-readable naming over time
    /// (e.g. Alder sheets have been prefixed "R&H", "AL", or "Alder"), so we match
    /// by substring rather than an exact sheet name. Note the Alder sheet prefix is
    /// "AL"/"R&H" in the sheet name even though the Syndicator column reads
    /// "R&H Capital Management LLC".
    fn portfolio_patterns(&self) -> &'static [&'static str] {
        if self.portfolio_name == "White Rabbit" {
            &["wr", "white rabbit"]
        } else {
            &["al ", "alder", "r&h"]
        }
    }

    fn find_sheet(
        &self,
        workbook: &Xlsx<std::io::BufReader<std::fs::File>>,
        sheet_type: &str,
    ) -> ParserResult<String> {
        let needle = sheet_type.to_lowercase();
        let patterns = self.portfolio_patterns();
        let names = workbook.sheet_names();
        names
            .iter()
            .find(|name| {
                let lower = name.to_lowercase();
                lower.contains(&needle) && patterns.iter().any(|p| lower.contains(p))
            })
            .cloned()
            .ok_or_else(|| {
                ParserError::ProcessingError(format!(
                    "No {} sheet found for {} in ClearView monthly file. Available sheets: {:?}",
                    sheet_type, self.portfolio_name, names
                ))
            })
    }

    pub fn validate_file_structure(&self, file_path: &Path) -> bool {
        let workbook: Xlsx<_> = match open_workbook(file_path) {
            Ok(wb) => wb,
            Err(_) => return false,
        };
        self.find_sheet(&workbook, "lendsaas").is_ok()
            && self.find_sheet(&workbook, "centrex").is_ok()
    }

    fn parse_lendsaas_sheet(
        &self,
        workbook: &mut Xlsx<std::io::BufReader<std::fs::File>>,
        sheet_name: &str,
    ) -> ParserResult<Vec<(String, f64, f64, f64)>> {
        let range = workbook.worksheet_range(sheet_name).map_err(|e| {
            ParserError::ProcessingError(format!("Failed to read sheet '{}': {:?}", sheet_name, e))
        })?;

        let mut rows_iter = range.rows();
        let headers: Vec<String> = match rows_iter.next() {
            Some(r) => r.iter().map(|c| c.to_string()).collect(),
            None => return Ok(vec![]),
        };

        let col = |name: &str| -> ParserResult<usize> {
            headers
                .iter()
                .position(|h| h == name)
                .ok_or_else(|| ParserError::MissingColumns {
                    columns: vec![name.to_string()],
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
        let range = workbook.worksheet_range(sheet_name).map_err(|e| {
            ParserError::ProcessingError(format!("Failed to read sheet '{}': {:?}", sheet_name, e))
        })?;

        let mut rows_iter = range.rows();
        let headers: Vec<String> = match rows_iter.next() {
            Some(r) => r.iter().map(|c| c.to_string()).collect(),
            None => return Ok(vec![]),
        };

        let col = |name: &str| -> ParserResult<usize> {
            headers
                .iter()
                .position(|h| h == name)
                .ok_or_else(|| ParserError::MissingColumns {
                    columns: vec![name.to_string()],
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
        let mut workbook: Xlsx<_> = open_workbook(file_path).map_err(|_| {
            ParserError::ProcessingError("Failed to open ClearView monthly Excel file".to_string())
        })?;

        let lendsaas_actual = self.find_sheet(&workbook, "lendsaas")?;
        let centrex_actual = self.find_sheet(&workbook, "centrex")?;

        let mut all_rows: Vec<(String, f64, f64, f64)> = Vec::new();
        all_rows.extend(self.parse_lendsaas_sheet(&mut workbook, &lendsaas_actual)?);
        all_rows.extend(self.parse_centrex_sheet(&mut workbook, &centrex_actual)?);

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
        .replace(['$', ','], "")
        .replace('(', "-")
        .replace(')', "")
        .trim()
        .to_string();
    if cleaned.is_empty() {
        return 0.0;
    }
    cleaned.parse::<f64>().unwrap_or(0.0)
}
