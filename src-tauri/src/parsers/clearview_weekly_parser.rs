use std::path::Path;
use std::collections::HashMap;
use super::base_parser::*;

pub struct ClearViewWeeklyParser {
    funder_name: String,
    required_columns: Vec<String>,
    file_path: std::path::PathBuf,
}

impl ClearViewWeeklyParser {
    pub fn new(file_path: &Path) -> Self {
        ClearViewWeeklyParser {
            funder_name: "ClearView Weekly".to_string(),
            required_columns: vec![
                "Deal Id".to_string(),
                "Participator Gross Amount".to_string(),
                "Fee".to_string(),
                "Net Payment Amount".to_string(),
            ],
            file_path: file_path.to_path_buf(),
        }
    }
    
    fn parse_currency(&self, value: &str) -> ParserResult<f64> {
        let cleaned = value
            .replace('$', "")
            .replace(',', "")
            .replace('(', "-")
            .replace(')', "")
            .replace('"', "")
            .trim()
            .to_string();
        
        if cleaned.is_empty() {
            return Ok(0.0);
        }
        
        cleaned.parse::<f64>().map_err(|e| {
            ParserError::TypeConversion {
                column: "currency".to_string(),
                message: format!("Failed to parse '{}': {}", value, e),
            }
        })
    }
    
    pub fn process(&self) -> ParserResult<PivotTable> {
        let data = read_csv_file(&self.file_path)?;
        
        // Validate columns
        if !data.is_empty() {
            let first_row = &data[0];
            let headers: Vec<String> = first_row.keys().cloned().collect();
            self.validate_columns(&headers)?;
        }
        
        // Group by Deal ID and sum amounts
        let mut grouped_data: HashMap<String, (f64, f64, f64)> = HashMap::new();
        
        for row in data {
            // Skip rows with empty Deal Id
            let deal_id = match row.get("Deal Id") {
                Some(id) => {
                    let trimmed = id.trim();
                    if trimmed.is_empty() {
                        continue;
                    }
                    trimmed.to_string()
                },
                None => continue,
            };
            
            // Parse amounts
            let gross = self.parse_currency(row.get("Participator Gross Amount").unwrap_or(&"0".to_string()))?;
            let fee = self.parse_currency(row.get("Fee").unwrap_or(&"0".to_string()))?;
            let net = self.parse_currency(row.get("Net Payment Amount").unwrap_or(&"0".to_string()))?;
            
            // Skip rows where all amounts are zero
            if gross == 0.0 && fee == 0.0 && net == 0.0 {
                continue;
            }
            
            // Add to grouped data
            let entry = grouped_data.entry(deal_id).or_insert((0.0, 0.0, 0.0));
            entry.0 += gross;
            entry.1 += fee;
            entry.2 += net;
        }
        
        // Create pivot table
        let mut pivot = PivotTable::new();
        
        for (deal_id, (gross, fee, net)) in grouped_data {
            pivot.add_row(
                deal_id.clone(),
                deal_id, // Using Deal ID as merchant name
                gross,
                fee,
                net,
            );
        }
        
        // Add totals row
        pivot.add_totals_row();
        
        Ok(pivot)
    }
}

impl BaseParser for ClearViewWeeklyParser {
    fn get_funder_name(&self) -> &str {
        &self.funder_name
    }
    
    fn get_required_columns(&self) -> Vec<String> {
        self.required_columns.clone()
    }
    
    fn parse_file(&self, file_path: &Path) -> ParserResult<Vec<HashMap<String, String>>> {
        read_csv_file(file_path)
    }
    
    fn validate_columns(&self, headers: &[String]) -> ParserResult<()> {
        let missing: Vec<String> = self.required_columns
            .iter()
            .filter(|col| !headers.contains(col))
            .cloned()
            .collect();
        
        if !missing.is_empty() {
            return Err(ParserError::MissingColumns { columns: missing });
        }
        
        Ok(())
    }
    
    fn process_row(&self, _row: &HashMap<String, String>) -> ParserResult<Option<ProcessedData>> {
        // This parser uses grouped processing, so we don't process individual rows
        Ok(None)
    }
    
    fn create_pivot_table(&self, _data: Vec<ProcessedData>) -> ParserResult<PivotTable> {
        // This parser creates its own pivot table in the process method
        self.process()
    }
}