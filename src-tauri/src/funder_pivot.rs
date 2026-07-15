// Phase 5: the cloud-only monthly flow's parse step.
//
// Replaces the SQLite-era save_funder_upload_validated + get_pivot_for_report
// pair: the frontend hands over the raw funder file bytes, this command
// validates the structure, runs the funder's parser, and returns the pivot
// rows + parser totals for the frontend to push to Supabase (Storage upload,
// funder_uploads upsert, commit_funder_pivot RPC). Nothing is written to disk
// beyond a temp file for the parser, and nothing is stored locally.

use crate::notification::{NotificationManager, ValidationResult};
use crate::parsers::{
    BaseParser, BhbParser, BigParser, BoomParser, ClearViewMonthlyParser, EfinParser, InAdvParser,
    KingsParser, PivotTable, ReceivabullParser,
};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use tauri::AppHandle;

#[derive(Debug, Serialize, Deserialize)]
pub struct PivotRowData {
    pub advance_id: String,
    pub merchant_name: String,
    pub gross_amount: f64,
    pub management_fee: f64,
    pub net_amount: f64,
    /// Fee breakdown for funders that split the servicing fee (Receivabull).
    /// `None` for every other funder. `fee_discrepancy` is
    /// gross - (originator + rb) - net.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub originator_fee: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub rb_fee: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub fee_discrepancy: Option<f64>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct PivotExport {
    pub rows: Vec<PivotRowData>,
    pub total_gross: f64,
    pub total_fee: f64,
    pub total_net: f64,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ParseFunderPivotResponse {
    pub success: bool,
    pub message: String,
    pub validation_errors: Vec<String>,
    pub validation_warnings: Vec<String>,
    /// None when no parser exists for the funder (e.g. Payva) — the frontend
    /// skips the cloud sync in that case.
    pub pivot: Option<PivotExport>,
}

fn pivot_to_export(pivot: PivotTable) -> PivotExport {
    PivotExport {
        total_gross: pivot.total_gross,
        total_fee: pivot.total_fee,
        total_net: pivot.total_net,
        rows: pivot
            .rows
            .into_iter()
            .filter(|row| row.advance_id != "Totals")
            .map(|row| PivotRowData {
                advance_id: row.advance_id,
                merchant_name: row.merchant_name,
                gross_amount: row.sum_of_syn_gross_amount,
                management_fee: row.total_servicing_fee,
                net_amount: row.sum_of_syn_net_amount,
                originator_fee: row.originator_fee,
                rb_fee: row.rb_fee,
                fee_discrepancy: row.fee_discrepancy,
            })
            .collect(),
    }
}

/// Run the funder's parser. `portfolio_name` only matters for Clear View,
/// whose single file carries deals for both portfolios.
fn parse_file(
    portfolio_name: &str,
    funder_name: &str,
    report_date: &str,
    path: &Path,
) -> Result<Option<PivotTable>, String> {
    let pivot = match funder_name {
        "BHB" => BhbParser::new().process(path),
        "BIG" => BigParser::with_report_date(report_date).process(path),
        "Clear View" | "ClearView" => ClearViewMonthlyParser::new(portfolio_name).process(path),
        "eFin" => EfinParser::new().process(path),
        "InAdvance" => InAdvParser::new().process(path),
        "Kings" => KingsParser::new().process(path),
        "Boom" => BoomParser::new().process(path),
        "Receivabull" => ReceivabullParser::new().process(path),
        _ => return Ok(None),
    };
    pivot
        .map(Some)
        .map_err(|e| format!("Failed to parse {} file: {}", funder_name, e))
}

fn validate_file(funder_name: &str, path: &Path) -> ValidationResult {
    match funder_name {
        "BHB" => BhbParser::new().validate_file_structure(path),
        "BIG" => BigParser::new().validate_file_structure(path),
        "eFin" => EfinParser::new().validate_file_structure(path),
        "InAdvance" => InAdvParser::new().validate_file_structure(path),
        "Kings" => KingsParser::new().validate_file_structure(path),
        "Boom" => BoomParser::new().validate_file_structure(path),
        "Receivabull" => ReceivabullParser::new().validate_file_structure(path),
        // Clear View validates during parsing (portfolio-dependent columns)
        _ => ValidationResult::valid(),
    }
}

/// Temp path preserving the original extension (parsers dispatch on it).
fn temp_path(file_name: &str) -> PathBuf {
    let extension = Path::new(file_name)
        .extension()
        .and_then(|ext| ext.to_str())
        .unwrap_or("csv");
    std::env::temp_dir().join(format!(
        "excelerate_upload_{}.{}",
        std::process::id(),
        extension
    ))
}

/// Validate + parse an uploaded funder file into pivot rows and totals for
/// the cloud commit. Sends the same desktop notifications the old validated
/// upload path did.
#[tauri::command]
pub async fn parse_funder_pivot(
    app_handle: AppHandle,
    portfolio_name: String,
    funder_name: String,
    file_data: Vec<u8>,
    file_name: String,
    report_date: String,
) -> Result<ParseFunderPivotResponse, String> {
    let path = temp_path(&file_name);
    fs::write(&path, &file_data).map_err(|e| format!("Failed to write temporary file: {}", e))?;

    let validation = validate_file(&funder_name, &path);

    if !validation.is_valid {
        let _ = fs::remove_file(&path);
        let notification = validation.to_notification(&file_name);
        let _ = NotificationManager::send(&app_handle, notification);
        return Ok(ParseFunderPivotResponse {
            success: false,
            message: format!("File validation failed for {}", file_name),
            validation_errors: validation
                .errors
                .iter()
                .map(|e| {
                    format!(
                        "{}: Expected '{}', found '{}'",
                        e.field, e.expected, e.found
                    )
                })
                .collect(),
            validation_warnings: validation.warnings,
            pivot: None,
        });
    }

    if !validation.warnings.is_empty() {
        let notification = validation.to_notification(&file_name);
        let _ = NotificationManager::send(&app_handle, notification);
    }

    let parse_result = parse_file(&portfolio_name, &funder_name, &report_date, &path);
    let _ = fs::remove_file(&path);

    match parse_result {
        Ok(Some(pivot)) => Ok(ParseFunderPivotResponse {
            success: true,
            message: format!("Parsed {} pivot for {}", funder_name, report_date),
            validation_errors: Vec::new(),
            validation_warnings: validation.warnings,
            pivot: Some(pivot_to_export(pivot)),
        }),
        Ok(None) => Ok(ParseFunderPivotResponse {
            success: true,
            message: format!("Parser not yet implemented for funder: {}", funder_name),
            validation_errors: Vec::new(),
            validation_warnings: validation.warnings,
            pivot: None,
        }),
        Err(e) => {
            let _ =
                NotificationManager::error(&app_handle, "Failed to parse file", Some(e.clone()));
            Err(e)
        }
    }
}
