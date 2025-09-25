use std::collections::HashMap;
use std::path::Path;
use super::base_parser::*;
use calamine::{Reader, Xlsx, open_workbook, Data};

pub struct BigParser {
    funder_name: String,
}

impl BigParser {
    pub fn new() -> Self {
        BigParser {
            funder_name: "BIG".to_string(),
        }
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
            "Could not find portfolio sheet (R&H or White Rabbit)".to_string()
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
            },
            Data::Float(f) => {
                // Convert float to integer string if it's a whole number
                if f.fract() == 0.0 {
                    Some((*f as i64).to_string())
                } else {
                    Some(f.to_string())
                }
            },
            Data::Int(i) => Some(i.to_string()),
            _ => Some(value.to_string()),
        }
    }
    
    fn process_sheet_data(&self, file_path: &Path, sheet_name: &str) -> ParserResult<Vec<ProcessedData>> {
        let mut workbook: Xlsx<_> = open_workbook(file_path)
            .map_err(|_| ParserError::ProcessingError("Failed to open workbook".to_string()))?;
        
        let range = workbook.worksheet_range(sheet_name)
            .map_err(|e| ParserError::ProcessingError(format!("Failed to read sheet '{}': {:?}", sheet_name, e)))?;
        
        let mut processed_data = Vec::new();
        
        // Find the header row (look for "Funding ID" or similar in column A)
        let mut data_start_row = 3; // Default start row
        let header_values = vec!["funding id", "fundingid", "funding_id", "id", "advance id", "advanceid"];
        
        for (row_idx, row) in range.rows().enumerate().take(10) {
            if let Some(first_cell) = row.get(0) {
                let cell_str = first_cell.to_string().to_lowercase();
                if header_values.iter().any(|h| cell_str.contains(h)) {
                    data_start_row = row_idx + 1;
                    break;
                }
            }
        }
        
        // Process data rows
        for (_row_idx, row) in range.rows().enumerate().skip(data_start_row) {
            // Column A (0): Funding ID / Advance ID
            let advance_id = row.get(0)
                .and_then(|cell| self.clean_advance_id(cell));
            
            if advance_id.is_none() {
                continue; // Skip rows without valid advance ID
            }
            
            // Column C (2): Business Name / Merchant Name
            let merchant_name = row.get(2)
                .map(|cell| cell.to_string())
                .unwrap_or_default();
            
            // Column AI (34): Total amount (usually has SUM formula)
            // First try column AI
            let mut net_amount = row.get(34)
                .and_then(|cell| match cell {
                    Data::Float(f) => Some(*f),
                    Data::Int(i) => Some(*i as f64),
                    _ => None,
                })
                .unwrap_or(0.0);
            
            // If column AI is 0 or not available, try summing columns AJ to AP (35-41)
            // These are the daily payment columns (skip AF which is % completed)
            // Column 35 (AJ) = "Payments 9/5/25"
            // Column 36 (AK) = "Payments 9/4/25" 
            // ... through column 41 (AP)
            if net_amount == 0.0 {
                let mut sum = 0.0;
                for col_idx in 35..=41 {
                    if let Some(cell) = row.get(col_idx) {
                        match cell {
                            Data::Float(f) => sum += f,
                            Data::Int(i) => sum += *i as f64,
                            _ => {}
                        }
                    }
                }
                if sum != 0.0 {
                    net_amount = sum;
                }
            }
            
            // Skip rows with zero amounts (likely empty or summary rows)
            if net_amount == 0.0 && merchant_name.trim().is_empty() {
                continue;
            }
            
            processed_data.push(ProcessedData {
                advance_id: advance_id.unwrap(),
                merchant_name,
                gross_payment: net_amount,  // BIG doesn't separate gross/net
                fees: 0.0,  // BIG doesn't provide separate fee information
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
            "BIG parser uses custom processing, call process() directly".to_string()
        ))
    }
    
    fn validate_columns(&self, _headers: &[String]) -> ParserResult<()> {
        // BIG files are validated differently (by sheet names)
        Ok(())
    }
    
    fn process_row(&self, _row: &HashMap<String, String>) -> ParserResult<Option<ProcessedData>> {
        // Not used for BIG parser
        Err(ParserError::ProcessingError(
            "BIG parser uses custom row processing".to_string()
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
        sorted_entries.sort_by(|a, b| a.0.0.cmp(&b.0.0));
        
        // Add data rows
        for ((advance_id, merchant_name), (gross, fee, net)) in sorted_entries {
            pivot.add_row(
                advance_id,
                merchant_name,
                gross,
                fee,
                net,
            );
        }
        
        // Add totals row
        pivot.add_totals_row();
        
        Ok(pivot)
    }
    
    fn process(&self, file_path: &Path) -> ParserResult<PivotTable> {
        // Check file extension
        let extension = file_path.extension()
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
            return Err(ParserError::ProcessingError("No valid data found".to_string()));
        }
        
        // Create pivot table
        self.create_pivot_table(processed_data)
    }
}