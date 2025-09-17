use std::path::Path;
use std::collections::HashMap;
use super::base_parser::*;

pub struct ClearViewDailyParser {
    funder_name: String,
    required_columns: Vec<String>,
    file_paths: Vec<std::path::PathBuf>,
}

impl ClearViewDailyParser {
    pub fn new(file_paths: Vec<std::path::PathBuf>) -> Self {
        ClearViewDailyParser {
            funder_name: "ClearView".to_string(),
            required_columns: vec![
                "Syn Net Amount".to_string(),
                "Syn Gross Amount".to_string(),
                "AdvanceID".to_string(),
                "Advance Status".to_string(),
            ],
            file_paths,
        }
    }

    pub fn from_single(file_path: &Path) -> Self {
        ClearViewDailyParser {
            funder_name: "ClearView".to_string(),
            required_columns: vec![
                "Syn Net Amount".to_string(),
                "Syn Gross Amount".to_string(),
                "AdvanceID".to_string(),
                "Advance Status".to_string(),
            ],
            file_paths: vec![file_path.to_path_buf()],
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
        
        if cleaned.is_empty() || cleaned == "0.00" {
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
        let mut all_data: Vec<HashMap<String, String>> = Vec::new();
        
        // Read and combine all files
        for file_path in &self.file_paths {
            let file_data = read_csv_file(file_path)?;
            all_data.extend(file_data);
        }
        
        // Validate columns from first file (assuming all have same structure)
        if !all_data.is_empty() {
            let first_row = &all_data[0];
            let headers: Vec<String> = first_row.keys().cloned().collect();
            self.validate_columns(&headers)?;
        }
        
        // Group by AdvanceID and sum amounts
        let mut grouped_data: HashMap<String, (f64, f64)> = HashMap::new();
        
        for row in all_data {
            // Skip rows with empty or invalid AdvanceID
            let advance_id = match row.get("AdvanceID") {
                Some(id) => {
                    let trimmed = id.trim();
                    if trimmed.is_empty() || trimmed == "0" {
                        continue;
                    }
                    trimmed.to_string()
                },
                None => continue,
            };
            
            // Parse amounts
            let syn_gross = self.parse_currency(row.get("Syn Gross Amount").unwrap_or(&"0".to_string()))?;
            let syn_net = self.parse_currency(row.get("Syn Net Amount").unwrap_or(&"0".to_string()))?;
            
            // Skip rows where both amounts are zero
            if syn_gross == 0.0 && syn_net == 0.0 {
                continue;
            }
            
            // Add to grouped data
            let entry = grouped_data.entry(advance_id).or_insert((0.0, 0.0));
            entry.0 += syn_gross;
            entry.1 += syn_net;
        }
        
        // Create pivot table
        let mut pivot = PivotTable::new();
        
        for (advance_id, (gross, net)) in grouped_data {
            let fee = (gross - net).abs();
            pivot.add_row(
                advance_id.clone(),
                advance_id, // Using AdvanceID as merchant name for now
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

impl BaseParser for ClearViewDailyParser {
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