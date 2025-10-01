use std::fs;
use std::path::Path;
use serde::{Serialize, Deserialize};
use tauri::{AppHandle, Emitter};
use crate::file_handler::{
    save_funder_upload as original_save_funder_upload,
    save_portfolio_workbook_with_version as original_save_portfolio_workbook,
    UploadResponse
};
use crate::parsers::{BaseParser, BhbParser, BigParser, BoomParser, EfinParser, InAdvParser, KingsParser};
use crate::notification::{NotificationManager, ValidationResult};

#[derive(Debug, Serialize, Deserialize)]
pub struct ValidatedUploadResponse {
    pub success: bool,
    pub message: String,
    pub file_path: Option<String>,
    pub version_id: Option<String>,
    pub backup_path: Option<String>,
    pub validation_errors: Vec<String>,
    pub validation_warnings: Vec<String>,
}

impl From<UploadResponse> for ValidatedUploadResponse {
    fn from(response: UploadResponse) -> Self {
        ValidatedUploadResponse {
            success: response.success,
            message: response.message,
            file_path: response.file_path,
            version_id: response.version_id,
            backup_path: response.backup_path,
            validation_errors: Vec::new(),
            validation_warnings: Vec::new(),
        }
    }
}

/// Validate and save a funder upload with notifications
#[tauri::command]
pub async fn save_funder_upload_validated(
    app_handle: AppHandle,
    portfolio_name: String,
    funder_name: String,
    file_data: Vec<u8>,
    file_name: String,
    report_date: String,
    upload_type: String,
) -> Result<ValidatedUploadResponse, String> {
    // First, save the file to a temporary location for validation
    let temp_dir = std::env::temp_dir();
    let temp_path = temp_dir.join(&file_name);
    
    fs::write(&temp_path, &file_data)
        .map_err(|e| format!("Failed to write temporary file: {}", e))?;
    
    // Validate based on funder type (skip Clear View for now as it has special handling)
    let validation_result = if funder_name == "Clear View" || funder_name == "ClearView" {
        ValidationResult::valid()
    } else {
        validate_funder_file(&funder_name, &temp_path)?
    };
    
    // Clean up temp file
    let _ = fs::remove_file(&temp_path);
    
    // Check if validation passed
    if !validation_result.is_valid {
        // Send error notification
        let notification = validation_result.to_notification(&file_name);
        let _ = NotificationManager::send(&app_handle, notification);
        
        // Return error response
        return Ok(ValidatedUploadResponse {
            success: false,
            message: format!("File validation failed for {}", file_name),
            file_path: None,
            version_id: None,
            backup_path: None,
            validation_errors: validation_result.errors.iter()
                .map(|e| format!("{}: Expected '{}', found '{}'", e.field, e.expected, e.found))
                .collect(),
            validation_warnings: validation_result.warnings,
        });
    }
    
    // If validation passed but has warnings, send warning notification
    if !validation_result.warnings.is_empty() {
        let notification = validation_result.to_notification(&file_name);
        let _ = NotificationManager::send(&app_handle, notification);
    }
    
    // Proceed with the original save function
    match original_save_funder_upload(
        &portfolio_name,
        &funder_name,
        file_data,
        &file_name,
        &report_date,
        &upload_type,
    ) {
        Ok(response) => {
            // Send success notification
            if response.success {
                let _ = NotificationManager::success(
                    &app_handle,
                    format!("File uploaded: {}", file_name),
                    Some(format!("{} - {}", funder_name, report_date)),
                );
            }
            
            let mut validated_response = ValidatedUploadResponse::from(response);
            validated_response.validation_warnings = validation_result.warnings;
            Ok(validated_response)
        }
        Err(e) => {
            // Send error notification
            let _ = NotificationManager::error(
                &app_handle,
                "Upload failed",
                Some(e.clone()),
            );
            Err(e)
        }
    }
}

/// Validate a portfolio workbook
#[tauri::command]
pub async fn save_portfolio_workbook_validated(
    app_handle: AppHandle,
    portfolio_name: String,
    file_data: Vec<u8>,
    file_name: String,
    report_date: String,
) -> Result<ValidatedUploadResponse, String> {
    // For portfolio workbooks, we'll do basic validation
    // Check that it's an Excel file
    if !file_name.ends_with(".xlsx") && !file_name.ends_with(".xls") {
        let _ = NotificationManager::error(
            &app_handle,
            "Invalid file format",
            Some("Portfolio workbooks must be Excel files (.xlsx or .xls)".to_string()),
        );
        
        return Ok(ValidatedUploadResponse {
            success: false,
            message: "Invalid file format".to_string(),
            file_path: None,
            version_id: None,
            backup_path: None,
            validation_errors: vec!["File must be an Excel workbook (.xlsx or .xls)".to_string()],
            validation_warnings: Vec::new(),
        });
    }
    
    // Proceed with the original save function
    match original_save_portfolio_workbook(
        &portfolio_name,
        file_data,
        &file_name,
        &report_date,
    ) {
        Ok(response) => {
            // Send success notification
            if response.success {
                let _ = NotificationManager::success(
                    &app_handle,
                    format!("Portfolio workbook saved: {}", portfolio_name),
                    Some(format!("Report date: {}", report_date)),
                );
            }
            
            Ok(ValidatedUploadResponse::from(response))
        }
        Err(e) => {
            // Send error notification
            let _ = NotificationManager::error(
                &app_handle,
                "Failed to save portfolio workbook",
                Some(e.clone()),
            );
            Err(e)
        }
    }
}

/// Validate a funder file based on the funder type
fn validate_funder_file(funder_name: &str, file_path: &Path) -> Result<ValidationResult, String> {
    let validation_result = match funder_name {
        "BHB" => {
            let parser = BhbParser::new();
            parser.validate_file_structure(file_path)
        }
        "BIG" => {
            let parser = BigParser::new();
            parser.validate_file_structure(file_path)
        }
        "eFin" => {
            let parser = EfinParser::new();
            parser.validate_file_structure(file_path)
        }
        "InAdvance" => {
            let parser = InAdvParser::new();
            parser.validate_file_structure(file_path)
        }
        "Kings" => {
            let parser = KingsParser::new();
            parser.validate_file_structure(file_path)
        }
        "Boom" => {
            let parser = BoomParser::new();
            parser.validate_file_structure(file_path)
        }
        _ => {
            // Unknown funder, skip validation
            ValidationResult::valid()
        }
    };
    
    Ok(validation_result)
}