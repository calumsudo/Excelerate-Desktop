import React, { useState, useRef, useEffect } from "react";
import { Button } from "@heroui/react";
import { Icon } from "@iconify/react";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { readFile } from "@tauri-apps/plugin-fs";

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
  const [localSelectedFile, setLocalSelectedFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  // const dragCounter = useRef(0);
  const dropZoneRef = useRef<HTMLDivElement>(null);
  const isHoveredRef = useRef(false);
  const onFileUploadRef = useRef(onFileUpload);
  const listenerRegisteredRef = useRef(false);

  // Use prop file if provided, otherwise use local state
  const currentFile = selectedFile ?? localSelectedFile;

  // Keep the ref up to date with the latest callback
  useEffect(() => {
    onFileUploadRef.current = onFileUpload;
  }, [onFileUpload]);

  // Handle file drop from Tauri
  const handleTauriFileDrop = async (filePath: string) => {
    console.log(`[FileUpload-${uploadId}] handleTauriFileDrop called with:`, filePath);
    try {
      // Extract file name from path
      const fileName = filePath.split(/[\\/]/).pop() || "file";

      // Check if file has valid extension
      const hasValidExtension = acceptedExtensions.some((ext) =>
        fileName.toLowerCase().endsWith(ext.toLowerCase())
      );

      if (!hasValidExtension) {
        console.error(
          `Invalid file extension: ${fileName}. Expected: ${acceptedExtensions.join(", ")}`
        );
        return;
      }

      // Read the file content
      const fileContent = await readFile(filePath);

      // Create a File object from the content
      const file = new File([fileContent], fileName, {
        type: fileName.endsWith(".xlsx")
          ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          : "application/vnd.ms-excel",
      });

      // Check file size
      if (file.size > maxSizeKB * 1024) {
        console.error(
          `File too large: ${(file.size / 1024).toFixed(1)}KB. Maximum: ${maxSizeKB}KB`
        );
        return;
      }

      console.log(
        `[FileUpload-${uploadId}] File created from Tauri drop:`,
        file.name,
        "Size:",
        file.size
      );

      // Update state and call handler
      if (selectedFile === undefined) {
        setLocalSelectedFile(file);
      }
      console.log(`[FileUpload-${uploadId}] Calling onFileUploadRef.current`);
      onFileUploadRef.current?.(file);
    } catch (error) {
      console.error("Failed to process Tauri file drop:", error);
    }
  };

  // Handle Tauri-specific drag and drop events
  useEffect(() => {
    let unlisten: (() => void) | undefined;

    const setupTauriDragDrop = async () => {
      // Prevent multiple registrations
      if (listenerRegisteredRef.current) {
        console.log(`[FileUpload-${uploadId}] Listener already registered, skipping`);
        return;
      }

      try {
        console.log(`[FileUpload-${uploadId}] Setting up Tauri drag drop listener`);
        listenerRegisteredRef.current = true;
        // Listen for Tauri drag and drop events
        unlisten = await getCurrentWebview().onDragDropEvent((event) => {
          // Only process if this specific drop zone is being hovered
          if (!dropZoneRef.current) return;

          const hasPosition = (payload: any): payload is { position: { x: number; y: number } } => {
            return (
              payload &&
              typeof payload.position === "object" &&
              typeof payload.position.x === "number" &&
              typeof payload.position.y === "number"
            );
          };

          // Check if the drop zone is being hovered
          const rect = dropZoneRef.current.getBoundingClientRect();
          const isOverDropZone =
            hasPosition(event.payload) &&
            event.payload.position.x >= rect.left &&
            event.payload.position.x <= rect.right &&
            event.payload.position.y >= rect.top &&
            event.payload.position.y <= rect.bottom;

          if (event.payload.type === "over") {
            // Only show dragging state if over this specific drop zone
            if (isOverDropZone) {
              setIsDragging(true);
              isHoveredRef.current = true;
            } else {
              setIsDragging(false);
              isHoveredRef.current = false;
            }
          } else if (event.payload.type === "drop") {
            // Only process drop if it's over this specific drop zone
            if (isHoveredRef.current || isOverDropZone) {
              console.log(`Files dropped on ${uploadId}:`, event.payload.paths);

              // Process the first file
              if (event.payload.paths && event.payload.paths.length > 0) {
                const filePath = event.payload.paths[0];
                console.log(`Processing file for ${uploadId}:`, filePath);
                handleTauriFileDrop(filePath);
              }
            }
            setIsDragging(false);
            isHoveredRef.current = false;
          } else {
            // Drag cancelled
            setIsDragging(false);
            isHoveredRef.current = false;
          }
        });
      } catch (error) {
        console.error("Failed to setup Tauri drag drop:", error);
      }
    };

    setupTauriDragDrop();

    // Cleanup
    return () => {
      console.log(`[FileUpload-${uploadId}] Cleaning up Tauri drag drop listener`);
      if (unlisten) {
        unlisten();
        listenerRegisteredRef.current = false;
      }
    };
  }, [acceptedExtensions, maxSizeKB, uploadId]); // Removed onFileUpload and selectedFile from deps

  // Check if file is valid based on props
  const isValidFile = (file: File): boolean => {
    // Check extension first as it's more reliable
    const isValidExtension = acceptedExtensions.some((ext) =>
      file.name.toLowerCase().endsWith(ext.toLowerCase())
    );

    // Check MIME type (can be empty for some files)
    const isValidType = !file.type || acceptedTypes.some((type) => file.type === type);

    // Check file size
    const isValidSize = file.size <= maxSizeKB * 1024;

    console.log("Validation:", {
      extension: isValidExtension,
      type: isValidType,
      size: isValidSize,
      fileName: file.name,
      fileType: file.type || "no type",
      fileSize: file.size,
    });

    // Accept if extension is valid AND size is valid
    // Type check is optional since some systems don't set it correctly
    return isValidExtension && isValidSize;
  };

  // Handle file selection
  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file && isValidFile(file)) {
      if (selectedFile === undefined) {
        setLocalSelectedFile(file);
      }
      onFileUploadRef.current?.(file);
    }
  };

  // Browser drag and drop handlers (kept as fallback for non-Tauri environments)
  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    // In Tauri, this will be handled by onDragDropEvent
  };

  // Clear file - FIXED
  const clearFile = () => {
    if (selectedFile === undefined) {
      setLocalSelectedFile(null);
    }
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
    onClearFile?.();
  };

  // Trigger file input click
  const triggerFileSelect = () => {
    fileInputRef.current?.click();
  };

  // Generate accept string for input
  const acceptString = [...acceptedTypes, ...acceptedExtensions].join(",");

  // Generate file type display string
  const fileTypeDisplay = acceptedExtensions.join(", ");

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
          onDragEnter={handleDragEnter}
          onDragLeave={handleDragLeave}
          onDragOver={handleDragOver}
          onDrop={handleDrop}
          onClick={triggerFileSelect}
          role="button"
          tabIndex={0}
          data-upload-id={uploadId}
        >
          <div className="flex flex-col items-center justify-center space-y-2">
            <Icon icon="material-symbols:upload-rounded" className={`w-8 h-8 ${hasError ? 'text-danger' : 'text-default-400'}`} />
            <div className="text-center">
              <p className={`text-sm font-medium ${hasError ? 'text-danger' : 'text-foreground'}`}>{label}</p>
              <p className={`text-xs mt-1 ${hasError ? 'text-danger' : 'text-default-500'}`}>
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
  }

  return (
    <div className={className}>
      <div className={`border rounded-lg p-3 ${hasError ? 'border-danger bg-danger/5' : 'border-default-300 bg-default-100'}`}>
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <Icon icon="vscode-icons:file-type-excel" className="w-6 h-6 flex-shrink-0" />
            <div className="min-w-0 flex-1 overflow-hidden">
              <p className={`text-sm font-medium truncate ${hasError ? 'text-danger' : 'text-foreground'}`} title={currentFile.name}>
                {currentFile.name}
              </p>
              <p className={`text-xs ${hasError ? 'text-danger' : 'text-default-500'}`}>
                {hasError && errorMessage ? errorMessage : `${(currentFile.size / 1024).toFixed(1)} KB`}
              </p>
            </div>
          </div>
          <Button isIconOnly color="danger" variant="light" size="sm" onPress={clearFile}>
            <Icon icon="material-symbols:close-rounded" className="w-3 h-3" />
          </Button>
        </div>
      </div>
    </div>
  );
};

export default FileUpload;
