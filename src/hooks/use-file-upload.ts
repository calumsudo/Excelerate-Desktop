import { useEffect, useRef, useState } from "react";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { readFile } from "@tauri-apps/plugin-fs";

interface UseFileUploadOptions {
  onFileUpload?: (file: File) => void;
  acceptedTypes: string[];
  acceptedExtensions: string[];
  maxSizeKB: number;
  selectedFile?: File | null;
  onClearFile?: () => void;
  uploadId: string;
}

interface UseFileUploadResult {
  currentFile: File | null;
  isDragging: boolean;
  fileInputRef: React.RefObject<HTMLInputElement>;
  dropZoneRef: React.RefObject<HTMLDivElement>;
  handleFileSelect: (event: React.ChangeEvent<HTMLInputElement>) => void;
  clearFile: () => void;
  triggerFileSelect: () => void;
}

/**
 * Encapsulates the stateful file-selection logic for FileUpload: local vs
 * controlled file state, extension/size validation, and the Tauri
 * drag-and-drop listener. Keeping this out of the component keeps the render
 * focused on presentation.
 */
export function useFileUpload({
  onFileUpload,
  acceptedTypes,
  acceptedExtensions,
  maxSizeKB,
  selectedFile = null,
  onClearFile,
  uploadId,
}: UseFileUploadOptions): UseFileUploadResult {
  const [localSelectedFile, setLocalSelectedFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
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
    console.warn(`[FileUpload-${uploadId}] handleTauriFileDrop called with:`, filePath);
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

      console.warn(
        `[FileUpload-${uploadId}] File created from Tauri drop:`,
        file.name,
        "Size:",
        file.size
      );

      // Update state and call handler
      if (selectedFile === undefined) {
        setLocalSelectedFile(file);
      }
      console.warn(`[FileUpload-${uploadId}] Calling onFileUploadRef.current`);
      onFileUploadRef.current?.(file);
    } catch (error) {
      console.error("Failed to process Tauri file drop:", error);
    }
  };

  // Keep a stable ref to the latest handler so the listener below can register
  // once and still call the current closure (deps otherwise force re-registration).
  const handleTauriFileDropRef = useRef(handleTauriFileDrop);
  useEffect(() => {
    handleTauriFileDropRef.current = handleTauriFileDrop;
  });

  // Handle Tauri-specific drag and drop events
  useEffect(() => {
    let unlisten: (() => void) | undefined;

    const setupTauriDragDrop = async () => {
      // Prevent multiple registrations
      if (listenerRegisteredRef.current) {
        console.warn(`[FileUpload-${uploadId}] Listener already registered, skipping`);
        return;
      }

      try {
        console.warn(`[FileUpload-${uploadId}] Setting up Tauri drag drop listener`);
        listenerRegisteredRef.current = true;
        // Listen for Tauri drag and drop events
        unlisten = await getCurrentWebview().onDragDropEvent((event) => {
          // Only process if this specific drop zone is being hovered
          if (!dropZoneRef.current) return;

          const hasPosition = (
            payload: unknown
          ): payload is { position: { x: number; y: number } } => {
            if (typeof payload !== "object" || payload === null) return false;
            const pos = (payload as { position?: unknown }).position;
            return (
              typeof pos === "object" &&
              pos !== null &&
              typeof (pos as { x?: unknown }).x === "number" &&
              typeof (pos as { y?: unknown }).y === "number"
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
              console.warn(`Files dropped on ${uploadId}:`, event.payload.paths);

              // Process the first file
              if (event.payload.paths && event.payload.paths.length > 0) {
                const filePath = event.payload.paths[0];
                console.warn(`Processing file for ${uploadId}:`, filePath);
                handleTauriFileDropRef.current(filePath);
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
      console.warn(`[FileUpload-${uploadId}] Cleaning up Tauri drag drop listener`);
      if (unlisten) {
        unlisten();
        listenerRegisteredRef.current = false;
      }
    };
  }, [uploadId]); // Register once per drop zone; dynamic values are read via refs

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

    console.warn("Validation:", {
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

  return {
    currentFile,
    isDragging,
    fileInputRef,
    dropZoneRef,
    handleFileSelect,
    clearFile,
    triggerFileSelect,
  };
}
