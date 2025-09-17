use std::path::{Path, PathBuf};
use std::collections::HashMap;
use chrono::{NaiveDate, Datelike};
use uuid::Uuid;
use super::base_parser::*;
use super::clearview_daily_parser::ClearViewDailyParser;
use super::clearview_weekly_parser::ClearViewWeeklyParser;
use crate::database::{Database, FunderPivotTable};
use crate::file_handler::get_excelerate_dir;

#[derive(Debug, Clone)]
pub struct ClearViewPivotProcessor {
    portfolio_name: String,
    report_date: String,
}

#[derive(Debug, Clone)]
pub enum PivotTableType {
    DailyAggregated,  // Multiple daily files aggregated into weekly
    WeeklyReport,     // Single weekly report file
    Combined,         // Combined daily + weekly
}

impl ClearViewPivotProcessor {
    pub fn new(portfolio_name: String, report_date: String) -> Self {
        ClearViewPivotProcessor {
            portfolio_name,
            report_date,
        }
    }
    
    /// Process all daily files in the folder and create/update the aggregated pivot table
    pub fn process_all_daily_files(
        &self,
    ) -> ParserResult<(PivotTable, String)> {
        // Find all existing daily files for this week
        let all_daily_files = self.get_daily_files_for_week("")
            .map_err(|e| ParserError::ProcessingError(e))?;
        
        println!("[DEBUG] Found {} daily files in folder to process", all_daily_files.len());
        for file in &all_daily_files {
            println!("[DEBUG] File to process: {}", file.display());
        }
        
        if all_daily_files.is_empty() {
            return Err(ParserError::ProcessingError("No daily files found in folder".to_string()));
        }
        
        // Process all daily files together to create the updated pivot
        self.create_daily_aggregated_pivot(all_daily_files)
    }
    
    /// Process a single daily file and update the aggregated pivot table (DEPRECATED - use process_all_daily_files)
    pub fn process_single_daily_file(
        &self,
        _daily_file_path: &Path,
    ) -> ParserResult<(PivotTable, String)> {
        // Just process all files in the folder instead
        self.process_all_daily_files()
    }
    
    /// Process multiple daily files into a weekly pivot table
    pub fn create_daily_aggregated_pivot(
        &self,
        daily_file_paths: Vec<PathBuf>,
    ) -> ParserResult<(PivotTable, String)> {
        if daily_file_paths.is_empty() {
            return Err(ParserError::ProcessingError("No daily files provided".to_string()));
        }
        
        // Create parser with all daily files
        let parser = ClearViewDailyParser::new(daily_file_paths);
        let pivot = parser.process()?;
        
        // Save pivot table to file
        let pivot_path = self.save_pivot_table(
            &pivot, 
            PivotTableType::DailyAggregated,
        )?;
        
        Ok((pivot, pivot_path))
    }
    
    /// Process weekly report file into a pivot table
    pub fn create_weekly_report_pivot(
        &self,
        weekly_file_path: &Path,
    ) -> ParserResult<(PivotTable, String)> {
        let parser = ClearViewWeeklyParser::new(weekly_file_path);
        let pivot = parser.process()?;
        
        // Save pivot table to file
        let pivot_path = self.save_pivot_table(
            &pivot,
            PivotTableType::WeeklyReport,
        )?;
        
        Ok((pivot, pivot_path))
    }
    
    /// Update combined pivot table if weekly report exists
    pub fn update_combined_pivot_if_needed(&self) -> ParserResult<Option<(PivotTable, String)>> {
        let base_dir = get_excelerate_dir()
            .map_err(|e| ParserError::ProcessingError(e))?;
        
        // Check if weekly report pivot exists
        let weekly_pivot_path = base_dir
            .join(&self.portfolio_name)
            .join("Funder Pivot Tables")
            .join("Weekly")
            .join("Clear View")
            .join("Weekly")
            .join(format!("{}.csv", self.report_date.replace('/', "-")));
        
        if !weekly_pivot_path.exists() {
            // No weekly report yet, so no combined pivot needed
            return Ok(None);
        }
        
        // Check if daily aggregated pivot exists
        let daily_pivot_path = base_dir
            .join(&self.portfolio_name)
            .join("Funder Pivot Tables")
            .join("Weekly")
            .join("Clear View")
            .join("Daily")
            .join(format!("{}.csv", self.report_date.replace('/', "-")));
        
        if !daily_pivot_path.exists() {
            // No daily pivot yet, so no combined pivot needed
            return Ok(None);
        }
        
        // Load both pivots from CSV files
        let daily_pivot = self.load_pivot_from_csv(&daily_pivot_path)?;
        let weekly_pivot = self.load_pivot_from_csv(&weekly_pivot_path)?;
        
        // Create combined pivot
        self.create_combined_pivot(&daily_pivot, &weekly_pivot).map(Some)
    }
    
