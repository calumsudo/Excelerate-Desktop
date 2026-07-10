import { supabase } from "./supabase";
import type { Database } from "./supabase.types";

type Views = Database["public"]["Views"];
export type PortfolioMonthlyRow = Views["portfolio_monthly"]["Row"];
export type MonthlyVintageRow = Views["monthly_vintage_stats"]["Row"];
export type FunderAllocationRow = Views["funder_allocation_current"]["Row"];
export type WeeklyRtrRow = Views["weekly_rtr_matrix"]["Row"];

export interface PortfolioOption {
  id: number;
  name: string;
}

/** Everything the dashboard needs for one portfolio, fetched in parallel. */
export interface PortfolioAnalytics {
  monthly: PortfolioMonthlyRow[];
  vintages: MonthlyVintageRow[];
  allocations: FunderAllocationRow[];
  rtr: WeeklyRtrRow[];
  funderNames: Record<number, string>;
}

// PostgREST caps responses at 1000 rows; weekly_rtr_matrix (funder × week)
// exceeds that after the workbook import, so page every view read.
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

/** Portfolios visible to the signed-in user — RLS filters by portfolio_access. */
export async function listPortfolios(): Promise<PortfolioOption[]> {
  const { data, error } = await supabase.from("portfolios").select("id, name").order("name");
  if (error) throw new Error(`Failed to load portfolios: ${error.message}`);
  return data ?? [];
}

async function getFunderNames(): Promise<Record<number, string>> {
  const { data, error } = await supabase.from("funders").select("id, name");
  if (error) throw new Error(`Failed to load funders: ${error.message}`);
  return Object.fromEntries((data ?? []).map((f) => [f.id, f.name]));
}

export async function getPortfolioAnalytics(portfolioId: number): Promise<PortfolioAnalytics> {
  const [monthly, vintages, allocations, rtr, funderNames] = await Promise.all([
    fetchAllPages<PortfolioMonthlyRow>((from, to) =>
      supabase
        .from("portfolio_monthly")
        .select("*")
        .eq("portfolio_id", portfolioId)
        .order("vintage_month")
        .range(from, to)
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
    fetchAllPages<FunderAllocationRow>((from, to) =>
      supabase
        .from("funder_allocation_current")
        .select("*")
        .eq("portfolio_id", portfolioId)
        .order("funder_id")
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
    getFunderNames(),
  ]);

  return { monthly, vintages, allocations, rtr, funderNames };
}

// ---------------------------------------------------------------------------
// Pure transforms (chart/KPI shapes). Kept UI-free so they are unit-testable.
// ---------------------------------------------------------------------------

export interface PortfolioKpis {
  dollarsAtWork: number;
  costBasis: number;
  netRtrOutstanding: number;
  principalReturned: number;
  profitReturned: number;
  /** Lifetime return on cost basis: sum(rtr_received) / sum(cost_basis) - 1 */
  lifetimeReturn: number;
  /** sum(bad_debt_rtr) / sum(initial_net_rtr) */
  badDebtPct: number;
  dealCount: number;
}

export function computeKpis(monthly: PortfolioMonthlyRow[]): PortfolioKpis {
  const sum = (pick: (r: PortfolioMonthlyRow) => number | null) =>
    monthly.reduce((acc, r) => acc + (pick(r) ?? 0), 0);

  const costBasis = sum((r) => r.cost_basis);
  const rtrReceived = sum((r) => r.rtr_received);
  const initialNetRtr = sum((r) => r.initial_net_rtr);

  return {
    dollarsAtWork: sum((r) => r.new_invested) + sum((r) => r.rtr_invested),
    costBasis,
    netRtrOutstanding: sum((r) => r.net_rtr_outstanding_after_bad_debt),
    principalReturned: sum((r) => r.principal_returned),
    profitReturned: sum((r) => r.profit_returned),
    lifetimeReturn: costBasis > 0 ? rtrReceived / costBasis - 1 : 0,
    badDebtPct: initialNetRtr > 0 ? sum((r) => r.bad_debt_rtr) / initialNetRtr : 0,
    dealCount: sum((r) => r.deal_count),
  };
}

/** "2024-05-01" → "May 24" (avoids Date parsing so timezones can't shift the month). */
export function formatMonth(vintageMonth: string): string {
  const [year, month] = vintageMonth.split("-").map(Number);
  const names = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];
  return `${names[(month || 1) - 1]} ${String(year).slice(2)}`;
}

/** One chart row per month with a numeric column per funder name. */
export interface StackedMonthRow {
  month: string;
  [funderName: string]: string | number;
}

export interface StackedByFunder {
  /** Funder names ordered by total contribution, largest first. */
  funders: string[];
  rows: StackedMonthRow[];
}

/** The workbook's "Allocations $ by Month" — vintage cost basis per funder. */
export function buildAllocationsByMonth(
  vintages: MonthlyVintageRow[],
  funderNames: Record<number, string>
): StackedByFunder {
  const totals = new Map<string, number>();
  const byMonth = new Map<string, Map<string, number>>();

  for (const v of vintages) {
    if (!v.vintage_month || v.funder_id == null) continue;
    const funder = funderNames[v.funder_id] ?? `Funder ${v.funder_id}`;
    const value = v.cost_basis ?? 0;
    totals.set(funder, (totals.get(funder) ?? 0) + value);
    const month = byMonth.get(v.vintage_month) ?? new Map<string, number>();
    month.set(funder, (month.get(funder) ?? 0) + value);
    byMonth.set(v.vintage_month, month);
  }

  const funders = [...totals.entries()].sort((a, b) => b[1] - a[1]).map(([name]) => name);
  const rows = [...byMonth.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, values]) => {
      const row: StackedMonthRow = { month: formatMonth(month) };
      for (const funder of funders) row[funder] = values.get(funder) ?? 0;
      return row;
    });

  return { funders, rows };
}

