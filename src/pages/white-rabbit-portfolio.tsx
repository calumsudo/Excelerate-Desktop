import React, { useState } from 'react';
import { DateValue } from '@internationalized/date';
import BasePortfolio from '@components/portfolio/base-portfolio';
import { FunderData } from '@components/portfolio/funder-upload-section';

function WhiteRabbitPortfolio() {
  // State for tracking uploaded funder files (optional)
  const [weeklyFiles, setWeeklyFiles] = useState<Record<string, File>>({});
  const [monthlyFiles, setMonthlyFiles] = useState<Record<string, File>>({});

  // Define your funders for weekly uploads
  const weeklyFunders: FunderData[] = [
    {
      name: "Funder Alpha",
      acceptedTypes: [
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'application/vnd.ms-excel'
      ],
      acceptedExtensions: ['.xlsx', '.xls'],
      maxSizeKB: 5120 // 5MB
    },
    {
      name: "Funder Beta",
      acceptedTypes: [
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'application/pdf'
      ],
      acceptedExtensions: ['.xlsx', '.pdf'],
      maxSizeKB: 10240 // 10MB
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
    console.log('WhiteRabbit Portfolio - Date selected:', date?.toString());
    // Add your date handling logic here
  };

  const handleFileUpload = (file: File) => {
    console.log('WhiteRabbit Portfolio - File uploaded:', file.name);
    // Add your file processing logic here
    // You might want to read the Excel file, parse it, etc.
  };

  // Handle weekly funder file uploads
  const handleWeeklyFunderUpload = (funderName: string, file: File) => {
    console.log(`WhiteRabbit Portfolio - Weekly upload for ${funderName}:`, file.name);
    setWeeklyFiles(prev => ({ ...prev, [funderName]: file }));
    // Add your weekly funder file processing logic here
  };

  // Handle monthly funder file uploads
  const handleMonthlyFunderUpload = (funderName: string, file: File) => {
    console.log(`WhiteRabbit Portfolio - Monthly upload for ${funderName}:`, file.name);
    setMonthlyFiles(prev => ({ ...prev, [funderName]: file }));
    // Add your monthly funder file processing logic here
  };

  // Handle clearing weekly funder files
  const handleWeeklyClearFile = (funderName: string) => {
    console.log(`WhiteRabbit Portfolio - Clearing weekly file for ${funderName}`);
    setWeeklyFiles(prev => {
      const updated = { ...prev };
      delete updated[funderName];
      return updated;
    });
  };

  // Handle clearing monthly funder files
  const handleMonthlyClearFile = (funderName: string) => {
    console.log(`WhiteRabbit Portfolio - Clearing monthly file for ${funderName}`);
    setMonthlyFiles(prev => {
      const updated = { ...prev };
      delete updated[funderName];
      return updated;
    });
  };

  return (
    <BasePortfolio
      portfolioName="WhiteRabbit"
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
    />
  );
}

export default WhiteRabbitPortfolio;