import { useState, useEffect } from "react";
import { DateValue } from "@internationalized/date";
import BasePortfolio from "@components/portfolio/base-portfolio";
import { FunderData } from "@components/portfolio/funder-upload-section";
import FileService, { VersionInfo, FunderUploadInfo } from "@services/file-service";
import { useFileErrorState } from "@/hooks/use-file-error-state";
import { UnmatchedDealsResultModal } from "@components/portfolio/unmatched-deals-result-modal";

const PORTFOLIO = "Alder";

const monthlyFunderList: FunderData[] = [
  {
    name: "BHB",
    acceptedTypes: ["text/csv"],
    acceptedExtensions: [".csv"],
    maxSizeKB: 5120,
  },
  {
    name: "BIG",
    acceptedTypes: ["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"],
    acceptedExtensions: [".xlsx"],
    maxSizeKB: 10240,
  },
  {
    name: "Clear View",
    acceptedTypes: ["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"],
    acceptedExtensions: [".xlsx"],
    maxSizeKB: 10240,
  },
  {
    name: "eFin",
    acceptedTypes: [
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "text/csv",
    ],
    acceptedExtensions: [".xlsx", ".csv"],
    maxSizeKB: 5120,
  },
  {
    name: "InAdvance",
    acceptedTypes: ["text/csv"],
    acceptedExtensions: [".csv"],
    maxSizeKB: 5120,
  },
  {
    name: "Kings",
    acceptedTypes: ["text/csv"],
    acceptedExtensions: [".csv"],
    maxSizeKB: 15360,
  },
  {
    name: "Boom",
    acceptedTypes: [
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "application/vnd.ms-excel",
    ],
    acceptedExtensions: [".xlsx", ".xls"],
    maxSizeKB: 10240,
  },
  {
    name: "Payva",
    acceptedTypes: [],
    acceptedExtensions: [],
    disabled: true,
  },
];

