import React, { useState, useRef, useEffect } from "react";
import { Icon } from "@iconify/react";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { readFile } from "@tauri-apps/plugin-fs";

interface ClearViewDailyUploadProps {
  onFileUpload?: (files: File[]) => void;
  uploadedFiles?: File[];
  onRemoveFile?: (index: number) => void;
  maxUploads?: number;
}

const ClearViewDailyUpload: React.FC<ClearViewDailyUploadProps> = ({
  onFileUpload,
  uploadedFiles = [],
  onRemoveFile,
  maxUploads = 5,
}) => {
  const [localFiles, setLocalFiles] = useState<File[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dropZoneRef = useRef<HTMLDivElement>(null);
  const isHoveredRef = useRef(false);

  const files = uploadedFiles.length > 0 ? uploadedFiles : localFiles;

  const handleFiles = (newFiles: FileList | null) => {
    if (!newFiles) return;

    const fileArray = Array.from(newFiles).filter(
      (file) => file.name.endsWith(".csv") && file.type.includes("csv")
    );

    const remainingSlots = maxUploads - files.length;
    const filesToAdd = fileArray.slice(0, remainingSlots);

    if (filesToAdd.length === 0 && remainingSlots === 0) {
      alert(`Maximum ${maxUploads} files allowed`);
      return;
    }

    const updatedFiles = [...files, ...filesToAdd];
    setLocalFiles(updatedFiles);
    onFileUpload?.(updatedFiles);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    handleFiles(e.target.files);
  };

  const handleRemoveFile = (index: number) => {
    const updatedFiles = files.filter((_, i) => i !== index);
    setLocalFiles(updatedFiles);
    onRemoveFile?.(index);
    if (onFileUpload) {
      onFileUpload(updatedFiles);
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
    return (bytes / (1024 * 1024)).toFixed(1) + " MB";
  };

  // Handle file drop from Tauri
  const handleTauriFileDrop = async (filePaths: string[]) => {
    try {
      const newFiles: File[] = [];

      for (const filePath of filePaths) {
        // Extract file name from path
        const fileName = filePath.split(/[\\/]/).pop() || "file.csv";

        // Check if file has valid extension
        if (!fileName.toLowerCase().endsWith(".csv")) {
          console.error(`Invalid file extension: ${fileName}. Expected: .csv`);
          continue;
        }

        // Read the file content
        const fileContent = await readFile(filePath);

        // Create a File object from the content
        const file = new File([fileContent], fileName, {
          type: "text/csv",
        });

        console.log("File created from Tauri drop:", file.name, "Size:", file.size);
        newFiles.push(file);
      }

      if (newFiles.length > 0) {
        const remainingSlots = maxUploads - files.length;
        const filesToAdd = newFiles.slice(0, remainingSlots);

        if (filesToAdd.length === 0 && remainingSlots === 0) {
          alert(`Maximum ${maxUploads} files allowed`);
          return;
        }

        const updatedFiles = [...files, ...filesToAdd];
        setLocalFiles(updatedFiles);
        onFileUpload?.(updatedFiles);
      }
    } catch (error) {
      console.error("Failed to process Tauri file drop:", error);
    }
  };

  // Handle Tauri-specific drag and drop events
  useEffect(() => {
    let unlisten: (() => void) | undefined;

    const setupTauriDragDrop = async () => {
      try {
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
            if (isOverDropZone && files.length < maxUploads) {
              setIsDragging(true);
              isHoveredRef.current = true;
            } else {
              setIsDragging(false);
              isHoveredRef.current = false;
            }
          } else if (event.payload.type === "drop") {
            // Only process drop if it's over this specific drop zone
            if ((isHoveredRef.current || isOverDropZone) && files.length < maxUploads) {
              console.log("Files dropped on ClearView daily upload:", event.payload.paths);

              // Process all CSV files
              if (event.payload.paths && event.payload.paths.length > 0) {
                const csvPaths = event.payload.paths.filter((path) =>
                  path.toLowerCase().endsWith(".csv")
                );
                if (csvPaths.length > 0) {
                  handleTauriFileDrop(csvPaths);
                }
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
        console.error("Failed to setup Tauri drag and drop:", error);
      }
    };

    setupTauriDragDrop();

    return () => {
      if (unlisten) {
        unlisten();
      }
    };
  }, [files, maxUploads, onFileUpload]);

  return (
    <div className="bg-default-50 rounded-lg p-6 border border-default-200">
      <h3 className="text-lg font-semibold mb-4 text-foreground text-center">
        Clear View - Daily Upload
      </h3>

      {/* Single Drop Zone */}
      <div
        ref={dropZoneRef}
        className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
          isDragging ? "border-primary bg-primary/10" : "border-default-300 hover:border-primary"
        } ${files.length >= maxUploads ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
        onClick={() => files.length < maxUploads && fileInputRef.current?.click()}
      >
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept=".csv"
          onChange={handleFileSelect}
          className="hidden"
          disabled={files.length >= maxUploads}
        />

        <Icon icon="tabler:upload" className="mx-auto h-12 w-12 text-default-400 mb-4" />

        <p className="text-sm font-medium text-foreground mb-2">
          {files.length >= maxUploads
            ? `Maximum ${maxUploads} files reached`
            : "Drop CSV files here or click to browse"}
        </p>

        <p className="text-xs text-default-500">
          {files.length < maxUploads
            ? `CSV files only • ${files.length}/${maxUploads} files uploaded`
            : "Remove files below to upload more"}
        </p>
      </div>

      {/* File List */}
      {files.length > 0 && (
        <div className="mt-6">
          <h4 className="text-sm font-semibold text-foreground mb-3">
            Uploaded Files ({files.length}/{maxUploads})
          </h4>

          <div className="space-y-2">
            {files.map((file, index) => (
              <div
                key={`${file.name}-${index}`}
                className="flex items-center justify-between p-3 bg-default-100 rounded-lg border border-default-200 hover:bg-default-200 transition-colors"
              >
                <div className="flex items-center space-x-3 flex-1 min-w-0">
                  <Icon icon="tabler:file-text" className="h-5 w-5 text-primary flex-shrink-0" />

                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">
                      Report {index + 1}: {file.name}
                    </p>
                    <p className="text-xs text-default-500">{formatFileSize(file.size)}</p>
                  </div>

                  <Icon icon="tabler:circle-check" className="h-4 w-4 text-success flex-shrink-0" />
                </div>

                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleRemoveFile(index);
                  }}
                  className="ml-3 p-1.5 hover:bg-danger/10 rounded-md transition-colors group"
                  title="Remove file"
                >
                  <Icon
                    icon="tabler:x"
                    className="h-4 w-4 text-default-500 group-hover:text-danger"
                  />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default ClearViewDailyUpload;