    /// Load pivot table from CSV file
    fn load_pivot_from_csv(&self, path: &Path) -> ParserResult<PivotTable> {
        let csv_content = std::fs::read_to_string(path)
            .map_err(|e| ParserError::Io(e))?;
        
        let mut reader = csv::Reader::from_reader(csv_content.as_bytes());
        let mut pivot = PivotTable::new();
        
        for result in reader.records() {
            let record = result.map_err(|e| ParserError::Csv(e))?;
            
            if record.len() >= 5 {
                let advance_id = record.get(0).unwrap_or("").to_string();
                
                // Skip the totals row when loading
                if advance_id == "Totals" {
                    continue;
                }
                
                let merchant_name = record.get(1).unwrap_or("").to_string();
                let gross = record.get(2).unwrap_or("0")
                    .parse::<f64>()
                    .unwrap_or(0.0);
                let fee = record.get(3).unwrap_or("0")
                    .parse::<f64>()
                    .unwrap_or(0.0);
                let net = record.get(4).unwrap_or("0")
                    .parse::<f64>()
                    .unwrap_or(0.0);
                
                pivot.add_row(advance_id, merchant_name, gross, fee, net);
            }
        }
        
        Ok(pivot)
    }
    
    /// Combine daily aggregated and weekly report pivot tables
    pub fn create_combined_pivot(
        &self,
        daily_pivot: &PivotTable,
        weekly_pivot: &PivotTable,
    ) -> ParserResult<(PivotTable, String)> {
        let mut combined_data: HashMap<String, (String, f64, f64, f64)> = HashMap::new();
        
        // Add daily pivot data (excluding totals row)
        for row in &daily_pivot.rows {
            if row.advance_id != "Totals" {
                let entry = combined_data
                    .entry(row.advance_id.clone())
                    .or_insert((row.merchant_name.clone(), 0.0, 0.0, 0.0));
                entry.1 += row.sum_of_syn_gross_amount;
                entry.2 += row.total_servicing_fee;
                entry.3 += row.sum_of_syn_net_amount;
            }
        }
        
        // Add weekly pivot data (excluding totals row)
        for row in &weekly_pivot.rows {
            if row.advance_id != "Totals" {
                let entry = combined_data
                    .entry(row.advance_id.clone())
                    .or_insert((row.merchant_name.clone(), 0.0, 0.0, 0.0));
                entry.1 += row.sum_of_syn_gross_amount;
                entry.2 += row.total_servicing_fee;
                entry.3 += row.sum_of_syn_net_amount;
            }
        }
        
        // Create combined pivot table
        let mut combined_pivot = PivotTable::new();
        for (advance_id, (merchant_name, gross, fee, net)) in combined_data {
            combined_pivot.add_row(advance_id, merchant_name, gross, fee, net);
        }
        
        // Add totals row
        combined_pivot.add_totals_row();
        
        // Save pivot table to file
        let pivot_path = self.save_pivot_table(
            &combined_pivot,
            PivotTableType::Combined,
        )?;
        
        Ok((combined_pivot, pivot_path))
    }
    
    /// Save pivot table to file system
    fn save_pivot_table(
        &self,
        pivot: &PivotTable,
        pivot_type: PivotTableType,
    ) -> ParserResult<String> {
        let base_dir = get_excelerate_dir()
            .map_err(|e| ParserError::ProcessingError(e))?;
        
        // Determine subdirectory and filename based on pivot type
        let (sub_dir, filename) = match pivot_type {
            PivotTableType::DailyAggregated => {
                // Daily aggregated pivots go to Funder Pivot Tables/Weekly/Clear View/Daily/
                let dir = "Daily";
                let name = format!("{}.csv", self.report_date.replace('/', "-"));
                (dir, name)
            },
            PivotTableType::WeeklyReport => {
                // Weekly report pivots go to Funder Pivot Tables/Weekly/Clear View/Weekly/
                let dir = "Weekly";
                let name = format!("{}.csv", self.report_date.replace('/', "-"));
                (dir, name)
            },
            PivotTableType::Combined => {
                // Combined pivots go to Funder Pivot Tables/Weekly/Clear View/Combined/
                let dir = "Combined";
                let name = format!("{}.csv", self.report_date.replace('/', "-"));
                (dir, name)
            },
        };
        
        let pivot_dir = base_dir
            .join(&self.portfolio_name)
            .join("Funder Pivot Tables")
            .join("Weekly")
            .join("Clear View")
            .join(sub_dir);
        
        // Ensure directory exists
        std::fs::create_dir_all(&pivot_dir)
            .map_err(|e| ParserError::Io(e))?;
        
        let file_path = pivot_dir.join(&filename);
        
        // Convert pivot table to CSV and save
        let csv_content = pivot.to_csv_string()?;
        std::fs::write(&file_path, csv_content)
            .map_err(|e| ParserError::Io(e))?;
        
        Ok(file_path.to_string_lossy().to_string())
    }
    
