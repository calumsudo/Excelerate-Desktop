import React, { useState } from "react";
import { DateValue } from "@internationalized/date";
import { Button } from "@heroui/react";
import { Icon } from "@iconify/react";
import FridayDatePicker from "@components/date/friday-date-picker";
import FileUpload from "./file-upload";
import FunderUploadSection, { FunderData } from "./funder-upload-section";
import ClearViewDailyUpload from "./clearview-daily-upload";

interface BasePortfolioProps {
  portfolioName: string;
  onDateChange?: (date: DateValue | null) => void;
  onFileUpload?: (file: File) => void;
  onClearMainFile?: () => void;
  weeklyFunders?: FunderData[];
  monthlyFunders?: FunderData[];
  dailyFunders?: FunderData[];
  onWeeklyFunderUpload?: (funderName: string, file: File) => void;
  onMonthlyFunderUpload?: (funderName: string, file: File) => void;
  onDailyFunderUpload?: (funderName: string, file: File) => void;
  onWeeklyClearFile?: (funderName: string) => void;
  onMonthlyClearFile?: (funderName: string) => void;
  onDailyClearFile?: (funderName: string) => void;
  weeklyUploadedFiles?: Record<string, File>;
  monthlyUploadedFiles?: Record<string, File>;
  dailyUploadedFiles?: Record<string, File>;
  existingWorkbookFile?: File | null;
  children?: React.ReactNode;
  // Clear View Daily specific props
  showClearViewDaily?: boolean;
  onClearViewDailyUpload?: (files: File[]) => void;
  onClearViewDailyRemove?: (index: number) => void;
  clearViewDailyFiles?: File[];
  onUpdateNetRtr?: () => void;
  canUpdateNetRtr?: boolean;
  isUpdatingNetRtr?: boolean;
}

const BasePortfolio: React.FC<BasePortfolioProps> = ({
  portfolioName,
  onDateChange,
  onFileUpload,
  onClearMainFile,
  weeklyFunders,
  monthlyFunders,
  dailyFunders,
  onWeeklyFunderUpload,
  onMonthlyFunderUpload,
  onDailyFunderUpload,
  onWeeklyClearFile,
  onMonthlyClearFile,
  onDailyClearFile,
  weeklyUploadedFiles,
  monthlyUploadedFiles,
  dailyUploadedFiles,
  existingWorkbookFile,
  children,
  showClearViewDaily,
  onClearViewDailyUpload,
  onClearViewDailyRemove,
  clearViewDailyFiles,
  onUpdateNetRtr,
  canUpdateNetRtr = false,
  isUpdatingNetRtr = false,
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
    // Prevent duplicate uploads if the same file is already selected
    if (selectedFile?.name === file.name && selectedFile?.size === file.size) {
      return;
    }
    setSelectedFile(file);
    onFileUpload?.(file);
  };

  // Clear file handlers
  const clearMainFile = () => {
    setSelectedFile(null);
    onClearMainFile?.();
  };

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
              <h2 className="text-base sm:text-lg md:text-xl font-semibold text-foreground">
                Select Report Date
              </h2>
              <FridayDatePicker
                label="Report Date (Friday)"
                description="Select the Friday date for this portfolio report"
                onDateChange={onDateChange}
              />
            </div>

            {/* Excel Upload Section */}
            <div className="flex-1 bg-default-50 rounded-lg p-2 border border-default-200 min-w-0">
              <h2 className="text-base md:text-md lg:text-lg xl:text-xl font-semibold text-foreground">
                <span className="hidden md:inline">{portfolioName} Portfolio Workbook Upload</span>
                <span className="md:hidden">{portfolioName} Upload</span>
              </h2>
              <FileUpload
                className="w-full"
                onFileUpload={handleFileUpload}
                selectedFile={selectedFile}
                onClearFile={clearMainFile}
                label="Click to upload portfolio workbook or drag and drop"
                description="Excel files only (.xlsx, .xls)"
                acceptedTypes={[
                  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                  "application/vnd.ms-excel",
                ]}
                acceptedExtensions={[".xlsx", ".xls"]}
                maxSizeKB={10240}
                uploadId={`${portfolioName}-main-workbook`}
              />
            </div>
          </div>

          {/* Clear View Daily Upload Section */}
          {showClearViewDaily && (
            <ClearViewDailyUpload
              onFileUpload={onClearViewDailyUpload}
              uploadedFiles={clearViewDailyFiles}
              onRemoveFile={onClearViewDailyRemove}
              maxUploads={5}
            />
          )}

          {/* Funder Upload Section */}
          {(weeklyFunders?.length || monthlyFunders?.length || dailyFunders?.length) && (
            <div className="bg-default-50 rounded-lg p-6 border border-default-200">
              <h2 className="text-2xl font-semibold mb-6 text-foreground text-center">
                Funder Upload
              </h2>

              <div className="space-y-6">
                {dailyFunders?.length && (
                  <FunderUploadSection
                    type="daily"
                    funders={dailyFunders}
                    onFileUpload={onDailyFunderUpload}
                    uploadedFiles={dailyUploadedFiles}
                    onClearFile={onDailyClearFile}
                  />
                )}

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

          {/* Update Net RTR Button */}
          {canUpdateNetRtr && onUpdateNetRtr && (
            <div className="bg-default-50 rounded-lg p-6 border border-default-200">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-semibold text-foreground">
                    Update Portfolio with Net RTR
                  </h2>
                  <p className="text-sm text-default-500 mt-1">
                    Update the portfolio workbook with Net RTR values from funder reports
                  </p>
                </div>
                <Button
                  color="primary"
                  size="lg"
                  onPress={onUpdateNetRtr}
                  isLoading={isUpdatingNetRtr}
                  startContent={
                    !isUpdatingNetRtr && <Icon icon="material-symbols:update" className="w-5 h-5" />
                  }
                  isDisabled={isUpdatingNetRtr}
                >
                  {isUpdatingNetRtr ? "Processing with Python..." : "Update Net RTR"}
                </Button>
              </div>
            </div>
          )}

          {/* Grid Section for Components */}
          {children && (
            <div className="bg-default-50 rounded-lg p-6 border border-default-200">
              <h2 className="text-2xl font-semibold mb-6 text-foreground">Portfolio Components</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">{children}</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default BasePortfolio;
