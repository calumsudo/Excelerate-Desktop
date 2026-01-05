use std::collections::HashMap;
use std::path::Path;
use super::base_parser::*;

pub struct InAdvParser {
    funder_name: String,
    required_columns: Vec<String>,
}

impl InAdvParser {
    pub fn new() -> Self {
        InAdvParser {
            funder_name: "InAdvance".to_string(),
            required_columns: vec![
                "Status".to_string(),
                "Mgmt Fee".to_string(),
                "Advance Id".to_string(),
                "Amount".to_string(),
                "Gross Amount".to_string(),
                "Contact ID".to_string(),
            ],
        }
    }
}

impl BaseParser for InAdvParser {
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
        // Get Advance ID and validate it's not empty
        let advance_id = row.get("Advance Id")
            .ok_or_else(|| ParserError::ProcessingError("Missing Advance Id".to_string()))?;
        
        // Skip empty advance IDs or non-numeric IDs
        if advance_id.is_empty() || advance_id.parse::<f64>().is_err() {
            return Ok(None);
        }
        
        // Get Status and skip if not "Cleared"
        let status = row.get("Status")
            .ok_or_else(|| ParserError::ProcessingError("Missing Status".to_string()))?;
        
        if status != "Cleared" {
            return Ok(None);
        }
        
        // Get Contact ID as merchant identifier
        let contact_id = row.get("Contact ID")
            .ok_or_else(|| ParserError::ProcessingError("Missing Contact ID".to_string()))?
            .clone();
        
        // Get Amount (net amount after fees)
        let amount = row.get("Amount")
            .ok_or_else(|| ParserError::ProcessingError("Missing Amount".to_string()))?;
        let net_amount = self.currency_to_float(amount)?;
        
        // Get Gross Amount
        let gross_amount = row.get("Gross Amount")
            .ok_or_else(|| ParserError::ProcessingError("Missing Gross Amount".to_string()))?;
        let gross_amount = self.currency_to_float(gross_amount)?;
        
        // Get Mgmt Fee (the fee amount)
        let mgmt_fee = row.get("Mgmt Fee")
            .ok_or_else(|| ParserError::ProcessingError("Missing Mgmt Fee".to_string()))?;
        let fee = self.currency_to_float(mgmt_fee)?.abs(); // Use absolute value of fee
        
        Ok(Some(ProcessedData {
            advance_id: advance_id.clone(),
            merchant_name: contact_id, // Using Contact ID as merchant identifier
            gross_payment: gross_amount,
            fees: fee,
            net: net_amount,
        }))
    }
    
    fn create_pivot_table(&self, data: Vec<ProcessedData>) -> ParserResult<PivotTable> {
        // Group by Advance ID and Merchant Name (Contact ID), summing the values
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