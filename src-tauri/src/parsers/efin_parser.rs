use std::collections::HashMap;
use std::path::Path;
use crate::parsers::base_parser::{
    BaseParser, ParserError, ParserResult, ProcessedData, PivotTable,
    read_csv_file
};

pub struct EfinParser;

impl EfinParser {
    pub fn new() -> Self {
        EfinParser
    }
}

impl BaseParser for EfinParser {
    fn get_funder_name(&self) -> &str {
        "eFin"
    }

    fn get_required_columns(&self) -> Vec<String> {
        vec![
            "Funding Date".to_string(),
            "Advance ID".to_string(),
            "Business Name".to_string(),
            "Advance Status".to_string(),
            "Payable Amt (Gross)".to_string(),
            "Servicing Fee $".to_string(),
            "Payable Amt (Net)".to_string(),
            "Payable Status".to_string(),
        ]
    }

    fn parse_file(&self, file_path: &Path) -> ParserResult<Vec<HashMap<String, String>>> {
        read_csv_file(file_path)
    }

    fn validate_columns(&self, headers: &[String]) -> ParserResult<()> {
        let required = self.get_required_columns();
        let missing: Vec<String> = required
            .iter()
            .filter(|col| !headers.contains(col))
            .cloned()
            .collect();

        if !missing.is_empty() {
            return Err(ParserError::MissingColumns { columns: missing });
        }

        Ok(())
    }

    fn process_row(&self, row: &HashMap<String, String>) -> ParserResult<Option<ProcessedData>> {
        // Get advance ID - skip if empty
        let advance_id = row.get("Advance ID")
            .ok_or_else(|| ParserError::ProcessingError("Missing Advance ID".to_string()))?
            .trim()
            .to_string();
        
        if advance_id.is_empty() {
            return Ok(None);
        }

        // Get merchant name
        let merchant_name = row.get("Business Name")
            .unwrap_or(&String::new())
            .trim()
            .to_string();

        // Parse amounts
        let gross_payment = row.get("Payable Amt (Gross)")
            .and_then(|v| self.currency_to_float(v).ok())
            .unwrap_or(0.0);

        let fees = row.get("Servicing Fee $")
            .and_then(|v| self.currency_to_float(v).ok())
            .unwrap_or(0.0)
            .abs(); // Ensure fees are positive

        let net = row.get("Payable Amt (Net)")
            .and_then(|v| self.currency_to_float(v).ok())
            .unwrap_or(0.0);

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
        
        // Group by Advance ID (aggregate multiple rows with same ID)
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
        
        // Add rows to pivot table
        for (advance_id, (merchant_name, gross, fee, net)) in grouped {
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
    use std::path::Path;

    #[test]
    fn test_efin_parser_with_example_file() {
        let file_path = Path::new("../examples/eFin.csv");
        if file_path.exists() {
            let parser = EfinParser::new();
            match parser.process(file_path) {
                Ok(pivot_table) => {
                    println!("eFin Parser Success!");
                    println!("Total Gross: {:.2}", pivot_table.total_gross);
                    println!("Total Fee: {:.2}", pivot_table.total_fee);
                    println!("Total Net: {:.2}", pivot_table.total_net);
                    println!("Number of rows: {}", pivot_table.rows.len());
                    assert!(pivot_table.rows.len() > 0);
                    
                    // Verify totals match what's expected
                    assert!(pivot_table.total_gross > 0.0);
                    assert!(pivot_table.total_fee > 0.0);
                    assert!(pivot_table.total_net > 0.0);
                    
                    // Verify the relationship: gross = net + fee (with small tolerance for rounding)
                    let calculated_gross = pivot_table.total_net + pivot_table.total_fee;
                    assert!((pivot_table.total_gross - calculated_gross).abs() < 0.01);
                },
                Err(e) => {
                    panic!("Failed to process eFin file: {:?}", e);
                }
            }
        } else {
            println!("Test file ../examples/eFin.csv not found, skipping test");
        }
    }

    #[test]
    fn test_currency_parsing() {
        let parser = EfinParser::new();
        
        assert_eq!(parser.currency_to_float("$100.50").unwrap(), 100.50);
        assert_eq!(parser.currency_to_float("1,234.56").unwrap(), 1234.56);
        assert_eq!(parser.currency_to_float("(50.00)").unwrap(), -50.00);
        assert_eq!(parser.currency_to_float("$1,234.56").unwrap(), 1234.56);
    }
}