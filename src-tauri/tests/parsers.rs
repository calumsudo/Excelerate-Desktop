use excelerate_lib::parsers::{
    BaseParser, BhbParser, ClearViewDailyParser, EfinParser, InAdvParser, KingsParser,
};
use std::path::PathBuf;

fn fixtures() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures")
}

// --- BHB ---

#[test]
fn bhb_processes_csv_fixture() {
    let path = fixtures().join("bhb.csv");
    let pivot = BhbParser::new().process(&path).expect("bhb parse failed");
    // 2 data rows + 1 totals row
    assert_eq!(pivot.rows.len(), 3);
    assert!((pivot.total_gross - 1500.0).abs() < 0.01);
    assert!((pivot.total_fee - 45.0).abs() < 0.01);
    assert!((pivot.total_net - 1455.0).abs() < 0.01);
}

#[test]
fn bhb_rejects_wrong_columns() {
    // Kings CSV has no "Deal Id" column; BHB process_row will error on first row
    let path = fixtures().join("kings.csv");
    let result = BhbParser::new().process(&path);
    assert!(result.is_err(), "expected error with wrong-column CSV");
}

// --- Kings ---

#[test]
fn kings_processes_csv_fixture() {
    let path = fixtures().join("kings.csv");
    let pivot = KingsParser::new()
        .process(&path)
        .expect("kings parse failed");
    // 2 data rows + 1 totals row
    assert_eq!(pivot.rows.len(), 3);
    assert!((pivot.total_gross - 133.49).abs() < 0.01);
    assert!((pivot.total_fee - 4.00).abs() < 0.01);
    assert!((pivot.total_net - 129.49).abs() < 0.01);
}

// --- eFin ---

#[test]
fn efin_processes_csv_fixture() {
    let path = fixtures().join("efin.csv");
    let pivot = EfinParser::new().process(&path).expect("efin parse failed");
    // 2 data rows + 1 totals row
    assert_eq!(pivot.rows.len(), 3);
    assert!((pivot.total_gross - 1500.0).abs() < 0.01);
    assert!((pivot.total_fee - 45.0).abs() < 0.01);
    assert!((pivot.total_net - 1455.0).abs() < 0.01);
}

#[test]
fn efin_skips_empty_advance_id() {
    // A row with an empty Advance ID should be silently skipped
    let tmp = std::env::temp_dir().join("efin_empty_id.csv");
    std::fs::write(
        &tmp,
        "Funding Date,Advance ID,Business Name,Advance Status,Payable Amt (Gross),Servicing Fee $,Payable Amt (Net),Payable Status\n\
         2024-01-01,,Ghost Inc,Active,100.00,3.00,97.00,Cleared\n\
         2024-01-01,ADV999,Real Co,Active,200.00,6.00,194.00,Cleared\n",
    )
    .unwrap();
    let pivot = EfinParser::new()
        .process(&tmp)
        .expect("efin empty id parse failed");
    std::fs::remove_file(tmp).ok();
    assert_eq!(pivot.rows.len(), 2); // 1 valid + 1 totals
    assert!((pivot.total_gross - 200.0).abs() < 0.01);
}

// --- InAdv ---

#[test]
fn inadv_processes_csv_fixture() {
    let path = fixtures().join("inadv.csv");
    let pivot = InAdvParser::new()
        .process(&path)
        .expect("inadv parse failed");
    // 2 Cleared rows + 1 totals; Pending row skipped
    assert_eq!(pivot.rows.len(), 3);
    assert!((pivot.total_gross - 1500.0).abs() < 0.01);
    assert!((pivot.total_fee - 45.0).abs() < 0.01);
    assert!((pivot.total_net - 1455.0).abs() < 0.01);
}

#[test]
fn inadv_skips_non_cleared_rows() {
    let tmp = std::env::temp_dir().join("inadv_pending.csv");
    std::fs::write(
        &tmp,
        "Status,Mgmt Fee,Advance Id,Amount,Gross Amount,Contact ID\n\
         Pending,10.00,11111,90.00,100.00,MERCH_X\n",
    )
    .unwrap();
    let pivot = InAdvParser::new()
        .process(&tmp)
        .expect("inadv pending parse failed");
    std::fs::remove_file(tmp).ok();
    // Only totals row (zero data rows)
    assert_eq!(pivot.rows.len(), 1);
    assert_eq!(pivot.total_gross, 0.0);
}

// --- ClearView Daily ---

#[test]
fn clearview_daily_processes_csv_fixture() {
    let path = fixtures().join("clearview_daily.csv");
    let parser = ClearViewDailyParser::from_single(&path);
    let pivot = parser.process().expect("clearview daily parse failed");
    // 3 advance IDs + 1 totals row
    assert_eq!(pivot.rows.len(), 4);
    assert!((pivot.total_gross - 1750.0).abs() < 0.01);
    assert!((pivot.total_net - 1697.5).abs() < 0.01);
}

#[test]
fn clearview_daily_skips_zero_amount_rows() {
    let tmp = std::env::temp_dir().join("clearview_zero.csv");
    std::fs::write(
        &tmp,
        "AdvanceID,Advance Status,Syn Gross Amount,Syn Net Amount\n\
         ADV001,Active,0.00,0.00\n\
         ADV002,Active,100.00,97.00\n",
    )
    .unwrap();
    let parser = ClearViewDailyParser::from_single(&tmp);
    let pivot = parser.process().expect("clearview zero parse failed");
    std::fs::remove_file(tmp).ok();
    assert_eq!(pivot.rows.len(), 2); // 1 valid + 1 totals
    assert!((pivot.total_gross - 100.0).abs() < 0.01);
}
