use std::collections::HashMap;
use std::path::Path;
use calamine::{open_workbook, Reader, Xlsx, Data, Range, DataType};
use chrono::{Utc, NaiveDate, Duration};
use uuid::Uuid;
use crate::database::{Database, Merchant};

pub struct PortfolioParser {
    portfolio_name: String,
    funder_mappings: HashMap<String, String>,
}

impl PortfolioParser {
    pub fn new(portfolio_name: String) -> Self {
        let mut funder_mappings = HashMap::new();
        
        // Mapping from Excel sheet names to internal funder names
        funder_mappings.insert("BHB".to_string(), "BHB".to_string());
        funder_mappings.insert("BIG".to_string(), "BIG".to_string());
        funder_mappings.insert("CV".to_string(), "Clear View".to_string());
        funder_mappings.insert("EFin".to_string(), "eFin".to_string());
        funder_mappings.insert("InAd".to_string(), "In Advance".to_string());
        funder_mappings.insert("Kings".to_string(), "Kings".to_string());
        funder_mappings.insert("Boom".to_string(), "Boom".to_string());
        
        PortfolioParser {
            portfolio_name,
            funder_mappings,
        }
    }
    
    pub fn parse_portfolio_workbook(&self, file_path: &Path, db: &Database) -> Result<usize, String> {
        let mut workbook: Xlsx<_> = open_workbook(file_path)
            .map_err(|e| format!("Failed to open workbook: {}", e))?;
        
        let mut total_merchants = 0;
        
        // Iterate through each funder sheet
        for (sheet_name, funder_name) in &self.funder_mappings {
            if let Ok(range) = workbook.worksheet_range(sheet_name) {
                match self.extract_merchants_from_sheet(&range, funder_name, db) {
                    Ok(count) => {
                        total_merchants += count;
                    }
                    Err(e) => {
                        // Log error but continue processing other sheets
                        eprintln!("Failed to extract merchants from {} sheet: {}", sheet_name, e);
                    }
                }
            }
            // Sheet not found is not an error - the workbook might not have all funders
        }
        
        Ok(total_merchants)
    }
    
    fn extract_merchants_from_sheet(
        &self,
        range: &Range<Data>,
        funder_name: &str,
        db: &Database,
    ) -> Result<usize, String> {
        // Find the header row (should be at index 1, which is row 2)
        let header_row_index = 1;
        
        // Get headers from row 2
        let headers = self.get_headers_from_row(range, header_row_index)?;
        
        // Map column names to indices
        let column_indices = self.map_column_indices(&headers)?;
        
        let mut merchant_count = 0;
        
        // Process data rows starting from row 3 (index 2)
        let total_rows = range.height() as usize;
        for row_index in (header_row_index + 1)..total_rows {
            // Check if the row has any data
            if self.is_row_empty(range, row_index, &column_indices) {
                continue;
            }
            
            match self.extract_merchant_from_row(range, row_index, &column_indices, funder_name) {
                Ok(merchant) => {
                    // Save merchant to database
                    if let Err(e) = db.insert_or_update_merchant(&merchant) {
                        eprintln!("Failed to save merchant: {}", e);
                    } else {
                        merchant_count += 1;
                    }
                }
                Err(e) => {
                    // Skip invalid rows but log the error
                    eprintln!("Failed to extract merchant from row {}: {}", row_index + 1, e);
                }
            }
        }
        
        Ok(merchant_count)
    }
    
    fn get_headers_from_row(&self, range: &Range<Data>, row_index: usize) -> Result<Vec<String>, String> {
        let mut headers = Vec::new();
        
        let total_cols = range.width() as usize;
        for col_index in 0..total_cols {
            let cell_value = range.get_value((row_index as u32, col_index as u32))
                .and_then(|cell| cell.as_string())
                .unwrap_or_default();
            headers.push(cell_value);
        }
        
        Ok(headers)
    }
    
    fn map_column_indices(&self, headers: &[String]) -> Result<HashMap<String, usize>, String> {
        let mut indices = HashMap::new();
        
        // Required columns and their variations
        let column_mappings = vec![
            ("date_funded", vec!["Date Funded", "Funded Date", "Fund Date"]),
            ("merchant_name", vec!["Merchant Name", "Merchant", "Business Name", "DBA"]),
            ("website", vec!["Website", "Web Site", "URL"]),
            ("advance_id", vec!["Advance ID", "Deal ID", "Advance #", "Deal Number"]),
            ("funder_advance_id", vec!["Funder Advance ID", "Funder Deal ID", "Funder ID"]),
            ("industry", vec!["Industry: NAICS or SIC", "Industry", "NAICS", "SIC", "Industry Code"]),
            ("state", vec!["State", "ST", "Province"]),
            ("fico", vec!["FICO", "Credit Score", "Score"]),
            ("buy_rate", vec!["Buy Rate", "Rate", "Factor Rate"]),
            ("commission", vec!["Commission", "Comm", "Fee"]),
            ("total_funded", vec!["Total Amount Funded", "Amount Funded", "Funded Amount", "Total Funded"]),
        ];
        
        for (key, variations) in column_mappings {
            for (idx, header) in headers.iter().enumerate() {
                let header_trimmed = header.trim();
                let header_lower = header_trimmed.to_lowercase();
                for variation in &variations {
                    if header_lower == variation.to_lowercase() || header_lower.contains(&variation.to_lowercase()) {
                        indices.insert(key.to_string(), idx);
                        break;
                    }
                }
                if indices.contains_key(key) {
                    break;
                }
            }
        }
        
        // At minimum, we need merchant_name
        if !indices.contains_key("merchant_name") {
            return Err("Missing required column: Merchant Name".to_string());
        }
        
        Ok(indices)
    }
    
