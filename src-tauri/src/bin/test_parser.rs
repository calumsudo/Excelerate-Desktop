use std::path::Path;
use excelerate_lib::parsers::{BaseParser, BhbParser};

fn main() {
    let file_path = Path::new("/Users/calum/Excelerate/Alder/Funder Uploads/Weekly/BHB/2025-09-12.csv");
    
    println!("Testing BHB parser with file: {:?}", file_path);
    
    let parser = BhbParser::new();
    
    match parser.process(file_path) {
        Ok(pivot_table) => {
            println!("Success! Parsed {} rows", pivot_table.rows.len());
            println!("Total Gross: {:.2}", pivot_table.total_gross);
            println!("Total Fee: {:.2}", pivot_table.total_fee);
            println!("Total Net: {:.2}", pivot_table.total_net);
            
            // Print first few rows
            for (i, row) in pivot_table.rows.iter().take(5).enumerate() {
                println!("Row {}: {} - {} | Gross: {:.2} | Fee: {:.2} | Net: {:.2}",
                    i + 1,
                    row.advance_id,
                    row.merchant_name,
                    row.sum_of_syn_gross_amount,
                    row.total_servicing_fee,
                    row.sum_of_syn_net_amount
                );
            }
            
            // Try to generate CSV
            match pivot_table.to_csv_string() {
                Ok(csv) => {
                    println!("\nCSV generation successful!");
                    println!("First 500 chars of CSV:\n{}", &csv[..csv.len().min(500)]);
                },
                Err(e) => {
                    eprintln!("Failed to generate CSV: {}", e);
                }
            }
        },
        Err(e) => {
            eprintln!("Failed to parse file: {}", e);
        }
    }
}