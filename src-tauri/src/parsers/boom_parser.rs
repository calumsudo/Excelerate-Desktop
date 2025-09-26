use std::collections::HashMap;
use std::path::Path;
use super::base_parser::*;
use calamine::{Reader, Xlsx, open_workbook, Data};

pub struct BoomParser {
    funder_name: String,
}

impl BoomParser {
    pub fn new() -> Self {
        BoomParser {
            funder_name: "Boom".to_string(),
        }
    }
    
    fn clean_value(&self, value: &Data) -> Option<String> {
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
    
    fn parse_currency(&self, value: &Data) -> f64 {
        match value {
            Data::Float(f) => *f,
            Data::Int(i) => *i as f64,
            Data::String(s) => {
                // Try to parse string as currency
                s.replace('$', "")
                    .replace(',', "")
                    .replace('(', "-")
                    .replace(')', "")
                    .trim()
                    .parse::<f64>()
                    .unwrap_or(0.0)
            },
            _ => 0.0,
        }
    }
    
    fn process_sheet_data(&self, file_path: &Path) -> ParserResult<Vec<ProcessedData>> {
        let mut workbook: Xlsx<_> = open_workbook(file_path)
            .map_err(|_| ParserError::ProcessingError("Failed to open workbook".to_string()))?;
        
        // Get the first sheet (usually "Syndicator Remittance Details -")
        let sheet_names = workbook.sheet_names();
        if sheet_names.is_empty() {
            return Err(ParserError::ProcessingError("No sheets found in workbook".to_string()));
        }
        
        let sheet_name = sheet_names[0].clone();
        
        let range = workbook.worksheet_range(&sheet_name)
            .map_err(|e| ParserError::ProcessingError(format!("Failed to read sheet '{}': {:?}", sheet_name, e)))?;
        
        let mut processed_data = Vec::new();
        
        // IMPORTANT: Excel column A is completely empty and calamine skips it
        // So calamine's indexing is shifted - what Excel shows as column B becomes index 0
        // 
        // Headers are on Excel row 11 (calamine index 10), data starts from Excel row 12 (calamine index 11)
        // Column mapping (Excel column → calamine index):
        // Excel B → Index 0: "Advance: Advance Name" (Advance ID)
        // Excel C → Index 1: Empty
        // Excel D → Index 2: "Merchant" (Merchant Name)
        // Excel E → Index 3: "Funded Date"
        // ...
        // Excel O → Index 13: "Gross Amount"
        // Excel P → Index 14: "Management Fee"  
        // Excel Q → Index 15: "Amount" (Net Amount)
        
        let header_row_idx = 10;  // Row 11 in Excel (0-indexed)
        let data_start_row = header_row_idx + 1;  // Row 12 in Excel
        
        // Verify headers are in expected positions
        if let Some(header_row) = range.rows().nth(header_row_idx) {
            // Check if we have the expected headers
            let advance_header = header_row.get(0).and_then(|cell| self.clean_value(cell));
            let merchant_header = header_row.get(2).and_then(|cell| self.clean_value(cell));
            let gross_header = header_row.get(13).and_then(|cell| self.clean_value(cell));
            
            if advance_header.is_none() || 
               !advance_header.as_ref().unwrap().to_lowercase().contains("advance") ||
               merchant_header.is_none() || 
               !merchant_header.as_ref().unwrap().to_lowercase().contains("merchant") ||
               gross_header.is_none() || 
               !gross_header.as_ref().unwrap().to_lowercase().contains("gross") {
                return Err(ParserError::ProcessingError(
                    format!("Expected headers not found. Looking for 'Advance' in column A (found: {:?}), 'Merchant' in column C (found: {:?}), and 'Gross Amount' in column N (found: {:?})",
                        advance_header, merchant_header, gross_header)
                ));
            }
        } else {
            return Err(ParserError::ProcessingError("Header row (row 11) not found".to_string()));
        }
        
        // Process data rows
        for (_row_idx, row) in range.rows().enumerate().skip(data_start_row) {
            // Column A (0): Advance ID
            let advance_id = row.get(0)
                .and_then(|cell| self.clean_value(cell));
            
            if advance_id.is_none() {
                continue; // Skip rows without valid advance ID
            }
            
            // Column C (2): Merchant Name (Note: Column B is empty, so merchant is at index 2)
            let merchant_name = row.get(2)
                .and_then(|cell| self.clean_value(cell))
                .unwrap_or_default();
            
            // Skip if merchant name is empty
            if merchant_name.is_empty() {
                continue;
            }
            
            // Column N (13): Gross Amount
            let gross_payment = row.get(13)
                .map(|cell| self.parse_currency(cell))
                .unwrap_or(0.0);
            
            // Column O (14): Management Fee
            let fees = row.get(14)
                .map(|cell| self.parse_currency(cell))
                .unwrap_or(0.0);
            
            // Column P (15): Net Amount
            let net = row.get(15)
                .map(|cell| self.parse_currency(cell))
                .unwrap_or(0.0);
            
            // Skip rows with all zero amounts
            if gross_payment == 0.0 && fees == 0.0 && net == 0.0 {
                continue;
            }
            
            processed_data.push(ProcessedData {
                advance_id: advance_id.unwrap(),
                merchant_name,
                gross_payment,
                fees,
                net,
            });
        }
        
        Ok(processed_data)
    }
}

impl BaseParser for BoomParser {
    fn get_funder_name(&self) -> &str {
        &self.funder_name
    }
    
    fn get_required_columns(&self) -> Vec<String> {
        // Boom files have fixed column positions, not named columns
        vec![]
    }
    
    fn parse_file(&self, _file_path: &Path) -> ParserResult<Vec<HashMap<String, String>>> {
        // For Boom parser, we'll override the process method directly
        // since the format is an xlsx file with specific structure
        Err(ParserError::ProcessingError(
            "Boom parser uses custom processing, call process() directly".to_string()
        ))
    }
    
    fn validate_columns(&self, _headers: &[String]) -> ParserResult<()> {
        // Boom files are validated differently (by column positions)
        Ok(())
    }
    
    fn process_row(&self, _row: &HashMap<String, String>) -> ParserResult<Option<ProcessedData>> {
        // Not used for Boom parser
        Err(ParserError::ProcessingError(
            "Boom parser uses custom row processing".to_string()
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
        
        // Process the sheet data
        let processed_data = self.process_sheet_data(file_path)?;
        
        if processed_data.is_empty() {
            return Err(ParserError::ProcessingError("No valid data found".to_string()));
        }
        
        // Create pivot table
        self.create_pivot_table(processed_data)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    
    #[test]
    fn test_boom_parser_with_example_file() {
        // Test with the actual example file if it exists
        let test_path = Path::new("../examples/Boom.xlsx");
        if test_path.exists() {
            let parser = BoomParser::new();
            let result = parser.process(test_path);
            
            assert!(result.is_ok(), "Failed to parse Boom.xlsx: {:?}", result);
            let pivot = result.unwrap();
            
            // The example file should have some data
            assert!(!pivot.rows.is_empty(), "No data rows found in pivot table");
            
            // Should have totals
            assert!(pivot.total_gross > 0.0, "Total gross amount should be greater than 0");
            
            // Last row should be totals
            if let Some(last_row) = pivot.rows.last() {
                assert_eq!(last_row.advance_id, "Totals");
            }
            
            println!("Pivot table created with {} rows", pivot.rows.len());
            println!("Total Gross: {:.2}", pivot.total_gross);
            println!("Total Fees: {:.2}", pivot.total_fee);
            println!("Total Net: {:.2}", pivot.total_net);
        }
    }
}