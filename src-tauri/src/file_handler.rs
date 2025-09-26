use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use serde::{Serialize, Deserialize};
use chrono::Utc;
use uuid::Uuid;
use crate::database::{Database, FileVersion, FunderUpload, FunderPivotTable, Merchant};
use crate::parsers::{BaseParser, BhbParser, BigParser, BoomParser, EfinParser, InAdvParser, KingsParser, ClearViewPivotProcessor, PortfolioParser};

lazy_static::lazy_static! {
    static ref DB: Mutex<Option<Database>> = Mutex::new(None);
}

#[derive(Debug, Serialize, Deserialize)]
pub struct UploadResponse {
    pub success: bool,
    pub message: String,
    pub file_path: Option<String>,
    pub version_id: Option<String>,
    pub backup_path: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct VersionInfo {
    pub id: String,
    pub report_date: String,
    pub original_filename: String,
    pub upload_timestamp: String,
    pub file_size: i64,
    pub is_active: bool,
}

impl From<FileVersion> for VersionInfo {
    fn from(version: FileVersion) -> Self {
        VersionInfo {
            id: version.id,
            report_date: version.report_date,
            original_filename: version.original_filename,
            upload_timestamp: version.upload_timestamp.to_rfc3339(),
            file_size: version.file_size,
            is_active: version.is_active,
        }
    }
}

pub fn get_excelerate_dir() -> Result<PathBuf, String> {
    let home_dir = dirs::home_dir()
        .ok_or_else(|| "Could not find home directory".to_string())?;
    
    let excelerate_dir = home_dir.join("Excelerate");
    Ok(excelerate_dir)
}

pub fn init_database() -> Result<(), String> {
    let base_dir = get_excelerate_dir()?;
    let db_path = base_dir.join("excelerate.db");
    
    let db = Database::new(&db_path)
        .map_err(|e| format!("Failed to initialize database: {}", e))?;
    
    let mut db_lock = DB.lock().unwrap();
    *db_lock = Some(db);
    
    Ok(())
}

pub fn ensure_directories() -> Result<(), String> {
    let base_dir = get_excelerate_dir()?;
    
    let mut directories = vec![
        base_dir.clone(),
        base_dir.join("Alder"),
        base_dir.join("Alder").join("Workbook"),
        base_dir.join("Alder").join("Workbook").join("versions"),
        base_dir.join("Alder").join("Funder Uploads"),
        base_dir.join("Alder").join("Funder Uploads").join("Weekly"),
        base_dir.join("Alder").join("Funder Uploads").join("Monthly"),
        base_dir.join("Alder").join("Funder Pivot Tables"),
        base_dir.join("Alder").join("Funder Pivot Tables").join("Weekly"),
        base_dir.join("Alder").join("Funder Pivot Tables").join("Monthly"),
        base_dir.join("White Rabbit"),
        base_dir.join("White Rabbit").join("Workbook"),
        base_dir.join("White Rabbit").join("Workbook").join("versions"),
        base_dir.join("White Rabbit").join("Funder Uploads"),
        base_dir.join("White Rabbit").join("Funder Uploads").join("Weekly"),
        base_dir.join("White Rabbit").join("Funder Uploads").join("Monthly"),
        base_dir.join("White Rabbit").join("Funder Pivot Tables"),
        base_dir.join("White Rabbit").join("Funder Pivot Tables").join("Weekly"),
        base_dir.join("White Rabbit").join("Funder Pivot Tables").join("Monthly"),
    ];
    
    // Add weekly funder directories for Alder
    let alder_weekly_funders = vec!["BHB", "BIG", "eFin", "InAdvance"];
    for funder in &alder_weekly_funders {
        directories.push(base_dir.join("Alder").join("Funder Uploads").join("Weekly").join(funder));
        directories.push(base_dir.join("Alder").join("Funder Pivot Tables").join("Weekly").join(funder));
    }
    
    // Add special Clear View directory structure for Alder
    directories.push(base_dir.join("Alder").join("Funder Uploads").join("Weekly").join("Clear View"));
    directories.push(base_dir.join("Alder").join("Funder Uploads").join("Weekly").join("Clear View").join("Daily"));
    directories.push(base_dir.join("Alder").join("Funder Uploads").join("Weekly").join("Clear View").join("Weekly"));
    directories.push(base_dir.join("Alder").join("Funder Pivot Tables").join("Weekly").join("Clear View"));
    directories.push(base_dir.join("Alder").join("Funder Pivot Tables").join("Weekly").join("Clear View").join("Daily"));
    directories.push(base_dir.join("Alder").join("Funder Pivot Tables").join("Weekly").join("Clear View").join("Weekly"));
    directories.push(base_dir.join("Alder").join("Funder Pivot Tables").join("Weekly").join("Clear View").join("Combined"));
    
    // Add monthly funder directories for Alder
    directories.push(base_dir.join("Alder").join("Funder Uploads").join("Monthly").join("Kings"));
    directories.push(base_dir.join("Alder").join("Funder Pivot Tables").join("Monthly").join("Kings"));
    directories.push(base_dir.join("Alder").join("Funder Uploads").join("Monthly").join("Boom"));
    directories.push(base_dir.join("Alder").join("Funder Pivot Tables").join("Monthly").join("Boom"));
    
    // Add weekly funder directories for White Rabbit
    let white_rabbit_weekly_funders = vec!["BHB", "BIG", "eFin"];
    for funder in &white_rabbit_weekly_funders {
        directories.push(base_dir.join("White Rabbit").join("Funder Uploads").join("Weekly").join(funder));
        directories.push(base_dir.join("White Rabbit").join("Funder Pivot Tables").join("Weekly").join(funder));
    }
    
    // Add special Clear View directory structure for White Rabbit
    directories.push(base_dir.join("White Rabbit").join("Funder Uploads").join("Weekly").join("Clear View"));
    directories.push(base_dir.join("White Rabbit").join("Funder Uploads").join("Weekly").join("Clear View").join("Daily"));
    directories.push(base_dir.join("White Rabbit").join("Funder Uploads").join("Weekly").join("Clear View").join("Weekly"));
    directories.push(base_dir.join("White Rabbit").join("Funder Pivot Tables").join("Weekly").join("Clear View"));
    directories.push(base_dir.join("White Rabbit").join("Funder Pivot Tables").join("Weekly").join("Clear View").join("Daily"));
    directories.push(base_dir.join("White Rabbit").join("Funder Pivot Tables").join("Weekly").join("Clear View").join("Weekly"));
    directories.push(base_dir.join("White Rabbit").join("Funder Pivot Tables").join("Weekly").join("Clear View").join("Combined"));
    
    // Add monthly funder directories for White Rabbit  
    directories.push(base_dir.join("White Rabbit").join("Funder Uploads").join("Monthly").join("Kings"));
    directories.push(base_dir.join("White Rabbit").join("Funder Pivot Tables").join("Monthly").join("Kings"));
    directories.push(base_dir.join("White Rabbit").join("Funder Uploads").join("Monthly").join("Boom"));
    directories.push(base_dir.join("White Rabbit").join("Funder Pivot Tables").join("Monthly").join("Boom"));
    
    for dir in directories {
        fs::create_dir_all(&dir)
            .map_err(|e| format!("Failed to create directory {:?}: {}", dir, e))?;
    }
    
    Ok(())
}

fn get_portfolio_dir(portfolio_name: &str) -> Result<PathBuf, String> {
    let base_dir = get_excelerate_dir()?;
    
    match portfolio_name.to_lowercase().replace(" ", "_").as_str() {
        "alder" => Ok(base_dir.join("Alder")),
        "white_rabbit" | "whiterabbit" => Ok(base_dir.join("White Rabbit")),
        _ => Err(format!("Unknown portfolio: {}", portfolio_name)),
    }
}

fn get_main_workbook_filename(portfolio_name: &str) -> String {
    match portfolio_name.to_lowercase().replace(" ", "_").as_str() {
        "alder" => "alder_portfolio_workbook.xlsx".to_string(),
        "white_rabbit" | "whiterabbit" => "white_rabbit_portfolio_workbook.xlsx".to_string(),
        _ => format!("{}_workbook.xlsx", portfolio_name.to_lowercase().replace(" ", "_")),
    }
}

#[tauri::command]
pub fn save_portfolio_workbook_with_version(
    portfolio_name: &str,
    file_data: Vec<u8>,
    file_name: &str,
    report_date: &str,
) -> Result<UploadResponse, String> {
    ensure_directories()?;
    
    if DB.lock().unwrap().is_none() {
        init_database()?;
    }
    
    let portfolio_dir = get_portfolio_dir(portfolio_name)?;
    let workbook_dir = portfolio_dir.join("Workbook");
    let versions_dir = workbook_dir.join("versions");
    
    let version_id = Uuid::new_v4().to_string();
    let file_extension = Path::new(file_name)
        .extension()
        .and_then(|ext| ext.to_str())
        .unwrap_or("xlsx");
    let version_filename = format!("{}_{}.{}", 
        report_date.replace("-", ""), 
        version_id, 
        file_extension
    );
    let version_path = versions_dir.join(&version_filename);
    
    fs::write(&version_path, &file_data)
        .map_err(|e| format!("Failed to save version file: {}", e))?;
    
    let main_filename = get_main_workbook_filename(portfolio_name);
    let main_path = workbook_dir.join(&main_filename);
    
    fs::write(&main_path, &file_data)
        .map_err(|e| format!("Failed to save main workbook: {}", e))?;
    
    let file_size = file_data.len() as i64;
    
    let version = FileVersion {
        id: version_id.clone(),
        portfolio_name: portfolio_name.to_string(),
        report_date: report_date.to_string(),
        original_filename: file_name.to_string(),
        version_filename: version_filename.clone(),
        file_path: version_path.to_string_lossy().to_string(),
        file_size,
        upload_timestamp: Utc::now(),
        is_active: true,
    };
    
    let db_lock = DB.lock().unwrap();
    if let Some(db) = db_lock.as_ref() {
        db.insert_file_version(&version)
            .map_err(|e| format!("Failed to save version to database: {}", e))?;
        
        // Extract merchants from the workbook
        let parser = PortfolioParser::new(portfolio_name.to_string());
        match parser.parse_portfolio_workbook(&main_path, db) {
            Ok(merchant_count) => {
                println!("Extracted {} merchants from portfolio workbook", merchant_count);
            }
            Err(e) => {
                eprintln!("Failed to extract merchants: {}", e);
                // Don't fail the upload if merchant extraction fails
            }
        }
    }
    
    Ok(UploadResponse {
        success: true,
        message: format!("Workbook saved successfully with version tracking"),
        file_path: Some(main_path.to_string_lossy().to_string()),
        version_id: Some(version_id),
        backup_path: Some(version_path.to_string_lossy().to_string()),
    })
}

#[tauri::command]
pub fn get_portfolio_versions(portfolio_name: &str) -> Result<Vec<VersionInfo>, String> {
    if DB.lock().unwrap().is_none() {
        init_database()?;
    }
    
    let db_lock = DB.lock().unwrap();
    if let Some(db) = db_lock.as_ref() {
        let versions = db.get_versions_by_portfolio(portfolio_name)
            .map_err(|e| format!("Failed to get versions: {}", e))?;
        
        Ok(versions.into_iter().map(VersionInfo::from).collect())
    } else {
        Err("Database not initialized".to_string())
    }
}

#[tauri::command]
pub fn get_versions_by_date(report_date: &str) -> Result<Vec<VersionInfo>, String> {
    if DB.lock().unwrap().is_none() {
        init_database()?;
    }
    
    let db_lock = DB.lock().unwrap();
    if let Some(db) = db_lock.as_ref() {
        let versions = db.get_versions_by_date(report_date)
            .map_err(|e| format!("Failed to get versions: {}", e))?;
        
        Ok(versions.into_iter().map(VersionInfo::from).collect())
    } else {
        Err("Database not initialized".to_string())
    }
}

#[tauri::command]
pub fn restore_version(version_id: &str) -> Result<UploadResponse, String> {
    if DB.lock().unwrap().is_none() {
        init_database()?;
    }
    
    let db_lock = DB.lock().unwrap();
    if let Some(db) = db_lock.as_ref() {
        let version = db.get_version_by_id(version_id)
            .map_err(|e| format!("Failed to get version: {}", e))?
            .ok_or_else(|| "Version not found".to_string())?;
        
        let version_path = Path::new(&version.file_path);
        if !version_path.exists() {
            return Err("Version file not found".to_string());
        }
        
        let file_data = fs::read(version_path)
            .map_err(|e| format!("Failed to read version file: {}", e))?;
        
        let portfolio_dir = get_portfolio_dir(&version.portfolio_name)?;
        let main_filename = get_main_workbook_filename(&version.portfolio_name);
        let main_path = portfolio_dir.join("Workbook").join(&main_filename);
        
        fs::write(&main_path, file_data)
            .map_err(|e| format!("Failed to restore workbook: {}", e))?;
        
        db.set_active_version(version_id)
            .map_err(|e| format!("Failed to update active version: {}", e))?;
        
        Ok(UploadResponse {
            success: true,
            message: format!("Version restored successfully"),
            file_path: Some(main_path.to_string_lossy().to_string()),
            version_id: Some(version_id.to_string()),
            backup_path: Some(version_path.to_string_lossy().to_string()),
        })
    } else {
        Err("Database not initialized".to_string())
    }
}

#[tauri::command]
pub fn get_active_version(portfolio_name: &str) -> Result<Option<VersionInfo>, String> {
    if DB.lock().unwrap().is_none() {
        init_database()?;
    }
    
    let db_lock = DB.lock().unwrap();
    if let Some(db) = db_lock.as_ref() {
        let version = db.get_active_version(portfolio_name)
            .map_err(|e| format!("Failed to get active version: {}", e))?;
        
        Ok(version.map(VersionInfo::from))
    } else {
        Err("Database not initialized".to_string())
    }
}

#[tauri::command]
pub fn check_version_exists(portfolio_name: &str, report_date: &str) -> Result<bool, String> {
    if DB.lock().unwrap().is_none() {
        init_database()?;
    }
    
    let db_lock = DB.lock().unwrap();
    if let Some(db) = db_lock.as_ref() {
        let version = db.get_version_by_portfolio_and_date(portfolio_name, report_date)
            .map_err(|e| format!("Failed to check version: {}", e))?;
        
        Ok(version.is_some())
    } else {
        Err("Database not initialized".to_string())
    }
}

#[tauri::command]
pub fn delete_version(version_id: &str) -> Result<bool, String> {
    if DB.lock().unwrap().is_none() {
        init_database()?;
    }
    
    let db_lock = DB.lock().unwrap();
    if let Some(db) = db_lock.as_ref() {
        let version = db.get_version_by_id(version_id)
            .map_err(|e| format!("Failed to get version: {}", e))?
            .ok_or_else(|| "Version not found".to_string())?;
        
        let version_path = Path::new(&version.file_path);
        if version_path.exists() {
            fs::remove_file(version_path)
                .map_err(|e| format!("Failed to delete version file: {}", e))?;
        }
        
        db.delete_version(version_id)
            .map_err(|e| format!("Failed to delete version from database: {}", e))
    } else {
        Err("Database not initialized".to_string())
    }
}

#[tauri::command]
pub fn get_portfolio_workbook_path(portfolio_name: &str) -> Result<String, String> {
    let portfolio_dir = get_portfolio_dir(portfolio_name)?;
    let main_filename = get_main_workbook_filename(portfolio_name);
    let file_path = portfolio_dir.join("Workbook").join(&main_filename);
    
    if file_path.exists() {
        Ok(file_path.to_string_lossy().to_string())
    } else {
        Err("Workbook file not found".to_string())
    }
}

#[tauri::command]
pub fn check_workbook_exists(portfolio_name: &str) -> bool {
    if let Ok(path) = get_portfolio_workbook_path(portfolio_name) {
        Path::new(&path).exists()
    } else {
        false
    }
}

fn extract_date_from_filename(filename: &str) -> Option<String> {
    // Try to find date pattern like "2025-09-02" in filename
    let re = regex::Regex::new(r"(\d{4})-(\d{2})-(\d{2})").ok()?;
    if let Some(captures) = re.captures(filename) {
        Some(format!("{}-{}-{}", 
            captures.get(1)?.as_str(),
            captures.get(2)?.as_str(),
            captures.get(3)?.as_str()
        ))
    } else {
        None
    }
}

fn process_clearview_file(
    file_path: &Path,
    portfolio_name: &str,
    report_date: &str,
    upload_id: &str,
) -> Result<(), String> {
    // Reduced logging to avoid blocking frontend
    
    let processor = ClearViewPivotProcessor::new(
        portfolio_name.to_string(),
        report_date.to_string(),
    );
    
    // Determine if this is a daily or weekly file based on path structure
    let path_str = file_path.to_string_lossy();
    let is_daily = path_str.contains("/Daily/") || path_str.contains("\\Daily\\");
    
    if DB.lock().unwrap().is_none() {
        init_database()?;
    }
    
    let db_lock = DB.lock().unwrap();
    let db = db_lock.as_ref().ok_or("Database not initialized")?;
    
    if is_daily {
        // Process daily file and update aggregated pivot
        let (pivot, pivot_path) = processor.process_single_daily_file(file_path)
            .map_err(|e| format!("Failed to process daily Clear View file: {:?}", e))?;
        
        // Store daily aggregated pivot metadata
        processor.store_pivot_metadata(
            db,
            upload_id,
            &pivot_path,
            &pivot,
            crate::parsers::clearview_pivot_processor::PivotTableType::DailyAggregated,
        ).map_err(|e| format!("Failed to store daily pivot metadata: {}", e))?;
        
        // Check if we need to update the combined pivot
        if let Some((combined_pivot, combined_path)) = processor.update_combined_pivot_if_needed()
            .map_err(|e| format!("Failed to update combined pivot: {:?}", e))? {
            
            // Store combined pivot metadata
            let combined_id = uuid::Uuid::new_v4().to_string();
            processor.store_pivot_metadata(
                db,
                &combined_id,
                &combined_path,
                &combined_pivot,
                crate::parsers::clearview_pivot_processor::PivotTableType::Combined,
            ).map_err(|e| format!("Failed to store combined pivot metadata: {}", e))?;
        }
    } else {
        // Process weekly file
        let (pivot, pivot_path) = processor.create_weekly_report_pivot(file_path)
            .map_err(|e| format!("Failed to process weekly Clear View file: {:?}", e))?;
        
        // Store weekly pivot metadata
        processor.store_pivot_metadata(
            db,
            upload_id,
            &pivot_path,
            &pivot,
            crate::parsers::clearview_pivot_processor::PivotTableType::WeeklyReport,
        ).map_err(|e| format!("Failed to store weekly pivot metadata: {}", e))?;
        
        // Check if we need to update the combined pivot
        if let Some((combined_pivot, combined_path)) = processor.update_combined_pivot_if_needed()
            .map_err(|e| format!("Failed to update combined pivot: {:?}", e))? {
            
            // Store combined pivot metadata  
            let combined_id = uuid::Uuid::new_v4().to_string();
            processor.store_pivot_metadata(
                db,
                &combined_id,
                &combined_path,
                &combined_pivot,
                crate::parsers::clearview_pivot_processor::PivotTableType::Combined,
            ).map_err(|e| format!("Failed to store combined pivot metadata: {}", e))?;
        }
    }
    
    Ok(())
}

fn process_funder_file(
    file_path: &Path,
    portfolio_name: &str,
    funder_name: &str,
    report_date: &str,
    upload_type: &str,
    upload_id: &str,
) -> Result<(), String> {
    // Special handling for Clear View files
    if funder_name == "Clear View" || funder_name == "ClearView" {
        return process_clearview_file(
            file_path,
            portfolio_name,
            report_date,
            upload_id,
        );
    }
    
    // Select the appropriate parser based on funder name
    let pivot_table = match funder_name {
        "BHB" => {
            let parser = BhbParser::new();
            parser.process(file_path)
                .map_err(|e| format!("Failed to parse BHB file: {}", e))?
        },
        "BIG" => {
            let parser = BigParser::new();
            parser.process(file_path)
                .map_err(|e| format!("Failed to parse BIG file: {}", e))?
        },
        "eFin" => {
            let parser = EfinParser::new();
            parser.process(file_path)
                .map_err(|e| format!("Failed to parse eFin file: {}", e))?
        },
        "InAdvance" => {
            let parser = InAdvParser::new();
            parser.process(file_path)
                .map_err(|e| format!("Failed to parse InAdvance file: {}", e))?
        },
        "Kings" => {
            let parser = KingsParser::new();
            parser.process(file_path)
                .map_err(|e| format!("Failed to parse Kings file: {}", e))?
        },
        "Boom" => {
            let parser = BoomParser::new();
            parser.process(file_path)
                .map_err(|e| format!("Failed to parse Boom file: {}", e))?
        },
        _ => {
            return Err(format!("Parser not yet implemented for funder: {}", funder_name));
        }
    };
    
    // Generate pivot table CSV
    let csv_content = pivot_table.to_csv_string()
        .map_err(|e| format!("Failed to generate CSV: {}", e))?;
    
    // Create pivot table directory and save file
    let portfolio_dir = get_portfolio_dir(portfolio_name)?;
    let pivot_dir = portfolio_dir
        .join("Funder Pivot Tables")
        .join(if upload_type == "weekly" { "Weekly" } else { "Monthly" })
        .join(funder_name);
    
    fs::create_dir_all(&pivot_dir)
        .map_err(|e| format!("Failed to create pivot directory: {}", e))?;
    
    let pivot_filename = format!("{}.csv", report_date);
    let pivot_path = pivot_dir.join(&pivot_filename);
    
    fs::write(&pivot_path, csv_content.as_bytes())
        .map_err(|e| format!("Failed to save pivot table: {}", e))?;
    
    // Save pivot table metadata to database
    let pivot_id = Uuid::new_v4().to_string();
    let pivot_record = FunderPivotTable {
        id: pivot_id,
        upload_id: upload_id.to_string(),
        portfolio_name: portfolio_name.to_string(),
        funder_name: funder_name.to_string(),
        report_date: report_date.to_string(),
        upload_type: upload_type.to_string(),
        pivot_file_path: pivot_path.to_string_lossy().to_string(),
        total_gross: pivot_table.total_gross,
        total_fee: pivot_table.total_fee,
        total_net: pivot_table.total_net,
        row_count: (pivot_table.rows.len() - 1) as i32, // Subtract 1 for totals row
        created_timestamp: Utc::now(),
    };
    
    // Save to database and immediately release the lock
    {
        let db_lock = DB.lock().unwrap();
        if let Some(db) = db_lock.as_ref() {
            db.insert_funder_pivot_table(&pivot_record)
                .map_err(|e| format!("Failed to save pivot table to database: {}", e))?;
        }
    }  // db_lock is dropped here
    
    Ok(())
}

#[derive(Debug, Serialize, Deserialize)]
pub struct FunderUploadInfo {
    pub id: String,
    pub funder_name: String,
    pub report_date: String,
    pub upload_type: String,
    pub original_filename: String,
    pub upload_timestamp: String,
    pub file_size: i64,
}

impl From<FunderUpload> for FunderUploadInfo {
    fn from(upload: FunderUpload) -> Self {
        FunderUploadInfo {
            id: upload.id,
            funder_name: upload.funder_name,
            report_date: upload.report_date,
            upload_type: upload.upload_type,
            original_filename: upload.original_filename,
            upload_timestamp: upload.upload_timestamp.to_rfc3339(),
            file_size: upload.file_size,
        }
    }
}

#[tauri::command]
pub fn save_funder_upload(
    portfolio_name: &str,
    funder_name: &str,
    file_data: Vec<u8>,
    file_name: &str,
    report_date: &str,
    upload_type: &str, // "weekly" or "monthly"
) -> Result<UploadResponse, String> {
    ensure_directories()?;
    
    if DB.lock().unwrap().is_none() {
        init_database()?;
    }
    
    let portfolio_dir = get_portfolio_dir(portfolio_name)?;
    
    // Debug logging commented out to avoid issues with frontend
    // println!("Processing upload - Portfolio: {}, Funder: {}, File: {}, Date: {}, Type: {}", 
    //     portfolio_name, funder_name, file_name, report_date, upload_type);
    
    // Check if this is a Clear View file (handle various naming patterns from frontend)
    let is_clearview = funder_name == "Clear View" 
        || funder_name == "ClearView" 
        || funder_name.starts_with("ClearView_Daily")
        || funder_name.starts_with("Clear View Daily");
    
    // Normalize the funder name for Clear View (removed - using final_funder_name in tuple instead)
    
    // Special handling for Clear View files
    let (funder_dir, stored_filename, final_funder_name) = if is_clearview {
        // Determine if this is a daily or weekly Clear View file
        // Check multiple indicators
        let is_daily = upload_type == "daily" 
            || funder_name.contains("Daily")
            || file_name.to_lowercase().contains("syndicate_report");
        
        // println!("Clear View file detected - Is Daily: {}", is_daily);
        
        if is_daily {
            // All daily files for a week go into a single folder based on the report date (Friday)
            let folder_date = report_date.replace('/', "-");
            
            let daily_dir = portfolio_dir
                .join("Funder Uploads")
                .join("Weekly")  // Daily files still go under Weekly folder structure
                .join("Clear View")
                .join("Daily")
                .join(&folder_date);
            
            // Keep original filename for daily files
            (daily_dir, file_name.to_string(), "Clear View".to_string())
        } else {
            // Weekly files go to Weekly/Clear View/Weekly/
            let weekly_dir = portfolio_dir
                .join("Funder Uploads")
                .join("Weekly")
                .join("Clear View")
                .join("Weekly");
            
            // Use report date as filename for weekly files (convert to consistent format)
            let file_date = report_date.replace('/', "-");
            let file_extension = Path::new(file_name)
                .extension()
                .and_then(|ext| ext.to_str())
                .unwrap_or("csv");
            (weekly_dir, format!("{}.{}", file_date, file_extension), "Clear View".to_string())
        }
    } else {
        // Standard funder directory structure for non-Clear View funders
        let funder_dir = portfolio_dir
            .join("Funder Uploads")
            .join(if upload_type == "weekly" { "Weekly" } else { "Monthly" })
            .join(funder_name);
        
        // Generate filename using report date and original extension
        let file_extension = Path::new(file_name)
            .extension()
            .and_then(|ext| ext.to_str())
            .unwrap_or("csv");
        (funder_dir, format!("{}.{}", report_date, file_extension), funder_name.to_string())
    };
    
    // Create funder directory if it doesn't exist
    // println!("Creating directory: {:?}", funder_dir);
    fs::create_dir_all(&funder_dir)
        .map_err(|e| format!("Failed to create funder directory: {}", e))?;
    
    let file_path = funder_dir.join(&stored_filename);
    // println!("Saving file to: {:?}", file_path);
    
    // Write the file
    fs::write(&file_path, &file_data)
        .map_err(|e| format!("Failed to save funder file: {}", e))?;
    
    // println!("File saved successfully");
    
    let file_size = file_data.len() as i64;
    let upload_id = Uuid::new_v4().to_string();
    
    // Save to database with normalized funder name
    let funder_upload = FunderUpload {
        id: upload_id.clone(),
        portfolio_name: portfolio_name.to_string(),
        funder_name: final_funder_name.clone(),
        report_date: report_date.to_string(),
        upload_type: upload_type.to_string(), // Keep the original upload_type (daily remains daily)
        original_filename: file_name.to_string(),
        stored_filename: stored_filename.clone(),
        file_path: file_path.to_string_lossy().to_string(),
        file_size,
        upload_timestamp: Utc::now(),
    };
    
    // Insert funder upload to database and immediately release the lock
    {
        let db_lock = DB.lock().unwrap();
        if let Some(db) = db_lock.as_ref() {
            db.insert_funder_upload(&funder_upload)
                .map_err(|e| format!("Failed to save funder upload to database: {}", e))?;
        }
    }  // db_lock is dropped here
    
    // For Clear View daily files, skip immediate processing to allow multiple files to be uploaded first
    // The frontend should call process_clearview_daily_pivot after all files are uploaded
    let pivot_result = if is_clearview && upload_type == "daily" {
        Ok(()) // Skip processing for Clear View daily files
    } else {
        // Process other funders normally
        process_funder_file(
            &file_path,
            portfolio_name,
            &final_funder_name,
            report_date,
            upload_type,
            &upload_id,
        )
    };
    
    let (success, message) = if is_clearview && upload_type == "daily" {
        // Special message for Clear View daily files
        (true, format!("Clear View daily file saved successfully. Call process_clearview_daily_pivot to generate pivot table after all files are uploaded."))
    } else {
        match pivot_result {
            Ok(_) => {
                (true, format!("Funder file saved and pivot table created successfully for {} - {}", final_funder_name, report_date))
            },
            Err(e) => {
                // Still return success for file upload even if pivot fails
                (true, format!("Funder file saved. Note: {}", e))
            },
        }
    };
    
    Ok(UploadResponse {
        success,
        message,
        file_path: Some(file_path.to_string_lossy().to_string()),
        version_id: Some(upload_id),
        backup_path: None,
    })
}

#[tauri::command]
pub fn get_funder_upload_info(
    portfolio_name: &str,
    funder_name: &str,
    report_date: &str,
    upload_type: &str,
) -> Result<Option<FunderUploadInfo>, String> {
    if DB.lock().unwrap().is_none() {
        init_database()?;
    }
    
    let db_lock = DB.lock().unwrap();
    if let Some(db) = db_lock.as_ref() {
        let upload = db.get_funder_upload(portfolio_name, funder_name, report_date, upload_type)
            .map_err(|e| format!("Failed to get funder upload: {}", e))?;
        
        Ok(upload.map(FunderUploadInfo::from))
    } else {
        Err("Database not initialized".to_string())
    }
}

#[tauri::command]
pub fn get_funder_uploads_for_date(
    portfolio_name: &str,
    report_date: &str,
) -> Result<Vec<FunderUploadInfo>, String> {
    if DB.lock().unwrap().is_none() {
        init_database()?;
    }
    
    let db_lock = DB.lock().unwrap();
    if let Some(db) = db_lock.as_ref() {
        let uploads = db.get_funder_uploads_by_portfolio_and_date(portfolio_name, report_date)
            .map_err(|e| format!("Failed to get funder uploads: {}", e))?;
        
        Ok(uploads.into_iter().map(FunderUploadInfo::from).collect())
    } else {
        Err("Database not initialized".to_string())
    }
}

#[tauri::command]
pub fn check_funder_upload_exists(
    portfolio_name: &str,
    funder_name: &str,
    report_date: &str,
    upload_type: &str,
) -> Result<bool, String> {
    if DB.lock().unwrap().is_none() {
        init_database()?;
    }
    
    let db_lock = DB.lock().unwrap();
    if let Some(db) = db_lock.as_ref() {
        let upload = db.get_funder_upload(portfolio_name, funder_name, report_date, upload_type)
            .map_err(|e| format!("Failed to check funder upload: {}", e))?;
        
        Ok(upload.is_some())
    } else {
        Err("Database not initialized".to_string())
    }
}

#[tauri::command]
pub fn delete_funder_upload(upload_id: &str) -> Result<bool, String> {
    if DB.lock().unwrap().is_none() {
        init_database()?;
    }
    
    let db_lock = DB.lock().unwrap();
    if let Some(db) = db_lock.as_ref() {
        // First, get the upload details to find the file paths
        let uploads = db.get_all_funder_uploads()
            .map_err(|e| format!("Failed to get funder uploads: {}", e))?;
        
        let upload = uploads.iter().find(|u| u.id == upload_id)
            .ok_or_else(|| "Upload not found".to_string())?;
        
        // Get the associated pivot table to delete its file too
        let pivot = db.get_pivot_table_by_upload_id(upload_id)
            .map_err(|e| format!("Failed to get pivot table: {}", e))?;
        
        // Delete the upload file from filesystem
        let upload_path = Path::new(&upload.file_path);
        if upload_path.exists() {
            fs::remove_file(upload_path)
                .map_err(|e| format!("Failed to delete upload file: {}", e))?;
        }
        
        // Delete the pivot table file from filesystem if it exists
        if let Some(pivot_table) = pivot {
            let pivot_path = Path::new(&pivot_table.pivot_file_path);
            if pivot_path.exists() {
                fs::remove_file(pivot_path)
                    .map_err(|e| format!("Failed to delete pivot table file: {}", e))?;
            }
            
            // Delete the pivot table from database
            db.delete_pivot_table_by_upload_id(upload_id)
                .map_err(|e| format!("Failed to delete pivot table from database: {}", e))?;
        }
        
        // Delete the upload from database
        db.delete_funder_upload(upload_id)
            .map_err(|e| format!("Failed to delete upload from database: {}", e))
    } else {
        Err("Database not initialized".to_string())
    }
}

#[derive(Debug, Serialize, Deserialize)]
pub struct DatabaseFileEntry {
    pub id: String,
    pub file_type: String, // "portfolio_workbook", "funder_upload", "pivot_table"
    pub portfolio_name: String,
    pub funder_name: Option<String>,
    pub report_date: String,
    pub upload_type: Option<String>, // "weekly" or "monthly"
    pub file_name: String,
    pub file_path: String,
    pub file_size: i64,
    pub upload_timestamp: String,
    pub is_active: Option<bool>,
    pub total_gross: Option<f64>,
    pub total_fee: Option<f64>,
    pub total_net: Option<f64>,
    pub row_count: Option<i32>,
}

#[tauri::command]
pub fn get_all_database_files() -> Result<Vec<DatabaseFileEntry>, String> {
    if DB.lock().unwrap().is_none() {
        init_database()?;
    }
    
    let mut all_files = Vec::new();
    
    let db_lock = DB.lock().unwrap();
    if let Some(db) = db_lock.as_ref() {
        // Get all portfolio workbook versions
        let versions = db.get_all_versions()
            .map_err(|e| format!("Failed to get versions: {}", e))?;
        
        for version in versions {
            all_files.push(DatabaseFileEntry {
                id: version.id.clone(),
                file_type: "portfolio_workbook".to_string(),
                portfolio_name: version.portfolio_name,
                funder_name: None,
                report_date: version.report_date,
                upload_type: None,
                file_name: version.original_filename,
                file_path: version.file_path,
                file_size: version.file_size,
                upload_timestamp: version.upload_timestamp.to_rfc3339(),
                is_active: Some(version.is_active),
                total_gross: None,
                total_fee: None,
                total_net: None,
                row_count: None,
            });
        }
        
        // Get all funder uploads
        let funder_uploads = db.get_all_funder_uploads()
            .map_err(|e| format!("Failed to get funder uploads: {}", e))?;
        
        for upload in funder_uploads {
            all_files.push(DatabaseFileEntry {
                id: upload.id.clone(),
                file_type: "funder_upload".to_string(),
                portfolio_name: upload.portfolio_name,
                funder_name: Some(upload.funder_name),
                report_date: upload.report_date,
                upload_type: Some(upload.upload_type),
                file_name: upload.original_filename,
                file_path: upload.file_path,
                file_size: upload.file_size,
                upload_timestamp: upload.upload_timestamp.to_rfc3339(),
                is_active: None,
                total_gross: None,
                total_fee: None,
                total_net: None,
                row_count: None,
            });
        }
        
        // Get all pivot tables
        let pivot_tables = db.get_all_pivot_tables()
            .map_err(|e| format!("Failed to get pivot tables: {}", e))?;
        
        for pivot in pivot_tables {
            let file_name = pivot.pivot_file_path.split('/').last()
                .unwrap_or("pivot_table.csv")
                .to_string();
            
            all_files.push(DatabaseFileEntry {
                id: pivot.id.clone(),
                file_type: "pivot_table".to_string(),
                portfolio_name: pivot.portfolio_name,
                funder_name: Some(pivot.funder_name),
                report_date: pivot.report_date,
                upload_type: Some(pivot.upload_type),
                file_name,
                file_path: pivot.pivot_file_path,
                file_size: 0, // We don't store file size for pivot tables, could calculate if needed
                upload_timestamp: pivot.created_timestamp.to_rfc3339(),
                is_active: None,
                total_gross: Some(pivot.total_gross),
                total_fee: Some(pivot.total_fee),
                total_net: Some(pivot.total_net),
                row_count: Some(pivot.row_count),
            });
        }
        
        Ok(all_files)
    } else {
        Err("Database not initialized".to_string())
    }
}

#[tauri::command]
pub fn read_csv_file(file_path: &str) -> Result<(Vec<String>, Vec<Vec<String>>), String> {
    use csv::ReaderBuilder;
    
    let path = Path::new(file_path);
    if !path.exists() {
        return Err("File not found".to_string());
    }
    
    let file = fs::File::open(path)
        .map_err(|e| format!("Failed to open file: {}", e))?;
    
    let mut reader = ReaderBuilder::new()
        .has_headers(true)
        .from_reader(file);
    
    // Get headers
    let headers = reader.headers()
        .map_err(|e| format!("Failed to read CSV headers: {}", e))?
        .iter()
        .map(|s| s.to_string())
        .collect::<Vec<String>>();
    
    // Get rows
    let mut rows = Vec::new();
    for result in reader.records() {
        let record = result
            .map_err(|e| format!("Failed to read CSV record: {}", e))?;
        let row: Vec<String> = record.iter()
            .map(|s| s.to_string())
            .collect();
        
        // Ensure the row has the same number of columns as headers
        // Pad with empty strings if necessary
        let mut padded_row = row.clone();
        while padded_row.len() < headers.len() {
            padded_row.push(String::new());
        }
        // Truncate if too many columns
        padded_row.truncate(headers.len());
        
        rows.push(padded_row);
    }
    
    Ok((headers, rows))
}

#[tauri::command]
pub fn read_excel_file(file_path: &str) -> Result<serde_json::Value, String> {
    use calamine::{Reader, open_workbook, Xlsx};
    
    let path = Path::new(file_path);
    if !path.exists() {
        return Err("File not found".to_string());
    }
    
    let mut workbook: Xlsx<_> = open_workbook(path)
        .map_err(|e| format!("Failed to open Excel file: {}", e))?;
    
    let mut sheets_data = Vec::new();
    
    for sheet_name in workbook.sheet_names() {
        if let Ok(range) = workbook.worksheet_range(&sheet_name) {
            let mut sheet_rows = Vec::new();
            
            for row in range.rows() {
                let mut row_data = Vec::new();
                for cell in row {
                    let value = match cell {
                        calamine::Data::Empty => serde_json::Value::Null,
                        calamine::Data::String(s) => serde_json::Value::String(s.clone()),
                        calamine::Data::Float(f) => {
                            serde_json::Value::Number(serde_json::Number::from_f64(*f).unwrap_or(serde_json::Number::from(0)))
                        },
                        calamine::Data::DateTime(dt) => {
                            // Convert Excel datetime to string
                            serde_json::Value::String(dt.to_string())
                        },
                        calamine::Data::Int(i) => serde_json::Value::Number(serde_json::Number::from(*i)),
                        calamine::Data::Bool(b) => serde_json::Value::Bool(*b),
                        calamine::Data::Error(_) => serde_json::Value::String("ERROR".to_string()),
                        calamine::Data::DateTimeIso(s) => serde_json::Value::String(s.clone()),
                        calamine::Data::DurationIso(s) => serde_json::Value::String(s.clone()),
                    };
                    row_data.push(serde_json::json!({ "value": value }));
                }
                sheet_rows.push(row_data);
            }
            
            sheets_data.push(serde_json::json!({
                "name": sheet_name,
                "data": sheet_rows
            }));
        }
    }
    
    Ok(serde_json::json!({
        "sheets": sheets_data,
        "activeSheet": 0
    }))
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ClearViewPivotResponse {
    pub success: bool,
    pub message: String,
    pub daily_pivot_path: Option<String>,
    pub weekly_pivot_path: Option<String>,
    pub combined_pivot_path: Option<String>,
    pub daily_total_gross: Option<f64>,
    pub daily_total_net: Option<f64>,
    pub weekly_total_gross: Option<f64>,
    pub weekly_total_net: Option<f64>,
    pub combined_total_gross: Option<f64>,
    pub combined_total_net: Option<f64>,
}

#[tauri::command]
pub fn process_clearview_pivots(
    portfolio_name: &str,
    report_date: &str,
    daily_file_paths: Vec<String>,
    weekly_file_path: Option<String>,
) -> Result<ClearViewPivotResponse, String> {
    if DB.lock().unwrap().is_none() {
        init_database()?;
    }
    
    let processor = ClearViewPivotProcessor::new(
        portfolio_name.to_string(),
        report_date.to_string(),
    );
    
    let mut response = ClearViewPivotResponse {
        success: false,
        message: String::new(),
        daily_pivot_path: None,
        weekly_pivot_path: None,
        combined_pivot_path: None,
        daily_total_gross: None,
        daily_total_net: None,
        weekly_total_gross: None,
        weekly_total_net: None,
        combined_total_gross: None,
        combined_total_net: None,
    };
    
    let db_lock = DB.lock().unwrap();
    let db = db_lock.as_ref().ok_or("Database not initialized")?;
    
    // Process daily files if provided
    let daily_pivot = if !daily_file_paths.is_empty() {
        let paths: Vec<PathBuf> = daily_file_paths.iter()
            .map(|p| PathBuf::from(p))
            .collect();
        
        match processor.create_daily_aggregated_pivot(paths) {
            Ok((pivot, path)) => {
                // Store pivot metadata in database
                let upload_id = Uuid::new_v4().to_string();
                processor.store_pivot_metadata(
                    db,
                    &upload_id,
                    &path,
                    &pivot,
                    crate::parsers::clearview_pivot_processor::PivotTableType::DailyAggregated,
                ).map_err(|e| format!("Failed to store daily pivot metadata: {}", e))?;
                
                response.daily_pivot_path = Some(path);
                response.daily_total_gross = Some(pivot.total_gross);
                response.daily_total_net = Some(pivot.total_net);
                Some(pivot)
            },
            Err(e) => {
                response.message = format!("Failed to create daily pivot: {:?}", e);
                None
            }
        }
    } else {
        None
    };
    
    // Process weekly file if provided
    let weekly_pivot = if let Some(weekly_path) = weekly_file_path {
        match processor.create_weekly_report_pivot(Path::new(&weekly_path)) {
            Ok((pivot, path)) => {
                // Store pivot metadata in database
                let upload_id = Uuid::new_v4().to_string();
                processor.store_pivot_metadata(
                    db,
                    &upload_id,
                    &path,
                    &pivot,
                    crate::parsers::clearview_pivot_processor::PivotTableType::WeeklyReport,
                ).map_err(|e| format!("Failed to store weekly pivot metadata: {}", e))?;
                
                response.weekly_pivot_path = Some(path);
                response.weekly_total_gross = Some(pivot.total_gross);
                response.weekly_total_net = Some(pivot.total_net);
                Some(pivot)
            },
            Err(e) => {
                response.message = format!("Failed to create weekly pivot: {:?}", e);
                None
            }
        }
    } else {
        None
    };
    
    // Create combined pivot if we have both daily and weekly
    if let (Some(daily), Some(weekly)) = (daily_pivot.as_ref(), weekly_pivot.as_ref()) {
        match processor.create_combined_pivot(daily, weekly) {
            Ok((pivot, path)) => {
                // Store pivot metadata in database
                let upload_id = Uuid::new_v4().to_string();
                processor.store_pivot_metadata(
                    db,
                    &upload_id,
                    &path,
                    &pivot,
                    crate::parsers::clearview_pivot_processor::PivotTableType::Combined,
                ).map_err(|e| format!("Failed to store combined pivot metadata: {}", e))?;
                
                response.combined_pivot_path = Some(path);
                response.combined_total_gross = Some(pivot.total_gross);
                response.combined_total_net = Some(pivot.total_net);
            },
            Err(e) => {
                response.message = format!("Failed to create combined pivot: {:?}", e);
            }
        }
    }
    
    response.success = true;
    if response.message.is_empty() {
        response.message = "Pivot tables created successfully".to_string();
    }
    
    Ok(response)
}

#[tauri::command]
pub fn process_clearview_daily_pivot(
    portfolio_name: &str,
    report_date: &str,
) -> Result<UploadResponse, String> {
    use crate::parsers::clearview_pivot_processor::ClearViewPivotProcessor;
    
    if DB.lock().unwrap().is_none() {
        init_database()?;
    }
    
    let processor = ClearViewPivotProcessor::new(
        portfolio_name.to_string(),
        report_date.to_string(),
    );
    
    // Process all daily files in the folder
    let (pivot, pivot_path) = processor.process_all_daily_files()
        .map_err(|e| format!("Failed to process Clear View daily files: {:?}", e))?;
    
    // Store pivot metadata
    let db_lock = DB.lock().unwrap();
    if let Some(db) = db_lock.as_ref() {
        let upload_id = uuid::Uuid::new_v4().to_string();
        processor.store_pivot_metadata(
            db,
            &upload_id,
            &pivot_path,
            &pivot,
            crate::parsers::clearview_pivot_processor::PivotTableType::DailyAggregated,
        ).map_err(|e| format!("Failed to store pivot metadata: {}", e))?;
        
        // Check if we need to update the combined pivot
        if let Ok(Some((combined_pivot, combined_path))) = processor.update_combined_pivot_if_needed() {
            processor.store_pivot_metadata(
                db,
                &upload_id,
                &combined_path,
                &combined_pivot,
                crate::parsers::clearview_pivot_processor::PivotTableType::Combined,
            ).map_err(|e| format!("Failed to store combined pivot metadata: {}", e))?;
        }
    }
    
    Ok(UploadResponse {
        success: true,
        message: format!("Clear View daily pivot table created successfully. Total gross: ${:.2}, Total net: ${:.2}", 
                        pivot.total_gross, pivot.total_net),
        file_path: Some(pivot_path),
        version_id: None,
        backup_path: None,
    })
}

#[tauri::command]
pub fn delete_clearview_file(
    upload_id: &str,
    portfolio_name: &str,
    report_date: &str,
    is_daily: bool,
) -> Result<UploadResponse, String> {
    if DB.lock().unwrap().is_none() {
        init_database()?;
    }
    
    // First delete the file using the standard deletion
    delete_funder_upload(upload_id)?;
    
    if is_daily {
        // After deleting a daily file, regenerate the daily aggregated pivot
        // if there are remaining daily files
        let processor = ClearViewPivotProcessor::new(
            portfolio_name.to_string(),
            report_date.to_string(),
        );
        
        let remaining_files = processor.get_daily_files_for_week("")
            .map_err(|e| format!("Failed to get remaining daily files: {}", e))?;
        
        if !remaining_files.is_empty() {
            // Regenerate the daily aggregated pivot
            let (pivot, pivot_path) = processor.process_all_daily_files()
                .map_err(|e| format!("Failed to regenerate daily pivot: {:?}", e))?;
            
            // Store updated pivot metadata
            let db_lock = DB.lock().unwrap();
            if let Some(db) = db_lock.as_ref() {
                let new_upload_id = uuid::Uuid::new_v4().to_string();
                processor.store_pivot_metadata(
                    db,
                    &new_upload_id,
                    &pivot_path,
                    &pivot,
                    crate::parsers::clearview_pivot_processor::PivotTableType::DailyAggregated,
                ).map_err(|e| format!("Failed to store pivot metadata: {}", e))?;
                
                // Check if we need to update the combined pivot
                if let Ok(Some((combined_pivot, combined_path))) = processor.update_combined_pivot_if_needed() {
                    processor.store_pivot_metadata(
                        db,
                        &new_upload_id,
                        &combined_path,
                        &combined_pivot,
                        crate::parsers::clearview_pivot_processor::PivotTableType::Combined,
                    ).map_err(|e| format!("Failed to store combined pivot metadata: {}", e))?;
                }
            }
            
            return Ok(UploadResponse {
                success: true,
                message: "Clear View daily file deleted and pivots updated".to_string(),
                file_path: Some(pivot_path),
                version_id: None,
                backup_path: None,
            });
        } else {
            // No remaining daily files, delete the daily pivot and combined pivot
            let base_dir = get_excelerate_dir()?;
            let daily_pivot_path = base_dir
                .join(portfolio_name)
                .join("Funder Pivot Tables")
                .join("Weekly")
                .join("Clear View")
                .join("Daily")
                .join(format!("{}.csv", report_date.replace('/', "-")));
            
            if daily_pivot_path.exists() {
                fs::remove_file(&daily_pivot_path).ok();
            }
            
            let combined_pivot_path = base_dir
                .join(portfolio_name)
                .join("Funder Pivot Tables")
                .join("Weekly")
                .join("Clear View")
                .join("Combined")
                .join(format!("{}.csv", report_date.replace('/', "-")));
            
            if combined_pivot_path.exists() {
                fs::remove_file(&combined_pivot_path).ok();
            }
        }
    } else {
        // Weekly file deleted, also delete the combined pivot
        let base_dir = get_excelerate_dir()?;
        let combined_pivot_path = base_dir
            .join(portfolio_name)
            .join("Funder Pivot Tables")
            .join("Weekly")
            .join("Clear View")
            .join("Combined")
            .join(format!("{}.csv", report_date.replace('/', "-")));
        
        if combined_pivot_path.exists() {
            fs::remove_file(&combined_pivot_path).ok();
        }
    }
    
    Ok(UploadResponse {
        success: true,
        message: "Clear View file deleted successfully".to_string(),
        file_path: None,
        version_id: None,
        backup_path: None,
    })
}

#[tauri::command]
pub fn get_clearview_daily_files_for_week(
    portfolio_name: &str,
    report_date: &str,
) -> Result<Vec<String>, String> {
    let processor = ClearViewPivotProcessor::new(
        portfolio_name.to_string(),
        report_date.to_string(),
    );
    
    // Get the week start date
    let week_start = ClearViewPivotProcessor::get_week_start(report_date)?;
    
    // Get all daily files for the week
    let files = processor.get_daily_files_for_week(&week_start)?;
    
    Ok(files.iter()
        .map(|p| p.to_string_lossy().to_string())
        .collect())
}

#[tauri::command]
pub fn extract_merchants_from_portfolio(portfolio_name: &str) -> Result<ExtractMerchantsResponse, String> {
    if DB.lock().unwrap().is_none() {
        init_database()?;
    }
    
    let portfolio_path = get_portfolio_workbook_path(portfolio_name)?;
    let file_path = Path::new(&portfolio_path);
    
    if !file_path.exists() {
        return Err(format!("Portfolio workbook not found: {}", portfolio_path));
    }
    
    let db_lock = DB.lock().unwrap();
    let db = db_lock.as_ref().ok_or("Database not initialized")?;
    
    // Create parser and extract merchants
    let parser = PortfolioParser::new(portfolio_name.to_string());
    let merchant_count = parser.parse_portfolio_workbook(file_path, db)
        .map_err(|e| format!("Failed to extract merchants: {}", e))?;
    
    Ok(ExtractMerchantsResponse {
        success: true,
        message: format!("Successfully extracted {} merchants from portfolio", merchant_count),
        merchant_count,
    })
}

#[tauri::command]
pub fn get_merchants_by_portfolio(portfolio_name: &str) -> Result<Vec<MerchantInfo>, String> {
    if DB.lock().unwrap().is_none() {
        init_database()?;
    }
    
    let db_lock = DB.lock().unwrap();
    let db = db_lock.as_ref().ok_or("Database not initialized")?;
    
    let merchants = db.get_merchants_by_portfolio(portfolio_name)
        .map_err(|e| format!("Failed to get merchants: {}", e))?;
    
    Ok(merchants.into_iter().map(MerchantInfo::from).collect())
}

#[tauri::command]
pub fn get_merchants_by_funder(portfolio_name: &str, funder_name: &str) -> Result<Vec<MerchantInfo>, String> {
    if DB.lock().unwrap().is_none() {
        init_database()?;
    }
    
    let db_lock = DB.lock().unwrap();
    let db = db_lock.as_ref().ok_or("Database not initialized")?;
    
    let merchants = db.get_merchants_by_funder(portfolio_name, funder_name)
        .map_err(|e| format!("Failed to get merchants: {}", e))?;
    
    Ok(merchants.into_iter().map(MerchantInfo::from).collect())
}

#[tauri::command]
pub fn clear_merchants_for_portfolio(portfolio_name: &str) -> Result<usize, String> {
    if DB.lock().unwrap().is_none() {
        init_database()?;
    }
    
    let db_lock = DB.lock().unwrap();
    let db = db_lock.as_ref().ok_or("Database not initialized")?;
    
    db.delete_merchants_by_portfolio(portfolio_name)
        .map_err(|e| format!("Failed to delete merchants: {}", e))
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ExtractMerchantsResponse {
    pub success: bool,
    pub message: String,
    pub merchant_count: usize,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct MerchantInfo {
    pub id: String,
    pub portfolio_name: String,
    pub funder_name: String,
    pub date_funded: Option<String>,
    pub merchant_name: String,
    pub website: Option<String>,
    pub advance_id: Option<String>,
    pub funder_advance_id: Option<String>,
    pub industry_naics_or_sic: Option<String>,
    pub state: Option<String>,
    pub fico: Option<String>,
    pub buy_rate: Option<f64>,
    pub commission: Option<f64>,
    pub total_amount_funded: Option<f64>,
    pub created_timestamp: String,
    pub updated_timestamp: String,
}

impl From<Merchant> for MerchantInfo {
    fn from(merchant: Merchant) -> Self {
        MerchantInfo {
            id: merchant.id,
            portfolio_name: merchant.portfolio_name,
            funder_name: merchant.funder_name,
            date_funded: merchant.date_funded,
            merchant_name: merchant.merchant_name,
            website: merchant.website,
            advance_id: merchant.advance_id,
            funder_advance_id: merchant.funder_advance_id,
            industry_naics_or_sic: merchant.industry_naics_or_sic,
            state: merchant.state,
            fico: merchant.fico,
            buy_rate: merchant.buy_rate,
            commission: merchant.commission,
            total_amount_funded: merchant.total_amount_funded,
            created_timestamp: merchant.created_timestamp.to_rfc3339(),
            updated_timestamp: merchant.updated_timestamp.to_rfc3339(),
        }
    }
}