function AlderPortfolio() {
  const [monthlyFiles, setMonthlyFiles] = useState<Record<string, File>>({});
  const [existingWorkbook, setExistingWorkbook] = useState<File | null>(null);
  const [selectedDate, setSelectedDate] = useState<DateValue | null>(null);
  const [versions, setVersions] = useState<VersionInfo[]>([]);
  const [funderUploads, setFunderUploads] = useState<FunderUploadInfo[]>([]);
  const {
    workbookError,
    monthlyErrorStates,
    setWorkbookErrorState,
    setFunderErrorState,
  } = useFileErrorState();

  const [isUploading, setIsUploading] = useState(false);
  const [isUpdatingNetRtr, setIsUpdatingNetRtr] = useState(false);
  const [unmatchedDealsModalOpen, setUnmatchedDealsModalOpen] = useState(false);
  const [unmatchedDeals, setUnmatchedDeals] = useState<
    Array<{
      funder_name: string;
      sheet_name: string;
      advance_id: string;
      merchant_name: string;
      gross_amount: number;
      management_fee: number;
      net_amount: number;
    }>
  >([]);

  useEffect(() => {
    const loadActiveVersion = async () => {
      const activeVersion = await FileService.getActiveVersion(PORTFOLIO);
      if (activeVersion) {
        const file = new File([], activeVersion.original_filename, {
          type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        });
        Object.defineProperty(file, "size", { value: activeVersion.file_size, writable: false });
        setExistingWorkbook(file);
      }
    };
    const loadVersions = async () => {
      setVersions(await FileService.getPortfolioVersions(PORTFOLIO));
    };
    loadActiveVersion();
    loadVersions();
  }, []);

  useEffect(() => {
    const loadFunderUploads = async () => {
      if (!selectedDate) {
        setFunderUploads([]);
        setMonthlyFiles({});
        return;
      }
      const reportDate = selectedDate.toString();
      const uploads = await FileService.getFunderUploadsForDate(PORTFOLIO, reportDate);
      setFunderUploads(uploads);

      // Load monthly funder files
      const filesMap: Record<string, File> = {};
      uploads
        .filter((u) => u.upload_type === "monthly")
        .forEach((upload) => {
          const file = new File([], upload.original_filename, {
            type: upload.original_filename.endsWith(".csv")
              ? "text/csv"
              : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          });
          Object.defineProperty(file, "size", { value: upload.file_size, writable: false });
          filesMap[upload.funder_name] = file;
        });
      setMonthlyFiles(filesMap);
    };
    loadFunderUploads();
  }, [selectedDate]);

  const handleDateChange = (date: DateValue | null) => setSelectedDate(date);

  const handleFileUpload = async (file: File) => {
    if (isUploading || !selectedDate) return;
    const reportDate = selectedDate.toString();
    try {
      setIsUploading(true);
      const versionExists = await FileService.checkVersionExists(PORTFOLIO, reportDate);
      if (versionExists) {
        if (!window.confirm(`A version already exists for ${reportDate}. Overwrite?`)) return;
      }
      const response = await FileService.savePortfolioWorkbookValidated(PORTFOLIO, file, reportDate);
      if (response.success) {
        setExistingWorkbook(file);
        setWorkbookErrorState(false);
        setVersions(await FileService.getPortfolioVersions(PORTFOLIO));
      } else {
        setWorkbookErrorState(true, response.validation_errors?.join(", ") || response.message);
      }
    } catch (error) {
      console.error("Error saving workbook:", error);
    } finally {
      setIsUploading(false);
    }
  };

  const handleClearMainFile = () => setExistingWorkbook(null);

  const handleMonthlyFunderUpload = async (funderName: string, file: File) => {
    if (!selectedDate) return;
    const reportDate = selectedDate.toString();
    try {
      const exists = await FileService.checkFunderUploadExists(PORTFOLIO, funderName, reportDate, "monthly");
      if (exists) {
        if (!window.confirm(`A file already exists for ${funderName} on ${reportDate}. Overwrite?`)) return;
      }
      const response = await FileService.saveFunderUploadValidated(PORTFOLIO, funderName, file, reportDate, "monthly");
      if (response.success) {
        setMonthlyFiles((prev) => ({ ...prev, [funderName]: file }));
        setFunderErrorState("monthly", funderName, false);
        setFunderUploads(await FileService.getFunderUploadsForDate(PORTFOLIO, reportDate));
      } else {
        setFunderErrorState("monthly", funderName, true, response.validation_errors?.join(", ") || response.message);
      }
    } catch (error) {
      console.error(`Error uploading funder file for ${funderName}:`, error);
      setFunderErrorState("monthly", funderName, true, "Upload failed");
    }
  };

  const handleMonthlyClearFile = async (funderName: string) => {
    if (selectedDate) {
      const reportDate = selectedDate.toString();
      const upload = funderUploads.find((u) => u.funder_name === funderName && u.upload_type === "monthly");
      if (upload) {
        try {
          await FileService.deleteFunderUpload(upload.id);
          setFunderUploads(await FileService.getFunderUploadsForDate(PORTFOLIO, reportDate));
        } catch (error) {
          console.error(`Error deleting ${funderName} upload:`, error);
        }
      }
    }
    setMonthlyFiles((prev) => { const u = { ...prev }; delete u[funderName]; return u; });
  };

  const handleUpdateNetRtr = async () => {
    if (!selectedDate || isUpdatingNetRtr) return;
    try {
      setIsUpdatingNetRtr(true);
      const response = await FileService.updatePortfolioWithNetRtr(PORTFOLIO, selectedDate.toString());
      if (response.success) {
        if (response.unmatched_deals && response.unmatched_deals.length > 0) {
          setUnmatchedDeals(response.unmatched_deals);
          setUnmatchedDealsModalOpen(true);
          alert(`Portfolio updated! ${response.unmatched_count} unmatched deals found. Please review.`);
        } else {
          alert("Portfolio updated successfully with Net RTR values! All deals matched.");
        }
        setVersions(await FileService.getPortfolioVersions(PORTFOLIO));
      } else {
        alert(`Failed to update portfolio: ${response.message}`);
      }
    } catch (error) {
      console.error("Error updating portfolio:", error);
      alert("Error updating portfolio. Check console for details.");
    } finally {
      setIsUpdatingNetRtr(false);
    }
  };

  const canUpdateNetRtr = !!(
    selectedDate &&
    existingWorkbook &&
    Object.keys(monthlyFiles).length > 0
  );

  return (
    <>
      <BasePortfolio
        portfolioName={PORTFOLIO}
        onDateChange={handleDateChange}
        onFileUpload={handleFileUpload}
        onClearMainFile={handleClearMainFile}
        monthlyFunders={monthlyFunderList}
        onMonthlyFunderUpload={handleMonthlyFunderUpload}
        onMonthlyClearFile={handleMonthlyClearFile}
        monthlyUploadedFiles={monthlyFiles}
        existingWorkbookFile={existingWorkbook}
        workbookError={workbookError}
        monthlyErrorStates={monthlyErrorStates}
        onUpdateNetRtr={handleUpdateNetRtr}
        canUpdateNetRtr={canUpdateNetRtr}
        isUpdatingNetRtr={isUpdatingNetRtr}
      />

      {/* Uploaded Files Summary */}
      {selectedDate && funderUploads.length > 0 && (
        <div className="max-w-6xl mx-auto mt-6 p-6 bg-default-50 rounded-lg border border-default-200">
          <h3 className="text-xl font-semibold mb-4">
            Uploaded Files for {selectedDate.toString()}
          </h3>
          <div className="space-y-2">
            {monthlyFunderList
              .filter((f) => !f.disabled)
              .map((funder) => {
                const uploaded = funderUploads.find(
                  (u) => u.funder_name === funder.name && u.upload_type === "monthly"
                );
                return (
                  <div
                    key={funder.name}
                    className="flex items-center justify-between p-2 bg-default-100 rounded"
                  >
                    <span className="text-sm">{funder.name}</span>
                    {uploaded ? (
                      <span className="text-xs text-success-600">
                        {uploaded.original_filename}
                      </span>
                    ) : (
                      <span className="text-xs text-default-400">Not uploaded</span>
                    )}
                  </div>
                );
              })}
          </div>
        </div>
      )}

      {/* Version History */}
      {versions.length > 0 && (
        <div className="max-w-6xl mx-auto mt-6 p-6 bg-default-50 rounded-lg border border-default-200">
          <h3 className="text-xl font-semibold mb-4">Version History</h3>
          <div className="space-y-2">
            {versions.slice(0, 5).map((version) => (
              <div
                key={version.id}
                className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-2 p-3 bg-default-100 rounded"
              >
                <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2 min-w-0">
                  <span className="font-medium whitespace-nowrap">{version.report_date}</span>
                  <span className="text-sm text-default-500 truncate" title={version.original_filename}>
                    {version.original_filename}
                  </span>
                  {version.is_active && (
                    <span className="text-xs bg-success-100 text-success-700 px-2 py-1 rounded self-start sm:self-auto whitespace-nowrap">
                      Active
                    </span>
                  )}
                </div>
                <span className="text-sm text-default-500 whitespace-nowrap">
                  {new Date(version.upload_timestamp).toLocaleString()}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      <UnmatchedDealsResultModal
        isOpen={unmatchedDealsModalOpen}
        onOpenChange={setUnmatchedDealsModalOpen}
        unmatchedDeals={unmatchedDeals}
        portfolioName={PORTFOLIO}
        reportDate={selectedDate?.toString() || ""}
      />
    </>
  );
}

export default AlderPortfolio;
