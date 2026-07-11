import { useState } from "react";
import PivotSyncService, { CloudSyncPreview } from "@/services/pivot-sync-service";
import { toast } from "@/services/toast-service";

export interface StartSyncResult {
  ok: boolean;
  validationErrors: string[];
}

/**
 * Drives the cloud save for a monthly funder upload: validate + parse the
 * file, run a dry-run of the validation RPC, show the reconciliation for
 * confirmation, then commit payments transactionally.
 */
export function useCloudSync() {
  const [previews, setPreviews] = useState<CloudSyncPreview[]>([]);
  const [isModalOpen, setModalOpen] = useState(false);
  const [isCommitting, setCommitting] = useState(false);

  const startSync = async (
    portfolioName: string,
    funderName: string,
    file: File,
    reportDate: string
  ): Promise<StartSyncResult> => {
    try {
      const result = await PivotSyncService.preview(portfolioName, funderName, file, reportDate);
      if (result.validationErrors.length > 0) {
        return { ok: false, validationErrors: result.validationErrors };
      }
      if (result.previews.length > 0) {
        setPreviews(result.previews);
        setModalOpen(true);
      }
      return { ok: true, validationErrors: [] };
    } catch (error) {
      console.error("Cloud sync preview failed:", error);
      toast.error("Cloud save failed", String(error));
      return { ok: false, validationErrors: [] };
    }
  };

  const commit = async () => {
    setCommitting(true);
    try {
      for (const preview of previews) {
        await PivotSyncService.commit(preview);
      }
      const totalMatched = previews.reduce((n, p) => n + p.reconciliation.matched_count, 0);
      const totalUnmatched = previews.reduce((n, p) => n + p.reconciliation.unmatched_count, 0);
      toast.success(
        "Saved to cloud",
        `${totalMatched} payment${totalMatched === 1 ? "" : "s"} written` +
          (totalUnmatched > 0 ? `, ${totalUnmatched} unmatched row(s) pending resolution` : "")
      );
      setModalOpen(false);
      setPreviews([]);
    } catch (error) {
      console.error("Cloud sync commit failed:", error);
      toast.error("Cloud save failed", String(error));
    } finally {
      setCommitting(false);
    }
  };

  return { previews, isModalOpen, setModalOpen, isCommitting, startSync, commit };
}
