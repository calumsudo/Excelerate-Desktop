use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use serde::{Serialize, Deserialize};
use chrono::Utc;
use uuid::Uuid;
use crate::database::{Database, FileVersion, FunderUpload};

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
        base_dir.join("White Rabbit"),
        base_dir.join("White Rabbit").join("Workbook"),
        base_dir.join("White Rabbit").join("Workbook").join("versions"),
        base_dir.join("White Rabbit").join("Funder Uploads"),
        base_dir.join("White Rabbit").join("Funder Uploads").join("Weekly"),
        base_dir.join("White Rabbit").join("Funder Uploads").join("Monthly"),
    ];
    
    // Add weekly funder directories for Alder
    let alder_weekly_funders = vec!["BHB", "BIG", "Clear View", "eFin", "InAdvance"];
    for funder in &alder_weekly_funders {
        directories.push(base_dir.join("Alder").join("Funder Uploads").join("Weekly").join(funder));
    }
    
    // Add monthly funder directories for Alder
    directories.push(base_dir.join("Alder").join("Funder Uploads").join("Monthly").join("Monthly Funder Gamma"));
    
    // Add weekly funder directories for White Rabbit
    let white_rabbit_weekly_funders = vec!["BHB", "BIG", "Clear View", "eFin"];
    for funder in &white_rabbit_weekly_funders {
        directories.push(base_dir.join("White Rabbit").join("Funder Uploads").join("Weekly").join(funder));
    }
    
    // Add monthly funder directories for White Rabbit  
    directories.push(base_dir.join("White Rabbit").join("Funder Uploads").join("Monthly").join("Monthly Funder Gamma"));
    
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
    
    let db_lock = DB.lock().unwrap();
    if let Some(db) = db_lock.as_ref() {
        db.insert_funder_upload(&funder_upload)
            .map_err(|e| format!("Failed to save funder upload to database: {}", e))?;
    }
    
    Ok(UploadResponse {
        success: true,
        message: format!("Funder file saved successfully for {} - {}", funder_name, report_date),
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