mod database;
mod file_handler;
mod notification;
pub mod parsers;
mod validated_file_handler;
mod workbook_import;

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
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
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
            file_handler::check_funder_upload_exists,
            file_handler::delete_funder_upload,
            file_handler::get_all_database_files,
            file_handler::read_csv_file,
            file_handler::read_excel_file,
            file_handler::get_merchants_by_portfolio,
            file_handler::get_pivot_tables_for_update,
            file_handler::get_pivot_for_report,
            file_handler::get_active_workbook_path,
            file_handler::find_unmatched_deals,
            file_handler::find_unmatched_deals_by_portfolio,
            file_handler::find_unmatched_deals_by_date,
            validated_file_handler::save_funder_upload_validated,
            validated_file_handler::save_portfolio_workbook_validated,
            workbook_import::parse_portfolio_workbook
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
