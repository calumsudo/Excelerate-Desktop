import { invoke } from "@tauri-apps/api/core";
import { save } from "@tauri-apps/plugin-dialog";
import { downloadDir } from "@tauri-apps/api/path";
import { supabase } from "./supabase";
import type { Database } from "./supabase.types";

type Tables = Database["public"]["Tables"];
type Views = Database["public"]["Views"];
type DealComputedRow = Views["deal_computed"]["Row"];
type DealPaymentRow = Views["deal_payments"]["Row"];
type MonthlyVintageRow = Views["monthly_vintage_stats"]["Row"];
type PortfolioMonthlyRow = Views["portfolio_monthly"]["Row"];
type WeeklyRtrRow = Views["weekly_rtr_matrix"]["Row"];
type FunderAllocationRow = Views["funder_allocation_current"]["Row"];
type FunderRow = Tables["funders"]["Row"];
type MerchantRow = Pick<
  Tables["merchants"]["Row"],
  "id" | "name" | "website" | "industry_id" | "state_id"
>;

// ---------------------------------------------------------------------------
// Payload shapes — must mirror the serde structs in
// src-tauri/src/workbook_export.rs exactly.
// ---------------------------------------------------------------------------

export interface ExportDeal {
  date_funded: string | null;
  merchant_name: string;
  website: string | null;
  advance_id: string | null;
  funder_advance_id: string | null;
  industry: string | null;
  state: string | null;
  fico: number | null;
  buy_rate: number | null;
  commission: number | null;
  sell_rate: number | null;
  total_amount_funded: number | null;
  commission_dollars: number | null;
  total_rtr: number | null;
  num_daily_payments: number | null;
  num_weekly_payments: number | null;
  term_months: number | null;
  participation_on_amount: number | null;
  new_dollars: boolean;
  rtr: boolean;
  new_dollars_at_work: number | null;
  rtr_dollars_at_work: number | null;
  rh_pct_of_deal: number | null;
  pro_rata_commission: number | null;
  cost_basis: number | null;
  rh_rtr: number | null;
  net_rtr: number | null;
  all_in_factor: number | null;
  points_per_month: number | null;
  gross_payment_expected: number | null;
  net_payment_expected: number | null;
  weekly_payment_expected: number | null;
  date_closed: string | null;
  total_net_received: number | null;
  net_rtr_balance: number | null;
  pct_rtr_paid: number | null;
  return_on_cost_basis: number | null;
  is_default: boolean;
  bad_debt_rtr: number | null;
  default_dollars_lost: number | null;
  default_date: string | null;
  /** Sparse payment matrix: [index into payment_dates, net] */
  payments: [number, number][];
}

export interface FunderSheetExport {
  sheet_name: string;
  funder_label: string;
  management_fee_rate: number | null;
  payment_dates: string[];
  deals: ExportDeal[];
}

export interface VintageRowExport {
  month: string | null;
  deal_count: number | null;
  new_invested: number | null;
  rtr_invested: number | null;
  total_participation: number | null;
  total_commissions: number | null;
  cost_basis: number | null;
  initial_net_rtr: number | null;
  weighted_avg_factor: number | null;
  principal_pct: number | null;
  profit_pct: number | null;
  rtr_received: number | null;
  principal_returned: number | null;
  profit_returned: number | null;
  cost_basis_after_principal: number | null;
  cost_basis_final: number | null;
  net_rtr_outstanding: number | null;
  bad_debt_rtr: number | null;
  net_rtr_outstanding_after_bad_debt: number | null;
  expected_weekly_payments: number | null;
  weighted_avg_term_months: number | null;
  avg_cost_basis_per_deal: number | null;
  vintage_return: number | null;
  bad_debt_pct: number | null;
  points_per_month: number | null;
  profit_share: number | null;
  wrc_net: number | null;
  wrc_net_vintage_return: number | null;
}

