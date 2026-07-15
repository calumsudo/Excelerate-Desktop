use crate::parsers::base_parser::{
    read_csv_file, read_excel_file, BaseParser, ParserError, ParserResult, PivotTable,
    ProcessedData,
};
use std::collections::HashMap;
use std::path::Path;

// Receivabull (portfolio: Alder). Monthly XLSX with one row per payable event;
// several rows can share a Deal Id, so rows are grouped by Deal Id.
//
// NOTE: Receivabull splits the servicing fee into two columns — the originator
// fee ("Orginator servicing fee (porportionally)") and Receivabull's own fee
// ("RB Servicing Fee $"). The standard pivot has a single `fee`, so this parser
// records fee = originator fee + RB fee for reconciliation, and additionally
// carries each row's originator_fee, rb_fee, and fee_discrepancy through the
// pivot (see PivotTableRow) into funder_pivot_rows. It trusts the funder's own
// "Payable Amt (Net)" as `net` rather than deriving it, because in some rows
// gross - (originator + RB) != net — that gap is the captured fee_discrepancy.
pub struct ReceivabullParser {
    funder_name: String,
    required_columns: Vec<String>,
}

impl Default for ReceivabullParser {
    fn default() -> Self {
        Self::new()
    }
}

impl ReceivabullParser {
    pub fn new() -> Self {
        ReceivabullParser {
            funder_name: "Receivabull".to_string(),
            required_columns: vec![
                "Funding Date".to_string(),
                "Deal Id".to_string(),
                "Merchant_name".to_string(),
                "Deal status".to_string(),
                "Payable Amt (Gross)".to_string(),
                "Orginator servicing fee (porportionally)".to_string(),
                "RB Servicing Fee $".to_string(),
                "Payable Amt (Net)".to_string(),
            ],
        }
    }
}

impl BaseParser for ReceivabullParser {
    fn get_funder_name(&self) -> &str {
        &self.funder_name
    }

    fn get_required_columns(&self) -> Vec<String> {
        self.required_columns.clone()
    }

    fn parse_file(&self, file_path: &Path) -> ParserResult<Vec<HashMap<String, String>>> {
        let extension = file_path
            .extension()
            .and_then(|e| e.to_str())
            .unwrap_or("")
            .to_lowercase();

        match extension.as_str() {
            // The monthly XLSX names its sheet after the month ("June", "July",
            // …), so read the first sheet by index rather than a fixed name.
            "xlsx" | "xls" => {
                use calamine::{open_workbook, Reader, Xlsx};
                let workbook: Xlsx<_> = open_workbook(file_path).map_err(|_| {
                    ParserError::ProcessingError(
                        "Failed to open Receivabull Excel file".to_string(),
                    )
                })?;
                let sheet_name = workbook.sheet_names().first().cloned().ok_or_else(|| {
                    ParserError::ProcessingError("No sheets in Receivabull Excel file".to_string())
                })?;
                read_excel_file(file_path, &sheet_name)
            }
            "csv" => read_csv_file(file_path),
            _ => Err(ParserError::UnsupportedFormat),
        }
    }

    fn validate_columns(&self, headers: &[String]) -> ParserResult<()> {
        let missing_columns: Vec<String> = self
            .required_columns
            .iter()
            .filter(|col| !headers.contains(col))
            .cloned()
            .collect();

        if !missing_columns.is_empty() {
            return Err(ParserError::MissingColumns {
                columns: missing_columns,
            });
        }

        Ok(())
    }

    fn process_row(&self, row: &HashMap<String, String>) -> ParserResult<Option<ProcessedData>> {
        let advance_id = row
            .get("Deal Id")
            .ok_or_else(|| ParserError::ProcessingError("Missing Deal Id".to_string()))?
            .trim()
            .to_string();

        // Skip non-data rows (blank or non-numeric Deal Id).
        if advance_id.is_empty() || advance_id.parse::<f64>().is_err() {
            return Ok(None);
        }

        let merchant_name = row
            .get("Merchant_name")
            .unwrap_or(&String::new())
            .trim()
            .to_string();

        let gross = row
            .get("Payable Amt (Gross)")
            .and_then(|v| self.currency_to_float(v).ok())
            .unwrap_or(0.0);

        // Single pivot fee = originator servicing fee + Receivabull servicing fee.
        let originator_fee = row
            .get("Orginator servicing fee (porportionally)")
            .and_then(|v| self.currency_to_float(v).ok())
            .unwrap_or(0.0)
            .abs();

        let rb_fee = row
            .get("RB Servicing Fee $")
            .and_then(|v| self.currency_to_float(v).ok())
            .unwrap_or(0.0)
            .abs();

        let fee = originator_fee + rb_fee;

        // Trust the funder's stated net (see the discrepancy note above).
        let net = row
            .get("Payable Amt (Net)")
            .and_then(|v| self.currency_to_float(v).ok())
            .unwrap_or(0.0);

        Ok(Some(ProcessedData {
            advance_id,
            merchant_name,
            gross_payment: gross,
            fees: fee,
            net,
            originator_fee: Some(originator_fee),
            rb_fee: Some(rb_fee),
        }))
    }

    fn create_pivot_table(&self, data: Vec<ProcessedData>) -> ParserResult<PivotTable> {
        // Group by Deal Id, summing gross / originator fee / RB fee / net across
        // the deal's rows. (gross, originator, rb, net)
        let mut grouped_data: HashMap<(String, String), (f64, f64, f64, f64)> = HashMap::new();

        for row in data {
            let key = (row.advance_id, row.merchant_name);
            let entry = grouped_data.entry(key).or_insert((0.0, 0.0, 0.0, 0.0));
            entry.0 += row.gross_payment;
            entry.1 += row.originator_fee.unwrap_or(0.0);
            entry.2 += row.rb_fee.unwrap_or(0.0);
            entry.3 += row.net;
        }

        let mut pivot = PivotTable::new();

        let mut sorted_entries: Vec<_> = grouped_data.into_iter().collect();
        sorted_entries.sort_by(|a, b| a.0 .0.cmp(&b.0 .0));

        let round2 = |v: f64| (v * 100.0).round() / 100.0;
        for ((advance_id, merchant_name), (gross, originator, rb, net)) in sorted_entries {
            // fee and discrepancy are derived from the unrounded sums and
            // rounded once, so they stay accurate even when the individually
            // rounded originator/rb split drifts by a cent.
            let fee = round2(originator + rb);
            // Discrepancy the funder carries: gross - (originator + rb) should
            // equal net, but for some deals it does not.
            let discrepancy = round2(gross - originator - rb - net);

            pivot.add_row_detailed(
                advance_id,
                merchant_name,
                round2(gross),
                fee,
                round2(net),
                Some(round2(originator)),
                Some(round2(rb)),
                Some(discrepancy),
            );
        }

        pivot.add_totals_row();
        Ok(pivot)
    }
}
