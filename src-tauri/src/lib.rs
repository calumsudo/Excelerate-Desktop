mod ai_chat;
mod funder_pivot;
mod notification;
pub mod parsers;
mod workbook_export;
mod workbook_import;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            funder_pivot::parse_funder_pivot,
            workbook_import::parse_portfolio_workbook,
            workbook_export::export_portfolio_workbook,
            ai_chat::ai_chat_stream,
            ai_chat::settings::get_ai_settings,
            ai_chat::settings::save_ai_settings,
            ai_chat::attachments::prepare_chat_attachment
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
