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
    console.log("Initializing Pyodide...");

    initPromise = (async () => {
      try {
        // Load Pyodide with the official CDN
        const pyodide = await loadPyodide({
          indexURL: "https://cdn.jsdelivr.net/pyodide/v0.28.3/full/",
        });

        console.log("Pyodide loaded, installing packages...");

        // Load micropip to install pure Python packages
        await pyodide.loadPackage(["micropip"]);
        const micropip = pyodide.pyimport("micropip");

        // Install openpyxl and its dependencies
        console.log("Installing openpyxl via micropip...");
        await micropip.install(["openpyxl", "et-xmlfile"]);
        console.log("openpyxl package installed successfully");

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
   */
  static async updatePortfolioWorkbookWithNetRtr(
    portfolioName: string,
    reportDate: string
  ): Promise<void> {
    try {
      console.log(`Starting Pyodide-based Excel update for ${portfolioName} on ${reportDate}`);

      // Initialize Pyodide if not already done
      const pyodide = await this.initialize();

      // Get the active workbook path from backend
      const workbookPath = await invoke<string>("get_active_workbook_path", {
        portfolioName,
      });

      console.log(`Loading workbook from: ${workbookPath}`);

      // Get pivot table data from backend
      const pivotTables = await invoke<FunderPivotData[]>("get_pivot_tables_for_update", {
        portfolioName,
        reportDate,
      });

      if (pivotTables.length === 0) {
        throw new Error("No pivot tables found for the specified date");
      }

      console.log(`Found ${pivotTables.length} pivot tables to process`);

      // Read the workbook file
      console.log(`Reading workbook file from: ${workbookPath}`);
      const fileData = await readFile(workbookPath);

      // Convert to Uint8Array if needed
      const uint8Array = new Uint8Array(fileData);

      // Verify the input file is a valid Excel file
      if (uint8Array[0] === 0x50 && uint8Array[1] === 0x4b) {
        console.log("Input file header verified: Valid Excel/ZIP format");
      } else {
        console.error(
          "Warning: Input file may not be a valid Excel file. Header bytes:",
          uint8Array[0],
          uint8Array[1]
        );
      }

      console.log(`Input file size: ${uint8Array.byteLength} bytes`);

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
    
    # For 2025, include the year suffix
    if year == 2025 or year == 25:
        return f"Net RTR {month}/{day}/25"
    elif year > 2000:
        # For full years, use M/D format
        return f"Net RTR {month}/{day}"
    else:
        # For two-digit years, include them
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
        # Column not found - need to find where to place it
        # Try to find the previous Friday's column to place after it
        from datetime import datetime, timedelta
        
        # Parse the current date
        date_parts = report_date.split('-')
        if len(date_parts) == 3:
            current_date = datetime(int(date_parts[0]), int(date_parts[1]), int(date_parts[2]))
            
            # Look for previous Fridays (up to 4 weeks back)
            found_previous = False
            for weeks_back in range(1, 5):
                previous_friday = current_date - timedelta(days=7 * weeks_back)
                # Generate the column name for the previous Friday
                prev_col_name = f"Net RTR {previous_friday.month}/{previous_friday.day}/25"
                
                # Search for this column
                for col, col_name in net_rtr_columns:
                    if col_name == prev_col_name:
                        # Found a previous week - place new column right after it
                        net_rtr_col = col + 1
                        print(f"Found previous week column '{prev_col_name}' at {col}, placing new column at {net_rtr_col}")
                        found_previous = True
                        break
                
                if found_previous:
                    break
        
        # If no previous Friday found or date parsing failed, place after last Net RTR column
        if net_rtr_col is None:
            if last_net_rtr_col > 0:
                # Add after the last Net RTR column without any artificial cap
                net_rtr_col = last_net_rtr_col + 1
                print(f"Adding new Net RTR column at {net_rtr_col} (after last Net RTR)")
            else:
                # No Net RTR columns exist yet, add after last data column
                net_rtr_col = last_data_col + 1
                print(f"Adding first Net RTR column at {net_rtr_col} (after last data)")
        
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
    
    for row_idx in range(3, min(ws.max_row + 1, 1000)):  # Limit for safety
        # Read the Funder Advance ID from the identified column
        funder_advance_id_cell = ws.cell(row=row_idx, column=funder_advance_col)
        
        if funder_advance_id_cell.value:
            funder_advance_id = str(funder_advance_id_cell.value).strip()
            
            # Collect worksheet IDs for analysis
            worksheet_ids.append(funder_advance_id)
            
            # Check if we have a net amount for this advance ID
            if funder_advance_id in net_amount_map:
                net_amount = net_amount_map[funder_advance_id]
                matched_ids.append(funder_advance_id)
                
                # Write the Net RTR value
                net_rtr_cell = ws.cell(row=row_idx, column=net_rtr_col, value=net_amount)
                
                # Apply currency formatting
                net_rtr_cell.number_format = '$#,##0.00'
                
                # Copy formatting from a nearby financial cell if available (without using deprecated .copy())
                ref_col = max(7, min(net_rtr_col - 1, last_data_col))  # Use a reasonable reference column
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
    'test_size': len(test_bytes)
}
print(f"Updated workbook base64 length: {len(debug_info['updated'])}")
print(f"Test workbook base64 length: {len(debug_info['test'])}")

# Return as JSON string
import json
json.dumps(debug_info)
`;

      console.log("Running Python code to update workbook...");
      const resultJson = await pyodide.runPythonAsync(pythonCode);

      // Parse the JSON response
      const result = JSON.parse(resultJson);
      console.log("Updated workbook size:", result.updated_size);
      console.log("Test workbook size:", result.test_size);

      // Convert base64 string to Uint8Array for the updated workbook
      const binaryString = atob(result.updated);
      console.log("Binary string length:", binaryString.length);

      const updatedArray = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        updatedArray[i] = binaryString.charCodeAt(i);
      }
      console.log("Workbook updated, size:", updatedArray.byteLength);

      // Also decode the test workbook for comparison
      const testBinaryString = atob(result.test);
      const testArray = new Uint8Array(testBinaryString.length);
      for (let i = 0; i < testBinaryString.length; i++) {
        testArray[i] = testBinaryString.charCodeAt(i);
      }
      console.log("Test workbook (resaved original), size:", testArray.byteLength);

      // Verify the file starts with the correct Excel ZIP header (PK)
      if (updatedArray[0] === 0x50 && updatedArray[1] === 0x4b) {
        console.log("File header verified: Valid Excel/ZIP format");
        console.log(
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
      console.log("Default filename:", defaultFilename);

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
        console.log("Saving file to:", filePath);
        console.log("Array type:", updatedArray.constructor.name);
        console.log("Array length:", updatedArray.length);

        // Write the Uint8Array directly - this is what Tauri expects for binary files
        await writeFile(filePath, updatedArray);
        console.log(`Successfully saved workbook to: ${filePath}`);

        // Verify the file was written correctly by reading it back
        try {
          const verifyData = await readFile(filePath);
          const verifyArray = new Uint8Array(verifyData);
          console.log("Verification - File size after writing:", verifyArray.byteLength);
          console.log(
            "Verification - First 10 bytes:",
            Array.from(verifyArray.slice(0, 10))
              .map((b) => b.toString(16).padStart(2, "0"))
              .join(" ")
          );
          if (verifyArray[0] === 0x50 && verifyArray[1] === 0x4b) {
            console.log("Verification - File written correctly with valid Excel header");
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
      } else {
        console.log("User cancelled save dialog");
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
      console.log("Pyodide preloaded successfully");
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
