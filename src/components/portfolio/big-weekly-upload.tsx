import React from "react";
import { Button, Progress } from "@heroui/react";
import { Icon } from "@iconify/react";
import FileUpload from "./file-upload";

const MAX_FILES = 4;

interface BigWeeklyUploadProps {
  files: File[];
  onFileUpload: (file: File) => void;
  onRemoveFile: (index: number) => void;
}

const BigWeeklyUpload: React.FC<BigWeeklyUploadProps> = ({ files, onFileUpload, onRemoveFile }) => {
  const uploadedCount = files.length;
  const canUploadMore = uploadedCount < MAX_FILES;

  return (
    <div className="bg-default rounded-lg p-6 border border-default-200">
      <h3 className="text-lg font-semibold mb-4 text-foreground text-center">BIG Weekly Reports</h3>

      <Progress
        label={`${uploadedCount} of ${MAX_FILES} weekly reports uploaded`}
        value={(uploadedCount / MAX_FILES) * 100}
        color={uploadedCount === MAX_FILES ? "success" : "primary"}
        className="mb-4"
        size="md"
        showValueLabel={false}
      />

      {/* Uploaded files list */}
      {files.length > 0 && (
        <div className="space-y-2 mb-4">
          {files.map((file, index) => (
            <div
              key={`${file.name}-${index}`}
              className="flex items-center justify-between p-3 bg-default-100 rounded-lg border border-default-200"
            >
              <div className="flex items-center gap-2 min-w-0 flex-1">
                <Icon icon="vscode-icons:file-type-excel" className="w-5 h-5 flex-shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-foreground truncate" title={file.name}>
                    {file.name}
                  </p>
                  <p className="text-xs text-default-500">
                    Week {index + 1} &middot; {(file.size / 1024).toFixed(1)} KB
                  </p>
                </div>
              </div>
              <Button
                isIconOnly
                color="danger"
                variant="light"
                size="sm"
                onPress={() => onRemoveFile(index)}
              >
                <Icon icon="material-symbols:close-rounded" className="w-4 h-4" />
              </Button>
            </div>
          ))}
        </div>
      )}

      {/* Upload zone */}
      {canUploadMore && (
        <FileUpload
          onFileUpload={onFileUpload}
          label={`Upload weekly report (${uploadedCount + 1} of ${MAX_FILES})`}
          description=".xlsx files only"
          acceptedTypes={["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"]}
          acceptedExtensions={[".xlsx"]}
          maxSizeKB={5120}
          uploadId="funder-weekly-BIG"
        />
      )}
    </div>
  );
};

export default BigWeeklyUpload;
