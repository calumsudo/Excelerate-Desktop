mod database;
mod file_handler;

// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Ensure directories exist on app startup
    if let Err(e) = file_handler::ensure_directories() {
        eprintln!("Failed to create Excelerate directories: {}", e);
    }
    
    // Initialize database on app startup
    if let Err(e) = file_handler::init_database() {
        eprintln!("Failed to initialize database: {}", e);
    }

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_fs::init())
        .invoke_handler(tauri::generate_handler![
            greet,
            file_handler::save_portfolio_workbook_with_version,
            file_handler::get_portfolio_workbook_path,
            file_handler::check_workbook_exists,
            file_handler::get_portfolio_versions,
            file_handler::get_versions_by_date,
            file_handler::restore_version,
            file_handler::get_active_version,
            file_handler::check_version_exists,
            file_handler::delete_version,
            file_handler::save_funder_upload,
            file_handler::get_funder_upload_info,
            file_handler::get_funder_uploads_for_date,
            file_handler::check_funder_upload_exists
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
