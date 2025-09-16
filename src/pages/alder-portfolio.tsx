import { useState, useEffect } from 'react';
import { DateValue } from '@internationalized/date';
import BasePortfolio from '@components/portfolio/base-portfolio';
import { FunderData } from '@components/portfolio/funder-upload-section';
import FileService from '@services/file-service';

function AlderPortfolio() {
  // State for tracking uploaded funder files (optional)
  const [weeklyFiles, setWeeklyFiles] = useState<Record<string, File>>({});
  const [monthlyFiles, setMonthlyFiles] = useState<Record<string, File>>({});
  const [existingWorkbook, setExistingWorkbook] = useState<File | null>(null);

  // Check for existing workbook on component mount
  useEffect(() => {
    const checkForExistingWorkbook = async () => {
      const workbookInfo = await FileService.getExistingWorkbookInfo('Alder');
      if (workbookInfo) {
        // Create a File object to represent the existing file
        // Note: We can't read the actual file content from the path in the browser
        // but we can display the file info
        const file = new File([], workbookInfo.fileName, {
          type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        });
        // Add size property to match the actual file size
        Object.defineProperty(file, 'size', {
          value: workbookInfo.fileSize,
          writable: false
        });
        setExistingWorkbook(file);
      }
    };

    checkForExistingWorkbook();
  }, []);

  // Define your funders for weekly uploads
  const weeklyFunders: FunderData[] = [
    {
      name: "BHB",
      acceptedTypes: [
        'text/csv'
      ],
      acceptedExtensions: ['.csv'],
      maxSizeKB: 5120 // 5MB
    }
  ];

  // Define your funders for monthly uploads
  const monthlyFunders: FunderData[] = [
    {
      name: "Monthly Funder Gamma",
      acceptedTypes: [
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      ],
      acceptedExtensions: ['.xlsx'],
      maxSizeKB: 15360 // 15MB
    }
  ];

  const handleDateChange = (date: DateValue | null) => {
    console.log('Alder Portfolio - Date selected:', date?.toString());
    // Add your date handling logic here
  };

  const handleFileUpload = async (file: File) => {
    console.log('Alder Portfolio - File uploaded:', file.name);
    
    try {
      const response = await FileService.savePortfolioWorkbook('Alder', file);
      
      if (response.success) {
        console.log('Workbook saved successfully:', response.file_path);
        // You can add a toast notification or other UI feedback here
      } else {
        console.error('Failed to save workbook:', response.message);
      }
    } catch (error) {
      console.error('Error saving workbook:', error);
      // Handle error - show user notification
    }
  };

  // Handle weekly funder file uploads
  const handleWeeklyFunderUpload = (funderName: string, file: File) => {
    console.log(`Alder Portfolio - Weekly upload for ${funderName}:`, file.name);
    setWeeklyFiles(prev => ({ ...prev, [funderName]: file }));
    // Add your weekly funder file processing logic here
  };

  // Handle monthly funder file uploads
  const handleMonthlyFunderUpload = (funderName: string, file: File) => {
    console.log(`Alder Portfolio - Monthly upload for ${funderName}:`, file.name);
    setMonthlyFiles(prev => ({ ...prev, [funderName]: file }));
    // Add your monthly funder file processing logic here
  };

  // Handle clearing weekly funder files
  const handleWeeklyClearFile = (funderName: string) => {
    console.log(`Alder Portfolio - Clearing weekly file for ${funderName}`);
    setWeeklyFiles(prev => {
      const updated = { ...prev };
      delete updated[funderName];
      return updated;
    });
  };

  // Handle clearing monthly funder files
  const handleMonthlyClearFile = (funderName: string) => {
    console.log(`Alder Portfolio - Clearing monthly file for ${funderName}`);
    setMonthlyFiles(prev => {
      const updated = { ...prev };
      delete updated[funderName];
      return updated;
    });
  };

  return (
    <BasePortfolio
      portfolioName="Alder"
      onDateChange={handleDateChange}
      onFileUpload={handleFileUpload}
      weeklyFunders={weeklyFunders}
      monthlyFunders={monthlyFunders}
      onWeeklyFunderUpload={handleWeeklyFunderUpload}
      onMonthlyFunderUpload={handleMonthlyFunderUpload}
      onWeeklyClearFile={handleWeeklyClearFile}
      onMonthlyClearFile={handleMonthlyClearFile}
      weeklyUploadedFiles={weeklyFiles}
      monthlyUploadedFiles={monthlyFiles}
      existingWorkbookFile={existingWorkbook}
    />
  );
}

export default AlderPortfolio;