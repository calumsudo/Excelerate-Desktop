#[cfg(test)]
mod tests {
    use std::path::Path;
    use crate::parsers::{BigParser, BaseParser};

    #[test]
    fn test_big_parser() {
        let file_path = Path::new("../examples/BIG-AL 09-05-25.xlsx");
        
        if !file_path.exists() {
            println!("Test file not found at: {:?}", file_path);
            return;
        }
        
        let parser = BigParser::new();
        
        println!("Testing BIG parser with file: {:?}", file_path);
        
        match parser.process(file_path) {
            Ok(pivot_table) => {
                println!("Successfully parsed BIG file!");
                println!("Total rows: {}", pivot_table.rows.len());
                println!("Total Gross: ${:.2}", pivot_table.total_gross);
                println!("Total Fees: ${:.2}", pivot_table.total_fee);
                println!("Total Net: ${:.2}", pivot_table.total_net);
                
                // Print first few rows
                println!("\nFirst 5 rows:");
                for (i, row) in pivot_table.rows.iter().take(5).enumerate() {
                    println!("  {}. {} - {} : ${:.2}", 
                        i + 1, 
                        row.advance_id, 
                        row.merchant_name,
                        row.sum_of_syn_net_amount
                    );
                }
                
                // Basic assertions
                assert!(pivot_table.rows.len() > 0, "Should have at least one row");
                assert!(pivot_table.total_net != 0.0, "Total net should not be zero");
            },
            Err(e) => {
                panic!("Error parsing BIG file: {}", e);
            }
        }
    }
}