//! Turns a picked file into chat blocks: spreadsheets/CSVs become inline
//! text (all providers handle text), PDFs and images become base64 blocks.

use std::path::Path;

use base64::Engine;
use calamine::{open_workbook_auto, Reader};
use serde::Serialize;

use super::types::ChatBlock;

const MAX_TEXT_BYTES: usize = 200_000;
const MAX_SHEET_ROWS: usize = 500;
const MAX_PDF_BYTES: usize = 20 * 1024 * 1024;
const MAX_IMAGE_BYTES: usize = 10 * 1024 * 1024;

#[derive(Debug, Serialize)]
pub struct PreparedAttachment {
    pub name: String,
    pub blocks: Vec<ChatBlock>,
}

fn file_name(path: &Path) -> String {
    path.file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_else(|| "file".to_string())
}

fn text_attachment(name: &str, mut body: String) -> PreparedAttachment {
    let mut note = String::new();
    if body.len() > MAX_TEXT_BYTES {
        let mut cut = MAX_TEXT_BYTES;
        while !body.is_char_boundary(cut) {
            cut -= 1;
        }
        body.truncate(cut);
        note = "\n\n[File truncated for size]".to_string();
    }
    PreparedAttachment {
        name: name.to_string(),
        blocks: vec![ChatBlock::Text {
            text: format!("Contents of uploaded file \"{name}\":\n\n{body}{note}"),
        }],
    }
}

fn excel_to_text(path: &Path) -> Result<String, String> {
    let mut workbook =
        open_workbook_auto(path).map_err(|e| format!("Cannot open spreadsheet: {e}"))?;
    let sheet_names = workbook.sheet_names().to_vec();
    let mut out = String::new();
    for sheet_name in sheet_names {
        let Ok(range) = workbook.worksheet_range(&sheet_name) else {
            continue;
        };
        out.push_str(&format!("## Sheet: {sheet_name}\n"));
        let total_rows = range.rows().count();
        for row in range.rows().take(MAX_SHEET_ROWS) {
            let line = row
                .iter()
                .map(|cell| {
                    let s = cell.to_string();
                    if s.contains(',') || s.contains('"') {
                        format!("\"{}\"", s.replace('"', "\"\""))
                    } else {
                        s
                    }
                })
                .collect::<Vec<_>>()
                .join(",");
            out.push_str(&line);
            out.push('\n');
        }
        if total_rows > MAX_SHEET_ROWS {
            out.push_str(&format!(
                "[... {} more rows omitted]\n",
                total_rows - MAX_SHEET_ROWS
            ));
        }
        out.push('\n');
    }
    Ok(out)
}

fn binary_attachment(
    path: &Path,
    name: &str,
    media_type: &str,
    max_bytes: usize,
    is_image: bool,
) -> Result<PreparedAttachment, String> {
    let bytes = std::fs::read(path).map_err(|e| format!("Cannot read file: {e}"))?;
    if bytes.len() > max_bytes {
        return Err(format!(
            "File is too large ({:.1} MB, max {} MB)",
            bytes.len() as f64 / 1_048_576.0,
            max_bytes / 1_048_576
        ));
    }
    let data = base64::engine::general_purpose::STANDARD.encode(&bytes);
    let block = if is_image {
        ChatBlock::Image {
            media_type: media_type.to_string(),
            data,
        }
    } else {
        ChatBlock::Document {
            media_type: media_type.to_string(),
            data,
            name: name.to_string(),
        }
    };
    Ok(PreparedAttachment {
        name: name.to_string(),
        blocks: vec![block],
    })
}

#[tauri::command]
pub fn prepare_chat_attachment(path: String) -> Result<PreparedAttachment, String> {
    let path = Path::new(&path);
    let name = file_name(path);
    let ext = path
        .extension()
        .map(|e| e.to_string_lossy().to_lowercase())
        .unwrap_or_default();

    match ext.as_str() {
        "csv" | "txt" | "md" | "json" | "tsv" => {
            let bytes = std::fs::read(path).map_err(|e| format!("Cannot read file: {e}"))?;
            Ok(text_attachment(
                &name,
                String::from_utf8_lossy(&bytes).to_string(),
            ))
        }
        "xlsx" | "xls" | "xlsm" | "xlsb" | "ods" => {
            Ok(text_attachment(&name, excel_to_text(path)?))
        }
        "pdf" => binary_attachment(path, &name, "application/pdf", MAX_PDF_BYTES, false),
        "png" => binary_attachment(path, &name, "image/png", MAX_IMAGE_BYTES, true),
        "jpg" | "jpeg" => binary_attachment(path, &name, "image/jpeg", MAX_IMAGE_BYTES, true),
        "gif" => binary_attachment(path, &name, "image/gif", MAX_IMAGE_BYTES, true),
        "webp" => binary_attachment(path, &name, "image/webp", MAX_IMAGE_BYTES, true),
        other => Err(format!(
            "Unsupported file type: .{other}. Supported: csv, tsv, txt, md, json, xlsx, xls, pdf, png, jpg, gif, webp"
        )),
    }
}
