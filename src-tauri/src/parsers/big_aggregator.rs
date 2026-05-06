use std::collections::HashMap;
use std::path::PathBuf;
use crate::parsers::base_parser::{BaseParser, ParserError, ParserResult, PivotTable};
use crate::parsers::big_parser::BigParser;

pub struct BigAggregator;

impl BigAggregator {
    /// Parse multiple weekly BIG XLSX files and aggregate into a single monthly PivotTable.
    /// Groups by (advance_id, merchant_name) and sums gross/fee/net across all files.
    pub fn aggregate_files(file_paths: Vec<PathBuf>) -> ParserResult<PivotTable> {
        if file_paths.is_empty() {
            return Err(ParserError::ProcessingError(
                "No BIG files provided for aggregation".to_string(),
            ));
        }

        let parser = BigParser::new();

        // Aggregate: key = (advance_id, merchant_name), value = (gross, fee, net)
        let mut grouped: HashMap<(String, String), (f64, f64, f64)> = HashMap::new();

        for path in &file_paths {
            let weekly_pivot = parser.process(path).map_err(|e| {
                ParserError::ProcessingError(format!(
                    "Failed to parse BIG file {}: {:?}",
                    path.display(),
                    e
                ))
            })?;

            for row in &weekly_pivot.rows {
                // Skip the totals row
                if row.advance_id == "Totals" {
                    continue;
                }
                let key = (row.advance_id.clone(), row.merchant_name.clone());
                let entry = grouped.entry(key).or_insert((0.0, 0.0, 0.0));
                entry.0 += row.sum_of_syn_gross_amount;
                entry.1 += row.total_servicing_fee;
                entry.2 += row.sum_of_syn_net_amount;
            }
        }

        let mut pivot = PivotTable::new();

        let mut sorted: Vec<_> = grouped.into_iter().collect();
        sorted.sort_by(|a, b| a.0 .0.cmp(&b.0 .0));

        for ((advance_id, merchant_name), (gross, fee, net)) in sorted {
            if net > 0.0 {
                pivot.add_row(advance_id, merchant_name, gross, fee, net);
            }
        }

        pivot.add_totals_row();

        Ok(pivot)
    }
}
