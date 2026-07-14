import React from "react";
import { DateValue } from "@internationalized/date";
import { Button } from "@heroui/react";
import { Icon } from "@iconify/react";
import MonthlyDatePicker from "@components/date/monthly-date-picker";
import FunderUploadSection, { FunderData } from "./funder-upload-section";

interface BasePortfolioProps {
  portfolioName: string;
  selectedDate: DateValue | null;
  onDateChange: (date: DateValue | null) => void;
  monthlyFunders?: FunderData[];
  onMonthlyFunderUpload?: (funderName: string, file: File) => void;
  onMonthlyClearFile?: (funderName: string) => void;
  monthlyUploadedFiles?: Record<string, File>;
  children?: React.ReactNode;
  monthlyErrorStates?: Record<string, { hasError: boolean; message?: string }>;
  onExportWorkbook?: () => void;
  isExporting?: boolean;
}

const BasePortfolio: React.FC<BasePortfolioProps> = ({
  portfolioName,
  selectedDate,
  onDateChange,
  monthlyFunders,
  onMonthlyFunderUpload,
  onMonthlyClearFile,
  monthlyUploadedFiles,
  children,
  monthlyErrorStates,
  onExportWorkbook,
  isExporting = false,
}) => {
  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-6xl mx-auto">
        {/* Portfolio Title */}
        <h1 className="text-3xl font-bold mb-4 text-foreground text-center">
          {portfolioName} Portfolio
        </h1>

        <div className="space-y-8">
          {/* Monthly Date Picker Section */}
          <div className="bg-default-50 rounded-lg p-2 border border-default-200">
            <h2 className="text-base sm:text-lg md:text-xl font-semibold text-foreground">
              Select Report Month
            </h2>
            <MonthlyDatePicker
              label="Report Month"
              description="Select the month for this portfolio report"
              value={selectedDate}
              onDateChange={onDateChange}
            />
          </div>

          {/* Funder Upload Section */}
          {monthlyFunders?.length && (
            <div className="bg-default-50 rounded-lg p-6 border border-default-200">
              <h2 className="text-2xl font-semibold mb-6 text-foreground text-center">
                Funder Upload
              </h2>

              <FunderUploadSection
                type="monthly"
                funders={monthlyFunders}
                onFileUpload={onMonthlyFunderUpload}
                uploadedFiles={monthlyUploadedFiles}
                onClearFile={onMonthlyClearFile}
                errorStates={monthlyErrorStates}
              />
            </div>
          )}

          {/* Export Workbook Button */}
          {onExportWorkbook && (
            <div className="bg-default-50 rounded-lg p-6 border border-default-200">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-semibold text-foreground">
                    Export Portfolio Workbook
                  </h2>
                  <p className="text-sm text-default-500 mt-1">
                    Generate the full Excel workbook from the cloud data
                  </p>
                </div>
                <Button
                  color="primary"
                  size="lg"
                  onPress={onExportWorkbook}
                  isLoading={isExporting}
                  startContent={
                    !isExporting && <Icon icon="material-symbols:download" className="w-5 h-5" />
                  }
                  isDisabled={isExporting}
                >
                  {isExporting ? "Exporting..." : "Export Workbook"}
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