/** Same series normalized to 100% per month ("Allocations % by Month"). */
export function normalizeStacked(stacked: StackedByFunder): StackedByFunder {
  const rows = stacked.rows.map((row) => {
    const total = stacked.funders.reduce((acc, f) => acc + (row[f] as number), 0);
    const out: StackedMonthRow = { month: row.month };
    for (const f of stacked.funders) {
      out[f] = total > 0 ? ((row[f] as number) / total) * 100 : 0;
    }
    return out;
  });
  return { funders: stacked.funders, rows };
}

export interface PieSlice {
  name: string;
  value: number;
}

/** Allocation pie for the most recent vintage month; returns its label too. */
export function latestMonthAllocation(
  vintages: MonthlyVintageRow[],
  funderNames: Record<number, string>
): { month: string | null; slices: PieSlice[] } {
  const months = vintages.map((v) => v.vintage_month).filter((m): m is string => m != null);
  if (months.length === 0) return { month: null, slices: [] };
  const latest = months.sort()[months.length - 1];

  const slices = vintages
    .filter((v) => v.vintage_month === latest && (v.cost_basis ?? 0) > 0)
    .map((v) => ({
      name: v.funder_id != null ? (funderNames[v.funder_id] ?? `Funder ${v.funder_id}`) : "Unknown",
      value: v.cost_basis ?? 0,
    }))
    .sort((a, b) => b.value - a.value);

  return { month: formatMonth(latest), slices };
}

/** The 'R&H-P' snapshot pie — current (post-repayment) cost basis per funder. */
export function currentAllocation(
  allocations: FunderAllocationRow[],
  funderNames: Record<number, string>
): PieSlice[] {
  return (
    allocations
      // fully-repaid funders can go slightly negative; they hold no allocation
      .filter((a) => (a.current_cost_basis ?? 0) > 0)
      .map((a) => ({
        name:
          a.funder_id != null ? (funderNames[a.funder_id] ?? `Funder ${a.funder_id}`) : "Unknown",
        value: a.current_cost_basis ?? 0,
      }))
      .sort((a, b) => b.value - a.value)
  );
}

export interface CommissionsMonthRow {
  month: string;
  participation: number;
  commissions: number;
}

/** "Commissions Paid by month" — ALDER Portfolio columns E/F per vintage. */
export function buildCommissionsByMonth(monthly: PortfolioMonthlyRow[]): CommissionsMonthRow[] {
  return monthly
    .filter((r) => r.vintage_month != null)
    .map((r) => ({
      month: formatMonth(r.vintage_month!),
      participation: r.total_participation ?? 0,
      commissions: r.total_commissions ?? 0,
    }));
}

export interface RtrPoint {
  date: string;
  total: number;
  cumulative: number;
  [funderName: string]: string | number;
}

export interface RtrSeries {
  funders: string[];
  points: RtrPoint[];
}

/**
 * The 'RTR' sheet — net RTR received per payment date, per funder plus a
 * running total. Historical rows are weekly-grained, monthly-flow rows monthly.
 */
export function buildRtrSeries(
  rtr: WeeklyRtrRow[],
  funderNames: Record<number, string>
): RtrSeries {
  const totals = new Map<string, number>();
  const byDate = new Map<string, Map<string, number>>();

  for (const r of rtr) {
    if (r.funder_id == null) continue;
    const funder = funderNames[r.funder_id] ?? `Funder ${r.funder_id}`;
    const value = r.total_net ?? 0;
    totals.set(funder, (totals.get(funder) ?? 0) + value);
    const date = byDate.get(r.payment_date) ?? new Map<string, number>();
    date.set(funder, (date.get(funder) ?? 0) + value);
    byDate.set(r.payment_date, date);
  }

  const funders = [...totals.entries()].sort((a, b) => b[1] - a[1]).map(([name]) => name);
  let cumulative = 0;
  const points = [...byDate.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, values]) => {
      const point: RtrPoint = { date, total: 0, cumulative: 0 };
      let total = 0;
      for (const funder of funders) {
        const v = values.get(funder) ?? 0;
        point[funder] = v;
        total += v;
      }
      cumulative += total;
      point.total = total;
      point.cumulative = cumulative;
      return point;
    });

  return { funders, points };
}

export interface VintagePerformanceRow {
  month: string;
  weightedAvgFactor: number | null;
  termMonths: number | null;
  pointsPerMonth: number | null;
}

/** "Term vs Weighted Avg Net Factor" + "Points per Month" per vintage. */
export function buildVintagePerformance(monthly: PortfolioMonthlyRow[]): VintagePerformanceRow[] {
  return monthly
    .filter((r) => r.vintage_month != null)
    .map((r) => ({
      month: formatMonth(r.vintage_month!),
      weightedAvgFactor: r.weighted_avg_factor,
      termMonths: r.weighted_avg_term_months,
      pointsPerMonth: r.points_per_month,
    }));
}

// ---------------------------------------------------------------------------
// Display formatting
// ---------------------------------------------------------------------------

export function formatMoney(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 1_000_000) return `$${(value / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000) return `$${(value / 1_000).toFixed(1)}K`;
  return `$${value.toFixed(0)}`;
}

export function formatPct(fraction: number, digits = 1): string {
  return `${(fraction * 100).toFixed(digits)}%`;
}
