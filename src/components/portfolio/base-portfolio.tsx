import React, { useState } from 'react';
import { DateValue } from '@internationalized/date';
import { Button } from '@heroui/react';
import { Icon } from '@iconify/react';
import FridayDatePicker from '@components/date/friday-date-picker';

interface BasePortfolioProps {
  portfolioName: string;
  onDateChange?: (date: DateValue | null) => void;
  onFileUpload?: (file: File) => void;
  onWeeklyFunderUpload?: (file: File) => void;
  onMonthlyFunderUpload?: (file: File) => void;
  children?: React.ReactNode; // For the grid components
}

const BasePortfolio: React.FC<BasePortfolioProps> = ({
  portfolioName,
  onDateChange,
  onFileUpload,
  onWeeklyFunderUpload,
  onMonthlyFunderUpload,
  children
}) => {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [weeklyFunderFile, setWeeklyFunderFile] = useState<File | null>(null);
  const [monthlyFunderFile, setMonthlyFunderFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isDraggingWeekly, setIsDraggingWeekly] = useState(false);
  const [isDraggingMonthly, setIsDraggingMonthly] = useState(false);
  
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const weeklyFileInputRef = React.useRef<HTMLInputElement>(null);
  const monthlyFileInputRef = React.useRef<HTMLInputElement>(null);

  // Handle file selection
  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file && isValidExcelFile(file)) {
      setSelectedFile(file);
      onFileUpload?.(file);
    }
  };

  // Handle weekly funder file selection
  const handleWeeklyFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file && isValidExcelFile(file)) {
      setWeeklyFunderFile(file);
      onWeeklyFunderUpload?.(file);
    }
  };

  // Handle monthly funder file selection
  const handleMonthlyFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file && isValidExcelFile(file)) {
      setMonthlyFunderFile(file);
      onMonthlyFunderUpload?.(file);
    }
  };

  // Check if file is Excel
  const isValidExcelFile = (file: File): boolean => {
    const validTypes = [
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-excel',
      '.xlsx',
      '.xls'
    ];
    return validTypes.some(type => 
      file.type === type || file.name.endsWith(type)
    );
  };

  // Handle drag and drop for main upload
  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const file = e.dataTransfer.files?.[0];
    if (file && isValidExcelFile(file)) {
      setSelectedFile(file);
      onFileUpload?.(file);
    }
  };

  // Handle drag and drop for weekly funder upload
  const handleWeeklyDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingWeekly(true);
  };

  const handleWeeklyDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingWeekly(false);
  };

  const handleWeeklyDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingWeekly(false);

    const file = e.dataTransfer.files?.[0];
    if (file && isValidExcelFile(file)) {
      setWeeklyFunderFile(file);
      onWeeklyFunderUpload?.(file);
    }
  };

  // Handle drag and drop for monthly funder upload
  const handleMonthlyDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingMonthly(true);
  };

  const handleMonthlyDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingMonthly(false);
  };

  const handleMonthlyDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingMonthly(false);

    const file = e.dataTransfer.files?.[0];
    if (file && isValidExcelFile(file)) {
      setMonthlyFunderFile(file);
      onMonthlyFunderUpload?.(file);
    }
  };

  // Clear selected files
  const clearFile = () => {
    setSelectedFile(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const clearWeeklyFile = () => {
    setWeeklyFunderFile(null);
    if (weeklyFileInputRef.current) {
      weeklyFileInputRef.current.value = '';
    }
  };

  const clearMonthlyFile = () => {
    setMonthlyFunderFile(null);
    if (monthlyFileInputRef.current) {
      monthlyFileInputRef.current.value = '';
    }
  };

  // Trigger file input clicks
  const triggerFileSelect = () => {
    fileInputRef.current?.click();
  };

  const triggerWeeklyFileSelect = () => {
    weeklyFileInputRef.current?.click();
  };

  const triggerMonthlyFileSelect = () => {
    monthlyFileInputRef.current?.click();
  };

  // Render upload area component (reusable)
  const renderUploadArea = (
    selectedFile: File | null,
    isDragging: boolean,
    onDragEnter: (e: React.DragEvent) => void,
    onDragLeave: (e: React.DragEvent) => void,
    onDragOver: (e: React.DragEvent) => void,
    onDrop: (e: React.DragEvent) => void,
    onClick: () => void,
    onClear: () => void
  ) => {
    if (!selectedFile) {
      return (
        <div
          className={`
            border-2 border-dashed rounded-lg p-6
            transition-all duration-200 cursor-pointer
            ${isDragging 
              ? 'border-primary bg-primary/5' 
              : 'border-default-300 hover:border-primary hover:bg-default-100'
            }
          `}
          onDragEnter={onDragEnter}
          onDragLeave={onDragLeave}
          onDragOver={onDragOver}
          onDrop={onDrop}
          onClick={onClick}
        >
          <div className="flex flex-col items-center justify-center space-y-2">
            <Icon icon="material-symbols:upload-rounded" className="w-8 h-8 text-default-400" />
            <div className="text-center">
              <p className="text-sm font-medium text-foreground">
                Click to upload or drag and drop
              </p>
              <p className="text-xs text-default-500 mt-1">
                Excel files only (.xlsx, .xls)
              </p>
            </div>
          </div>
        </div>
      );
    }

    return (
      <div className="border border-default-300 rounded-lg p-3 bg-default-100">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Icon icon="vscode-icons:file-type-excel" className="w-6 h-6" />
            <div>
              <p className="text-sm font-medium text-foreground">
                {selectedFile.name}
              </p>
              <p className="text-xs text-default-500">
                {(selectedFile.size / 1024).toFixed(1)} KB
              </p>
            </div>
          </div>
          <Button
            isIconOnly
            color="danger"
            variant="light"
            size="sm"
            onPress={onClear}
          >
            <Icon icon="material-symbols:close-rounded" className="w-3 h-3" />
          </Button>
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-6xl mx-auto">
        {/* Portfolio Title - Made Larger */}
        <h1 className="text-6xl font-bold mb-12 text-foreground text-center">
          {portfolioName} Portfolio
        </h1>

        <div className="space-y-8">
          {/* Date Picker and Excel Upload Side by Side - Using Flex as primary, Grid as fallback */}
          <div className="flex flex-row gap-6">
            {/* Friday Date Picker Section */}
            <div className="flex-1 bg-default-50 rounded-lg p-4 border border-default-200 ">
              <h2 className="text-xl font-semibold mb-4 text-foreground">
                Select Report Date
              </h2>
              <FridayDatePicker
                label="Report Date (Friday)"
                description="Select the Friday date for this portfolio report"
                onDateChange={onDateChange}
              />
            </div>

            {/* Excel Upload Section */}
            <div className="flex-1 bg-default-50 rounded-lg p-4 border border-default-200">
              <h2 className="text-xl font-semibold mb-4 text-foreground">
                Upload Excel Workbook
              </h2>
              
              {/* Hidden file input */}
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
                onChange={handleFileSelect}
                className="hidden"
              />

              {renderUploadArea(
                selectedFile,
                isDragging,
                handleDragEnter,
                handleDragLeave,
                handleDragOver,
                handleDrop,
                triggerFileSelect,
                clearFile
              )}

              {/* Help text */}
              <p className="text-xs text-default-400 mt-2">
                Maximum file size: 10MB. Supported formats: .xlsx, .xls
              </p>
            </div>
          </div>

          {/* Funder Upload Section - Full width single column */}
          <div className="bg-default-50 rounded-lg p-6 border border-default-200">
            <h2 className="text-2xl font-semibold mb-6 text-foreground text-center">
              Funder Upload
            </h2>
            
            <div className="space-y-6">
              {/* Weekly Upload Section - Full width */}
              <div className="bg-white rounded-lg p-6 border border-default-200">
                <h3 className="text-lg font-semibold mb-4 text-foreground text-center">
                  Weekly Upload
                </h3>
                
                {/* Hidden file input for weekly */}
                <input
                  ref={weeklyFileInputRef}
                  type="file"
                  accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
                  onChange={handleWeeklyFileSelect}
                  className="hidden"
                />

                <div className="max-w-2xl mx-auto">
                  {renderUploadArea(
                    weeklyFunderFile,
                    isDraggingWeekly,
                    handleWeeklyDragEnter,
                    handleWeeklyDragLeave,
                    handleDragOver,
                    handleWeeklyDrop,
                    triggerWeeklyFileSelect,
                    clearWeeklyFile
                  )}
                </div>
              </div>

              {/* Monthly Upload Section - Full width */}
              <div className="bg-white rounded-lg p-6 border border-default-200">
                <h3 className="text-lg font-semibold mb-4 text-foreground text-center">
                  Monthly Upload
                </h3>
                
                {/* Hidden file input for monthly */}
                <input
                  ref={monthlyFileInputRef}
                  type="file"
                  accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
                  onChange={handleMonthlyFileSelect}
                  className="hidden"
                />

                <div className="max-w-2xl mx-auto">
                  {renderUploadArea(
                    monthlyFunderFile,
                    isDraggingMonthly,
                    handleMonthlyDragEnter,
                    handleMonthlyDragLeave,
                    handleDragOver,
                    handleMonthlyDrop,
                    triggerMonthlyFileSelect,
                    clearMonthlyFile
                  )}
                </div>
              </div>
            </div>

            {/* Help text for funder uploads */}
            <p className="text-xs text-default-400 mt-4 text-center">
              Upload weekly and monthly funder reports. Maximum file size: 10MB each.
            </p>
          </div>

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