export interface WorkbookExportData {
  portfolio_name: string;
  funder_sheets: FunderSheetExport[];
  vintage_sheets: { sheet_name: string; rows: VintageRowExport[] }[];
  portfolio_rows: VintageRowExport[];
  rtr: { dates: string[]; funders: { name: string; values: number[] }[] };
  allocations: {
    funder_name: string;
    initial_cost_basis: number | null;
    pct_initial_cost_basis: number | null;
    current_cost_basis: number | null;
    pct_current_cost_basis: number | null;
    rtr_received: number | null;
    factor: number | null;
    weighted_avg_term_months: number | null;
    weighted_term_contribution: number | null;
  }[];
}

export interface ExportSummary {
  file_path: string;
  sheet_count: number;
  deal_count: number;
  payment_count: number;
}

// PostgREST caps responses at 1000 rows; deal_payments alone is ~26k rows
// per portfolio after the workbook import, so page every read.
const PAGE_SIZE = 1000;

async function fetchAllPages<T>(
  buildQuery: (
    from: number,
    to: number
  ) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>
): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await buildQuery(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(error.message);
    if (!data || data.length === 0) break;
    rows.push(...data);
    if (data.length < PAGE_SIZE) break;
  }
  return rows;
}

// ---------------------------------------------------------------------------
// Pure payload builders (exported for unit tests)
// ---------------------------------------------------------------------------

const vintageRow = (v: MonthlyVintageRow | PortfolioMonthlyRow): VintageRowExport => ({
  month: v.vintage_month,
  deal_count: v.deal_count,
  new_invested: v.new_invested,
  rtr_invested: v.rtr_invested,
  total_participation: v.total_participation,
  total_commissions: v.total_commissions,
  cost_basis: v.cost_basis,
  initial_net_rtr: v.initial_net_rtr,
  weighted_avg_factor: v.weighted_avg_factor,
  principal_pct: v.principal_pct,
  profit_pct: v.profit_pct,
  rtr_received: v.rtr_received,
  principal_returned: v.principal_returned,
  profit_returned: v.profit_returned,
  cost_basis_after_principal: v.cost_basis_after_principal,
  cost_basis_final: v.cost_basis_final,
  net_rtr_outstanding: v.net_rtr_outstanding,
  bad_debt_rtr: v.bad_debt_rtr,
  net_rtr_outstanding_after_bad_debt: v.net_rtr_outstanding_after_bad_debt,
  expected_weekly_payments: v.expected_weekly_payments,
  weighted_avg_term_months: v.weighted_avg_term_months,
  avg_cost_basis_per_deal: v.avg_cost_basis_per_deal,
  vintage_return: v.vintage_return,
  bad_debt_pct: v.bad_debt_pct,
  points_per_month: v.points_per_month,
  profit_share: v.profit_share,
  wrc_net: v.wrc_net,
  wrc_net_vintage_return: v.wrc_net_vintage_return,
});

/** Raw deal inputs the deal_computed view doesn't expose. */
export interface DealAux {
  default_date: string | null;
  num_daily_payments: number | null;
  num_weekly_payments: number | null;
}

export interface FunderSheetInputs {
  deals: DealComputedRow[];
  payments: DealPaymentRow[];
  funders: Pick<FunderRow, "id" | "name" | "sheet_name">[];
  feeByFunder: Map<number, number | null>;
  merchantsById: Map<string, MerchantRow>;
  industriesById: Map<number, string>;
  statesById: Map<number, string>;
  auxByDeal: Map<string, DealAux>;
}

/**
 * Group deal_computed + deal_payments into one export sheet per funder,
 * with each sheet's payment matrix spanning that funder's distinct payment
 * dates in ascending order. Funders with no deals are skipped.
 */
