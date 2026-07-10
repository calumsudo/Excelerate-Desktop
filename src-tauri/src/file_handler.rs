use crate::database::{
    Database, FileVersion, FunderPivotTable, FunderUpload, Merchant, UnmatchedDeal,
};
use crate::parsers::{
    BaseParser, BhbParser, BigParser, BoomParser, ClearViewMonthlyParser, EfinParser, InAdvParser,
    KingsParser, PortfolioParser,
};
use chrono::Utc;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use uuid::Uuid;

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
    let home_dir = dirs::home_dir().ok_or_else(|| "Could not find home directory".to_string())?;

    let excelerate_dir = home_dir.join("Excelerate");
    Ok(excelerate_dir)
}

pub fn init_database() -> Result<(), String> {
    let base_dir = get_excelerate_dir()?;
    let db_path = base_dir.join("excelerate.db");

    let db =
        Database::new(&db_path).map_err(|e| format!("Failed to initialize database: {}", e))?;

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
        base_dir
            .join("Alder")
            .join("Funder Uploads")
            .join("Monthly"),
        base_dir.join("Alder").join("Funder Pivot Tables"),
        base_dir
            .join("Alder")
            .join("Funder Pivot Tables")
            .join("Monthly"),
        base_dir.join("White Rabbit"),
        base_dir.join("White Rabbit").join("Workbook"),
        base_dir
            .join("White Rabbit")
            .join("Workbook")
            .join("versions"),
        base_dir.join("White Rabbit").join("Funder Uploads"),
        base_dir
            .join("White Rabbit")
            .join("Funder Uploads")
            .join("Monthly"),
        base_dir.join("White Rabbit").join("Funder Pivot Tables"),
        base_dir
            .join("White Rabbit")
            .join("Funder Pivot Tables")
            .join("Monthly"),
    ];

    // Monthly funder directories for both portfolios
    let monthly_funders = vec!["BHB", "BIG", "Clear View", "eFin", "Kings", "Boom", "Payva"];
    for portfolio in &["Alder", "White Rabbit"] {
        for funder in &monthly_funders {
            directories.push(
                base_dir
                    .join(portfolio)
                    .join("Funder Uploads")
                    .join("Monthly")
                    .join(funder),
            );
            directories.push(
                base_dir
                    .join(portfolio)
                    .join("Funder Pivot Tables")
                    .join("Monthly")
                    .join(funder),
            );
        }
        // InAdvance is Alder-only but add for both to keep it simple
        directories.push(
            base_dir
                .join(portfolio)
                .join("Funder Uploads")
                .join("Monthly")
                .join("InAdvance"),
        );
        directories.push(
            base_dir
                .join(portfolio)
                .join("Funder Pivot Tables")
                .join("Monthly")
                .join("InAdvance"),
        );
    }

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
        _ => format!(
            "{}_workbook.xlsx",
            portfolio_name.to_lowercase().replace(" ", "_")
        ),
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
    let version_filename = format!(
        "{}_{}.{}",
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
                println!(
                    "Extracted {} merchants from portfolio workbook",
                    merchant_count
                );
            }
            Err(e) => {
                eprintln!("Failed to extract merchants: {}", e);
                // Don't fail the upload if merchant extraction fails
            }
        }
    }

    Ok(UploadResponse {
        success: true,
        message: "Workbook saved successfully with version tracking".to_string(),
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
        let versions = db
            .get_versions_by_portfolio(portfolio_name)
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
        let versions = db
            .get_versions_by_date(report_date)
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
        let version = db
            .get_version_by_id(version_id)
            .map_err(|e| format!("Failed to get version: {}", e))?
            .ok_or_else(|| "Version not found".to_string())?;

        let version_path = Path::new(&version.file_path);
        if !version_path.exists() {
            return Err("Version file not found".to_string());
        }

        let file_data =
            fs::read(version_path).map_err(|e| format!("Failed to read version file: {}", e))?;

        let portfolio_dir = get_portfolio_dir(&version.portfolio_name)?;
        let main_filename = get_main_workbook_filename(&version.portfolio_name);
        let main_path = portfolio_dir.join("Workbook").join(&main_filename);

        fs::write(&main_path, file_data)
            .map_err(|e| format!("Failed to restore workbook: {}", e))?;

        db.set_active_version(version_id)
            .map_err(|e| format!("Failed to update active version: {}", e))?;

        Ok(UploadResponse {
            success: true,
            message: "Version restored successfully".to_string(),
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
        let version = db
            .get_active_version(portfolio_name)
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
        let version = db
            .get_version_by_portfolio_and_date(portfolio_name, report_date)
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
        let version = db
            .get_version_by_id(version_id)
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

fn process_clearview_monthly_file(
    file_path: &Path,
    portfolio_name: &str,
    report_date: &str,
    upload_id: &str,
    original_filename: &str,
    file_size: i64,
) -> Result<(), String> {
    if DB.lock().unwrap().is_none() {
        init_database()?;
    }

    // Generate pivots for both portfolios from the single uploaded file.
    // Each portfolio is processed independently so a failure in one doesn't
    // discard the other's result.
    let mut errors: Vec<String> = Vec::new();
    for pf in ["Alder", "White Rabbit"] {
        if let Err(e) = process_clearview_portfolio(
            file_path,
            pf,
            portfolio_name,
            report_date,
            upload_id,
            original_filename,
            file_size,
        ) {
            errors.push(format!("{}: {}", pf, e));
        }
    }

    if errors.is_empty() {
        Ok(())
    } else {
        Err(errors.join("; "))
    }
}

fn process_clearview_portfolio(
    file_path: &Path,
    pf: &str,
    uploading_portfolio: &str,
    report_date: &str,
    upload_id: &str,
    original_filename: &str,
    file_size: i64,
) -> Result<(), String> {
    let parser = ClearViewMonthlyParser::new(pf);
    let pivot = parser
        .process(file_path)
        .map_err(|e| format!("Failed to parse ClearView monthly file: {:?}", e))?;

    let csv_content = pivot
        .to_csv_string()
        .map_err(|e| format!("Failed to generate CSV: {}", e))?;

    let portfolio_dir = get_portfolio_dir(pf)?;
    let pivot_dir = portfolio_dir
        .join("Funder Pivot Tables")
        .join("Monthly")
        .join("Clear View");
    fs::create_dir_all(&pivot_dir)
        .map_err(|e| format!("Failed to create pivot directory: {}", e))?;

    let pivot_path = pivot_dir.join(format!("{}.csv", report_date));
    fs::write(&pivot_path, csv_content.as_bytes())
        .map_err(|e| format!("Failed to save pivot table: {}", e))?;

    // For the uploading portfolio, reuse the upload_id of the record just saved.
    // For the other portfolio, reuse its existing upload record for this report
    // if one exists (re-uploads are idempotent) instead of replacing it.
    let effective_upload_id = if pf == uploading_portfolio {
        upload_id.to_string()
    } else {
        let other_funder_dir = portfolio_dir
            .join("Funder Uploads")
            .join("Monthly")
            .join("Clear View");
        fs::create_dir_all(&other_funder_dir)
            .map_err(|e| format!("Failed to create other portfolio funder directory: {}", e))?;

        let file_extension = Path::new(original_filename)
            .extension()
            .and_then(|ext| ext.to_str())
            .unwrap_or("xlsx");
        let stored_filename = format!("{}.{}", report_date, file_extension);
        let other_file_path = other_funder_dir.join(&stored_filename);
        fs::copy(file_path, &other_file_path)
            .map_err(|e| format!("Failed to copy CV file to other portfolio: {}", e))?;

        let db_lock = DB.lock().unwrap();
        let db = db_lock.as_ref().ok_or("Database not initialized")?;

        let other_upload_id = db
            .get_funder_upload(pf, "Clear View", report_date, "monthly")
            .map_err(|e| format!("Failed to look up existing CV upload: {}", e))?
            .map(|u| u.id)
            .unwrap_or_else(|| Uuid::new_v4().to_string());

        let other_upload = FunderUpload {
            id: other_upload_id.clone(),
            portfolio_name: pf.to_string(),
            funder_name: "Clear View".to_string(),
            report_date: report_date.to_string(),
            upload_type: "monthly".to_string(),
            original_filename: original_filename.to_string(),
            stored_filename,
            file_path: other_file_path.to_string_lossy().to_string(),
            file_size,
            upload_timestamp: Utc::now(),
        };
        db.insert_funder_upload(&other_upload)
            .map_err(|e| format!("Failed to save CV upload for other portfolio: {}", e))?;
        other_upload_id
    };

    let pivot_record = FunderPivotTable {
        id: Uuid::new_v4().to_string(),
        upload_id: effective_upload_id,
        portfolio_name: pf.to_string(),
        funder_name: "Clear View".to_string(),
        report_date: report_date.to_string(),
        upload_type: "monthly".to_string(),
        pivot_file_path: pivot_path.to_string_lossy().to_string(),
        total_gross: pivot.total_gross,
        total_fee: pivot.total_fee,
        total_net: pivot.total_net,
        row_count: (pivot.rows.len().saturating_sub(1)) as i32,
        created_timestamp: Utc::now(),
    };

    let db_lock = DB.lock().unwrap();
    if let Some(db) = db_lock.as_ref() {
        // Replace any pivot records left by a previous upload of this report
        db.delete_pivot_tables_for_report(pf, "Clear View", report_date, "monthly")
            .map_err(|e| format!("Failed to clear existing CV pivot records: {}", e))?;
        db.insert_funder_pivot_table(&pivot_record)
            .map_err(|e| format!("Failed to save CV pivot table to database: {}", e))?;
    }

    Ok(())
}

#[allow(clippy::too_many_arguments)]
fn process_funder_file(
    file_path: &Path,
    portfolio_name: &str,
    funder_name: &str,
    report_date: &str,
    upload_type: &str,
    upload_id: &str,
    original_filename: &str,
    file_size: i64,
) -> Result<(), String> {
    // Special handling for Clear View monthly files (auto-splits to both portfolios)
    if funder_name == "Clear View" || funder_name == "ClearView" {
        return process_clearview_monthly_file(
            file_path,
            portfolio_name,
            report_date,
            upload_id,
            original_filename,
            file_size,
        );
    }

    // Payva placeholder - not yet implemented
    if funder_name == "Payva" {
        return Ok(());
    }

    // Select the appropriate parser based on funder name
    let pivot_table = match funder_name {
        "BHB" => {
            let parser = BhbParser::new();
            parser
                .process(file_path)
                .map_err(|e| format!("Failed to parse BHB file: {}", e))?
        }
        "BIG" => {
            let parser = BigParser::with_report_date(report_date);
            parser
                .process(file_path)
                .map_err(|e| format!("Failed to parse BIG file: {}", e))?
        }
        "eFin" => {
            let parser = EfinParser::new();
            parser
                .process(file_path)
                .map_err(|e| format!("Failed to parse eFin file: {}", e))?
        }
        "InAdvance" => {
            let parser = InAdvParser::new();
            parser
                .process(file_path)
                .map_err(|e| format!("Failed to parse InAdvance file: {}", e))?
        }
        "Kings" => {
            let parser = KingsParser::new();
            parser
                .process(file_path)
                .map_err(|e| format!("Failed to parse Kings file: {}", e))?
        }
        "Boom" => {
            let parser = BoomParser::new();
            parser
                .process(file_path)
                .map_err(|e| format!("Failed to parse Boom file: {}", e))?
        }
        _ => {
            return Err(format!(
                "Parser not yet implemented for funder: {}",
                funder_name
            ));
        }
    };

    // Generate pivot table CSV
    let csv_content = pivot_table
        .to_csv_string()
        .map_err(|e| format!("Failed to generate CSV: {}", e))?;

    // Create pivot table directory and save file
    let portfolio_dir = get_portfolio_dir(portfolio_name)?;
    let pivot_dir = portfolio_dir
        .join("Funder Pivot Tables")
        .join("Monthly")
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
            // Replace any pivot records left by a previous upload of this report
            db.delete_pivot_tables_for_report(
                portfolio_name,
                funder_name,
                report_date,
                upload_type,
            )
            .map_err(|e| format!("Failed to clear existing pivot records: {}", e))?;
            db.insert_funder_pivot_table(&pivot_record)
                .map_err(|e| format!("Failed to save pivot table to database: {}", e))?;
        }
    } // db_lock is dropped here

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
    upload_type: &str, // "monthly"
) -> Result<UploadResponse, String> {
    ensure_directories()?;

    if DB.lock().unwrap().is_none() {
        init_database()?;
    }

    let portfolio_dir = get_portfolio_dir(portfolio_name)?;

    // Debug logging commented out to avoid issues with frontend
    // println!("Processing upload - Portfolio: {}, Funder: {}, File: {}, Date: {}, Type: {}",
    //     portfolio_name, funder_name, file_name, report_date, upload_type);

    // Standard funder directory structure - all funders now use Monthly
    let funder_dir = portfolio_dir
        .join("Funder Uploads")
        .join("Monthly")
        .join(funder_name);

    let file_extension = Path::new(file_name)
        .extension()
        .and_then(|ext| ext.to_str())
        .unwrap_or("csv");
    let stored_filename = format!("{}.{}", report_date, file_extension);
    let final_funder_name = funder_name.to_string();

    // Create funder directory if it doesn't exist
    // println!("Creating directory: {:?}", funder_dir);
    fs::create_dir_all(&funder_dir)
        .map_err(|e| format!("Failed to create funder directory: {}", e))?;

    let file_path = funder_dir.join(&stored_filename);
    // println!("Saving file to: {:?}", file_path);

    // Write the file
    fs::write(&file_path, &file_data).map_err(|e| format!("Failed to save funder file: {}", e))?;

    // println!("File saved successfully");

    let file_size = file_data.len() as i64;

    // Reuse the existing upload id for this (portfolio, funder, report_date, upload_type)
    // so re-uploading the same report updates records in place instead of
    // replacing them (INSERT OR REPLACE would delete the old row and orphan
    // its pivot table records).
    let upload_id = {
        let db_lock = DB.lock().unwrap();
        let db = db_lock.as_ref().ok_or("Database not initialized")?;
        db.get_funder_upload(portfolio_name, &final_funder_name, report_date, upload_type)
            .map_err(|e| format!("Failed to look up existing upload: {}", e))?
            .map(|u| u.id)
            .unwrap_or_else(|| Uuid::new_v4().to_string())
    };

    // Save to database with normalized funder name
    let funder_upload = FunderUpload {
        id: upload_id.clone(),
        portfolio_name: portfolio_name.to_string(),
        funder_name: final_funder_name.clone(),
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
    } // db_lock is dropped here

    let pivot_result = process_funder_file(
        &file_path,
        portfolio_name,
        &final_funder_name,
        report_date,
        upload_type,
        &upload_id,
        file_name,
        file_size,
    );

    let (success, message) = match pivot_result {
        Ok(_) => (
            true,
            format!(
                "Funder file saved and pivot table created successfully for {} - {}",
                final_funder_name, report_date
            ),
        ),
        Err(e) => (true, format!("Funder file saved. Note: {}", e)),
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
        let upload = db
            .get_funder_upload(portfolio_name, funder_name, report_date, upload_type)
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
        let uploads = db
            .get_funder_uploads_by_portfolio_and_date(portfolio_name, report_date)
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
        let upload = db
            .get_funder_upload(portfolio_name, funder_name, report_date, upload_type)
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
        let uploads = db
            .get_all_funder_uploads()
            .map_err(|e| format!("Failed to get funder uploads: {}", e))?;

        let upload = uploads
            .iter()
            .find(|u| u.id == upload_id)
            .ok_or_else(|| "Upload not found".to_string())?;

        // Get the associated pivot table to delete its file too
        let pivot = db
            .get_pivot_table_by_upload_id(upload_id)
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
    pub upload_type: Option<String>, // "monthly"
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
        let versions = db
            .get_all_versions()
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
        let funder_uploads = db
            .get_all_funder_uploads()
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
        let pivot_tables = db
            .get_all_pivot_tables()
            .map_err(|e| format!("Failed to get pivot tables: {}", e))?;

        for pivot in pivot_tables {
            let file_name = pivot
                .pivot_file_path
                .split('/')
                .next_back()
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

    let file = fs::File::open(path).map_err(|e| format!("Failed to open file: {}", e))?;

    let mut reader = ReaderBuilder::new().has_headers(true).from_reader(file);

    // Get headers
    let headers = reader
        .headers()
        .map_err(|e| format!("Failed to read CSV headers: {}", e))?
        .iter()
        .map(|s| s.to_string())
        .collect::<Vec<String>>();

    // Get rows
    let mut rows = Vec::new();
    for result in reader.records() {
        let record = result.map_err(|e| format!("Failed to read CSV record: {}", e))?;
        let row: Vec<String> = record.iter().map(|s| s.to_string()).collect();

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
    use calamine::{open_workbook, Reader, Xlsx};

    let path = Path::new(file_path);
    if !path.exists() {
        return Err("File not found".to_string());
    }

    let mut workbook: Xlsx<_> =
        open_workbook(path).map_err(|e| format!("Failed to open Excel file: {}", e))?;

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
                        calamine::Data::Float(f) => serde_json::Value::Number(
                            serde_json::Number::from_f64(*f).unwrap_or(serde_json::Number::from(0)),
                        ),
                        calamine::Data::DateTime(dt) => {
                            // Convert Excel datetime to string
                            serde_json::Value::String(dt.to_string())
                        }
                        calamine::Data::Int(i) => {
                            serde_json::Value::Number(serde_json::Number::from(*i))
                        }
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

#[tauri::command]
pub fn get_merchants_by_portfolio(portfolio_name: &str) -> Result<Vec<MerchantInfo>, String> {
    if DB.lock().unwrap().is_none() {
        init_database()?;
    }

    let db_lock = DB.lock().unwrap();
    let db = db_lock.as_ref().ok_or("Database not initialized")?;

    let merchants = db
        .get_merchants_by_portfolio(portfolio_name)
        .map_err(|e| format!("Failed to get merchants: {}", e))?;

    Ok(merchants.into_iter().map(MerchantInfo::from).collect())
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

#[derive(Serialize, Deserialize)]
pub struct PivotTableData {
    pub advance_id: String,
    pub merchant_name: String,
    pub gross_amount: f64,
    pub management_fee: f64,
    pub net_amount: f64,
}

#[derive(Serialize, Deserialize)]
pub struct FunderPivotData {
    pub funder_name: String,
    pub sheet_name: String,
    pub pivot_data: Vec<PivotTableData>,
    pub file_path: String,
}

#[tauri::command]
pub fn get_pivot_tables_for_update(
    portfolio_name: &str,
    report_date: &str,
) -> Result<Vec<FunderPivotData>, String> {
    let base_dir = get_excelerate_dir()?;

    // Convert date format for file naming (MM/DD/YYYY -> MM-DD-YYYY)
    let file_date = report_date.replace('/', "-");

    // List of funders to check with their sheet names
    let funders = vec![
        ("BHB", "BHB", "Monthly"),
        ("BIG", "BIG", "Monthly"),
        ("Clear View", "CV", "Monthly"), // Special case - will use Combined subdirectory
        ("eFin", "EFin", "Monthly"),
        ("InAdvance", "InAd", "Monthly"),
        ("Boom", "Boom", "Monthly"),
        ("Kings", "Kings", "Monthly"),
    ];

    let mut all_pivot_data = Vec::new();

    for (folder_name, sheet_name, funder_type) in funders {
        let pivot_path = base_dir
            .join(portfolio_name)
            .join("Funder Pivot Tables")
            .join(funder_type)
            .join(folder_name)
            .join(format!("{}.csv", file_date));

        // Check if the pivot table file exists
        if pivot_path.exists() {
            println!("Loading pivot table from: {}", pivot_path.display());

            // Read the CSV file
            let csv_content = fs::read_to_string(&pivot_path)
                .map_err(|e| format!("Failed to read CSV file: {}", e))?;

            let mut reader = csv::Reader::from_reader(csv_content.as_bytes());
            let mut pivot_data = Vec::new();

            for result in reader.records() {
                let record = result.map_err(|e| format!("Failed to parse CSV: {}", e))?;

                if record.len() >= 5 {
                    let advance_id = record.get(0).unwrap_or("").to_string();

                    // Skip the totals row
                    if advance_id == "Totals" {
                        continue;
                    }

                    let merchant_name = record.get(1).unwrap_or("").to_string();
                    let gross_amount = record.get(2).unwrap_or("0").parse::<f64>().unwrap_or(0.0);
                    let management_fee = record.get(3).unwrap_or("0").parse::<f64>().unwrap_or(0.0);
                    let net_amount = record.get(4).unwrap_or("0").parse::<f64>().unwrap_or(0.0);

                    pivot_data.push(PivotTableData {
                        advance_id,
                        merchant_name,
                        gross_amount,
                        management_fee,
                        net_amount,
                    });
                }
            }

            if !pivot_data.is_empty() {
                all_pivot_data.push(FunderPivotData {
                    funder_name: folder_name.to_string(),
                    sheet_name: sheet_name.to_string(),
                    pivot_data,
                    file_path: pivot_path.to_string_lossy().to_string(),
                });
            }
        }
    }

    Ok(all_pivot_data)
}

#[tauri::command]
pub fn get_active_workbook_path(portfolio_name: &str) -> Result<String, String> {
    let base_dir = get_excelerate_dir()?;
    let workbook_dir = base_dir.join(portfolio_name).join("Workbook");

    // Initialize DB if needed
    if DB.lock().unwrap().is_none() {
        init_database()?;
    }

    let db_lock = DB.lock().unwrap();
    let db = db_lock.as_ref().ok_or("Database not initialized")?;

    let active_version = db
        .get_active_version(portfolio_name)
        .map_err(|e| format!("Failed to get active version: {}", e))?;

    if let Some(version) = active_version {
        Ok(version.file_path)
    } else {
        // If no active version, look for the original workbook
        let original_path = workbook_dir.join(format!("{} Portfolio.xlsx", portfolio_name));
        if !original_path.exists() {
            return Err(format!(
                "No portfolio workbook found for {}",
                portfolio_name
            ));
        }
        Ok(original_path.to_string_lossy().to_string())
    }
}

#[tauri::command]
pub fn find_unmatched_deals() -> Result<Vec<UnmatchedDeal>, String> {
    if DB.lock().unwrap().is_none() {
        init_database()?;
    }

    let db_lock = DB.lock().unwrap();
    let db = db_lock.as_ref().ok_or("Database not initialized")?;

    db.find_unmatched_deals()
        .map_err(|e| format!("Failed to find unmatched deals: {}", e))
}

#[tauri::command]
pub fn find_unmatched_deals_by_portfolio(
    portfolio_name: String,
) -> Result<Vec<UnmatchedDeal>, String> {
    if DB.lock().unwrap().is_none() {
        init_database()?;
    }

    let db_lock = DB.lock().unwrap();
    let db = db_lock.as_ref().ok_or("Database not initialized")?;

    db.find_unmatched_deals_by_portfolio(&portfolio_name)
        .map_err(|e| format!("Failed to find unmatched deals for portfolio: {}", e))
}

#[tauri::command]
pub fn find_unmatched_deals_by_date(report_date: String) -> Result<Vec<UnmatchedDeal>, String> {
    if DB.lock().unwrap().is_none() {
        init_database()?;
    }

    let db_lock = DB.lock().unwrap();
    let db = db_lock.as_ref().ok_or("Database not initialized")?;

    db.find_unmatched_deals_by_date(&report_date)
        .map_err(|e| format!("Failed to find unmatched deals for date: {}", e))
}
