#[cfg(test)]
mod tests {
    use super::super::clearview_daily_parser::ClearViewDailyParser;
    use super::super::clearview_weekly_parser::ClearViewWeeklyParser;
    use std::path::Path;

    #[test]
    fn test_clearview_daily_parser() {
        let file_path = Path::new("../examples/clearview_daily.csv");
        if file_path.exists() {
            let parser = ClearViewDailyParser::from_single(file_path);
            match parser.process() {
                Ok(pivot_table) => {
                    println!("Daily Parser Success!");
                    println!("Total Gross: {:.2}", pivot_table.total_gross);
                    println!("Total Fee: {:.2}", pivot_table.total_fee);
                    println!("Total Net: {:.2}", pivot_table.total_net);
                    println!("Number of rows: {}", pivot_table.rows.len());
                    assert!(pivot_table.rows.len() > 0);
                },
                Err(e) => {
                    panic!("Failed to process Clear View daily file: {:?}", e);
                }
            }
        } else {
            println!("Test file not found, skipping test");
        }
    }

    #[test]
    fn test_clearview_weekly_parser() {
        let file_path = Path::new("../examples/clearview_weekly.csv");
        if file_path.exists() {
            let parser = ClearViewWeeklyParser::new(file_path);
            match parser.process() {
                Ok(pivot_table) => {
                    println!("Weekly Parser Success!");
                    println!("Total Gross: {:.2}", pivot_table.total_gross);
                    println!("Total Fee: {:.2}", pivot_table.total_fee);
                    println!("Total Net: {:.2}", pivot_table.total_net);
                    println!("Number of rows: {}", pivot_table.rows.len());
                    assert!(pivot_table.rows.len() > 0);
                },
                Err(e) => {
                    panic!("Failed to process Clear View weekly file: {:?}", e);
                }
            }
        } else {
            println!("Test file not found, skipping test");
        }
    }

    #[test]
    fn test_clearview_multiple_daily_files() {
        let file_paths = vec![
            Path::new("../examples/clearview_daily.csv").to_path_buf(),
        ];
        
        // Check if at least one file exists
        if file_paths.iter().any(|p| p.exists()) {
            let existing_paths: Vec<_> = file_paths.into_iter().filter(|p| p.exists()).collect();
            let parser = ClearViewDailyParser::new(existing_paths.clone());
            
            match parser.process() {
                Ok(pivot_table) => {
                    println!("Multiple Daily Parser Success!");
                    println!("Processed {} files", existing_paths.len());
                    println!("Total Gross: {:.2}", pivot_table.total_gross);
                    println!("Total Fee: {:.2}", pivot_table.total_fee);
                    println!("Total Net: {:.2}", pivot_table.total_net);
                    println!("Number of rows: {}", pivot_table.rows.len());
                    assert!(pivot_table.rows.len() > 0);
                },
                Err(e) => {
                    panic!("Failed to process Clear View daily files: {:?}", e);
                }
            }
        } else {
            println!("Test files not found, skipping test");
        }
    }
}