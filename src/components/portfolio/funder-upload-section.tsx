import React, { useState } from "react";
import FileUpload from "./file-upload";

export interface FunderData {
  name: string;
  acceptedTypes: string[];
  acceptedExtensions: string[];
  maxSizeKB?: number;
}

interface FunderUploadSectionProps {
  type: "daily" | "weekly" | "monthly";
  funders: FunderData[];
  onFileUpload?: (funderName: string, file: File) => void;
  uploadedFiles?: Record<string, File>;
  onClearFile?: (funderName: string) => void;
  errorStates?: Record<string, { hasError: boolean; message?: string }>;
}

const FunderUploadSection: React.FC<FunderUploadSectionProps> = ({
  type,
  funders,
  onFileUpload,
  uploadedFiles = {},
  onClearFile,
  errorStates = {},
}) => {
  const [localFiles, setLocalFiles] = useState<Record<string, File>>({});

  const handleFileUpload = (funderName: string, file: File) => {
    setLocalFiles((prev) => ({ ...prev, [funderName]: file }));
    onFileUpload?.(funderName, file);
  };

  const handleClearFile = (funderName: string) => {
    setLocalFiles((prev) => {
      const updated = { ...prev };
      delete updated[funderName];
      return updated;
    });
    onClearFile?.(funderName);
  };

  const getFileForFunder = (funderName: string) => {
    return uploadedFiles[funderName] || localFiles[funderName] || null;
  };

  const capitalizedType = type.charAt(0).toUpperCase() + type.slice(1);

  return (
    <div className="bg-default rounded-lg p-6 border border-default-200">
      <h3 className="text-lg font-semibold mb-4 text-foreground text-center">
        {capitalizedType} Upload
      </h3>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {funders.map((funder) => (
          <div key={funder.name} className="bg-default-50 rounded-lg p-4 border border-default-200">
            <h4 className="text-sm font-medium text-foreground mb-3 text-center">{funder.name}</h4>

            <FileUpload
              onFileUpload={(file) => handleFileUpload(funder.name, file)}
              selectedFile={getFileForFunder(funder.name)}
              onClearFile={() => handleClearFile(funder.name)}
              label={`Upload ${type} report`}
              description={`${funder.acceptedExtensions.join(", ")} files only`}
              acceptedTypes={funder.acceptedTypes}
              acceptedExtensions={funder.acceptedExtensions}
              maxSizeKB={funder.maxSizeKB || 10240}
              uploadId={`funder-${type}-${funder.name}`}
              hasError={errorStates[funder.name]?.hasError || false}
              errorMessage={errorStates[funder.name]?.message}
            />
          </div>
        ))}
      </div>
    </div>
  );
};

export default FunderUploadSection;
