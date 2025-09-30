import ExcelJS from 'exceljs';
import { Buffer } from 'buffer';
import { invoke } from '@tauri-apps/api/core';
import { save } from '@tauri-apps/plugin-dialog';
import { downloadDir } from '@tauri-apps/api/path';
import { readFile, writeFile } from '@tauri-apps/plugin-fs';

// Make Buffer available globally for ExcelJS
(window as any).Buffer = Buffer;

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

export class ExcelServiceExcelJS {
  /**
   * Update portfolio workbook with Net RTR values using ExcelJS
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
      
      // Read the workbook file using ExcelJS
      console.log(`Reading workbook file from: ${workbookPath}`);
      const fileData = await readFile(workbookPath);
      
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(Buffer.from(fileData));
      console.log('Workbook loaded successfully with ExcelJS');
      
      // Generate Net RTR column header
      const netRtrColumn = this.generateNetRtrColumnName(reportDate);
      console.log(`Net RTR column name: ${netRtrColumn}`);
      
      // Process each funder's pivot table
      for (const funderPivot of pivotTables) {
        console.log(`Processing ${funderPivot.funder_name} (${funderPivot.sheet_name})`);
        
        // Get the worksheet
        const worksheet = workbook.getWorksheet(funderPivot.sheet_name);
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
      
      // Generate the updated workbook
      console.log('Generating updated workbook...');
      const buffer = await workbook.xlsx.writeBuffer();
      const wbout = new Uint8Array(buffer);
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
   * Update a worksheet with Net RTR values using ExcelJS
   */
  private static updateWorksheetWithNetRtr(
    worksheet: ExcelJS.Worksheet,
    pivotData: PivotTableData[],
    netRtrColumn: string
  ): void {
    // Find or add the Net RTR column
    const headerRow = worksheet.getRow(2);
    let netRtrColIndex = 0;
    
    // Search for existing Net RTR column
    headerRow.eachCell({ includeEmpty: false }, (cell, colNumber) => {
      if (cell.value === netRtrColumn) {
        netRtrColIndex = colNumber;
      }
    });
    
    // If not found, add it as a new column
    if (netRtrColIndex === 0) {
      // Find the last column with data in row 2
      let lastCol = 0;
      headerRow.eachCell({ includeEmpty: false }, (_cell, colNumber) => {
        if (colNumber > lastCol) lastCol = colNumber;
      });
      
      netRtrColIndex = lastCol + 1;
      
      // Add the header with the same formatting as other headers
      const newHeaderCell = headerRow.getCell(netRtrColIndex);
      newHeaderCell.value = netRtrColumn;
      
      // Copy formatting from the previous column header if it exists
      if (lastCol > 0) {
        const prevHeaderCell = headerRow.getCell(lastCol);
        newHeaderCell.style = { ...prevHeaderCell.style };
      }
    }
    
    console.log(`Using column ${netRtrColIndex} for Net RTR`);
    
    // Create a map of advance IDs to net amounts
    const netAmountMap = new Map<string, number>();
    for (const row of pivotData) {
      if (row.advance_id !== 'Totals') {
        netAmountMap.set(row.advance_id, row.net_amount);
      }
    }
    
    console.log(`Processing ${netAmountMap.size} advance IDs`);
    
    // Update data rows starting from row 3
    let updatesCount = 0;
    let rowNumber = 3;
    const maxRows = worksheet.rowCount;
    
    while (rowNumber <= maxRows) {
      const row = worksheet.getRow(rowNumber);
      
      // Read the Funder Advance ID from column E (column 5)
      const funderAdvanceIdCell = row.getCell(5);
      
      if (funderAdvanceIdCell.value) {
        const funderAdvanceId = String(funderAdvanceIdCell.value);
        
        // Check if we have a net amount for this advance ID
        if (netAmountMap.has(funderAdvanceId)) {
          const netAmount = netAmountMap.get(funderAdvanceId)!;
          
          // Write the Net RTR value
          const netRtrCell = row.getCell(netRtrColIndex);
          netRtrCell.value = netAmount;
          
          // Apply number formatting (currency)
          netRtrCell.numFmt = '$#,##0.00';
          
          // Copy formatting from other cells in the row if needed
          const prevCell = row.getCell(netRtrColIndex - 1);
          if (prevCell.style) {
            netRtrCell.style = { 
              ...prevCell.style,
              numFmt: '$#,##0.00'  // Ensure currency format
            };
          }
          
          updatesCount++;
        }
      }
      
      rowNumber++;
    }
    
    // Auto-fit the column width
    worksheet.getColumn(netRtrColIndex).width = 15;
    
    console.log(`Updated ${updatesCount} rows with Net RTR values`);
  }
}