export function buildFunderSheets(inputs: FunderSheetInputs): FunderSheetExport[] {
  const dealsByFunder = new Map<number, DealComputedRow[]>();
  for (const deal of inputs.deals) {
    if (deal.funder_id == null) continue;
    const list = dealsByFunder.get(deal.funder_id) ?? [];
    list.push(deal);
    dealsByFunder.set(deal.funder_id, list);
  }

  const paymentsByDeal = new Map<string, DealPaymentRow[]>();
  const datesByFunder = new Map<number, Set<string>>();
  for (const payment of inputs.payments) {
    const list = paymentsByDeal.get(payment.deal_id) ?? [];
    list.push(payment);
    paymentsByDeal.set(payment.deal_id, list);
    if (payment.funder_id != null) {
      const dates = datesByFunder.get(payment.funder_id) ?? new Set<string>();
      dates.add(payment.payment_date);
      datesByFunder.set(payment.funder_id, dates);
    }
  }

  const sheets: FunderSheetExport[] = [];
  const orderedFunders = [...inputs.funders].sort((a, b) => a.id - b.id);
  for (const funder of orderedFunders) {
    const deals = dealsByFunder.get(funder.id);
    if (!deals?.length) continue;

    const paymentDates = [...(datesByFunder.get(funder.id) ?? [])].sort();
    const dateIndex = new Map(paymentDates.map((d, i) => [d, i]));

    const sortedDeals = [...deals].sort(
      (a, b) =>
        (a.date_funded ?? "").localeCompare(b.date_funded ?? "") ||
        (a.advance_id ?? "").localeCompare(b.advance_id ?? "", undefined, { numeric: true })
    );

    sheets.push({
      sheet_name: funder.sheet_name ?? funder.name,
      funder_label: funder.name,
      management_fee_rate: inputs.feeByFunder.get(funder.id) ?? null,
      payment_dates: paymentDates,
      deals: sortedDeals.map((deal) => {
        const merchant = deal.merchant_id ? inputs.merchantsById.get(deal.merchant_id) : undefined;
        const aux = inputs.auxByDeal.get(deal.id);
        const dealPayments = paymentsByDeal.get(deal.id) ?? [];
        // The unique (deal_id, payment_date) constraint guarantees one cell
        // per date, so the sparse pairs never collide.
        const payments: [number, number][] = dealPayments
          .flatMap((p): [number, number][] => {
            const idx = dateIndex.get(p.payment_date) ?? -1;
            return idx >= 0 ? [[idx, p.net]] : [];
          })
          .sort((a, b) => a[0] - b[0]);
        return {
          date_funded: deal.date_funded,
          merchant_name: merchant?.name ?? "Unknown",
          website: merchant?.website ?? null,
          advance_id: deal.advance_id,
          funder_advance_id: deal.funder_advance_id,
          industry:
            merchant?.industry_id != null
              ? (inputs.industriesById.get(merchant.industry_id) ?? null)
              : null,
          state:
            merchant?.state_id != null ? (inputs.statesById.get(merchant.state_id) ?? null) : null,
          fico: deal.fico,
          buy_rate: deal.buy_rate,
          commission: deal.commission,
          sell_rate: deal.sell_rate,
          total_amount_funded: deal.total_amount_funded,
          commission_dollars: deal.commission_dollars,
          total_rtr: deal.total_rtr,
          num_daily_payments: aux?.num_daily_payments ?? null,
          num_weekly_payments: aux?.num_weekly_payments ?? null,
          term_months: deal.term_months,
          participation_on_amount: deal.participation_on_amount,
          new_dollars: deal.new_dollars,
          rtr: deal.rtr,
          new_dollars_at_work: deal.new_dollars_at_work,
          rtr_dollars_at_work: deal.rtr_dollars_at_work,
          rh_pct_of_deal: deal.rh_pct_of_deal,
          pro_rata_commission: deal.pro_rata_commission,
          cost_basis: deal.cost_basis,
          rh_rtr: deal.rh_rtr,
          net_rtr: deal.net_rtr,
          all_in_factor: deal.all_in_factor,
          points_per_month: deal.points_per_month,
          gross_payment_expected: deal.gross_payment_expected,
          net_payment_expected: deal.net_payment_expected,
          weekly_payment_expected: deal.weekly_payment_expected,
          date_closed: deal.date_closed,
          total_net_received: deal.total_net_received,
          net_rtr_balance: deal.net_rtr_balance,
          pct_rtr_paid: deal.pct_rtr_paid,
          return_on_cost_basis: deal.return_on_cost_basis,
          is_default: deal.is_default,
          bad_debt_rtr: deal.is_default ? deal.bad_debt_rtr : null,
          default_dollars_lost: deal.default_dollars_lost,
          default_date: aux?.default_date ?? null,
          payments,
        };
      }),
    });
  }
  return sheets;
}

