import { loadPyodide, PyodideInterface } from "pyodide";
import { invoke } from "@tauri-apps/api/core";
import { save } from "@tauri-apps/plugin-dialog";
import { downloadDir } from "@tauri-apps/api/path";
import { readFile, writeFile } from "@tauri-apps/plugin-fs";

interface PivotTableData {
  advance_id: string;
  merchant_name: string;
  gross_amount: number;
  management_fee: number;
  net_amount: number;
}

interface FunderPivotData {
  funder_name: string;
  sheet_name: string;
  pivot_data: PivotTableData[];
  file_path: string;
}

export interface UnmatchedDealFromUpdate {
  funder_name: string;
  sheet_name: string;
  advance_id: string;
  merchant_name: string;
  gross_amount: number;
  management_fee: number;
  net_amount: number;
}

export interface DuplicateConflictFromUpdate {
  funder_name: string;
  sheet_name: string;
  advance_id: string;
  internal_advance_id: string;
  merchant_name: string;
  date_funded: string;
  row_index: number;
  net_amount: number;
  match_count: number;
}

export interface UpdateWorkbookResult {
  filePath: string;
  unmatchedDeals: UnmatchedDealFromUpdate[];
  duplicateConflicts: DuplicateConflictFromUpdate[];
}

// Singleton instance of Pyodide
let pyodideInstance: PyodideInterface | null = null;
let isInitializing = false;
let initPromise: Promise<PyodideInterface> | null = null;

export class PyodideService {
  /**
   * Initialize Pyodide and load required packages
   * This is a singleton - will only initialize once
   */
  static async initialize(): Promise<PyodideInterface> {
    // If already initialized, return existing instance
    if (pyodideInstance) {
      return pyodideInstance;
    }

    // If currently initializing, wait for it
    if (isInitializing && initPromise) {
      return initPromise;
    }

    // Start initialization
    isInitializing = true;
    console.warn("Initializing Pyodide...");

    initPromise = (async () => {
      try {
        // Load Pyodide with the official CDN
        const pyodide = await loadPyodide({
          indexURL: "https://cdn.jsdelivr.net/pyodide/v0.28.3/full/",
        });

        console.warn("Pyodide loaded, installing packages...");

        // Load micropip to install pure Python packages
        await pyodide.loadPackage(["micropip"]);
        const micropip = pyodide.pyimport("micropip");

        // Install openpyxl and its dependencies
        console.warn("Installing openpyxl via micropip...");
        await micropip.install(["openpyxl", "et-xmlfile"]);
        console.warn("openpyxl package installed successfully");

        // Store the instance
        pyodideInstance = pyodide;
        isInitializing = false;

        return pyodide;
      } catch (error) {
        isInitializing = false;
        initPromise = null;
        console.error("Failed to initialize Pyodide:", error);
        throw error;
      }
    })();

    return initPromise;
  }

