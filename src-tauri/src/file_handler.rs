use std::fs;
use std::path::{Path, PathBuf};
use serde::{Serialize, Deserialize};

#[derive(Debug, Serialize, Deserialize)]
pub struct UploadResponse {
    success: bool,
    message: String,
    file_path: Option<String>,
}

pub fn get_excelerate_dir() -> Result<PathBuf, String> {
    let home_dir = dirs::home_dir()
        .ok_or_else(|| "Could not find home directory".to_string())?;
    
    let excelerate_dir = home_dir.join("Excelerate");
    Ok(excelerate_dir)
}

pub fn ensure_directories() -> Result<(), String> {
    let base_dir = get_excelerate_dir()?;
    
    let directories = vec![
        base_dir.clone(),
        base_dir.join("Alder"),
        base_dir.join("Alder").join("Workbook"),
        base_dir.join("White Rabbit"),
        base_dir.join("White Rabbit").join("Workbook"),
    ];
    
    for dir in directories {
        fs::create_dir_all(&dir)
            .map_err(|e| format!("Failed to create directory {:?}: {}", dir, e))?;
    }
    
    Ok(())
}

#[tauri::command]
pub fn save_portfolio_workbook(
    portfolio_name: &str,
    file_data: Vec<u8>,
    _file_name: &str,
) -> Result<UploadResponse, String> {
    ensure_directories()?;
    
    let base_dir = get_excelerate_dir()?;
    
    let portfolio_dir = match portfolio_name.to_lowercase().as_str() {
        "alder" => base_dir.join("Alder").join("Workbook"),
        "white rabbit" | "whiterabbit" | "white_rabbit" => base_dir.join("White Rabbit").join("Workbook"),
        _ => return Err(format!("Unknown portfolio: {}", portfolio_name)),
    };
    
    let output_filename = match portfolio_name.to_lowercase().as_str() {
        "alder" => "alder_portfolio_original.xlsx",
        "white rabbit" | "whiterabbit" | "white_rabbit" => "white_rabbit_portfolio_original.xlsx",
        _ => return Err(format!("Unknown portfolio: {}", portfolio_name)),
    };
    
    let file_path = portfolio_dir.join(output_filename);
    
    fs::write(&file_path, file_data)
        .map_err(|e| format!("Failed to save file: {}", e))?;
    
    Ok(UploadResponse {
        success: true,
        message: format!("File saved successfully to {:?}", file_path),
        file_path: Some(file_path.to_string_lossy().to_string()),
    })
}

#[tauri::command]
pub fn get_portfolio_workbook_path(portfolio_name: &str) -> Result<String, String> {
    let base_dir = get_excelerate_dir()?;
    
    let file_path = match portfolio_name.to_lowercase().as_str() {
        "alder" => base_dir.join("Alder").join("Workbook").join("alder_portfolio_original.xlsx"),
        "white rabbit" | "whiterabbit" | "white_rabbit" => {
            base_dir.join("White Rabbit").join("Workbook").join("white_rabbit_portfolio_original.xlsx")
        }
        _ => return Err(format!("Unknown portfolio: {}", portfolio_name)),
    };
    
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

#[tauri::command]
pub fn get_existing_workbook_info(portfolio_name: &str) -> Result<(String, String, u64), String> {
    let path_str = get_portfolio_workbook_path(portfolio_name)?;
    let path = Path::new(&path_str);
    
    if !path.exists() {
        return Err("Workbook file not found".to_string());
    }
    
    let file_name = path.file_name()
        .and_then(|n| n.to_str())
        .ok_or("Invalid file name")?
        .to_string();
    
    let metadata = fs::metadata(path)
        .map_err(|e| format!("Failed to get file metadata: {}", e))?;
    
    let file_size = metadata.len();
    
    Ok((file_name, path_str, file_size))
}

#[tauri::command]
pub fn delete_portfolio_workbook(portfolio_name: &str) -> Result<bool, String> {
    let base_dir = get_excelerate_dir()?;
    
    let file_path = match portfolio_name.to_lowercase().as_str() {
        "alder" => base_dir.join("Alder").join("Workbook").join("alder_portfolio_original.xlsx"),
        "white rabbit" | "whiterabbit" | "white_rabbit" => {
            base_dir.join("White Rabbit").join("Workbook").join("white_rabbit_portfolio_original.xlsx")
        }
        _ => return Err(format!("Unknown portfolio: {}", portfolio_name)),
    };
    
    if file_path.exists() {
        fs::remove_file(&file_path)
            .map_err(|e| format!("Failed to delete file: {}", e))?;
        Ok(true)
    } else {
        Ok(false)
    }
}