/** The 'RTR' sheet matrix: one row per funder over all payment dates. */
export function buildRtrExport(
  rtr: WeeklyRtrRow[],
  funderOrder: { id: number; name: string }[]
): WorkbookExportData["rtr"] {
  const dates = [...new Set(rtr.map((r) => r.payment_date))].sort();
  const dateIndex = new Map(dates.map((d, i) => [d, i]));
  const valuesByFunder = new Map<number, number[]>();
  for (const row of rtr) {
    if (row.funder_id == null) continue;
    const values = valuesByFunder.get(row.funder_id) ?? new Array(dates.length).fill(0);
    values[dateIndex.get(row.payment_date)!] += row.total_net ?? 0;
    valuesByFunder.set(row.funder_id, values);
  }
  return {
    dates,
    funders: funderOrder.flatMap((f) => {
      const values = valuesByFunder.get(f.id);
      return values ? [{ name: f.name, values }] : [];
    }),
  };
}

// ---------------------------------------------------------------------------
// Fetch + export
// ---------------------------------------------------------------------------

async function fetchWorkbookData(portfolioName: string): Promise<WorkbookExportData> {
  const { data: portfolio, error: portfolioError } = await supabase
    .from("portfolios")
    .select("id, name")
    .eq("name", portfolioName)
    .single();
  if (portfolioError || !portfolio) {
    throw new Error(`Portfolio "${portfolioName}" not found: ${portfolioError?.message}`);
  }
  const portfolioId = portfolio.id;

  const [
    funders,
    links,
    dealRows,
    dealDates,
    payments,
    merchants,
    industries,
    states,
    vintages,
    monthly,
    rtrRows,
    allocationRows,
  ] = await Promise.all([
    fetchAllPages<Pick<FunderRow, "id" | "name" | "sheet_name">>((from, to) =>
      supabase.from("funders").select("id, name, sheet_name").order("id").range(from, to)
    ),
    fetchAllPages<{ funder_id: number; management_fee_rate: number | null }>((from, to) =>
      supabase
        .from("portfolio_funders")
        .select("funder_id, management_fee_rate")
        .eq("portfolio_id", portfolioId)
        .range(from, to)
    ),
    fetchAllPages<DealComputedRow>((from, to) =>
      supabase
        .from("deal_computed")
        .select("*")
        .eq("portfolio_id", portfolioId)
        .order("id")
        .range(from, to)
    ),
    fetchAllPages<{ id: string } & DealAux>((from, to) =>
      supabase
        .from("deals")
        .select("id, default_date, num_daily_payments, num_weekly_payments")
        .eq("portfolio_id", portfolioId)
        .order("id")
        .range(from, to)
    ),
    fetchAllPages<DealPaymentRow>((from, to) =>
      supabase
        .from("deal_payments")
        .select("*")
        .eq("portfolio_id", portfolioId)
        .order("deal_id")
        .order("payment_date")
        .range(from, to)
    ),
    fetchAllPages<MerchantRow>((from, to) =>
      supabase
        .from("merchants")
        .select("id, name, website, industry_id, state_id")
        .order("id")
        .range(from, to)
    ),
    fetchAllPages<{ id: number; name: string }>((from, to) =>
      supabase.from("industries").select("id, name").order("id").range(from, to)
    ),
    fetchAllPages<{ id: number; code: string }>((from, to) =>
      supabase.from("states").select("id, code").order("id").range(from, to)
    ),
    fetchAllPages<MonthlyVintageRow>((from, to) =>
      supabase
        .from("monthly_vintage_stats")
        .select("*")
        .eq("portfolio_id", portfolioId)
        .order("vintage_month")
        .order("funder_id")
        .range(from, to)
    ),
    fetchAllPages<PortfolioMonthlyRow>((from, to) =>
      supabase
        .from("portfolio_monthly")
        .select("*")
        .eq("portfolio_id", portfolioId)
        .order("vintage_month")
        .range(from, to)
    ),
    fetchAllPages<WeeklyRtrRow>((from, to) =>
      supabase
        .from("weekly_rtr_matrix")
        .select("*")
        .eq("portfolio_id", portfolioId)
        .order("payment_date")
        .order("funder_id")
        .range(from, to)
    ),
    fetchAllPages<FunderAllocationRow>((from, to) =>
      supabase
        .from("funder_allocation_current")
        .select("*")
        .eq("portfolio_id", portfolioId)
        .order("funder_id")
        .range(from, to)
    ),
  ]);

  const funderSheets = buildFunderSheets({
    deals: dealRows,
    payments,
    funders,
    feeByFunder: new Map(links.map((l) => [l.funder_id, l.management_fee_rate])),
    merchantsById: new Map(merchants.map((m) => [m.id, m])),
    industriesById: new Map(industries.map((i) => [i.id, i.name])),
    statesById: new Map(states.map((s) => [s.id, s.code])),
    auxByDeal: new Map(dealDates.map((d) => [d.id, d])),
  });

  const vintagesByFunder = new Map<number, MonthlyVintageRow[]>();
  for (const v of vintages) {
    if (v.funder_id == null) continue;
    const list = vintagesByFunder.get(v.funder_id) ?? [];
    list.push(v);
    vintagesByFunder.set(v.funder_id, list);
  }
  const vintageSheets = funderSheets.flatMap((sheet) => {
    const funder = funders.find((f) => (f.sheet_name ?? f.name) === sheet.sheet_name);
    const rows = funder ? (vintagesByFunder.get(funder.id) ?? []) : [];
    if (rows.length === 0) return [];
    return [{ sheet_name: `${sheet.sheet_name}-P`, rows: rows.map(vintageRow) }];
  });

  const sheetNames = new Set(funderSheets.map((s) => s.sheet_name));
  const funderOrder = funders.flatMap((f) =>
    sheetNames.has(f.sheet_name ?? f.name) ? [{ id: f.id, name: f.name }] : []
  );

  const funderNameById = new Map(funders.map((f) => [f.id, f.name]));

  return {
    portfolio_name: portfolio.name,
    funder_sheets: funderSheets,
    vintage_sheets: vintageSheets,
    portfolio_rows: monthly.map(vintageRow),
    rtr: buildRtrExport(rtrRows, funderOrder),
    allocations: allocationRows
      .filter((a) => a.funder_id != null)
      .map((a) => ({
        funder_name: funderNameById.get(a.funder_id!) ?? `Funder ${a.funder_id}`,
        initial_cost_basis: a.initial_cost_basis,
        pct_initial_cost_basis: a.pct_initial_cost_basis,
        current_cost_basis: a.current_cost_basis,
        pct_current_cost_basis: a.pct_current_cost_basis,
        rtr_received: a.rtr_received,
        factor: a.factor,
        weighted_avg_term_months: a.weighted_avg_term_months,
        weighted_term_contribution: a.weighted_term_contribution,
      })),
  };
}

export class WorkbookExportService {
  /**
   * Fetch the portfolio's data from Supabase, ask where to save, and write
   * the values-only workbook via the Rust `export_portfolio_workbook`
   * command. Returns null when the user cancels the save dialog.
   */
  static async exportPortfolio(portfolioName: string): Promise<ExportSummary | null> {
    const data = await fetchWorkbookData(portfolioName);
    if (data.funder_sheets.length === 0) {
      throw new Error(
        "No deals found for this portfolio — run the workbook import before exporting."
      );
    }

    const today = new Date().toISOString().slice(0, 10);
    const defaultFilename = `${portfolioName.replace(/\s+/g, "_")}_Portfolio_Export_${today}.xlsx`;
    const filePath = await save({
      defaultPath: `${await downloadDir()}/${defaultFilename}`,
      filters: [{ name: "Excel", extensions: ["xlsx"] }],
    });
    if (!filePath) return null;

    return await invoke<ExportSummary>("export_portfolio_workbook", { filePath, data });
  }
}

export default WorkbookExportService;
