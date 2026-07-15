import { invoke } from "@tauri-apps/api/core";
import { supabase } from "./supabase";

/** Pivot rows + parser totals returned by the Rust `parse_funder_pivot` command. */
export interface PivotRowData {
  advance_id: string;
  merchant_name: string;
  gross_amount: number;
  management_fee: number;
  net_amount: number;
  /**
   * Fee breakdown for funders that split the servicing fee (Receivabull).
   * Omitted for every other funder. `fee_discrepancy` is
   * gross - (originator_fee + rb_fee) - net.
   */
  originator_fee?: number;
  rb_fee?: number;
  fee_discrepancy?: number;
}

export interface PivotExport {
  rows: PivotRowData[];
  total_gross: number;
  total_fee: number;
  total_net: number;
}

export interface ParseFunderPivotResponse {
  success: boolean;
  message: string;
  validation_errors: string[];
  validation_warnings: string[];
  /** null when no parser exists for the funder (e.g. Payva) */
  pivot: PivotExport | null;
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

/** Outcome of the parse + dry-run step for one uploaded file. */
export interface PreviewResult {
  previews: CloudSyncPreview[];
  validationErrors: string[];
  validationWarnings: string[];
}

/** A pivot row still waiting to be matched to a deal, with its upload scope. */
export interface UnresolvedPivotRow {
  row_id: string;
  advance_id: string | null;
  merchant_name: string;
  gross: number;
  fee: number;
  net: number;
  portfolio_id: number | null;
  funder_id: number | null;
  report_date: string;
}

/** One committed pivot row as stored in funder_pivot_rows. */
export interface CommittedPivotRow {
  id: string;
  advance_id: string | null;
  merchant_name: string;
  gross: number;
  fee: number;
  net: number;
  originator_fee: number | null;
  rb_fee: number | null;
  fee_discrepancy: number | null;
  matched_deal_id: string | null;
}

/** A committed pivot: the funder_pivot_tables totals row plus its rows. */
export interface CommittedPivot {
  id: string;
  report_date: string;
  total_gross: number;
  total_fee: number;
  total_net: number;
  row_count: number;
  rows: CommittedPivotRow[];
}

/** One funder_uploads row, resolved for display. */
export interface CloudUploadInfo {
  id: string;
  funder_id: number;
  funder_name: string;
  report_date: string;
  original_filename: string;
  file_size: number | null;
  storage_path: string | null;
  created_at: string;
}

// UI funder labels that differ from funders.name in Supabase
const FUNDER_NAME_MAP: Record<string, string> = {
  InAdvance: "In Advance",
  Payva: "PayVa",
  ClearView: "Clear View",
  Receivabull: "R'bull",
};

const dbFunderName = (uiName: string) => FUNDER_NAME_MAP[uiName] ?? uiName;

// funders.name in Supabase → the label the portfolio pages use ("Clear View"
// is spelled the same in both, so only these need mapping back)
const DB_TO_UI_FUNDER: Record<string, string> = {
  "In Advance": "InAdvance",
  PayVa: "Payva",
  "R'bull": "Receivabull",
};

export const uiFunderName = (dbName: string) => DB_TO_UI_FUNDER[dbName] ?? dbName;

export class PivotSyncService {
  private static portfolioIds = new Map<string, number>();
  private static funderIds = new Map<string, number>();
  private static funderNamesById: Map<number, string> | null = null;

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

  private static async getFunderNames(): Promise<Map<number, string>> {
    if (this.funderNamesById) return this.funderNamesById;
    const { data, error } = await supabase.from("funders").select("id, name");
    if (error) throw new Error(`Failed to load funders: ${error.message}`);
    this.funderNamesById = new Map((data ?? []).map((f) => [f.id, f.name]));
    return this.funderNamesById;
  }