  /**
   * Update portfolio workbook with Net RTR values using Pyodide and openpyxl
   * Returns the file path and any unmatched deals found during processing
   */
  static async updatePortfolioWorkbookWithNetRtr(
    portfolioName: string,
    reportDate: string
  ): Promise<UpdateWorkbookResult> {
    try {
      console.warn(`Starting Pyodide-based Excel update for ${portfolioName} on ${reportDate}`);

      // Initialize Pyodide if not already done
      const pyodide = await this.initialize();

      // Get the active workbook path from backend
      const workbookPath = await invoke<string>("get_active_workbook_path", {
        portfolioName,
      });

      console.warn(`Loading workbook from: ${workbookPath}`);

      // Get pivot table data from backend
      const pivotTables = await invoke<FunderPivotData[]>("get_pivot_tables_for_update", {
        portfolioName,
        reportDate,
      });

      if (pivotTables.length === 0) {
        throw new Error("No pivot tables found for the specified date");
      }

      console.warn(`Found ${pivotTables.length} pivot tables to process`);

      // Read the workbook file
      console.warn(`Reading workbook file from: ${workbookPath}`);
      const fileData = await readFile(workbookPath);

      // Convert to Uint8Array if needed
      const uint8Array = new Uint8Array(fileData);

      // Verify the input file is a valid Excel file
      if (uint8Array[0] === 0x50 && uint8Array[1] === 0x4b) {
        console.warn("Input file header verified: Valid Excel/ZIP format");
      } else {
        console.error(
          "Warning: Input file may not be a valid Excel file. Header bytes:",
          uint8Array[0],
          uint8Array[1]
        );
      }

      console.warn(`Input file size: ${uint8Array.byteLength} bytes`);

      // Pass the Uint8Array directly to Python globals
      pyodide.globals.set("workbook_array", uint8Array);
      pyodide.globals.set("pivot_tables_json", JSON.stringify(pivotTables));
      pyodide.globals.set("report_date", reportDate);

      // Python code to update the workbook
      const pythonCode = `
import json
import io
from openpyxl import load_workbook
from datetime import datetime
from copy import copy

# Parse the pivot tables data
pivot_tables = json.loads(pivot_tables_json)

# Track unmatched deals and duplicate-id conflicts across all funders
all_unmatched_deals = []
all_duplicate_conflicts = []

# Convert JavaScript Uint8Array to Python bytes
workbook_bytes = bytes(workbook_array.to_py())
print(f"Received workbook bytes, size: {len(workbook_bytes)}")

# Verify the file starts with ZIP header (Excel files are ZIP archives)
if workbook_bytes[:2] != b'PK':
    raise ValueError(f"Invalid Excel file: Does not start with ZIP header. Got: {workbook_bytes[:2].hex()}")

# Load the workbook from bytes - with more conservative settings
try:
    # Try loading with different settings for better compatibility
    wb = load_workbook(io.BytesIO(workbook_bytes), keep_vba=False, data_only=False, keep_links=False)
    print(f"Workbook loaded successfully with {len(wb.sheetnames)} sheets: {wb.sheetnames}")
except Exception as e:
    print(f"Error loading workbook: {e}")
    raise

# Generate Net RTR column header
def generate_net_rtr_column(date_str):
    """Generate the Net RTR column name based on the report date"""
    # Parse the date string
    if '-' in date_str:
        # Handle YYYY-MM-DD format
        parts = date_str.split('-')
        year, month, day = int(parts[0]), int(parts[1]), int(parts[2])
    elif '/' in date_str:
        # Handle MM/DD/YYYY format
        parts = date_str.split('/')
        month, day, year = int(parts[0]), int(parts[1]), int(parts[2])
    else:
        raise ValueError(f"Unsupported date format: {date_str}")

    # For years 2000 and above, use two-digit year format
    if year >= 2000:
        two_digit_year = str(year)[-2:]  # Get last 2 digits (e.g., 2026 -> 26)
        return f"Net RTR {month}/{day}/{two_digit_year}"
    else:
        # For older dates, include the full two-digit year
        return f"Net RTR {month}/{day}/{str(year).zfill(2)}"

# Generate the column header
net_rtr_column = generate_net_rtr_column(report_date)
print(f"Net RTR column name: {net_rtr_column}")

# Process each funder's pivot table
for funder_pivot in pivot_tables:
    funder_name = funder_pivot['funder_name']
    sheet_name = funder_pivot['sheet_name']
    pivot_data = funder_pivot['pivot_data']
    
    print(f"Processing {funder_name} ({sheet_name})")
    
    # Check if the sheet exists
    if sheet_name not in wb.sheetnames:
        print(f"Sheet {sheet_name} not found, skipping")
        continue
    
    ws = wb[sheet_name]
    
    # Create a mapping of advance IDs to net amounts
    net_amount_map = {}
    for row in pivot_data:
        if row['advance_id'] != 'Totals':
            net_amount_map[row['advance_id']] = row['net_amount']
    
    print(f"Processing {len(net_amount_map)} advance IDs")
    
    # Find or add the Net RTR column
    # Row 2 contains headers
    header_row = 2
    net_rtr_col = None
    
    # First, find all existing Net RTR columns to determine where to place the new one
    net_rtr_columns = []
    last_net_rtr_col = 0
    last_data_col = 1
    
    # Scan headers to find existing Net RTR columns and last data column
    # Search all columns, no artificial limit
    for col in range(1, ws.max_column + 1):
        cell = ws.cell(row=header_row, column=col)
        if cell.value:
            cell_value_str = str(cell.value).strip()
            # Track any column with data
            if cell_value_str != '':
                last_data_col = col
            # Check if this is a Net RTR column
            if cell_value_str.startswith('Net RTR'):
                net_rtr_columns.append((col, cell_value_str))
                last_net_rtr_col = max(last_net_rtr_col, col)
                # Check if this is our specific date
                if cell_value_str == net_rtr_column:
                    net_rtr_col = col
                    print(f"Found existing Net RTR column '{net_rtr_column}' at column {col}")
    
    print(f"Found {len(net_rtr_columns)} existing Net RTR columns")
    if net_rtr_columns:
        print(f"Existing Net RTR columns: {net_rtr_columns[:5]}...")  # Show first 5
        print(f"Last Net RTR column is at position {last_net_rtr_col}")
    
    # If we found the column, clear its existing data (except headers in rows 1-2)
    if net_rtr_col is not None:
        print(f"Clearing existing data in column {net_rtr_col} for '{net_rtr_column}'")
        # Clear all data below row 2
        for row in range(3, ws.max_row + 1):
            cell = ws.cell(row=row, column=net_rtr_col)
            cell.value = None
    else:
        # Column not found - place chronologically among existing Net RTR headers,
        # ignoring stale/unparseable outliers so column order tracks date order.
        def parse_net_rtr_date(header):
            if not header.startswith('Net RTR '):
                return None
            parts = header[len('Net RTR '):].strip().split('/')
            if len(parts) != 3:
                return None
            try:
                mm, dd, yy = int(parts[0]), int(parts[1]), int(parts[2])
                if yy < 100:
                    yy += 2000
                return datetime(yy, mm, dd)
            except (ValueError, TypeError):
                return None

        date_parts = report_date.split('-')
        new_date = datetime(int(date_parts[0]), int(date_parts[1]), int(date_parts[2]))

        dated_cols = [(c, parse_net_rtr_date(h)) for c, h in net_rtr_columns]
        dated_cols = [(c, d) for c, d in dated_cols if d is not None]
        older = [(c, d) for c, d in dated_cols if d < new_date]
        newer = [(c, d) for c, d in dated_cols if d > new_date]

        if older:
            anchor_col, anchor_date = max(older, key=lambda x: x[1])
            net_rtr_col = anchor_col + 1
            print(f"Placing after latest-older Net RTR col {anchor_col} ({anchor_date.strftime('%m/%d/%Y')}) at {net_rtr_col}")
        elif newer:
            anchor_col, anchor_date = min(newer, key=lambda x: x[1])
            net_rtr_col = anchor_col
            print(f"Placing before earliest-newer Net RTR col {anchor_col} ({anchor_date.strftime('%m/%d/%Y')}) at {net_rtr_col}")
        elif last_net_rtr_col > 0:
            net_rtr_col = last_net_rtr_col + 1
            print(f"No parseable Net RTR dates; placing after last Net RTR col at {net_rtr_col}")
        else:
            net_rtr_col = last_data_col + 1
            print(f"No Net RTR columns; placing after last data col at {net_rtr_col}")

        ws.insert_cols(net_rtr_col)
        print(f"Inserted new column at position {net_rtr_col}")

        # Set the header for the new column
        ws.cell(row=header_row, column=net_rtr_col, value=net_rtr_column)

        # Copy formatting from the previous column header if available (without using deprecated .copy())
        if net_rtr_col > 1:
            prev_header = ws.cell(row=header_row, column=net_rtr_col - 1)
            new_header = ws.cell(row=header_row, column=net_rtr_col)
            if prev_header.font:
                new_header.font = copy(prev_header.font)
            if prev_header.fill:
                new_header.fill = copy(prev_header.fill)
            if prev_header.border:
                new_header.border = copy(prev_header.border)
            if prev_header.alignment:
                new_header.alignment = copy(prev_header.alignment)
    
    print(f"Using column {net_rtr_col} for Net RTR")
    
    # Update data rows starting from row 3
    updates_count = 0
    matched_ids = []
    worksheet_ids = []
    
    # Show summary of what we're processing
    print(f"Total advance IDs to process: {len(net_amount_map)}")
    
    # Check what column actually has the Funder Advance ID (might not be column 5)
    # Look for "Funder Advance ID" header in row 2
    funder_advance_col = None
    for col in range(1, min(ws.max_column + 1, 20)):
        header_cell = ws.cell(row=header_row, column=col)
        if header_cell.value and "Funder Advance ID" in str(header_cell.value):
            funder_advance_col = col
            print(f"Found 'Funder Advance ID' header in column {col}")
            break
    
    # Fall back to column 5 if not found
    if funder_advance_col is None:
        funder_advance_col = 5
        print(f"Using default column 5 for Funder Advance ID")
    
    # First pass: bucket Funder Advance ID -> [row_idx, ...] so we can detect duplicates
    # before writing anything. If one funder id maps to multiple workbook rows (e.g. an
    # original deal + an add-on tracked as a separate position), writing the same Net
    # RTR to each row would double-count in the column total, so we skip those and
    # surface them for human reconciliation instead.
    id_row_map = {}
    for row_idx in range(3, min(ws.max_row + 1, 1000)):
        funder_advance_id_cell = ws.cell(row=row_idx, column=funder_advance_col)
        if funder_advance_id_cell.value:
            funder_advance_id = str(funder_advance_id_cell.value).strip()
            worksheet_ids.append(funder_advance_id)
            if funder_advance_id in net_amount_map:
                id_row_map.setdefault(funder_advance_id, []).append(row_idx)

    duplicate_advance_ids = set()
    for fid, row_indices in id_row_map.items():
        net_amount = net_amount_map[fid]
        if len(row_indices) > 1:
            duplicate_advance_ids.add(fid)
            for r_idx in row_indices:
                date_val = ws.cell(row=r_idx, column=1).value
                if hasattr(date_val, 'isoformat'):
                    date_str = date_val.isoformat()
                elif date_val is None:
                    date_str = ''
                else:
                    date_str = str(date_val)
                all_duplicate_conflicts.append({
                    'funder_name': funder_name,
                    'sheet_name': sheet_name,
                    'advance_id': fid,
                    'internal_advance_id': str(ws.cell(row=r_idx, column=4).value or ''),
                    'merchant_name': str(ws.cell(row=r_idx, column=2).value or ''),
                    'date_funded': date_str,
                    'row_index': r_idx,
                    'net_amount': net_amount,
                    'match_count': len(row_indices),
                })
            continue

        row_idx = row_indices[0]
        matched_ids.append(fid)
        net_rtr_cell = ws.cell(row=row_idx, column=net_rtr_col, value=net_amount)
        net_rtr_cell.number_format = '$#,##0.00'
        ref_col = max(7, min(net_rtr_col - 1, last_data_col))
        ref_cell = ws.cell(row=row_idx, column=ref_col)
        if ref_cell.font:
            net_rtr_cell.font = copy(ref_cell.font)
        if ref_cell.fill:
            net_rtr_cell.fill = copy(ref_cell.fill)
        if ref_cell.border:
            net_rtr_cell.border = copy(ref_cell.border)
        if ref_cell.alignment:
            net_rtr_cell.alignment = copy(ref_cell.alignment)
        updates_count += 1

    print(f"Updated {updates_count} rows with Net RTR values")
    if duplicate_advance_ids:
        print(f"WARNING: {len(duplicate_advance_ids)} advance IDs appeared on multiple rows; skipped writing and flagged for reconciliation:")
        for fid in list(duplicate_advance_ids)[:10]:
            print(f"  - {fid}")

    # Find unmatched deals - advance IDs from pivot that weren't matched in worksheet.
    # Exclude duplicates: they DID appear in the workbook but were skipped pending reconciliation,
    # so they belong in the duplicates list, not the unmatched list.
    unmatched_advance_ids = set(net_amount_map.keys()) - set(matched_ids) - duplicate_advance_ids

    if unmatched_advance_ids:
        print(f"WARNING: {len(unmatched_advance_ids)} advance IDs from pivot table were not found in worksheet:")
        for advance_id in list(unmatched_advance_ids)[:10]:  # Show first 10
            print(f"  - {advance_id}")

        # Add to global unmatched list with full deal details
        for row in pivot_data:
            if row['advance_id'] in unmatched_advance_ids:
                all_unmatched_deals.append({
                    'funder_name': funder_name,
                    'sheet_name': sheet_name,
                    'advance_id': row['advance_id'],
                    'merchant_name': row['merchant_name'],
                    'gross_amount': row['gross_amount'],
                    'management_fee': row['management_fee'],
                    'net_amount': row['net_amount']
                })
    else:
        print(f"All {len(matched_ids)} advance IDs were successfully matched")

    # Ensure the worksheet knows about the new column by updating dimensions
    if net_rtr_col > ws.max_column:
        ws.max_column = net_rtr_col
    
    # Set column width for the Net RTR column
    col_letter = ws.cell(row=1, column=net_rtr_col).column_letter
    ws.column_dimensions[col_letter].width = 15
    
    # Recalculate worksheet dimensions
    # Note: calculate_dimension() doesn't take arguments in openpyxl
    dimensions = ws.calculate_dimension()

# Save the workbook to bytes
output = io.BytesIO()
wb.save(output)
output.seek(0)
updated_workbook_bytes = output.read()

print(f"Workbook updated successfully, size: {len(updated_workbook_bytes)} bytes")

# Verify the saved bytes start with ZIP header
if updated_workbook_bytes[:2] == b'PK':
    print("Python: Excel file has valid ZIP header")
    print(f"Python: First 10 bytes: {updated_workbook_bytes[:10].hex()}")
else:
    print(f"Python: WARNING - Invalid header: {updated_workbook_bytes[:2].hex()}")

# Test: Try saving the original workbook without modifications to see if that works
test_output = io.BytesIO()
wb_copy = load_workbook(io.BytesIO(workbook_bytes), keep_vba=False, data_only=False, keep_links=False)
wb_copy.save(test_output)
test_output.seek(0)
test_bytes = test_output.read()
print(f"Test: Original workbook resaved size: {len(test_bytes)} bytes, header: {test_bytes[:2].hex()}")

# Convert to base64 for safe transfer to JavaScript
import base64

# For debugging - also return the test bytes to see if resaving without changes works
debug_info = {
    'updated': base64.b64encode(updated_workbook_bytes).decode('utf-8'),
    'test': base64.b64encode(test_bytes).decode('utf-8'),
    'updated_size': len(updated_workbook_bytes),
    'test_size': len(test_bytes),
    'unmatched_deals': all_unmatched_deals,
    'unmatched_count': len(all_unmatched_deals),
    'duplicate_conflicts': all_duplicate_conflicts,
    'duplicate_count': len(all_duplicate_conflicts)
}
print(f"Updated workbook base64 length: {len(debug_info['updated'])}")
print(f"Test workbook base64 length: {len(debug_info['test'])}")
print(f"Total unmatched deals across all funders: {len(all_unmatched_deals)}")
print(f"Total duplicate-id conflicts across all funders: {len(all_duplicate_conflicts)}")

# Return as JSON string
import json
json.dumps(debug_info)
`;

      console.warn("Running Python code to update workbook...");
      const resultJson = await pyodide.runPythonAsync(pythonCode);

      // Parse the JSON response
      const result = JSON.parse(resultJson);
      console.warn("Updated workbook size:", result.updated_size);
      console.warn("Test workbook size:", result.test_size);
      console.warn("Unmatched deals found:", result.unmatched_count);
      console.warn("Duplicate-id conflicts found:", result.duplicate_count);

      const unmatchedDeals: UnmatchedDealFromUpdate[] = result.unmatched_deals || [];
      const duplicateConflicts: DuplicateConflictFromUpdate[] = result.duplicate_conflicts || [];

      // Convert base64 string to Uint8Array for the updated workbook
      const binaryString = atob(result.updated);
      console.warn("Binary string length:", binaryString.length);

      const updatedArray = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        updatedArray[i] = binaryString.charCodeAt(i);
      }
      console.warn("Workbook updated, size:", updatedArray.byteLength);

      // Also decode the test workbook for comparison
      const testBinaryString = atob(result.test);
      const testArray = new Uint8Array(testBinaryString.length);
      for (let i = 0; i < testBinaryString.length; i++) {
        testArray[i] = testBinaryString.charCodeAt(i);
      }
      console.warn("Test workbook (resaved original), size:", testArray.byteLength);

      // Verify the file starts with the correct Excel ZIP header (PK)
      if (updatedArray[0] === 0x50 && updatedArray[1] === 0x4b) {
        console.warn("File header verified: Valid Excel/ZIP format");
        console.warn(
          "First 10 bytes:",
          Array.from(updatedArray.slice(0, 10))
            .map((b) => b.toString(16).padStart(2, "0"))
            .join(" ")
        );
      } else {
        console.error(
          "Warning: File may be corrupted. Header bytes:",
          updatedArray[0],
          updatedArray[1]
        );
        console.error(
          "First 10 bytes:",
          Array.from(updatedArray.slice(0, 10))
            .map((b) => b.toString(16).padStart(2, "0"))
            .join(" ")
        );
      }

      // Create filename with date
      const dateStr = reportDate.replace(/\//g, "-");
      const defaultFilename = `${portfolioName}_Portfolio_Updated_${dateStr}.xlsx`;
      console.warn("Default filename:", defaultFilename);

      // Get the downloads directory path
      const downloadsPath = await downloadDir();

      // Open save dialog for user to choose location
      const filePath = await save({
        defaultPath: `${downloadsPath}/${defaultFilename}`,
        filters: [
          {
            name: "Excel",
            extensions: ["xlsx"],
          },
        ],
      });

      if (filePath) {
        // Write the file to the chosen location
        console.warn("Saving file to:", filePath);
        console.warn("Array type:", updatedArray.constructor.name);
        console.warn("Array length:", updatedArray.length);

        // Write the Uint8Array directly - this is what Tauri expects for binary files
        await writeFile(filePath, updatedArray);
        console.warn(`Successfully saved workbook to: ${filePath}`);

        // Verify the file was written correctly by reading it back
        try {
          const verifyData = await readFile(filePath);
          const verifyArray = new Uint8Array(verifyData);
          console.warn("Verification - File size after writing:", verifyArray.byteLength);
          console.warn(
            "Verification - First 10 bytes:",
            Array.from(verifyArray.slice(0, 10))
              .map((b) => b.toString(16).padStart(2, "0"))
              .join(" ")
          );
          if (verifyArray[0] === 0x50 && verifyArray[1] === 0x4b) {
            console.warn("Verification - File written correctly with valid Excel header");
          } else {
            console.error("Verification - File may be corrupted after writing");
            console.error(
              "Expected: 50 4b..., Got:",
              verifyArray[0]?.toString(16),
              verifyArray[1]?.toString(16)
            );
          }
        } catch (err) {
          console.error("Could not verify written file:", err);
        }

        return {
          filePath,
          unmatchedDeals,
          duplicateConflicts,
        };
      } else {
        console.warn("User cancelled save dialog");
        throw new Error("Save cancelled by user");
      }
    } catch (error) {
      console.error("Error updating portfolio workbook with Pyodide:", error);
      throw error;
    }
  }

  /**
   * Preload Pyodide for better performance
   * Call this on app startup or when idle
   */
  static async preload(): Promise<void> {
    try {
      await this.initialize();
      console.warn("Pyodide preloaded successfully");
    } catch (error) {
      console.error("Failed to preload Pyodide:", error);
    }
  }

  /**
   * Check if Pyodide is initialized
   */
  static isInitialized(): boolean {
    return pyodideInstance !== null;
  }

  /**
   * Get initialization progress for UI feedback
   */
  static isInitializing(): boolean {
    return isInitializing;
  }
}
