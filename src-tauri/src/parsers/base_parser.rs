use std::collections::HashMap;
use std::path::Path;
use thiserror::Error;
use serde::{Serialize, Deserialize};
use crate::notification::{ValidationResult, ValidationError};

#[derive(Error, Debug)]
pub enum ParserError {
    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),
    
    #[error("CSV error: {0}")]
    Csv(#[from] csv::Error),
    
    #[error("Excel error: {0}")]
    Excel(#[from] calamine::Error),
    
    #[error("Missing required columns: {columns:?}")]
    MissingColumns { columns: Vec<String> },
    
    #[error("Type conversion error for column {column}: {message}")]
    TypeConversion { column: String, message: String },
    
    #[error("Unsupported file format")]
    UnsupportedFormat,
    
    #[error("Processing error: {0}")]
    ProcessingError(String),
}

pub type ParserResult<T> = Result<T, ParserError>;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PivotTableRow {
    pub advance_id: String,
    pub merchant_name: String,
    pub sum_of_syn_gross_amount: f64,
    pub total_servicing_fee: f64,
    pub sum_of_syn_net_amount: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PivotTable {
    pub rows: Vec<PivotTableRow>,
    pub total_gross: f64,
    pub total_fee: f64,
    pub total_net: f64,
}

impl PivotTable {
    pub fn new() -> Self {
        PivotTable {
            rows: Vec::new(),
            total_gross: 0.0,
            total_fee: 0.0,
            total_net: 0.0,
        }
    }
    
    pub fn add_row(&mut self, advance_id: String, merchant_name: String, gross: f64, fee: f64, net: f64) {
        self.rows.push(PivotTableRow {
            advance_id,
            merchant_name,
            sum_of_syn_gross_amount: gross,
            total_servicing_fee: fee,
            sum_of_syn_net_amount: net,
        });
        self.total_gross += gross;
        self.total_fee += fee;
        self.total_net += net;
    }
    
    pub fn add_totals_row(&mut self) {
        self.rows.push(PivotTableRow {
            advance_id: "Totals".to_string(),
            merchant_name: String::new(),
            sum_of_syn_gross_amount: self.total_gross,
            total_servicing_fee: self.total_fee,
            sum_of_syn_net_amount: self.total_net,
        });
    }
    
    pub fn to_csv_string(&self) -> ParserResult<String> {
        let mut writer = csv::Writer::from_writer(vec![]);
        
        // Write headers
        writer.write_record(&[
            "Advance ID",
            "Merchant Name", 
            "Sum of Syn Gross Amount",
            "Total Servicing Fee",
            "Sum of Syn Net Amount"
        ])?;
        
        // Write rows
        for row in &self.rows {
            writer.write_record(&[
                &row.advance_id,
                &row.merchant_name,
                &format!("{:.2}", row.sum_of_syn_gross_amount),
                &format!("{:.2}", row.total_servicing_fee),
                &format!("{:.2}", row.sum_of_syn_net_amount),
            ])?;
        }
        
        let bytes = writer.into_inner().map_err(|e| {
            ParserError::ProcessingError(format!("Failed to get CSV writer bytes: {}", e))
        })?;
        
        String::from_utf8(bytes).map_err(|e| {
            ParserError::ProcessingError(format!("Failed to convert CSV to string: {}", e))
        })
    }
}

#[derive(Debug)]
pub struct ProcessedData {
    pub advance_id: String,
    pub merchant_name: String,
    pub gross_payment: f64,
    pub fees: f64,
    pub net: f64,
}

pub trait BaseParser {
    fn get_funder_name(&self) -> &str;
    fn get_required_columns(&self) -> Vec<String>;
    
    fn parse_file(&self, file_path: &Path) -> ParserResult<Vec<HashMap<String, String>>>;
    fn validate_columns(&self, headers: &[String]) -> ParserResult<()>;
    fn process_row(&self, row: &HashMap<String, String>) -> ParserResult<Option<ProcessedData>>;
    fn create_pivot_table(&self, data: Vec<ProcessedData>) -> ParserResult<PivotTable>;
    
    /// Validate file structure before processing
    fn validate_file_structure(&self, file_path: &Path) -> ValidationResult {
        let mut result = ValidationResult::valid();
        
        // Try to parse the file headers
        match self.parse_file_headers(file_path) {
            Ok(headers) => {
                // Check for required columns
                let required = self.get_required_columns();
                for col in required {
                    if !headers.iter().any(|h| h.eq_ignore_ascii_case(&col)) {
                        result.add_error(ValidationError {
                            field: "Column".to_string(),
                            expected: col.clone(),
                            found: "Missing".to_string(),
                            line: Some(1),
                            column: None,
                        });
                    }
                }
            }
            Err(e) => {
                result.add_error(ValidationError {
                    field: "File Format".to_string(),
                    expected: format!("{} file format", self.get_funder_name()),
                    found: format!("Invalid format: {}", e),
                    line: None,
                    column: None,
                });
            }
        }
        
        result
    }
    
    /// Parse only file headers for validation
    fn parse_file_headers(&self, file_path: &Path) -> ParserResult<Vec<String>> {
        let extension = file_path.extension()
            .and_then(|ext| ext.to_str())
            .ok_or(ParserError::UnsupportedFormat)?;
        
        match extension.to_lowercase().as_str() {
            "csv" => {
                let mut reader = csv::ReaderBuilder::new()
                    .flexible(true)
                    .from_path(file_path)?;
                let headers = reader.headers()?
                    .iter()
                    .map(|h| h.to_string())
                    .collect();
                Ok(headers)
            }
            "xlsx" | "xls" => {
                use calamine::{open_workbook, Reader, Xlsx};
                let mut workbook: Xlsx<_> = open_workbook(file_path)
                    .map_err(|_| ParserError::ProcessingError("Failed to open Excel file".to_string()))?;
                
                // Try to find the appropriate sheet
                let sheet_names = workbook.sheet_names();
                if sheet_names.is_empty() {
                    return Err(ParserError::ProcessingError("No sheets found in Excel file".to_string()));
                }
                
                let sheet_name = sheet_names[0].clone();
                if let Ok(range) = workbook.worksheet_range(&sheet_name) {
                    if let Some(first_row) = range.rows().next() {
                        let headers: Vec<String> = first_row.iter()
                            .map(|cell| cell.to_string())
                            .collect();
                        return Ok(headers);
                    }
                }
                Err(ParserError::ProcessingError("Could not read headers from Excel file".to_string()))
            }
            _ => Err(ParserError::UnsupportedFormat)
        }
    }
    
    fn process(&self, file_path: &Path) -> ParserResult<PivotTable> {
        // Parse file
        let raw_data = self.parse_file(file_path)?;
        
        // Process each row
        let mut processed_data = Vec::new();
        for row in raw_data {
            if let Some(data) = self.process_row(&row)? {
                processed_data.push(data);
            }
        }
        
        // Create pivot table
        let pivot = self.create_pivot_table(processed_data)?;
        
        Ok(pivot)
    }
    
    fn currency_to_float(&self, value: &str) -> ParserResult<f64> {
        let cleaned = value
            .replace('$', "")
            .replace(',', "")
            .replace('(', "-")
            .replace(')', "")
            .trim()
            .to_string();
        
        cleaned.parse::<f64>().map_err(|e| {
            ParserError::TypeConversion {
                column: "currency".to_string(),
                message: format!("Failed to parse '{}': {}", value, e),
            }
        })
    }
}

pub fn read_csv_file(file_path: &Path) -> ParserResult<Vec<HashMap<String, String>>> {
    let mut reader = csv::ReaderBuilder::new()
        .flexible(true)  // Allow variable number of fields
        .from_path(file_path)?;
    
    let headers = reader.headers()?.clone();
    
    let mut records = Vec::new();
    for result in reader.records() {
        let record = result?;
        
        // Skip rows that don't have enough fields or are summary rows
        if record.len() < headers.len() {
            continue;
        }
        
        // Skip summary rows (e.g., rows that start with text like "235 Deal(s)")
        if let Some(first_field) = record.get(0) {
            if first_field.contains("Deal(s)") {
                continue;
            }
        }
        
        let mut row_map = HashMap::new();
        
        for (i, field) in record.iter().enumerate() {
            if let Some(header) = headers.get(i) {
                row_map.insert(header.to_string(), field.to_string());
            }
        }
        
        records.push(row_map);
    }
    
    Ok(records)
}

pub fn read_excel_file(file_path: &Path, sheet_name: &str) -> ParserResult<Vec<HashMap<String, String>>> {
    use calamine::{open_workbook, Reader, Xlsx};
    
    let mut workbook: Xlsx<_> = open_workbook(file_path).map_err(|_| ParserError::Excel(calamine::Error::Io(std::io::Error::new(std::io::ErrorKind::Other, "Failed to open workbook"))))?;
    
    let range = workbook.worksheet_range(sheet_name)
        .map_err(|e| ParserError::ProcessingError(format!("Failed to read sheet '{}': {:?}", sheet_name, e)))?;
    
    let mut records = Vec::new();
    let mut headers: Vec<String> = Vec::new();
    
    for (row_idx, row) in range.rows().enumerate() {
        if row_idx == 0 {
            // First row is headers
            headers = row.iter()
                .map(|cell| cell.to_string())
                .collect();
        } else {
            let mut row_map: HashMap<String, String> = HashMap::new();
            for (col_idx, cell) in row.iter().enumerate() {
                if let Some(header) = headers.get(col_idx) {
                    row_map.insert(header.to_string(), cell.to_string());
                }
            }
            records.push(row_map);
        }
    }
    
    Ok(records)
}