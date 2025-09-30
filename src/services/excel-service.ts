import * as XLSX from 'xlsx';
import { invoke } from '@tauri-apps/api/core';
import { save } from '@tauri-apps/plugin-dialog';
import { downloadDir } from '@tauri-apps/api/path';
import { readFile, writeFile } from '@tauri-apps/plugin-fs';

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

export class ExcelService {
  /**
   * Update portfolio workbook with Net RTR values
   */
  static async updatePortfolioWorkbookWithNetRtr(
    portfolioName: string,
    reportDate: string
  ): Promise<void> {
    try {
      console.log(`Starting Excel update for ${portfolioName} on ${reportDate}`);
      
      // Get the active workbook path from backend
      const workbookPath = await invoke<string>('get_active_workbook_path', {
        portfolioName
      });
      
      console.log(`Loading workbook from: ${workbookPath}`);
      
      // Get pivot table data from backend
      const pivotTables = await invoke<FunderPivotData[]>('get_pivot_tables_for_update', {
        portfolioName,
        reportDate
      });
      
      if (pivotTables.length === 0) {
        throw new Error('No pivot tables found for the specified date');
      }
      
      console.log(`Found ${pivotTables.length} pivot tables to process`);
      
      // Read the workbook file with style preservation
      console.log(`Reading workbook file from: ${workbookPath}`);
      const fileData = await readFile(workbookPath);
      const workbook = XLSX.read(new Uint8Array(fileData), { 
        type: 'array',
        cellStyles: true,  // Preserve cell styles
        cellFormula: true, // Preserve formulas
        cellDates: true,   // Preserve date formats
        sheetStubs: true   // Preserve empty cells
      });
      console.log('Workbook loaded successfully');
      
      // Generate Net RTR column header
      const netRtrColumn = this.generateNetRtrColumnName(reportDate);
      console.log(`Net RTR column name: ${netRtrColumn}`);
      
      // Process each funder's pivot table
      for (const funderPivot of pivotTables) {
        console.log(`Processing ${funderPivot.funder_name} (${funderPivot.sheet_name})`);
        
        // Get the worksheet
        const worksheet = workbook.Sheets[funderPivot.sheet_name];
        if (!worksheet) {
          console.warn(`Sheet ${funderPivot.sheet_name} not found, skipping`);
          continue;
        }
        
        // Update the worksheet with Net RTR values
        this.updateWorksheetWithNetRtr(
          worksheet,
          funderPivot.pivot_data,
          netRtrColumn
        );
      }
      
      // Generate the updated workbook with style preservation
      console.log('Generating updated workbook...');
      const wbout = XLSX.write(workbook, { 
        bookType: 'xlsx', 
        type: 'array',
        cellStyles: true,  // Preserve cell styles
        bookSST: true,     // Use shared string table for better compatibility
        compression: true  // Use compression for smaller file size
      });
      console.log('Workbook generated, size:', wbout.byteLength);
      
      // Create filename with date
      const dateStr = reportDate.replace(/\//g, '-');
      const defaultFilename = `${portfolioName}_Portfolio_Updated_${dateStr}.xlsx`;
      console.log('Default filename:', defaultFilename);
      
      // Get the downloads directory path
      const downloadsPath = await downloadDir();
      
      // Open save dialog for user to choose location
      const filePath = await save({
        defaultPath: `${downloadsPath}/${defaultFilename}`,
        filters: [{
          name: 'Excel',
          extensions: ['xlsx']
        }]
      });
      
      if (filePath) {
        // Write the file to the chosen location
        console.log('Saving file to:', filePath);
        await writeFile(filePath, wbout);
        console.log(`Successfully saved workbook to: ${filePath}`);
      } else {
        console.log('User cancelled save dialog');
        throw new Error('Save cancelled by user');
      }
      
    } catch (error) {
      console.error('Error updating portfolio workbook:', error);
      throw error;
    }
  }
  
  /**
   * Generate the Net RTR column name based on the report date
   */
  private static generateNetRtrColumnName(reportDate: string): string {
    console.log('Generating Net RTR column for date:', reportDate);
    
    let month: number, day: number, year: number;
    
    // Handle different date formats
    if (reportDate.includes('-')) {
      // Handle YYYY-MM-DD format
      const parts = reportDate.split('-');
      if (parts.length !== 3) {
        throw new Error(`Invalid date format: ${reportDate}`);
      }
      year = parseInt(parts[0], 10);
      month = parseInt(parts[1], 10);
      day = parseInt(parts[2], 10);
    } else if (reportDate.includes('/')) {
      // Handle MM/DD/YYYY format
      const parts = reportDate.split('/');
      if (parts.length !== 3) {
        throw new Error(`Invalid date format: ${reportDate}`);
      }
      month = parseInt(parts[0], 10);
      day = parseInt(parts[1], 10);
      year = parseInt(parts[2], 10);
    } else {
      throw new Error(`Unsupported date format: ${reportDate}`);
    }
    
    // Validate parsed values
    if (isNaN(month) || isNaN(day) || isNaN(year)) {
      throw new Error(`Invalid date values parsed from: ${reportDate}`);
    }
    
    // For 2025, include the year suffix
    if (year === 2025 || year === 25) {
      return `Net RTR ${month}/${day}/25`;
    } else if (year > 2000) {
      // For full years, use M/D format
      return `Net RTR ${month}/${day}`;
    } else {
      // For two-digit years, include them
      return `Net RTR ${month}/${day}/${String(year).padStart(2, '0')}`;
    }
  }
  
  /**
   * Update a worksheet with Net RTR values
   */
  private static updateWorksheetWithNetRtr(
    worksheet: XLSX.WorkSheet,
    pivotData: PivotTableData[],
    netRtrColumn: string
  ): void {
    // Get the range of the worksheet
    const range = XLSX.utils.decode_range(worksheet['!ref'] || 'A1');
    
    // Find or add the Net RTR column
    // Row 2 (index 1) contains headers
    let netRtrColIndex = -1;
    
    // Search for existing Net RTR column
    for (let col = 0; col <= range.e.c; col++) {
      const cellAddress = XLSX.utils.encode_cell({ r: 1, c: col });
      const cell = worksheet[cellAddress];
      if (cell && cell.v === netRtrColumn) {
        netRtrColIndex = col;
        break;
      }
    }
    
    // If not found, add it as a new column
    if (netRtrColIndex === -1) {
      netRtrColIndex = range.e.c + 1;
      range.e.c = netRtrColIndex; // Extend the range
      
      // Add the header with style if possible
      const headerAddress = XLSX.utils.encode_cell({ r: 1, c: netRtrColIndex });
      
      // Copy style from adjacent header cell if available
      const prevHeaderAddress = XLSX.utils.encode_cell({ r: 1, c: netRtrColIndex - 1 });
      const prevHeader = worksheet[prevHeaderAddress];
      
      if (prevHeader && prevHeader.s) {
        // Copy the style from the previous header
        worksheet[headerAddress] = { 
          t: 's', 
          v: netRtrColumn,
          s: prevHeader.s  // Copy the style
        };
      } else {
        worksheet[headerAddress] = { t: 's', v: netRtrColumn };
      }
    }
    
    console.log(`Using column ${XLSX.utils.encode_col(netRtrColIndex)} for Net RTR`);
    
    // Create a map of advance IDs to net amounts
    const netAmountMap = new Map<string, number>();
    for (const row of pivotData) {
      if (row.advance_id !== 'Totals') {
        netAmountMap.set(row.advance_id, row.net_amount);
      }
    }
    
    console.log(`Processing ${netAmountMap.size} advance IDs`);
    
    // Get a reference cell style for currency formatting if available
    let currencyStyle = null;
    // Try to find a cell with currency formatting (check column with financial data)
    for (let col = 6; col <= Math.min(range.e.c, 15); col++) {
      const sampleCell = worksheet[XLSX.utils.encode_cell({ r: 2, c: col })];
      if (sampleCell && sampleCell.z && sampleCell.z.includes('$')) {
        currencyStyle = sampleCell.s;
        break;
      }
    }
    
    // Update data rows starting from row 3 (index 2)
    let updatesCount = 0;
    for (let row = 2; row <= range.e.r; row++) {
      // Read the Funder Advance ID from column E (index 4)
      const funderAdvanceIdAddress = XLSX.utils.encode_cell({ r: row, c: 4 });
      const funderAdvanceIdCell = worksheet[funderAdvanceIdAddress];
      
      if (funderAdvanceIdCell && funderAdvanceIdCell.v) {
        const funderAdvanceId = String(funderAdvanceIdCell.v);
        
        // Check if we have a net amount for this advance ID
        if (netAmountMap.has(funderAdvanceId)) {
          const netAmount = netAmountMap.get(funderAdvanceId)!;
          
          // Write the Net RTR value with style if available
          const netRtrAddress = XLSX.utils.encode_cell({ r: row, c: netRtrColIndex });
          
          // Try to get style from the same row
          const styleRefAddress = XLSX.utils.encode_cell({ r: row, c: Math.max(6, netRtrColIndex - 1) });
          const styleRefCell = worksheet[styleRefAddress];
          
          const cellData: any = { 
            t: 'n', 
            v: netAmount,
            z: '$#,##0.00'  // Currency format
          };
          
          // Apply style if available
          if (currencyStyle) {
            cellData.s = currencyStyle;
          } else if (styleRefCell && styleRefCell.s) {
            cellData.s = styleRefCell.s;
          }
          
          worksheet[netRtrAddress] = cellData;
          
          updatesCount++;
        }
      }
    }
    
    // Update the worksheet range
    worksheet['!ref'] = XLSX.utils.encode_range(range);
    
    // Preserve column widths if they exist
    if (!worksheet['!cols']) {
      worksheet['!cols'] = [];
    }
    // Set width for the new column
    while (worksheet['!cols'].length <= netRtrColIndex) {
      worksheet['!cols'].push({ wch: 12 }); // Default width
    }
    worksheet['!cols'][netRtrColIndex] = { wch: 15 }; // Set Net RTR column width
    
    console.log(`Updated ${updatesCount} rows with Net RTR values`);
  }
}