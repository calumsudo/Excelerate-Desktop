import { invoke } from "@tauri-apps/api/core";
import { supabase } from "./supabase";

/** Pivot rows + parser totals returned by the Rust `get_pivot_for_report` command. */
export interface PivotRowData {
  advance_id: string;
  merchant_name: string;
  gross_amount: number;
  management_fee: number;
  net_amount: number;
}

export interface PivotExport {
  rows: PivotRowData[];
  total_gross: number;
  total_fee: number;
  total_net: number;
}

/** Reconciliation summary returned by the `commit_funder_pivot` RPC. */
export interface PivotReconciliation {
  committed: boolean;
  pivot_table_id: string;
  report_date: string;
  total_net: number;
  matched_count: number;
  matched_net: number;
  unmatched_count: number;
  unmatched_net: number;
  duplicate_count: number;
  duplicate_net: number;
  unmatched: Array<{
    row_id: string;
    advance_id: string | null;
    merchant_name: string;
    gross: number;
    fee: number;
    net: number;
  }>;
  duplicates: Array<{
    row_id: string;
    advance_id: string | null;
    merchant_name: string;
    gross: number;
    fee: number;
    net: number;
    match_count: number;
  }>;
}

/** One pending cloud commit: everything the reconciliation modal needs. */
export interface CloudSyncPreview {
  portfolioName: string;
  funderName: string;
  uploadId: string;
  pivot: PivotExport;
  reconciliation: PivotReconciliation;
}

// UI funder labels that differ from funders.name in Supabase
const FUNDER_NAME_MAP: Record<string, string> = {
  InAdvance: "In Advance",
  Payva: "PayVa",
  ClearView: "Clear View",
};

const dbFunderName = (uiName: string) => FUNDER_NAME_MAP[uiName] ?? uiName;

export class PivotSyncService {
  private static portfolioIds = new Map<string, number>();
  private static funderIds = new Map<string, number>();

  private static async getPortfolioId(portfolioName: string): Promise<number> {
    const cached = this.portfolioIds.get(portfolioName);
    if (cached !== undefined) return cached;

    const { data, error } = await supabase
      .from("portfolios")
      .select("id")
      .eq("name", portfolioName)
      .single();
    if (error || !data) {
      throw new Error(`Portfolio "${portfolioName}" not found in Supabase: ${error?.message}`);
    }
    this.portfolioIds.set(portfolioName, data.id);
    return data.id;
  }

  private static async getFunderId(uiFunderName: string): Promise<number> {
    const name = dbFunderName(uiFunderName);
    const cached = this.funderIds.get(name);
    if (cached !== undefined) return cached;

    const { data, error } = await supabase.from("funders").select("id").eq("name", name).single();
    if (error || !data) {
      throw new Error(`Funder "${name}" not found in Supabase: ${error?.message}`);
    }
    this.funderIds.set(name, data.id);
    return data.id;
  }

  private static async getPivotForReport(
    portfolioName: string,
    funderName: string,
    reportDate: string
  ): Promise<PivotExport | null> {
    return await invoke<PivotExport | null>("get_pivot_for_report", {
      portfolioName,
      funderName,
      reportDate,
      uploadType: "monthly",
    });
  }

  private static async callCommitRpc(
    uploadId: string,
    pivot: PivotExport,
    dryRun: boolean
  ): Promise<PivotReconciliation> {
    const { data, error } = await supabase.rpc("commit_funder_pivot", {
      p_upload_id: uploadId,
      p_rows: pivot.rows.map((r) => ({
        advance_id: r.advance_id,
        merchant_name: r.merchant_name,
        gross: r.gross_amount,
        fee: r.management_fee,
        net: r.net_amount,
      })),
      p_total_gross: pivot.total_gross,
      p_total_fee: pivot.total_fee,
      p_total_net: pivot.total_net,
      p_dry_run: dryRun,
    });
    if (error) {
      throw new Error(`Pivot ${dryRun ? "preview" : "commit"} failed: ${error.message}`);
    }
    return data as unknown as PivotReconciliation;
  }

  /**
   * Push one portfolio's parsed pivot to the cloud: raw file to Storage,
   * upload record to funder_uploads, then a dry-run of the validation RPC.
   * Returns null when no pivot exists locally (e.g. parser not implemented).
   */
  private static async previewPortfolio(
    portfolioName: string,
    funderName: string,
    file: File,
    reportDate: string
  ): Promise<CloudSyncPreview | null> {
    const pivot = await this.getPivotForReport(portfolioName, funderName, reportDate);
    if (!pivot) return null;

    const portfolioId = await this.getPortfolioId(portfolioName);
    const funderId = await this.getFunderId(funderName);

    const storagePath = `${portfolioId}/${funderId}/${reportDate}/${file.name}`;
    const { error: storageError } = await supabase.storage
      .from("funder-uploads")
      .upload(storagePath, await file.arrayBuffer(), {
        upsert: true,
        contentType: file.type || "application/octet-stream",
      });
    if (storageError) {
      throw new Error(`Failed to upload raw file to Storage: ${storageError.message}`);
    }

    const { data: user } = await supabase.auth.getUser();
    const { data: upload, error: uploadError } = await supabase
      .from("funder_uploads")
      .upsert(
        {
          portfolio_id: portfolioId,
          funder_id: funderId,
          report_date: reportDate,
          upload_type: "monthly",
          original_filename: file.name,
          storage_path: storagePath,
          file_size: file.size,
          uploaded_by: user.user?.id ?? null,
        },
        { onConflict: "portfolio_id,funder_id,report_date,upload_type" }
      )
      .select("id")
      .single();
    if (uploadError || !upload) {
      throw new Error(`Failed to record funder upload: ${uploadError?.message}`);
    }

    const reconciliation = await this.callCommitRpc(upload.id, pivot, true);
    return { portfolioName, funderName, uploadId: upload.id, pivot, reconciliation };
  }

  /**
   * Preview the cloud sync for a freshly uploaded funder file. A Clear View
   * file carries deals for both portfolios, so it produces one preview each.
   */
  static async preview(
    portfolioName: string,
    funderName: string,
    file: File,
    reportDate: string
  ): Promise<CloudSyncPreview[]> {
    const isClearView = funderName === "Clear View" || funderName === "ClearView";
    const portfolios = isClearView ? ["Alder", "White Rabbit"] : [portfolioName];

    const previews: CloudSyncPreview[] = [];
    for (const pf of portfolios) {
      const preview = await this.previewPortfolio(pf, funderName, file, reportDate);
      if (preview) previews.push(preview);
    }
    return previews;
  }

  /** Re-run the validation RPC for real: writes net_rtr_payments transactionally. */
  static async commit(preview: CloudSyncPreview): Promise<PivotReconciliation> {
    return await this.callCommitRpc(preview.uploadId, preview.pivot, false);
  }

  /** Resolve one unmatched pivot row to a deal and write its payment. */
  static async resolveRow(rowId: string, dealId: string): Promise<void> {
    const { error } = await supabase.rpc("resolve_pivot_row", {
      p_row_id: rowId,
      p_deal_id: dealId,
    });
    if (error) {
      throw new Error(`Failed to resolve pivot row: ${error.message}`);
    }
  }
}

export default PivotSyncService;
