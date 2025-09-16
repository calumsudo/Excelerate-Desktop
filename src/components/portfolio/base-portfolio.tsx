import React, { useState } from 'react';
import { DateValue } from '@internationalized/date';
import FridayDatePicker from '@components/date/friday-date-picker';
import FileUpload from './file-upload';
import FunderUploadSection, { FunderData } from './funder-upload-section';

interface BasePortfolioProps {
  portfolioName: string;
  onDateChange?: (date: DateValue | null) => void;
  onFileUpload?: (file: File) => void;
  weeklyFunders?: FunderData[];
  monthlyFunders?: FunderData[];
  onWeeklyFunderUpload?: (funderName: string, file: File) => void;
  onMonthlyFunderUpload?: (funderName: string, file: File) => void;
  onWeeklyClearFile?: (funderName: string) => void;
  onMonthlyClearFile?: (funderName: string) => void;
  weeklyUploadedFiles?: Record<string, File>;
  monthlyUploadedFiles?: Record<string, File>;
  existingWorkbookFile?: File | null;
  children?: React.ReactNode;
}

const BasePortfolio: React.FC<BasePortfolioProps> = ({
  portfolioName,
  onDateChange,
  onFileUpload,
  weeklyFunders,
  monthlyFunders,
  onWeeklyFunderUpload,
  onMonthlyFunderUpload,
  onWeeklyClearFile,
  onMonthlyClearFile,
  weeklyUploadedFiles,
  monthlyUploadedFiles,
  existingWorkbookFile,
  children
}) => {
  const [selectedFile, setSelectedFile] = useState<File | null>(existingWorkbookFile || null);

  // Update selected file when existingWorkbookFile changes
  React.useEffect(() => {
    if (existingWorkbookFile) {
      setSelectedFile(existingWorkbookFile);
    }
  }, [existingWorkbookFile]);

  // Handle main file upload
  const handleFileUpload = (file: File) => {
    setSelectedFile(file);
    onFileUpload?.(file);
  };

  // Clear file handlers
  const clearMainFile = () => setSelectedFile(null);

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-6xl mx-auto">
        {/* Portfolio Title */}
        <h1 className="text-3xl font-bold mb-4 text-foreground text-center">
          {portfolioName} Portfolio
        </h1>

        <div className="space-y-8">
          {/* Date Picker and Excel Upload Side by Side */}
          <div className="flex flex-row gap-6">
            {/* Friday Date Picker Section */}
            <div className="flex-1 bg-default-50 rounded-lg p-2 border border-default-200">
              <h2 className="text-xl font-semibold text-foreground">
                Select Report Date
              </h2>
              <FridayDatePicker
                label="Report Date (Friday)"
                description="Select the Friday date for this portfolio report"
                onDateChange={onDateChange}
              />
            </div>

            {/* Excel Upload Section */}
            <div className="flex-1 bg-default-50 rounded-lg p-2 border border-default-200">
              <h2 className="text-xl font-semibold text-foreground">
                {portfolioName} Portfolio Workbook Upload
              </h2>
              <FileUpload
                onFileUpload={handleFileUpload}
                selectedFile={selectedFile}
                onClearFile={clearMainFile}
                label="Click to upload portfolio workbook or drag and drop"
                description="Excel files only (.xlsx, .xls)"
                acceptedTypes={[
                  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                  'application/vnd.ms-excel'
                ]}
                acceptedExtensions={['.xlsx', '.xls']}
                maxSizeKB={10240}
                uploadId={`${portfolioName}-main-workbook`}
              />
            </div>
          </div>

          {/* Funder Upload Section */}
          {(weeklyFunders?.length || monthlyFunders?.length) && (
            <div className="bg-default-50 rounded-lg p-6 border border-default-200">
              <h2 className="text-2xl font-semibold mb-6 text-foreground text-center">
                Funder Upload
              </h2>
              
              <div className="space-y-6">
                {weeklyFunders?.length && (
                  <FunderUploadSection
                    type="weekly"
                    funders={weeklyFunders}
                    onFileUpload={onWeeklyFunderUpload}
                    uploadedFiles={weeklyUploadedFiles}
                    onClearFile={onWeeklyClearFile}
                  />
                )}
                
                {monthlyFunders?.length && (
                  <FunderUploadSection
                    type="monthly"
                    funders={monthlyFunders}
                    onFileUpload={onMonthlyFunderUpload}
                    uploadedFiles={monthlyUploadedFiles}
                    onClearFile={onMonthlyClearFile}
                  />
                )}
              </div>
            </div>
          )}

          {/* Grid Section for Components */}
          {children && (
            <div className="bg-default-50 rounded-lg p-6 border border-default-200">
              <h2 className="text-2xl font-semibold mb-6 text-foreground">
                Portfolio Components
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {children}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default BasePortfolio;