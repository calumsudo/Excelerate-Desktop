import React from "react";
import { Button } from "@heroui/react";
import { Icon } from "@iconify/react";
import { useFileUpload } from "@/hooks/use-file-upload";

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
  uploadId?: string; // Unique identifier for this upload area
  hasError?: boolean; // Indicates if the upload has a validation error
  errorMessage?: string; // Optional error message to display
}

// Browser drag and drop handlers (kept as fallback for non-Tauri environments).
// In Tauri, drops are handled by onDragDropEvent instead.
const preventDragDefault = (e: React.DragEvent) => {
  e.preventDefault();
  e.stopPropagation();
};

interface FileDropZoneProps {
  className: string;
  fileInputRef: React.RefObject<HTMLInputElement>;
  dropZoneRef: React.RefObject<HTMLDivElement>;
  acceptString: string;
  fileTypeDisplay: string;
  isDragging: boolean;
  hasError: boolean;
  errorMessage?: string;
  label: string;
  description: string;
  maxSizeKB: number;
  uploadId: string;
  onFileSelect: (event: React.ChangeEvent<HTMLInputElement>) => void;
  onTriggerFileSelect: () => void;
}

// Empty-state drop target shown before a file is chosen.
const FileDropZone: React.FC<FileDropZoneProps> = ({
  className,
  fileInputRef,
  dropZoneRef,
  acceptString,
  fileTypeDisplay,
  isDragging,
  hasError,
  errorMessage,
  label,
  description,
  maxSizeKB,
  uploadId,
  onFileSelect,
  onTriggerFileSelect,
}) => (
  <div className={className}>
    {/* Hidden file input */}
    <input
      ref={fileInputRef}
      type="file"
      accept={acceptString}
      onChange={onFileSelect}
      className="hidden"
    />

    <div
      ref={dropZoneRef}
      className={`
        border-2 border-dashed rounded-lg p-6
        transition-all duration-200 cursor-pointer
        ${
          hasError
            ? "border-danger bg-danger/5"
            : isDragging
              ? "border-primary bg-primary/5"
              : "border-default-300 hover:border-primary hover:bg-default-100"
        }
      `}
      onDragEnter={preventDragDefault}
      onDragLeave={preventDragDefault}
      onDragOver={preventDragDefault}
      onDrop={preventDragDefault}
      onClick={onTriggerFileSelect}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onTriggerFileSelect();
        }
      }}
      role="button"
      tabIndex={0}
      data-upload-id={uploadId}
    >
      <div className="flex flex-col items-center justify-center space-y-2">
        <Icon
          icon="material-symbols:upload-rounded"
          className={`w-8 h-8 ${hasError ? "text-danger" : "text-default-400"}`}
        />
        <div className="text-center">
          <p className={`text-sm font-medium ${hasError ? "text-danger" : "text-foreground"}`}>
            {label}
          </p>
          <p className={`text-xs mt-1 ${hasError ? "text-danger" : "text-default-500"}`}>
            {hasError && errorMessage ? errorMessage : description}
          </p>
        </div>
      </div>
    </div>

    <p className="text-xs text-default-400 mt-2">
      Maximum file size: {(maxSizeKB / 1024).toFixed(0)}MB. Supported formats: {fileTypeDisplay}
    </p>
  </div>
);

interface SelectedFileCardProps {
  className: string;
  file: File;
  hasError: boolean;
  errorMessage?: string;
  onClear: () => void;
}

// Filled-state card shown once a valid file is selected.
const SelectedFileCard: React.FC<SelectedFileCardProps> = ({
  className,
  file,
  hasError,
  errorMessage,
  onClear,
}) => (
  <div className={className}>
    <div
      className={`border rounded-lg p-3 ${hasError ? "border-danger bg-danger/5" : "border-default-300 bg-default-100"}`}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <Icon icon="vscode-icons:file-type-excel" className="w-6 h-6 flex-shrink-0" />
          <div className="min-w-0 flex-1 overflow-hidden">
            <p
              className={`text-sm font-medium truncate ${hasError ? "text-danger" : "text-foreground"}`}
              title={file.name}
            >
              {file.name}
            </p>
            <p className={`text-xs ${hasError ? "text-danger" : "text-default-500"}`}>
              {hasError && errorMessage ? errorMessage : `${(file.size / 1024).toFixed(1)} KB`}
            </p>
          </div>
        </div>
        <Button isIconOnly color="danger" variant="light" size="sm" onPress={onClear}>
          <Icon icon="material-symbols:close-rounded" className="w-3 h-3" />
        </Button>
      </div>
    </div>
  </div>
);

const FileUpload: React.FC<FileUploadProps> = ({
  onFileUpload,
  acceptedTypes = [
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/vnd.ms-excel",
  ],
  acceptedExtensions = [".xlsx", ".xls"],
  maxSizeKB = 10240, // 10MB default
  label = "Click to upload file or drag and drop",
  description = "Excel files only (.xlsx, .xls)",
  className = "",
  selectedFile = null,
  onClearFile,
  uploadId = "default",
  hasError = false,
  errorMessage,
}) => {
  const {
    currentFile,
    isDragging,
    fileInputRef,
    dropZoneRef,
    handleFileSelect,
    clearFile,
    triggerFileSelect,
  } = useFileUpload({
    onFileUpload,
    acceptedTypes,
    acceptedExtensions,
    maxSizeKB,
    selectedFile,
    onClearFile,
    uploadId,
  });

  // Generate accept string for input
  const acceptString = [...acceptedTypes, ...acceptedExtensions].join(",");

  // Generate file type display string
  const fileTypeDisplay = acceptedExtensions.join(", ");

  if (!currentFile) {
    return (
      <FileDropZone
        className={className}
        fileInputRef={fileInputRef}
        dropZoneRef={dropZoneRef}
        acceptString={acceptString}
        fileTypeDisplay={fileTypeDisplay}
        isDragging={isDragging}
        hasError={hasError}
        errorMessage={errorMessage}
        label={label}
        description={description}
        maxSizeKB={maxSizeKB}
        uploadId={uploadId}
        onFileSelect={handleFileSelect}
        onTriggerFileSelect={triggerFileSelect}
      />
    );
  }

  return (
    <SelectedFileCard
      className={className}
      file={currentFile}
      hasError={hasError}
      errorMessage={errorMessage}
      onClear={clearFile}
    />
  );
};

export default FileUpload;
