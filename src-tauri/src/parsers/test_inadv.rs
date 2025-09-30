#[cfg(test)]
mod tests {
    use super::super::inadv_parser::InAdvParser;
    use super::super::base_parser::BaseParser;
    use std::path::PathBuf;

    #[test]
    fn test_inadv_parser_with_example_file() {
        // Get the path to the example file
        let mut path = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
        path.pop(); // Go up from src-tauri to project root
        path.push("examples");
        path.push("InAdv.csv");

        let parser = InAdvParser::new();
        
        match parser.process(&path) {
            Ok(pivot) => {
                // Verify we got the expected results
                assert!(pivot.rows.len() > 0, "Should have at least one row");
                assert!(pivot.total_gross > 0.0, "Total gross should be positive");
                assert!(pivot.total_fee > 0.0, "Total fees should be positive");
                assert!(pivot.total_net > 0.0, "Total net should be positive");
                
                // Check that totals roughly match (gross - fees = net)
                let calculated_net = pivot.total_gross - pivot.total_fee;
                let diff = (calculated_net - pivot.total_net).abs();
                assert!(diff < 0.01, "Net should equal gross minus fees");
                
                println!("✅ InAdvance parser test passed!");
                println!("Total Gross: ${:.2}", pivot.total_gross);
                println!("Total Fees: ${:.2}", pivot.total_fee);
                println!("Total Net: ${:.2}", pivot.total_net);
                println!("Number of data rows: {}", pivot.rows.len() - 1); // -1 for totals row
            },
            Err(e) => {
                panic!("Failed to parse InAdvance file: {}", e);
            }
        }
    }

    #[test]
    fn test_inadv_parser_columns() {
        let parser = InAdvParser::new();
        let required = parser.get_required_columns();
        
        // Verify we have the expected columns
        assert!(required.contains(&"Process Date".to_string()));
        assert!(required.contains(&"Status".to_string()));
        assert!(required.contains(&"Funding Date".to_string()));
        assert!(required.contains(&"Paid To".to_string()));
        assert!(required.contains(&"Servicing Fee %".to_string()));
        assert!(required.contains(&"Mgmt Fee".to_string()));
        assert!(required.contains(&"Advance Id".to_string()));
        assert!(required.contains(&"Amount".to_string()));
        assert!(required.contains(&"Gross Amount".to_string()));
        assert!(required.contains(&"Contact ID".to_string()));
    }
}