  /** Validate + parse the uploaded file via the Rust parser for one portfolio. */
  private static async parsePivot(
    portfolioName: string,
    funderName: string,
    fileData: number[],
    fileName: string,
    reportDate: string
  ): Promise<ParseFunderPivotResponse> {
    return await invoke<ParseFunderPivotResponse>("parse_funder_pivot", {
      portfolioName,
      funderName,
      fileData,
      fileName,
      reportDate,
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
        // Only present for Receivabull; the RPC stores NULL when omitted.
        ...(r.originator_fee !== undefined && { originator_fee: r.originator_fee }),
        ...(r.rb_fee !== undefined && { rb_fee: r.rb_fee }),
        ...(r.fee_discrepancy !== undefined && { fee_discrepancy: r.fee_discrepancy }),
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
   */
  private static async previewPortfolio(
    portfolioName: string,
    funderName: string,
    pivot: PivotExport,
    file: File,
    reportDate: string
  ): Promise<CloudSyncPreview> {
    const [portfolioId, funderId] = await Promise.all([
      this.getPortfolioId(portfolioName),
      this.getFunderId(funderName),
    ]);

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
   * Validate, parse, and preview the cloud sync for a freshly uploaded funder
   * file. A Clear View file carries deals for both portfolios, so it produces
   * one preview each. Validation failures return errors and no previews.
   */
  static async preview(
    portfolioName: string,
    funderName: string,
    file: File,
    reportDate: string
  ): Promise<PreviewResult> {
    const isClearView = funderName === "Clear View" || funderName === "ClearView";
    const portfolios = isClearView ? ["Alder", "White Rabbit"] : [portfolioName];
    const fileData = Array.from(new Uint8Array(await file.arrayBuffer()));

    const previews: CloudSyncPreview[] = [];
    const validationWarnings: string[] = [];
    for (const pf of portfolios) {
      const parsed = await this.parsePivot(pf, funderName, fileData, file.name, reportDate);
      validationWarnings.push(...parsed.validation_warnings);
      if (!parsed.success) {
        return { previews: [], validationErrors: parsed.validation_errors, validationWarnings };
      }
      if (!parsed.pivot) continue; // no parser for this funder yet
      previews.push(await this.previewPortfolio(pf, funderName, parsed.pivot, file, reportDate));
    }
    return { previews, validationErrors: [], validationWarnings };
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

  /**
   * Every pivot row across all uploads still waiting for a deal
   * (matched_deal_id IS NULL), newest report dates first. These are the
   * rows whose dollars are not yet in net_rtr_payments.
   */
  static async listUnresolvedRows(): Promise<UnresolvedPivotRow[]> {
    const PAGE = 1000; // PostgREST response cap
    const rows: Array<{
      id: string;
      pivot_table_id: string;
      advance_id: string | null;
      merchant_name: string;
      gross: number;
      fee: number;
      net: number;
    }> = [];
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await supabase
        .from("funder_pivot_rows")
        .select("id, pivot_table_id, advance_id, merchant_name, gross, fee, net")
        .is("matched_deal_id", null)
        .order("id")
        .range(from, from + PAGE - 1);
      if (error) throw new Error(`Failed to load unresolved pivot rows: ${error.message}`);
      if (!data || data.length === 0) break;
      rows.push(...data);
      if (data.length < PAGE) break;
    }
    if (rows.length === 0) return [];

    const pivotIds = [...new Set(rows.map((r) => r.pivot_table_id))];
    const { data: pivots, error: pivotError } = await supabase
      .from("funder_pivot_tables")
      .select("id, portfolio_id, funder_id, report_date")
      .in("id", pivotIds);
    if (pivotError) throw new Error(`Failed to load pivot tables: ${pivotError.message}`);
    const pivotsById = new Map((pivots ?? []).map((p) => [p.id, p]));

    return rows
      .map((row) => {
        const pivot = pivotsById.get(row.pivot_table_id);
        return {
          row_id: row.id,
          advance_id: row.advance_id,
          merchant_name: row.merchant_name,
          gross: row.gross,
          fee: row.fee,
          net: row.net,
          portfolio_id: pivot?.portfolio_id ?? null,
          funder_id: pivot?.funder_id ?? null,
          report_date: pivot?.report_date ?? "",
        };
      })
      .sort(
        (a, b) =>
          b.report_date.localeCompare(a.report_date) ||
          a.merchant_name.localeCompare(b.merchant_name)
      );
  }

  /** All funder UI labels known to Supabase, alphabetically. */
  static async listFunders(): Promise<string[]> {
    const names = await this.getFunderNames();
    return [...names.values()].map(uiFunderName).sort((a, b) => a.localeCompare(b));
  }

  /**
   * Distinct report dates that have a committed pivot for one portfolio +
   * funder, newest first. Drives the year/month selectors on the Pivot Tables
   * page so only periods with data are offered.
   */
  static async listPivotMonths(portfolioName: string, funderName: string): Promise<string[]> {
    const [portfolioId, funderId] = await Promise.all([
      this.getPortfolioId(portfolioName),
      this.getFunderId(funderName),
    ]);
    const { data, error } = await supabase
      .from("funder_pivot_tables")
      .select("report_date")
      .eq("portfolio_id", portfolioId)
      .eq("funder_id", funderId)
      .order("report_date", { ascending: false });
    if (error) throw new Error(`Failed to load pivot months: ${error.message}`);
    return [...new Set((data ?? []).map((r) => r.report_date))];
  }

  /**
   * The committed pivot (totals + every row) for one portfolio + funder +
   * report date, or null if none was committed for that combination.
   */
  static async getPivotTable(
    portfolioName: string,
    funderName: string,
    reportDate: string
  ): Promise<CommittedPivot | null> {
    const [portfolioId, funderId] = await Promise.all([
      this.getPortfolioId(portfolioName),
      this.getFunderId(funderName),
    ]);
    const { data: table, error: tableError } = await supabase
      .from("funder_pivot_tables")
      .select("id, report_date, total_gross, total_fee, total_net, row_count")
      .eq("portfolio_id", portfolioId)
      .eq("funder_id", funderId)
      .eq("report_date", reportDate)
      .maybeSingle();
    if (tableError) throw new Error(`Failed to load pivot table: ${tableError.message}`);
    if (!table) return null;

    const PAGE = 1000; // PostgREST response cap
    const rows: CommittedPivotRow[] = [];
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await supabase
        .from("funder_pivot_rows")
        .select(
          "id, advance_id, merchant_name, gross, fee, net, originator_fee, rb_fee, fee_discrepancy, matched_deal_id"
        )
        .eq("pivot_table_id", table.id)
        .order("merchant_name")
        .range(from, from + PAGE - 1);
      if (error) throw new Error(`Failed to load pivot rows: ${error.message}`);
      if (!data || data.length === 0) break;
      rows.push(...data);
      if (data.length < PAGE) break;
    }
    return { ...table, rows };
  }

  /** All funder uploads recorded in Supabase for one portfolio + report date. */
  static async listUploadsForDate(
    portfolioName: string,
    reportDate: string
  ): Promise<CloudUploadInfo[]> {
    const portfolioId = await this.getPortfolioId(portfolioName);
    const [funderNames, { data, error }] = await Promise.all([
      this.getFunderNames(),
      supabase
        .from("funder_uploads")
        .select(
          "id, funder_id, report_date, original_filename, file_size, storage_path, created_at"
        )
        .eq("portfolio_id", portfolioId)
        .eq("report_date", reportDate)
        .order("funder_id"),
    ]);
    if (error) throw new Error(`Failed to load funder uploads: ${error.message}`);
    return (data ?? []).map((u) => ({
      ...u,
      funder_name: funderNames.get(u.funder_id) ?? `Funder ${u.funder_id}`,
    }));
  }

  /** Whether an upload already exists for this (portfolio, funder, date). */
  static async uploadExists(
    portfolioName: string,
    uiFunderName: string,
    reportDate: string
  ): Promise<boolean> {
    const [portfolioId, funderId] = await Promise.all([
      this.getPortfolioId(portfolioName),
      this.getFunderId(uiFunderName),
    ]);
    const { count, error } = await supabase
      .from("funder_uploads")
      .select("id", { count: "exact", head: true })
      .eq("portfolio_id", portfolioId)
      .eq("funder_id", funderId)
      .eq("report_date", reportDate);
    if (error) throw new Error(`Failed to check funder upload: ${error.message}`);
    return (count ?? 0) > 0;
  }

  /**
   * Delete one upload and everything derived from it: its committed
   * payments (scoped by source_upload_id), the raw file in Storage, and the
   * funder_uploads row (pivot tables/rows cascade).
   */
  static async deleteUpload(upload: CloudUploadInfo): Promise<void> {
    const { error: paymentsError } = await supabase
      .from("net_rtr_payments")
      .delete()
      .eq("source_upload_id", upload.id);
    if (paymentsError) {
      throw new Error(`Failed to delete payments for upload: ${paymentsError.message}`);
    }

    if (upload.storage_path) {
      const { error: storageError } = await supabase.storage
        .from("funder-uploads")
        .remove([upload.storage_path]);
      if (storageError) {
        console.error(`Failed to delete stored file ${upload.storage_path}:`, storageError);
      }
    }

    const { error } = await supabase.from("funder_uploads").delete().eq("id", upload.id);
    if (error) throw new Error(`Failed to delete funder upload: ${error.message}`);
  }
}

export default PivotSyncService;
