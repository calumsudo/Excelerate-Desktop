Create a new BaseParser implementation for the funder named: $ARGUMENTS

Follow these steps exactly:

## Step 1 — Derive names

From the argument (e.g. `bhb`), derive:
- `snake_name`: lowercase, underscores (e.g. `bhb`)
- `PascalName`: PascalCase (e.g. `Bhb`)
- File path: `src-tauri/src/parsers/<snake_name>_parser.rs`
- Tauri command name: `parse_<snake_name>_file`

## Step 2 — Read the reference parser

Read `src-tauri/src/parsers/bhb_parser.rs` to understand the exact pattern, and read `src-tauri/src/parsers/base_parser.rs` for the trait definition and helper functions.

## Step 3 — Create the parser file

Write `src-tauri/src/parsers/<snake_name>_parser.rs` with a full `BaseParser` implementation. Use this structure exactly:

```rust
use super::base_parser::*;
use std::collections::HashMap;
use std::path::Path;

pub struct <PascalName>Parser {
    funder_name: String,
    required_columns: Vec<String>,
}

impl Default for <PascalName>Parser {
    fn default() -> Self {
        Self::new()
    }
}

impl <PascalName>Parser {
    pub fn new() -> Self {
        <PascalName>Parser {
            funder_name: "<NAME>".to_string(),
            required_columns: vec![
                // TODO: map column — add the actual column header strings from the funder's file
            ],
        }
    }
}

impl BaseParser for <PascalName>Parser {
    fn get_funder_name(&self) -> &str {
        &self.funder_name
    }

    fn get_required_columns(&self) -> Vec<String> {
        self.required_columns.clone()
    }

    fn parse_file(&self, file_path: &Path) -> ParserResult<Vec<HashMap<String, String>>> {
        let extension = file_path
            .extension()
            .and_then(|e| e.to_str())
            .ok_or(ParserError::UnsupportedFormat)?;

        match extension.to_lowercase().as_str() {
            "csv" => read_csv_file(file_path),
            "xlsx" => read_excel_file(file_path, "Sheet1"),
            _ => Err(ParserError::UnsupportedFormat),
        }
    }

    fn validate_columns(&self, headers: &[String]) -> ParserResult<()> {
        let missing_columns: Vec<String> = self
            .required_columns
            .iter()
            .filter(|col| !headers.contains(col))
            .cloned()
            .collect();

        if !missing_columns.is_empty() {
            return Err(ParserError::MissingColumns {
                columns: missing_columns,
            });
        }

        Ok(())
    }

    fn process_row(&self, row: &HashMap<String, String>) -> ParserResult<Option<ProcessedData>> {
        // TODO: map column — replace these placeholder column names with the actual headers
        let advance_id = row
            .get("ID_COLUMN")
            .ok_or_else(|| ParserError::ProcessingError("Missing ID column".to_string()))?
            .clone();

        // Skip non-data rows
        if advance_id.is_empty() {
            return Ok(None);
        }

        let merchant_name = row
            .get("NAME_COLUMN")
            .ok_or_else(|| ParserError::ProcessingError("Missing merchant name column".to_string()))?
            .clone();

        // TODO: map column — replace GROSS_COLUMN, FEE_COLUMN, NET_COLUMN with actual headers
        let gross = self.currency_to_float(
            row.get("GROSS_COLUMN")
                .ok_or_else(|| ParserError::ProcessingError("Missing gross column".to_string()))?,
        )?;

        let fee = self.currency_to_float(
            row.get("FEE_COLUMN")
                .ok_or_else(|| ParserError::ProcessingError("Missing fee column".to_string()))?,
        )?.abs();

        let net = self.currency_to_float(
            row.get("NET_COLUMN")
                .ok_or_else(|| ParserError::ProcessingError("Missing net column".to_string()))?,
        )?;

        Ok(Some(ProcessedData {
            advance_id,
            merchant_name,
            gross_payment: gross,
            fees: fee,
            net,
        }))
    }

    fn create_pivot_table(&self, data: Vec<ProcessedData>) -> ParserResult<PivotTable> {
        let mut grouped_data: std::collections::HashMap<(String, String), (f64, f64, f64)> =
            std::collections::HashMap::new();

        for row in data {
            let key = (row.advance_id, row.merchant_name);
            let entry = grouped_data.entry(key).or_insert((0.0, 0.0, 0.0));
            entry.0 += row.gross_payment;
            entry.1 += row.fees;
            entry.2 += row.net;
        }

        let mut pivot = PivotTable::new();

        let mut sorted_entries: Vec<_> = grouped_data.into_iter().collect();
        sorted_entries.sort_by(|a, b| a.0 .0.cmp(&b.0 .0));

        for ((advance_id, merchant_name), (gross, fee, net)) in sorted_entries {
            pivot.add_row(
                advance_id,
                merchant_name,
                (gross * 100.0).round() / 100.0,
                (fee * 100.0).round() / 100.0,
                (net * 100.0).round() / 100.0,
            );
        }

        pivot.add_totals_row();
        Ok(pivot)
    }
}
```

## Step 4 — Register in mod.rs

Read `src-tauri/src/parsers/mod.rs` then append two lines in the correct sections:
- After the last `pub mod` line: `pub mod <snake_name>_parser;`
- After the last `pub use` line: `pub use <snake_name>_parser::<PascalName>Parser;`

## Step 5 — Register the Tauri command in lib.rs

Read `src-tauri/src/lib.rs`. Add a new `#[tauri::command]` stub function (if none exists for this parser yet), then add it to the `tauri::generate_handler![…]` list. The simplest approach is to add a dedicated parse command in `file_handler.rs` following the pattern of the existing funder parse commands there — or, if no such pattern exists, add a minimal stub directly in `lib.rs`:

```rust
#[tauri::command]
fn parse_<snake_name>_file(file_path: String) -> Result<String, String> {
    use crate::parsers::{BaseParser, <PascalName>Parser};
    use std::path::Path;
    let parser = <PascalName>Parser::new();
    parser
        .process(Path::new(&file_path))
        .and_then(|pivot| pivot.to_csv_string())
        .map_err(|e| e.to_string())
}
```

Add `parse_<snake_name>_file` to the `tauri::generate_handler![…]` list in `lib.rs`.

## Step 6 — Compile check

Run: `cd src-tauri && cargo check`

Report whether it succeeded. If it fails, fix the errors and re-run.

## Step 7 — Summarize

Tell the user:
- File created: `src-tauri/src/parsers/<snake_name>_parser.rs`
- mod.rs and lib.rs updated
- Tauri command registered: `parse_<snake_name>_file`
- All `// TODO: map column` markers that need real column names before the parser will work
