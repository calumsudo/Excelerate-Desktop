use std::collections::HashMap;
use std::path::Path;
use super::base_parser::*;

pub struct BhbParser {
    funder_name: String,
    required_columns: Vec<String>,
}

impl BhbParser {
    pub fn new() -> Self {
        BhbParser {
            funder_name: "BHB".to_string(),
            required_columns: vec![
                "Deal ID".to_string(),
                "Deal Name".to_string(),
                "Participator Gross Amount".to_string(),
                "Non Qualifying Collections".to_string(),
                "Total Reversals".to_string(),
                "Fee".to_string(),
                "Res. Commission".to_string(),
                "Net Payment Amount".to_string(),
                "Balance".to_string(),
            ],
        }
    }
}

impl BaseParser for BhbParser {
    fn get_funder_name(&self) -> &str {
        &self.funder_name
    }
    
    fn get_required_columns(&self) -> Vec<String> {
        self.required_columns.clone()
    }
    
    fn parse_file(&self, file_path: &Path) -> ParserResult<Vec<HashMap<String, String>>> {
        let extension = file_path.extension()
            .and_then(|e| e.to_str())
            .ok_or(ParserError::UnsupportedFormat)?;
        
        match extension.to_lowercase().as_str() {
            "csv" => read_csv_file(file_path),
            "xlsx" => read_excel_file(file_path, "Sheet1"),
            _ => Err(ParserError::UnsupportedFormat),
        }
    }
    
    fn validate_columns(&self, headers: &[String]) -> ParserResult<()> {
        let missing_columns: Vec<String> = self.required_columns.iter()
            .filter(|col| !headers.contains(col))
            .cloned()
            .collect();
        
        if !missing_columns.is_empty() {
            return Err(ParserError::MissingColumns { columns: missing_columns });
        }
        
        Ok(())
    }
    
    fn process_row(&self, row: &HashMap<String, String>) -> ParserResult<Option<ProcessedData>> {
        // Get Deal ID and validate it's numeric
        let deal_id = row.get("Deal ID")
            .ok_or_else(|| ParserError::ProcessingError("Missing Deal ID".to_string()))?;
        
        // Skip non-numeric Deal IDs
        if deal_id.parse::<f64>().is_err() {
            return Ok(None);
        }
        
        let deal_name = row.get("Deal Name")
            .ok_or_else(|| ParserError::ProcessingError("Missing Deal Name".to_string()))?
            .clone();
        
        let gross_amount = row.get("Participator Gross Amount")
            .ok_or_else(|| ParserError::ProcessingError("Missing Participator Gross Amount".to_string()))?;
        let gross_amount = self.currency_to_float(gross_amount)?;
        
        let fee = row.get("Fee")
            .ok_or_else(|| ParserError::ProcessingError("Missing Fee".to_string()))?;
        let fee = self.currency_to_float(fee)?.abs(); // Use absolute value of fee
        
        let net_amount = row.get("Net Payment Amount")
            .ok_or_else(|| ParserError::ProcessingError("Missing Net Payment Amount".to_string()))?;
        let net_amount = self.currency_to_float(net_amount)?;
        
        Ok(Some(ProcessedData {
            advance_id: deal_id.clone(),
            merchant_name: deal_name,
            gross_payment: gross_amount,
            fees: fee,
            net: net_amount,
        }))
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
        sorted_entries.sort_by(|a, b| a.0.0.cmp(&b.0.0));
        
        // Add data rows
        for ((advance_id, merchant_name), (gross, fee, net)) in sorted_entries {
            pivot.add_row(
                advance_id,
                merchant_name,
                (gross * 100.0).round() / 100.0, // Round to 2 decimal places
                (fee * 100.0).round() / 100.0,
                (net * 100.0).round() / 100.0,
            );
        }
        
        // Add totals row
        pivot.add_totals_row();
        
        Ok(pivot)
    }
}