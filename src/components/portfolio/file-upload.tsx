import React, { useState, useRef } from 'react';
import { Button } from '@heroui/react';
import { Icon } from '@iconify/react';

interface FileUploadProps {
  onFileUpload?: (file: File) => void;
  acceptedTypes?: string[];
  acceptedExtensions?: string[];
  maxSizeKB?: number;
  label?: string;
  description?: string;
  className?: string;
  selectedFile?: File | null;
  onClearFile?: () => void;
}

const FileUpload: React.FC<FileUploadProps> = ({
  onFileUpload,
  acceptedTypes = [
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-excel'
  ],
  acceptedExtensions = ['.xlsx', '.xls'],
  maxSizeKB = 10240, // 10MB default
  label = "Click to upload file or drag and drop",
  description = "Excel files only (.xlsx, .xls)",
  className = "",
  selectedFile = null,
  onClearFile
}) => {
  const [localSelectedFile, setLocalSelectedFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Use prop file if provided, otherwise use local state
  const currentFile = selectedFile ?? localSelectedFile;

  // Check if file is valid based on props
  const isValidFile = (file: File): boolean => {
    const isValidType = acceptedTypes.some(type => file.type === type);
    const isValidExtension = acceptedExtensions.some(ext => file.name.toLowerCase().endsWith(ext.toLowerCase()));
    const isValidSize = file.size <= maxSizeKB * 1024;
    
    return (isValidType || isValidExtension) && isValidSize;
  };

  // Handle file selection
  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file && isValidFile(file)) {
      if (selectedFile === undefined) {
        setLocalSelectedFile(file);
      }
      onFileUpload?.(file);
    }
  };

  // Handle drag and drop
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
    if (file && isValidFile(file)) {
      if (selectedFile === undefined) {
        setLocalSelectedFile(file);
      }
      onFileUpload?.(file);
    }
  };

  // Clear file - FIXED
  const clearFile = () => {
    if (selectedFile === undefined) {
      setLocalSelectedFile(null);
    }
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
    onClearFile?.();
  };

  // Trigger file input click
  const triggerFileSelect = () => {
    fileInputRef.current?.click();
  };

  // Generate accept string for input
  const acceptString = [...acceptedTypes, ...acceptedExtensions].join(',');

  // Generate file type display string
  const fileTypeDisplay = acceptedExtensions.join(', ');

  if (!currentFile) {
    return (
      <div className={className}>
        {/* Hidden file input */}
        <input
          ref={fileInputRef}
          type="file"
          accept={acceptString}
          onChange={handleFileSelect}
          className="hidden"
        />

        <div
          className={`
            border-2 border-dashed rounded-lg p-6
            transition-all duration-200 cursor-pointer
            ${isDragging 
              ? 'border-primary bg-primary/5' 
              : 'border-default-300 hover:border-primary hover:bg-default-100'
            }
          `}
          onDragEnter={handleDragEnter}
          onDragLeave={handleDragLeave}
          onDragOver={handleDragOver}
          onDrop={handleDrop}
          onClick={triggerFileSelect}
        >
          <div className="flex flex-col items-center justify-center space-y-2">
            <Icon icon="material-symbols:upload-rounded" className="w-8 h-8 text-default-400" />
            <div className="text-center">
              <p className="text-sm font-medium text-foreground">
                {label}
              </p>
              <p className="text-xs text-default-500 mt-1">
                {description}
              </p>
            </div>
          </div>
        </div>

        <p className="text-xs text-default-400 mt-2">
          Maximum file size: {(maxSizeKB / 1024).toFixed(0)}MB. Supported formats: {fileTypeDisplay}
        </p>
      </div>
    );
  }

  return (
    <div className={className}>
      <div className="border border-default-300 rounded-lg p-3 bg-default-100">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Icon icon="vscode-icons:file-type-excel" className="w-6 h-6" />
            <div>
              <p className="text-sm font-medium text-foreground">
                {currentFile.name}
              </p>
              <p className="text-xs text-default-500">
                {(currentFile.size / 1024).toFixed(1)} KB
              </p>
            </div>
          </div>
          <Button
            isIconOnly
            color="danger"
            variant="light"
            size="sm"
            onPress={clearFile}
          >
            <Icon icon="material-symbols:close-rounded" className="w-3 h-3" />
          </Button>
        </div>
      </div>
    </div>
  );
};

export default FileUpload;