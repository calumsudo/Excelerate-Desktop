use std::collections::HashMap;
use std::path::Path;
use super::base_parser::{
    BaseParser, ParserError, ParserResult, PivotTable, ProcessedData, read_csv_file
};

pub struct KingsParser;

impl KingsParser {
    pub fn new() -> Self {
        KingsParser
    }
}

impl BaseParser for KingsParser {
    fn get_funder_name(&self) -> &str {
        "Kings"
    }
    
    fn get_required_columns(&self) -> Vec<String> {
        vec![
            "Advance ID".to_string(),
            "Business Name".to_string(),
            "Payable Amt (Gross)".to_string(),
            "Servicing Fee $".to_string(),
            "Payable Amt (Net)".to_string(),
        ]
    }
    
    fn parse_file(&self, file_path: &Path) -> ParserResult<Vec<HashMap<String, String>>> {
        read_csv_file(file_path)
    }
    
    fn validate_columns(&self, headers: &[String]) -> ParserResult<()> {
        let required = self.get_required_columns();
        let missing: Vec<String> = required.into_iter()
            .filter(|col| !headers.contains(col))
            .collect();
        
        if !missing.is_empty() {
            return Err(ParserError::MissingColumns { columns: missing });
        }
        
        Ok(())
    }
    
    fn process_row(&self, row: &HashMap<String, String>) -> ParserResult<Option<ProcessedData>> {
        // Get required fields
        let advance_id = row.get("Advance ID").unwrap_or(&String::new()).clone();
        let merchant_name = row.get("Business Name").unwrap_or(&String::new()).clone();
        
        let default_zero = String::from("0");
        let gross_str = row.get("Payable Amt (Gross)").unwrap_or(&default_zero);
        let fees_str = row.get("Servicing Fee $").unwrap_or(&default_zero);
        let net_str = row.get("Payable Amt (Net)").unwrap_or(&default_zero);
        
        // Skip empty rows
        if advance_id.is_empty() || merchant_name.is_empty() {
            return Ok(None);
        }
        
        // Parse amounts
        let gross_payment = self.currency_to_float(gross_str)?;
        let fees = self.currency_to_float(fees_str)?;
        let net = self.currency_to_float(net_str)?;
        
        // Skip rows with zero amounts
        if gross_payment == 0.0 && fees == 0.0 && net == 0.0 {
            return Ok(None);
        }
        
        Ok(Some(ProcessedData {
            advance_id,
            merchant_name,
            gross_payment,
            fees,
            net,
        }))
    }
    
    fn create_pivot_table(&self, data: Vec<ProcessedData>) -> ParserResult<PivotTable> {
        let mut pivot = PivotTable::new();
        
        // Group by advance_id and aggregate
        let mut grouped: HashMap<String, (String, f64, f64, f64)> = HashMap::new();
        
        for item in data {
            let entry = grouped.entry(item.advance_id.clone()).or_insert((
                item.merchant_name.clone(),
                0.0,
                0.0,
                0.0,
            ));
            entry.1 += item.gross_payment;
            entry.2 += item.fees;
            entry.3 += item.net;
        }
        
        // Add rows to pivot table, sorted by advance_id
        let mut sorted: Vec<_> = grouped.into_iter().collect();
        sorted.sort_by(|a, b| a.0.cmp(&b.0));
        
        for (advance_id, (merchant_name, gross, fee, net)) in sorted {
            pivot.add_row(advance_id, merchant_name, gross, fee, net);
        }
        
        // Add totals row
        pivot.add_totals_row();
        
        Ok(pivot)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use std::path::PathBuf;
    
    #[test]
    fn test_kings_parser() {
        // Create a test CSV file
        let test_data = r#"Funding Date,Advance ID,Business Name,Advance Status,Syndicators Name,Payable Amt (Gross),Servicing Fee $,Payable Amt (Net),Payable Cleared Date,Payable Process Date
2024-11-13,7294788,Mailpacknship Inc,Paid In Full,R&H Capital Management II,103.49,3.10,100.39,2025-07-31,2025-07-31
2024-10-24,7246479,Cmpm Express Inc,In-Repayment,R&H Capital Management II,30.00,0.90,29.10,2025-08-04,2025-08-04
2024-10-08,7192094,Cmpm Express Inc,In-Repayment,R&H Capital Management II,20.00,0.60,19.40,2025-08-04,2025-08-04"#;
        
        let test_path = PathBuf::from("test_kings.csv");
        fs::write(&test_path, test_data).expect("Failed to write test file");
        
        let parser = KingsParser::new();
        let result = parser.process(&test_path);
        
        // Clean up test file
        fs::remove_file(&test_path).ok();
        
        assert!(result.is_ok());
        let pivot = result.unwrap();
        
        // Should have 3 unique advances + totals row
        assert_eq!(pivot.rows.len(), 4);
        
        // Check totals
        assert_eq!(pivot.total_gross, 153.49);
        assert_eq!(pivot.total_fee, 4.60);
        assert_eq!(pivot.total_net, 148.89);
    }
}