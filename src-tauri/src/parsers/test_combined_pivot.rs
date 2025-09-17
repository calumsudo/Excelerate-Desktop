#[cfg(test)]
mod tests {
    use super::super::clearview_pivot_processor::ClearViewPivotProcessor;
    use super::super::base_parser::PivotTable;
    use crate::file_handler::{get_excelerate_dir, ensure_directories};
    use std::fs;
    use std::path::PathBuf;
    
    #[test]
    fn test_combined_pivot_creation() {
        // Setup
        ensure_directories().expect("Failed to create directories");
        
        let portfolio = "Alder";
        let report_date = "2025-01-17";
        let base_dir = get_excelerate_dir().expect("Failed to get base dir");
        
        // Create daily pivot directory
        let daily_dir = base_dir
            .join(portfolio)
            .join("Funder Pivot Tables")
            .join("Weekly")
            .join("Clear View")
            .join("Daily");
        fs::create_dir_all(&daily_dir).expect("Failed to create daily dir");
        
        // Create weekly pivot directory
        let weekly_dir = base_dir
            .join(portfolio)
            .join("Funder Pivot Tables")
            .join("Weekly")
            .join("Clear View")
            .join("Weekly");
        fs::create_dir_all(&weekly_dir).expect("Failed to create weekly dir");
        
        // Create combined pivot directory
        let combined_dir = base_dir
            .join(portfolio)
            .join("Funder Pivot Tables")
            .join("Weekly")
            .join("Clear View")
            .join("Combined");
        fs::create_dir_all(&combined_dir).expect("Failed to create combined dir");
        
        // Create sample daily pivot CSV
        let daily_csv = r#"Advance ID,Merchant Name,Sum of Syn Gross Amount,Total Servicing Fee,Sum of Syn Net Amount
DEAL001,Merchant A,1000.00,100.00,900.00
DEAL002,Merchant B,2000.00,200.00,1800.00
Totals,,3000.00,300.00,2700.00"#;
        
        let daily_path = daily_dir.join(format!("{}.csv", report_date));
        fs::write(&daily_path, daily_csv).expect("Failed to write daily pivot");
        
        // Create sample weekly pivot CSV
        let weekly_csv = r#"Advance ID,Merchant Name,Sum of Syn Gross Amount,Total Servicing Fee,Sum of Syn Net Amount
DEAL002,Merchant B,1500.00,150.00,1350.00
DEAL003,Merchant C,3000.00,300.00,2700.00
Totals,,4500.00,450.00,4050.00"#;
        
        let weekly_path = weekly_dir.join(format!("{}.csv", report_date));
        fs::write(&weekly_path, weekly_csv).expect("Failed to write weekly pivot");
        
        // Create processor and test combined pivot generation
        let processor = ClearViewPivotProcessor::new(
            portfolio.to_string(),
            report_date.to_string(),
        );
        
        // Call update_combined_pivot_if_needed
        let result = processor.update_combined_pivot_if_needed()
            .expect("Failed to create combined pivot");
        
        assert!(result.is_some(), "Combined pivot should be created when both daily and weekly exist");
        
        let (combined_pivot, combined_path) = result.unwrap();
        
        // Verify combined pivot path
        let expected_combined_path = combined_dir.join(format!("{}.csv", report_date));
        assert_eq!(
            combined_path,
            expected_combined_path.to_string_lossy().to_string(),
            "Combined pivot path doesn't match expected"
        );
        
        // Verify combined pivot exists on disk
        assert!(
            expected_combined_path.exists(),
            "Combined pivot file was not created on disk"
        );
        
        // Verify combined pivot data
        // Should have DEAL001 (daily only), DEAL002 (both), DEAL003 (weekly only)
        assert_eq!(combined_pivot.rows.len(), 4, "Should have 3 deals + 1 totals row");
        
        // Verify totals are correct
        // Daily: 3000 + Weekly: 4500 = 7500 total gross
        // But DEAL002 appears in both, so it should be:
        // DEAL001: 1000, DEAL002: 2000 + 1500 = 3500, DEAL003: 3000 = Total: 7500
        assert_eq!(combined_pivot.total_gross, 7500.0, "Combined gross total incorrect");
        assert_eq!(combined_pivot.total_fee, 750.0, "Combined fee total incorrect");
        assert_eq!(combined_pivot.total_net, 6750.0, "Combined net total incorrect");
        
        // Read the saved combined file and verify content
        let saved_content = fs::read_to_string(&expected_combined_path)
            .expect("Failed to read combined pivot file");
        
        println!("Combined pivot content:\n{}", saved_content);
        
        assert!(saved_content.contains("DEAL001"), "Combined pivot should contain DEAL001");
        assert!(saved_content.contains("DEAL002"), "Combined pivot should contain DEAL002");
        assert!(saved_content.contains("DEAL003"), "Combined pivot should contain DEAL003");
        assert!(saved_content.contains("Totals"), "Combined pivot should contain Totals row");
        
        // Cleanup
        fs::remove_file(&daily_path).ok();
        fs::remove_file(&weekly_path).ok();
        fs::remove_file(&expected_combined_path).ok();
        
        println!("✓ Combined pivot table successfully created with correct data");
    }
    
