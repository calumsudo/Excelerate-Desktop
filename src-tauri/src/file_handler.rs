use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use serde::{Serialize, Deserialize};
use chrono::Utc;
use uuid::Uuid;
use crate::database::{Database, FileVersion, FunderUpload, FunderPivotTable};
use crate::parsers::{BaseParser, BhbParser, BigParser};

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
    let alder_weekly_funders = vec!["BHB", "BIG", "Clear View", "eFin", "InAdvance"];
    for funder in &alder_weekly_funders {
        directories.push(base_dir.join("Alder").join("Funder Uploads").join("Weekly").join(funder));
        directories.push(base_dir.join("Alder").join("Funder Pivot Tables").join("Weekly").join(funder));
    }
    
    // Add monthly funder directories for Alder
    directories.push(base_dir.join("Alder").join("Funder Uploads").join("Monthly").join("Monthly Funder Gamma"));
    directories.push(base_dir.join("Alder").join("Funder Pivot Tables").join("Monthly").join("Monthly Funder Gamma"));
    
    // Add weekly funder directories for White Rabbit
    let white_rabbit_weekly_funders = vec!["BHB", "BIG", "Clear View", "eFin"];
    for funder in &white_rabbit_weekly_funders {
        directories.push(base_dir.join("White Rabbit").join("Funder Uploads").join("Weekly").join(funder));
        directories.push(base_dir.join("White Rabbit").join("Funder Pivot Tables").join("Weekly").join(funder));
    }
    
    // Add monthly funder directories for White Rabbit  
    directories.push(base_dir.join("White Rabbit").join("Funder Uploads").join("Monthly").join("Monthly Funder Gamma"));
    directories.push(base_dir.join("White Rabbit").join("Funder Pivot Tables").join("Monthly").join("Monthly Funder Gamma"));
    
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

fn process_funder_file(
    file_path: &Path,
    portfolio_name: &str,
    funder_name: &str,
    report_date: &str,
    upload_type: &str,
    upload_id: &str,
) -> Result<(), String> {
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
    let funder_dir = portfolio_dir
        .join("Funder Uploads")
        .join(if upload_type == "weekly" { "Weekly" } else { "Monthly" })
        .join(funder_name);
    
    // Create funder directory if it doesn't exist
    fs::create_dir_all(&funder_dir)
        .map_err(|e| format!("Failed to create funder directory: {}", e))?;
    
    // Generate filename using report date and original extension
    let file_extension = Path::new(file_name)
        .extension()
        .and_then(|ext| ext.to_str())
        .unwrap_or("csv");
    let stored_filename = format!("{}.{}", report_date, file_extension);
    let file_path = funder_dir.join(&stored_filename);
    
    // Write the file
    fs::write(&file_path, &file_data)
        .map_err(|e| format!("Failed to save funder file: {}", e))?;
    
    let file_size = file_data.len() as i64;
    let upload_id = Uuid::new_v4().to_string();
    
    // Save to database
    let funder_upload = FunderUpload {
        id: upload_id.clone(),
        portfolio_name: portfolio_name.to_string(),
        funder_name: funder_name.to_string(),
        report_date: report_date.to_string(),
        upload_type: upload_type.to_string(),
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
    
    // Try to process the file and create pivot table, but don't block the response
    let pivot_result = process_funder_file(
        &file_path,
        portfolio_name,
        funder_name,
        report_date,
        upload_type,
        &upload_id,
    );
    
    let (success, message) = match pivot_result {
        Ok(_) => {
            (true, format!("Funder file saved and pivot table created successfully for {} - {}", funder_name, report_date))
        },
        Err(e) => {
            // Still return success for file upload even if pivot fails
            (true, format!("Funder file saved. Note: {}", e))
        },
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