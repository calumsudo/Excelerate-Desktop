import { invoke } from "@tauri-apps/api/core";
import { supabase } from "./supabase";
import type { Json } from "./supabase.types";

/** One Net RTR cell from the workbook's weekly payment matrix. */
export interface ImportPayment {
  payment_date: string;
  net: number;
}

/** One deal row parsed from a funder sheet (Rust `parse_portfolio_workbook`). */
export interface ImportDeal {
  row: number;
  merchant_name: string;
  website: string | null;
  advance_id: string | null;
  funder_advance_id: string | null;
  industry: string | null;
  state: string | null;
  fico: number | null;
  buy_rate: number | null;
  commission_rate: number | null;
  total_funded_amount: number | null;
  num_daily_payments: number | null;
  num_weekly_payments: number | null;
  participation_amount: number | null;
  new_dollars: boolean;
  rtr: boolean;
  is_default: boolean;
  date_funded: string | null;
  date_closed: string | null;
  default_date: string | null;
  payments: ImportPayment[];
}

export interface SheetImport {
  sheet_name: string;
  management_fee_rate: number | null;
  deals: ImportDeal[];
  payment_dates: string[];
  payment_count: number;
  total_net_payments: number;
  warnings: string[];
}

export interface WorkbookImport {
  sheets: SheetImport[];
  missing_sheets: string[];
  workbook_sheet_names: string[];
}

/** Summary returned by the `import_funder_sheet` RPC for one sheet. */
export interface SheetImportResult {
  deals_in_payload: number;
  deals_imported: number;
  rows_skipped: number;
  duplicate_rows_dropped: number;
  merchants_upserted: number;
  payments_deleted: number;
  payments_inserted: number;
  payments_net_inserted: number;
  payments_net_dropped: number;
  management_fee_rate: number;
  unmatched_industries: string[];
  unmatched_states: string[];
}

/** One funder sheet ready to import: parse result + resolved Supabase funder. */
export interface SheetPreview {
  sheet: SheetImport;
  funderId: number;
  funderName: string;
  /** Fee currently stored on portfolio_funders (null when not linked yet) */
  currentFeeRate: number | null;
}

export interface WorkbookImportPreview {
  portfolioId: number;
  portfolioName: string;
  filePath: string;
  sheets: SheetPreview[];
  /** Funder sheets registered in Supabase but absent from this workbook */
  missingSheets: string[];
}

export type ImportProgress =
  | { phase: "importing"; index: number; total: number; sheetName: string }
  | {
      phase: "done";
      index: number;
      total: number;
      sheetName: string;
      result: SheetImportResult;
    };

export class WorkbookImportService {
  /**
   * Parse the workbook (Rust/calamine) and resolve each funder sheet against
   * Supabase. Nothing is written yet — the wizard shows this as a preview.
   */
  static async preview(portfolioName: string, filePath: string): Promise<WorkbookImportPreview> {
    const { data: portfolio, error: portfolioError } = await supabase
      .from("portfolios")
      .select("id")
      .eq("name", portfolioName)
      .single();
    if (portfolioError || !portfolio) {
      throw new Error(`Portfolio "${portfolioName}" not found: ${portfolioError?.message}`);
    }

    const { data: funders, error: fundersError } = await supabase
      .from("funders")
      .select("id, name, sheet_name")
      .not("sheet_name", "is", null);
    if (fundersError || !funders?.length) {
      throw new Error(`Failed to load funders: ${fundersError?.message}`);
    }

    const { data: links, error: linksError } = await supabase
      .from("portfolio_funders")
      .select("funder_id, management_fee_rate")
      .eq("portfolio_id", portfolio.id);
    if (linksError) {
      throw new Error(`Failed to load portfolio funders: ${linksError.message}`);
    }
    const feeByFunder = new Map(links?.map((l) => [l.funder_id, l.management_fee_rate]) ?? []);

    const parse = await invoke<WorkbookImport>("parse_portfolio_workbook", {
      filePath,
      sheetNames: funders.map((f) => f.sheet_name),
    });

    const bySheet = new Map(funders.map((f) => [f.sheet_name, f]));
    const sheets: SheetPreview[] = parse.sheets.map((sheet) => {
      const funder = bySheet.get(sheet.sheet_name);
      if (!funder) {
        throw new Error(`No funder registered for sheet "${sheet.sheet_name}"`);
      }
      return {
        sheet,
        funderId: funder.id,
        funderName: funder.name,
        currentFeeRate: feeByFunder.get(funder.id) ?? null,
      };
    });

    return {
      portfolioId: portfolio.id,
      portfolioName,
      filePath,
      sheets,
      missingSheets: parse.missing_sheets,
    };
  }

  /** Import one funder sheet transactionally via the import_funder_sheet RPC. */
  static async importSheet(portfolioId: number, preview: SheetPreview): Promise<SheetImportResult> {
    const { data, error } = await supabase.rpc("import_funder_sheet", {
      p_portfolio_id: portfolioId,
      p_funder_id: preview.funderId,
      p_management_fee_rate: preview.sheet.management_fee_rate,
      p_deals: preview.sheet.deals as unknown as Json,
      p_total_net_payments: preview.sheet.total_net_payments,
    });
    if (error) {
      throw new Error(`Import failed for ${preview.funderName}: ${error.message}`);
    }
    return data as unknown as SheetImportResult;
  }

  /**
   * Import every parsed sheet sequentially (one transaction per sheet, so a
   * failure mid-way leaves earlier sheets imported — safe to re-run).
   */
  static async importAll(
    preview: WorkbookImportPreview,
    onProgress?: (progress: ImportProgress) => void
  ): Promise<Map<string, SheetImportResult>> {
    const results = new Map<string, SheetImportResult>();
    const total = preview.sheets.length;
    for (const [index, sheetPreview] of preview.sheets.entries()) {
      onProgress?.({
        phase: "importing",
        index,
        total,
        sheetName: sheetPreview.sheet.sheet_name,
      });
      const result = await this.importSheet(preview.portfolioId, sheetPreview);
      results.set(sheetPreview.sheet.sheet_name, result);
      onProgress?.({
        phase: "done",
        index,
        total,
        sheetName: sheetPreview.sheet.sheet_name,
        result,
      });
    }
    return results;
  }
}

export default WorkbookImportService;