    #[test]
    fn test_no_combined_pivot_when_only_daily_exists() {
        ensure_directories().expect("Failed to create directories");
        
        let portfolio = "Alder";
        let report_date = "2025-01-18";
        let base_dir = get_excelerate_dir().expect("Failed to get base dir");
        
        // Create only daily pivot
        let daily_dir = base_dir
            .join(portfolio)
            .join("Funder Pivot Tables")
            .join("Weekly")
            .join("Clear View")
            .join("Daily");
        fs::create_dir_all(&daily_dir).expect("Failed to create daily dir");
        
        let daily_csv = r#"Advance ID,Merchant Name,Sum of Syn Gross Amount,Total Servicing Fee,Sum of Syn Net Amount
DEAL001,Merchant A,1000.00,100.00,900.00
Totals,,1000.00,100.00,900.00"#;
        
        let daily_path = daily_dir.join(format!("{}.csv", report_date));
        fs::write(&daily_path, daily_csv).expect("Failed to write daily pivot");
        
        let processor = ClearViewPivotProcessor::new(
            portfolio.to_string(),
            report_date.to_string(),
        );
        
        let result = processor.update_combined_pivot_if_needed()
            .expect("update_combined_pivot_if_needed should not fail");
        
        assert!(result.is_none(), "Combined pivot should NOT be created when only daily exists");
        
        // Cleanup
        fs::remove_file(&daily_path).ok();
        
        println!("✓ Combined pivot correctly not created when only daily exists");
    }
    
    #[test]
    fn test_no_combined_pivot_when_only_weekly_exists() {
        ensure_directories().expect("Failed to create directories");
        
        let portfolio = "Alder";
        let report_date = "2025-01-19";
        let base_dir = get_excelerate_dir().expect("Failed to get base dir");
        
        // Create only weekly pivot
        let weekly_dir = base_dir
            .join(portfolio)
            .join("Funder Pivot Tables")
            .join("Weekly")
            .join("Clear View")
            .join("Weekly");
        fs::create_dir_all(&weekly_dir).expect("Failed to create weekly dir");
        
        let weekly_csv = r#"Advance ID,Merchant Name,Sum of Syn Gross Amount,Total Servicing Fee,Sum of Syn Net Amount
DEAL003,Merchant C,3000.00,300.00,2700.00
Totals,,3000.00,300.00,2700.00"#;
        
        let weekly_path = weekly_dir.join(format!("{}.csv", report_date));
        fs::write(&weekly_path, weekly_csv).expect("Failed to write weekly pivot");
        
        let processor = ClearViewPivotProcessor::new(
            portfolio.to_string(),
            report_date.to_string(),
        );
        
        let result = processor.update_combined_pivot_if_needed()
            .expect("update_combined_pivot_if_needed should not fail");
        
        assert!(result.is_none(), "Combined pivot should NOT be created when only weekly exists");
        
        // Cleanup
        fs::remove_file(&weekly_path).ok();
        
        println!("✓ Combined pivot correctly not created when only weekly exists");
    }
}