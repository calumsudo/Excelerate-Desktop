import { useState, useEffect, useCallback } from "react";
import { DateValue } from "@internationalized/date";
import BasePortfolio from "@components/portfolio/base-portfolio";
import { FunderData } from "@components/portfolio/funder-upload-section";
import PivotSyncService, { CloudUploadInfo, uiFunderName } from "@services/pivot-sync-service";
import WorkbookExportService from "@services/workbook-export-service";
import { toast } from "@services/toast-service";
import { useFileErrorState } from "@/hooks/use-file-error-state";
import { useCloudSync } from "@/hooks/use-cloud-sync";
import PivotReconciliationModal from "@components/portfolio/pivot-reconciliation-modal";
import WorkbookImportWizard from "@components/portfolio/workbook-import-wizard";

const PORTFOLIO = "White Rabbit";

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

function WhiteRabbitPortfolio() {
  const [monthlyFiles, setMonthlyFiles] = useState<Record<string, File>>({});
  const [selectedDate, setSelectedDate] = useState<DateValue | null>(null);
  const [funderUploads, setFunderUploads] = useState<CloudUploadInfo[]>([]);
  const [isExporting, setIsExporting] = useState(false);
  const { monthlyErrorStates, setFunderErrorState } = useFileErrorState();
  const cloudSync = useCloudSync();

  const refreshUploads = useCallback(async (reportDate: string) => {
    try {
      const uploads = await PivotSyncService.listUploadsForDate(PORTFOLIO, reportDate);
      setFunderUploads(uploads);

      const filesMap: Record<string, File> = {};
      uploads.forEach((upload) => {
        const file = new File([], upload.original_filename, {
          type: upload.original_filename.endsWith(".csv")
            ? "text/csv"
            : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        });
        Object.defineProperty(file, "size", {
          value: upload.file_size ?? 0,
          writable: false,
        });
        filesMap[uiFunderName(upload.funder_name)] = file;
      });
      setMonthlyFiles(filesMap);
    } catch (error) {
      console.error("Error loading funder uploads:", error);
    }
  }, []);

  useEffect(() => {
    if (!selectedDate) {
      setFunderUploads([]);
      setMonthlyFiles({});
      return;
    }
    refreshUploads(selectedDate.toString());
  }, [selectedDate, refreshUploads]);

  const handleDateChange = (date: DateValue | null) => setSelectedDate(date);

  const handleMonthlyFunderUpload = async (funderName: string, file: File) => {
    if (!selectedDate) return;
    const reportDate = selectedDate.toString();
    try {
      const exists = await PivotSyncService.uploadExists(PORTFOLIO, funderName, reportDate);
      if (exists) {
        if (!window.confirm(`A file already exists for ${funderName} on ${reportDate}. Overwrite?`))
          return;
      }
      const result = await cloudSync.startSync(PORTFOLIO, funderName, file, reportDate);
      if (result.ok) {
        setMonthlyFiles((prev) => ({ ...prev, [funderName]: file }));
        setFunderErrorState(funderName, false);
        await refreshUploads(reportDate);
      } else if (result.validationErrors.length > 0) {
        setFunderErrorState(funderName, true, result.validationErrors.join(", "));
      } else {
        setFunderErrorState(funderName, true, "Upload failed");
      }
    } catch (error) {
      console.error(`Error uploading funder file for ${funderName}:`, error);
      setFunderErrorState(funderName, true, "Upload failed");
    }
  };

  const handleMonthlyClearFile = async (funderName: string) => {
    if (selectedDate) {
      const reportDate = selectedDate.toString();
      const upload = funderUploads.find((u) => uiFunderName(u.funder_name) === funderName);
      if (upload) {
        if (
          !window.confirm(
            `Delete the ${funderName} upload for ${reportDate}? ` +
              `This removes its synced payments from the cloud.`
          )
        )
          return;
        try {
          await PivotSyncService.deleteUpload(upload);
          toast.success(
            "Upload deleted",
            `${funderName} payments for ${reportDate} removed from the cloud`
          );
          await refreshUploads(reportDate);
        } catch (error) {
          console.error(`Error deleting ${funderName} upload:`, error);
          toast.error("Delete failed", String(error));
          return;
        }
      }
    }
    setMonthlyFiles((prev) => {
      const u = { ...prev };
      delete u[funderName];
      return u;
    });
  };

  const handleExportWorkbook = async () => {
    if (isExporting) return;
    try {
      setIsExporting(true);
      const summary = await WorkbookExportService.exportPortfolio(PORTFOLIO);
      if (summary) {
        toast.success(
          "Workbook exported",
          `${summary.sheet_count} sheets, ${summary.deal_count} deals — ${summary.file_path}`
        );
      }
    } catch (error) {
      console.error("Error exporting workbook:", error);
      toast.error("Export failed", String(error));
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <>
      <BasePortfolio
        portfolioName={PORTFOLIO}
        onDateChange={handleDateChange}
        monthlyFunders={monthlyFunderList}
        onMonthlyFunderUpload={handleMonthlyFunderUpload}
        onMonthlyClearFile={handleMonthlyClearFile}
        monthlyUploadedFiles={monthlyFiles}
        monthlyErrorStates={monthlyErrorStates}
        onExportWorkbook={handleExportWorkbook}
        isExporting={isExporting}
      />

      <WorkbookImportWizard portfolioName={PORTFOLIO} />

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
                  (u) => uiFunderName(u.funder_name) === funder.name
                );
                return (
                  <div
                    key={funder.name}
                    className="flex items-center justify-between p-2 bg-default-100 rounded"
                  >
                    <span className="text-sm">{funder.name}</span>
                    {uploaded ? (
                      <span className="text-xs text-success-600">{uploaded.original_filename}</span>
                    ) : (
                      <span className="text-xs text-default-400">Not uploaded</span>
                    )}
                  </div>
                );
              })}
          </div>
        </div>
      )}

      <PivotReconciliationModal
        isOpen={cloudSync.isModalOpen}
        onOpenChange={cloudSync.setModalOpen}
        previews={cloudSync.previews}
        onCommit={cloudSync.commit}
        isCommitting={cloudSync.isCommitting}
      />
    </>
  );
}

export default WhiteRabbitPortfolio;
