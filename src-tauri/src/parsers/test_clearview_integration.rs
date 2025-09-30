#[cfg(test)]
mod tests {
    use super::super::clearview_weekly_parser::ClearViewWeeklyParser;
    use super::super::clearview_pivot_processor::ClearViewPivotProcessor;
    use crate::file_handler::{get_excelerate_dir, ensure_directories};
    use std::path::Path;
    use std::fs;
    
    #[test]
    fn test_clearview_weekly_parser_saves_pivot_table() {
        // Setup
        ensure_directories().expect("Failed to create directories");
        
        // Create test CSV data for ClearView weekly file
        let test_csv = r#"Deal Id,Participator Gross Amount,Fee,Net Payment Amount
DEAL001,"$1,000.00","$100.00","$900.00"
DEAL002,"$2,500.00","$250.00","$2,250.00"
DEAL001,"$500.00","$50.00","$450.00"
"#;
        
        // Create a temporary test file
        let temp_dir = std::env::temp_dir();
        let test_file_path = temp_dir.join("test_clearview_weekly.csv");
        fs::write(&test_file_path, test_csv).expect("Failed to write test file");
        
        // Test the parser
        let parser = ClearViewWeeklyParser::new(&test_file_path);
        let pivot = parser.process().expect("Failed to process file");
        
        // Verify the pivot table has correct data
        assert_eq!(pivot.rows.len(), 3); // 2 deals + 1 totals row
        assert_eq!(pivot.total_gross, 4000.0);
        assert_eq!(pivot.total_fee, 400.0);
        assert_eq!(pivot.total_net, 3600.0);
        
        // Test the pivot processor saves to file system
        let processor = ClearViewPivotProcessor::new(
            "Alder".to_string(),
            "2025-01-17".to_string(),
        );
        
        let (processed_pivot, pivot_path) = processor
            .create_weekly_report_pivot(&test_file_path)
            .expect("Failed to create weekly report pivot");
        
        // Verify file was created
        assert!(Path::new(&pivot_path).exists(), "Pivot file was not created");
        
        // Verify the pivot path is correct
        let expected_path = get_excelerate_dir()
            .unwrap()
            .join("Alder")
            .join("Funder Pivot Tables")
            .join("Weekly")
            .join("Clear View")
            .join("Weekly")
            .join("2025-01-17.csv");
        
        assert_eq!(
            pivot_path, 
            expected_path.to_string_lossy().to_string(),
            "Pivot file path doesn't match expected location"
        );
        
        // Read the saved file and verify content
        let saved_content = fs::read_to_string(&pivot_path)
            .expect("Failed to read saved pivot file");
        
        assert!(saved_content.contains("DEAL001"));
        assert!(saved_content.contains("DEAL002"));
        assert!(saved_content.contains("Totals"));
        
        // Cleanup
        fs::remove_file(&test_file_path).ok();
        fs::remove_file(&pivot_path).ok();
        
        println!("✓ ClearView weekly parser successfully saves pivot table to file system");
    }
}