    /// Store pivot table metadata in database
    pub fn store_pivot_metadata(
        &self,
        db: &Database,
        upload_id: &str,
        pivot_path: &str,
        pivot: &PivotTable,
        pivot_type: PivotTableType,
    ) -> Result<(), String> {
        let upload_type = match pivot_type {
            PivotTableType::DailyAggregated => "daily_aggregated",
            PivotTableType::WeeklyReport => "weekly",
            PivotTableType::Combined => "combined",
        };
        
        let pivot_metadata = FunderPivotTable {
            id: Uuid::new_v4().to_string(),
            upload_id: upload_id.to_string(),
            portfolio_name: self.portfolio_name.clone(),
            funder_name: "ClearView".to_string(),
            report_date: self.report_date.clone(),
            upload_type: upload_type.to_string(),
            pivot_file_path: pivot_path.to_string(),
            total_gross: pivot.total_gross,
            total_fee: pivot.total_fee,
            total_net: pivot.total_net,
            row_count: (pivot.rows.len() - 1) as i32, // Exclude totals row
            created_timestamp: chrono::Utc::now(),
        };
        
        db.insert_funder_pivot_table(&pivot_metadata)
            .map_err(|e| format!("Failed to store pivot metadata: {}", e))?;
        
        Ok(())
    }
    
    /// Get week start date for a given date
    pub fn get_week_start(date_str: &str) -> Result<String, String> {
        
        // Try parsing different date formats
        let (year, month, day) = if date_str.contains('-') {
            // Handle YYYY-MM-DD or MM-DD-YYYY format
            let parts: Vec<&str> = date_str.split('-').collect();
            if parts.len() != 3 {
                return Err(format!("Invalid date format: {}", date_str));
            }
            
            // Check if first part is 4 digits (YYYY-MM-DD)
            if parts[0].len() == 4 {
                let year = parts[0].parse::<i32>()
                    .map_err(|_| format!("Invalid year in date: {}", date_str))?;
                let month = parts[1].parse::<u32>()
                    .map_err(|_| format!("Invalid month in date: {}", date_str))?;
                let day = parts[2].parse::<u32>()
                    .map_err(|_| format!("Invalid day in date: {}", date_str))?;
                (year, month, day)
            } else {
                // Assume MM-DD-YYYY
                let month = parts[0].parse::<u32>()
                    .map_err(|_| format!("Invalid month in date: {}", date_str))?;
                let day = parts[1].parse::<u32>()
                    .map_err(|_| format!("Invalid day in date: {}", date_str))?;
                let year = parts[2].parse::<i32>()
                    .map_err(|_| format!("Invalid year in date: {}", date_str))?;
                (year, month, day)
            }
        } else if date_str.contains('/') {
            // Handle MM/DD/YYYY format
            let parts: Vec<&str> = date_str.split('/').collect();
            if parts.len() != 3 {
                return Err(format!("Invalid date format: {}", date_str));
            }
            
            let month = parts[0].parse::<u32>()
                .map_err(|_| format!("Invalid month in date: {}", date_str))?;
            let day = parts[1].parse::<u32>()
                .map_err(|_| format!("Invalid day in date: {}", date_str))?;
            let year = parts[2].parse::<i32>()
                .map_err(|_| format!("Invalid year in date: {}", date_str))?;
            (year, month, day)
        } else {
            return Err(format!("Unrecognized date format: {}", date_str));
        };
        
        let date = NaiveDate::from_ymd_opt(year, month, day)
            .ok_or_else(|| "Invalid date".to_string())?;
        
        // Find the start of the week (Sunday)
        let weekday = date.weekday().num_days_from_sunday();
        let week_start = date - chrono::Duration::days(weekday as i64);
        
        Ok(format!("{:02}/{:02}/{}", 
            week_start.month(), 
            week_start.day(), 
            week_start.year()
        ))
    }
    
    /// Get all daily files for a week
    pub fn get_daily_files_for_week(
        &self,
        _start_date: &str,
    ) -> Result<Vec<PathBuf>, String> {
        let base_dir = get_excelerate_dir()?;
        
        // All daily files for a week are stored in a single folder based on the report date (Friday)
        // Convert report_date to the folder format (MM-DD-YYYY)
        let folder_date = self.report_date.replace('/', "-");
        
        let daily_dir = base_dir
            .join(&self.portfolio_name)
            .join("Funder Uploads")
            .join("Weekly")
            .join("Clear View")
            .join("Daily")
            .join(&folder_date);
        
        println!("[DEBUG] Looking for daily files in: {}", daily_dir.display());
        
        let mut daily_files = Vec::new();
        
        // Check if the directory exists
        if daily_dir.exists() {
            println!("[DEBUG] Directory exists, scanning for CSV files");
            // Read all CSV files in this folder
            for entry in std::fs::read_dir(&daily_dir).map_err(|e| e.to_string())? {
                let entry = entry.map_err(|e| e.to_string())?;
                let path = entry.path();
                
                if path.extension().and_then(|s| s.to_str()) == Some("csv") {
                    println!("[DEBUG] Found CSV file: {}", path.display());
                    daily_files.push(path);
                }
            }
        } else {
            println!("[DEBUG] Directory does not exist: {}", daily_dir.display());
        }
        
        println!("[DEBUG] Total daily files found: {}", daily_files.len());
        Ok(daily_files)
    }
    
}