    fn is_row_empty(&self, range: &Range<Data>, row_index: usize, column_indices: &HashMap<String, usize>) -> bool {
        // Check if merchant name is empty (required field)
        if let Some(&merchant_col) = column_indices.get("merchant_name") {
            let merchant_name = range.get_value((row_index as u32, merchant_col as u32))
                .and_then(|cell| cell.as_string())
                .unwrap_or_default();
            return merchant_name.trim().is_empty();
        }
        true
    }
    
    fn extract_merchant_from_row(
        &self,
        range: &Range<Data>,
        row_index: usize,
        column_indices: &HashMap<String, usize>,
        funder_name: &str,
    ) -> Result<Merchant, String> {
        let get_string_value = |key: &str| -> Option<String> {
            column_indices.get(key).and_then(|&col_idx| {
                range.get_value((row_index as u32, col_idx as u32))
                    .and_then(|cell| cell.as_string())
                    .filter(|s| !s.trim().is_empty())
            })
        };
        
        let get_date_value = |key: &str| -> Option<String> {
            column_indices.get(key).and_then(|&col_idx| {
                range.get_value((row_index as u32, col_idx as u32))
                    .and_then(|cell| {
                        match cell {
                            Data::String(s) if !s.trim().is_empty() => {
                                // Parse date format like "3/21/2025" to "2025-03-21"
                                let parts: Vec<&str> = s.trim().split('/').collect();
                                if parts.len() == 3 {
                                    // Convert M/D/YYYY to YYYY-MM-DD
                                    if let (Some(month), Some(day), Some(year)) = 
                                        (parts[0].parse::<u32>().ok(), 
                                         parts[1].parse::<u32>().ok(), 
                                         parts[2].parse::<i32>().ok()) {
                                        Some(format!("{:04}-{:02}-{:02}", year, month, day))
                                    } else {
                                        None
                                    }
                                } else {
                                    Some(s.clone())
                                }
                            }
                            Data::Float(f) => {
                                // Excel stores dates as days since 1900-01-01
                                // But there's a bug: Excel thinks 1900 is a leap year
                                let days = *f as i64;
                                let adjusted_days = if days > 59 { days - 1 } else { days };
                                
                                NaiveDate::from_ymd_opt(1899, 12, 31)
                                    .and_then(|base| base.checked_add_signed(Duration::days(adjusted_days)))
                                    .map(|date| date.format("%Y-%m-%d").to_string())
                            }
                            Data::Int(i) => {
                                // Excel stores dates as days since 1900-01-01
                                let adjusted_days = if *i > 59 { i - 1 } else { *i };
                                
                                NaiveDate::from_ymd_opt(1899, 12, 31)
                                    .and_then(|base| base.checked_add_signed(Duration::days(adjusted_days)))
                                    .map(|date| date.format("%Y-%m-%d").to_string())
                            }
                            Data::DateTime(dt) => {
                                // Excel DateTime: days since 1900-01-01, but Excel incorrectly treats 1900 as leap year
                                let days = dt.as_f64() as i64;
                                // Adjust for Excel's leap year bug (1900-02-29 doesn't exist)
                                let adjusted_days = if days > 59 { days - 1 } else { days };
                                
                                NaiveDate::from_ymd_opt(1899, 12, 31)
                                    .and_then(|base| base.checked_add_signed(Duration::days(adjusted_days)))
                                    .map(|date| date.format("%Y-%m-%d").to_string())
                            }
                            _ => None
                        }
                    })
            })
        };
        
        let get_float_value = |key: &str| -> Option<f64> {
            column_indices.get(key).and_then(|&col_idx| {
                range.get_value((row_index as u32, col_idx as u32))
                    .and_then(|cell| {
                        match cell {
                            Data::Float(f) => Some(*f),
                            Data::Int(i) => Some(*i as f64),
                            Data::String(s) => {
                                // Try to parse string as number, removing currency symbols and commas
                                let cleaned = s.replace("$", "").replace(",", "").replace("%", "");
                                cleaned.parse::<f64>().ok()
                            }
                            _ => None,
                        }
                    })
            })
        };
        
        let merchant_name = get_string_value("merchant_name")
            .ok_or_else(|| "Missing merchant name".to_string())?;
        
        let advance_id = get_string_value("advance_id");
        
        // Generate unique ID
        let id = Uuid::new_v4().to_string();
        
        let now = Utc::now();
        
        Ok(Merchant {
            id,
            portfolio_name: self.portfolio_name.clone(),
            funder_name: funder_name.to_string(),
            date_funded: get_date_value("date_funded"),
            merchant_name,
            website: get_string_value("website"),
            advance_id,
            funder_advance_id: get_string_value("funder_advance_id"),
            industry_naics_or_sic: get_string_value("industry"),
            state: get_string_value("state"),
            fico: get_string_value("fico"),
            buy_rate: get_float_value("buy_rate"),
            commission: get_float_value("commission"),
            total_amount_funded: get_float_value("total_funded"),
            created_timestamp: now,
            updated_timestamp: now,
        })
    }
}