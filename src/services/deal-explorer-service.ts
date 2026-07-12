import { save } from "@tauri-apps/plugin-dialog";
import { writeTextFile } from "@tauri-apps/plugin-fs";
import { downloadDir, join } from "@tauri-apps/api/path";
import { supabase } from "./supabase";
import type { Database } from "./supabase.types";
import { formatMonth } from "./analytics-service";

type DealComputedRow = Database["public"]["Views"]["deal_computed"]["Row"];

export type DealStatus = "Active" | "Closed" | "Defaulted";

/** A deal_computed row flattened with its lookups, ready for filtering/grouping. */
export interface DealRecord extends DealComputedRow {
  merchant_name: string | null;
  industry: string | null;
  state: string | null;
  merchant_website: string | null;
  funder_name: string | null;
  portfolio_name: string | null;
  status: DealStatus;
}

// ---------------------------------------------------------------------------
// Field registry — drives the column picker, filter builder, pivot and charts
// ---------------------------------------------------------------------------

export type FieldType = "text" | "number" | "money" | "percent" | "date" | "month" | "boolean";

export interface FieldDef {
  key: keyof DealRecord;
  label: string;
  type: FieldType;
  /** Usable as a group-by dimension in pivots and charts. */
  dimension?: boolean;
  /** Shown in the table when no view customizes columns. */
  defaultVisible?: boolean;
}

export const DEAL_FIELDS: FieldDef[] = [
  { key: "funder_advance_id", label: "Advance ID", type: "text", defaultVisible: true },
  { key: "advance_id", label: "Internal Advance ID", type: "text" },
  { key: "merchant_name", label: "Merchant", type: "text", dimension: true, defaultVisible: true },
  { key: "merchant_website", label: "Website", type: "text" },
  { key: "funder_name", label: "Funder", type: "text", dimension: true, defaultVisible: true },
  { key: "portfolio_name", label: "Portfolio", type: "text", dimension: true },
  { key: "industry", label: "Industry", type: "text", dimension: true, defaultVisible: true },
  { key: "state", label: "State", type: "text", dimension: true, defaultVisible: true },
  { key: "status", label: "Status", type: "text", dimension: true, defaultVisible: true },
  {
    key: "vintage_month",
    label: "Vintage Month",
    type: "month",
    dimension: true,
    defaultVisible: true,
  },
  { key: "date_funded", label: "Date Funded", type: "date" },
  { key: "date_closed", label: "Date Closed", type: "date" },
  { key: "fico", label: "FICO", type: "number" },
  { key: "buy_rate", label: "Buy Rate", type: "number" },
  { key: "sell_rate", label: "Sell Rate", type: "number" },
  { key: "commission", label: "Commission Rate", type: "percent" },
  { key: "management_fee_rate", label: "Management Fee Rate", type: "percent" },
  { key: "total_amount_funded", label: "Amount Funded", type: "money", defaultVisible: true },
  { key: "participation_on_amount", label: "Participation", type: "money", defaultVisible: true },
  { key: "commission_dollars", label: "Commission $", type: "money" },
  { key: "pro_rata_commission", label: "Pro-Rata Commission", type: "money" },
  { key: "rh_pct_of_deal", label: "% of Deal", type: "percent" },
  { key: "cost_basis", label: "Cost Basis", type: "money", defaultVisible: true },
  { key: "total_rtr", label: "Total RTR", type: "money" },
  { key: "rh_rtr", label: "R&H RTR", type: "money" },
  { key: "net_rtr", label: "Net RTR", type: "money", defaultVisible: true },
  { key: "term_months", label: "Term (months)", type: "number" },
  { key: "all_in_factor", label: "All-In Factor", type: "number" },
  { key: "points_per_month", label: "Points / Month", type: "number" },
  { key: "new_dollars_at_work", label: "New $ at Work", type: "money" },
  { key: "rtr_dollars_at_work", label: "RTR $ at Work", type: "money" },
  { key: "gross_payment_expected", label: "Gross Payment Expected", type: "money" },
  { key: "net_payment_expected", label: "Net Payment Expected", type: "money" },
  { key: "weekly_payment_expected", label: "Weekly Payment Expected", type: "money" },
  { key: "total_gross_received", label: "Gross Received", type: "money" },
  { key: "total_fee_paid", label: "Fees Paid", type: "money" },
  { key: "total_net_received", label: "Net Received", type: "money", defaultVisible: true },
  { key: "net_rtr_balance", label: "Net RTR Balance", type: "money", defaultVisible: true },
  { key: "pct_rtr_paid", label: "% RTR Paid", type: "percent", defaultVisible: true },
  { key: "return_on_cost_basis", label: "Return on Cost Basis", type: "percent" },
  { key: "bad_debt_rtr", label: "Bad Debt RTR", type: "money" },
  { key: "default_dollars_lost", label: "Default $ Lost", type: "money" },
  { key: "is_default", label: "Defaulted", type: "boolean", dimension: true },
  { key: "new_dollars", label: "New Dollars", type: "boolean", dimension: true },
  { key: "rtr", label: "RTR Reinvestment", type: "boolean", dimension: true },
  { key: "is_daily", label: "Daily Payer", type: "boolean", dimension: true },
];

const FIELDS_BY_KEY = new Map(DEAL_FIELDS.map((f) => [f.key as string, f]));

export const fieldDef = (key: string): FieldDef | undefined => FIELDS_BY_KEY.get(key);

export const DIMENSION_FIELDS = DEAL_FIELDS.filter((f) => f.dimension);
export const NUMERIC_FIELDS = DEAL_FIELDS.filter(
  (f) => f.type === "number" || f.type === "money" || f.type === "percent"
);
export const DEFAULT_VISIBLE_FIELDS = DEAL_FIELDS.filter((f) => f.defaultVisible).map(
  (f) => f.key as string
);

const moneyFormat = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 2,
});

export function formatFieldValue(value: string | number | boolean | null, type: FieldType): string {
  if (value == null || value === "") return "—";
  switch (type) {
    case "money":
      return moneyFormat.format(value as number);
    case "percent":
      return `${((value as number) * 100).toFixed(1)}%`;
    case "number":
      return (value as number).toLocaleString("en-US", { maximumFractionDigits: 3 });
    case "month":
      return formatMonth(String(value));
    case "boolean":
      return value ? "Yes" : "No";
    default:
      return String(value);
  }
}

// ---------------------------------------------------------------------------
// Data fetch — deal_computed joined client-side with its lookups
// ---------------------------------------------------------------------------

const PAGE_SIZE = 1000; // PostgREST response cap

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

interface MerchantLookupRow {
  id: string;
  name: string;
  industry_id: number | null;
  state_id: number | null;
  website: string | null;
}

function dealStatus(deal: DealComputedRow): DealStatus {
  if (deal.is_default) return "Defaulted";
  if (deal.date_closed != null) return "Closed";
  return "Active";
}

/** Every deal visible to the user (RLS scopes reads), flattened with lookups. */
export async function getDealRecords(): Promise<DealRecord[]> {
  const [deals, merchants, industries, states, funders, portfolios] = await Promise.all([
    fetchAllPages<DealComputedRow>((from, to) =>
      supabase.from("deal_computed").select("*").order("date_funded").range(from, to)
    ),
    fetchAllPages<MerchantLookupRow>((from, to) =>
      supabase
        .from("merchants")
        .select("id, name, industry_id, state_id, website")
        .order("id")
        .range(from, to)
    ),
    supabase.from("industries").select("id, name"),
    supabase.from("states").select("id, code"),
    supabase.from("funders").select("id, name"),
    supabase.from("portfolios").select("id, name"),
  ]);

  for (const lookup of [industries, states, funders, portfolios]) {
    if (lookup.error) throw new Error(`Failed to load lookups: ${lookup.error.message}`);
  }

  const industryNames = new Map((industries.data ?? []).map((i) => [i.id, i.name]));
  const stateCodes = new Map((states.data ?? []).map((s) => [s.id, s.code]));
  const funderNames = new Map((funders.data ?? []).map((f) => [f.id, f.name]));
  const portfolioNames = new Map((portfolios.data ?? []).map((p) => [p.id, p.name]));
  const merchantsById = new Map(merchants.map((m) => [m.id, m]));

  return deals.map((deal) => {
    const merchant = deal.merchant_id != null ? merchantsById.get(deal.merchant_id) : undefined;
    return {
      ...deal,
      merchant_name: merchant?.name ?? null,
      industry:
        merchant?.industry_id != null ? (industryNames.get(merchant.industry_id) ?? null) : null,
      state: merchant?.state_id != null ? (stateCodes.get(merchant.state_id) ?? null) : null,
      merchant_website: merchant?.website ?? null,
      funder_name: deal.funder_id != null ? (funderNames.get(deal.funder_id) ?? null) : null,
      portfolio_name:
        deal.portfolio_id != null ? (portfolioNames.get(deal.portfolio_id) ?? null) : null,
      status: dealStatus(deal),
    };
  });
}

// ---------------------------------------------------------------------------
// Filtering
// ---------------------------------------------------------------------------

export type FilterOperator =
  | "contains"
  | "eq"
  | "neq"
  | "gt"
  | "gte"
  | "lt"
  | "lte"
  | "between"
  | "is_true"
  | "is_false";

export const OPERATORS_BY_TYPE: Record<FieldType, FilterOperator[]> = {
  text: ["contains", "eq", "neq"],
  number: ["eq", "neq", "gt", "gte", "lt", "lte", "between"],
  money: ["eq", "neq", "gt", "gte", "lt", "lte", "between"],
  percent: ["eq", "neq", "gt", "gte", "lt", "lte", "between"],
  date: ["eq", "gte", "lte", "between"],
  month: ["eq", "gte", "lte", "between"],
  boolean: ["is_true", "is_false"],
};

export const OPERATOR_LABELS: Record<FilterOperator, string> = {
  contains: "contains",
  eq: "=",
  neq: "≠",
  gt: ">",
  gte: "≥",
  lt: "<",
  lte: "≤",
  between: "between",
  is_true: "is yes",
  is_false: "is no",
};

export interface FilterRule {
  id: string;
  field: string;
  operator: FilterOperator;
  value: string;
  /** Upper bound for "between". */
  value2: string;
}

export interface ExplorerFilters {
  /** Free-text match on merchant, advance IDs, industry, state. */
  search: string;
  portfolios: string[];
  funders: string[];
  industries: string[];
  states: string[];
  statuses: string[];
  /** Vintage month range, "YYYY-MM" keys. */
  monthFrom: string | null;
  monthTo: string | null;
  rules: FilterRule[];
}

export const EMPTY_FILTERS: ExplorerFilters = {
  search: "",
  portfolios: [],
  funders: [],
  industries: [],
  states: [],
  statuses: [],
  monthFrom: null,
  monthTo: null,
  rules: [],
};

export function countActiveFilters(filters: ExplorerFilters): number {
  let count = 0;
  if (filters.search.trim()) count++;
  if (filters.portfolios.length > 0) count++;
  if (filters.funders.length > 0) count++;
  if (filters.industries.length > 0) count++;
  if (filters.states.length > 0) count++;
  if (filters.statuses.length > 0) count++;
  if (filters.monthFrom != null || filters.monthTo != null) count++;
  count += filters.rules.length;
  return count;
}

function applyRule(record: DealRecord, rule: FilterRule): boolean {
  const def = fieldDef(rule.field);
  if (!def) return true;
  const raw = record[def.key];

  if (def.type === "boolean") {
    const truthy = raw === true;
    return rule.operator === "is_true" ? truthy : !truthy;
  }

  // An incomplete rule (no value yet) matches everything.
  if (rule.value === "" || (rule.operator === "between" && rule.value2 === "")) return true;
  if (raw == null) return false;

  if (def.type === "text") {
    const value = String(raw).toLowerCase();
    const needle = rule.value.toLowerCase();
    if (rule.operator === "contains") return value.includes(needle);
    if (rule.operator === "eq") return value === needle;
    return value !== needle;
  }

  if (def.type === "date" || def.type === "month") {
    // ISO strings compare lexicographically; months compare on YYYY-MM.
    const trim = (v: string) => (def.type === "month" ? v.slice(0, 7) : v);
    const value = trim(String(raw));
    const bound = trim(rule.value);
    switch (rule.operator) {
      case "eq":
        return value === bound;
      case "gte":
        return value >= bound;
      case "lte":
        return value <= bound;
      case "between":
        return value >= bound && value <= trim(rule.value2);
      default:
        return true;
    }
  }

  // number / money / percent — percent rules are entered as percentages.
  const scale = def.type === "percent" ? 100 : 1;
  const value = (raw as number) * scale;
  const bound = Number(rule.value);
  const bound2 = Number(rule.value2);
  if (Number.isNaN(bound)) return true;
  switch (rule.operator) {
    case "eq":
      return value === bound;
    case "neq":
      return value !== bound;
    case "gt":
      return value > bound;
    case "gte":
      return value >= bound;
    case "lt":
      return value < bound;
    case "lte":
      return value <= bound;
    case "between":
      return !Number.isNaN(bound2) && value >= bound && value <= bound2;
    default:
      return true;
  }
}

export function applyFilters(records: DealRecord[], filters: ExplorerFilters): DealRecord[] {
  const needle = filters.search.trim().toLowerCase();
  const monthOf = (r: DealRecord) => r.vintage_month?.slice(0, 7) ?? null;

  return records.filter((r) => {
    if (needle) {
      const haystack = [r.merchant_name, r.funder_advance_id, r.advance_id, r.industry, r.state]
        .filter((v): v is string => v != null)
        .join(" ")
        .toLowerCase();
      if (!haystack.includes(needle)) return false;
    }
    if (filters.portfolios.length > 0 && !filters.portfolios.includes(r.portfolio_name ?? ""))
      return false;
    if (filters.funders.length > 0 && !filters.funders.includes(r.funder_name ?? "")) return false;
    if (filters.industries.length > 0 && !filters.industries.includes(r.industry ?? ""))
      return false;
    if (filters.states.length > 0 && !filters.states.includes(r.state ?? "")) return false;
    if (filters.statuses.length > 0 && !filters.statuses.includes(r.status)) return false;
    const month = monthOf(r);
    if (filters.monthFrom != null && (month == null || month < filters.monthFrom)) return false;
    if (filters.monthTo != null && (month == null || month > filters.monthTo)) return false;
    return filters.rules.every((rule) => applyRule(r, rule));
  });
}

// ---------------------------------------------------------------------------
// Grouping (shared by pivot + charts)
// ---------------------------------------------------------------------------

export type Aggregation = "sum" | "avg" | "count" | "min" | "max";

export const AGGREGATION_LABELS: Record<Aggregation, string> = {
  sum: "Sum",
  avg: "Average",
  count: "Count",
  min: "Min",
  max: "Max",
};

/** Sortable key + display label for a record's value in a dimension field. */
function dimensionValue(record: DealRecord, def: FieldDef): { key: string; label: string } {
  const raw = record[def.key];
  if (raw == null || raw === "") return { key: "￿", label: "Unknown" };
  if (def.type === "boolean") return { key: raw ? "1" : "0", label: raw ? "Yes" : "No" };
  if (def.type === "month") return { key: String(raw), label: formatMonth(String(raw)) };
  return { key: String(raw), label: String(raw) };
}

function aggregate(values: number[], agg: Aggregation): number | null {
  if (agg === "count") return values.length;
  if (values.length === 0) return null;
  switch (agg) {
    case "sum":
      return values.reduce((a, b) => a + b, 0);
    case "avg":
      return values.reduce((a, b) => a + b, 0) / values.length;
    case "min":
      return Math.min(...values);
    case "max":
      return Math.max(...values);
  }
}

/** Metric samples for a group: for "count" every record contributes a 1. */
function metricValues(records: DealRecord[], metricField: string | null): number[] {
  if (metricField == null) return records.map(() => 1);
  const def = fieldDef(metricField);
  if (!def) return [];
  const out: number[] = [];
  for (const r of records) {
    const v = r[def.key];
    if (typeof v === "number") out.push(v);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Pivot tables
// ---------------------------------------------------------------------------

export interface PivotConfig {
  rowField: string;
  /** Optional second dimension across the top. */
  colField: string | null;
  /** Numeric field to aggregate; ignored when agg is "count". */
  valueField: string;
  agg: Aggregation;
}

export const DEFAULT_PIVOT_CONFIG: PivotConfig = {
  rowField: "vintage_month",
  colField: "funder_name",
  valueField: "cost_basis",
  agg: "sum",
};

export interface PivotRow {
  label: string;
  values: (number | null)[];
  total: number | null;
}

export interface PivotData {
  rowLabel: string;
  colLabels: string[];
  rows: PivotRow[];
  colTotals: (number | null)[];
  grandTotal: number | null;
  /** How cell values should be formatted. */
  valueType: FieldType;
}

export function buildPivot(records: DealRecord[], config: PivotConfig): PivotData {
  const rowDef = fieldDef(config.rowField);
  const colDef = config.colField != null ? fieldDef(config.colField) : undefined;
  const metricField = config.agg === "count" ? null : config.valueField;
  const valueType: FieldType =
    config.agg === "count" ? "number" : (fieldDef(config.valueField)?.type ?? "number");
  if (!rowDef) {
    return {
      rowLabel: "",
      colLabels: [],
      rows: [],
      colTotals: [],
      grandTotal: null,
      valueType,
    };
  }

  // group records by row key × col key
  const rowMeta = new Map<string, string>(); // sort key -> label
  const colMeta = new Map<string, string>();
  const groups = new Map<string, Map<string, DealRecord[]>>();
  for (const record of records) {
    const row = dimensionValue(record, rowDef);
    const col = colDef ? dimensionValue(record, colDef) : { key: "__all__", label: "Value" };
    rowMeta.set(row.key, row.label);
    colMeta.set(col.key, col.label);
    const cols = groups.get(row.key) ?? new Map<string, DealRecord[]>();
    const cell = cols.get(col.key) ?? [];
    cell.push(record);
    cols.set(col.key, cell);
    groups.set(row.key, cols);
  }

  const rowKeys = [...rowMeta.keys()].sort();
  const colKeys = [...colMeta.keys()].sort();

  const rows: PivotRow[] = rowKeys.map((rowKey) => {
    const cols = groups.get(rowKey)!;
    const values = colKeys.map((colKey) => {
      const cell = cols.get(colKey);
      return cell ? aggregate(metricValues(cell, metricField), config.agg) : null;
    });
    const allRecords = [...cols.values()].flat();
    return {
      label: rowMeta.get(rowKey)!,
      values,
      total: aggregate(metricValues(allRecords, metricField), config.agg),
    };
  });

  const colTotals = colKeys.map((colKey) => {
    const cell = rowKeys.flatMap((rowKey) => groups.get(rowKey)!.get(colKey) ?? []);
    return aggregate(metricValues(cell, metricField), config.agg);
  });

  return {
    rowLabel: rowDef.label,
    colLabels: colKeys.map((k) => colMeta.get(k)!),
    rows,
    colTotals,
    grandTotal: aggregate(metricValues(records, metricField), config.agg),
    valueType,
  };
}

// ---------------------------------------------------------------------------
// Chart builder
// ---------------------------------------------------------------------------

export type ChartType = "bar" | "line" | "area" | "pie";

export interface ChartConfig {
  type: ChartType;
  dimension: string;
  /** Optional split into stacked/multi series; ignored for pie. */
  seriesField: string | null;
  /** Numeric field key, or "count". */
  metric: string;
  agg: Aggregation;
}

export const COUNT_METRIC = "count";

export const DEFAULT_CHART_CONFIG: ChartConfig = {
  type: "bar",
  dimension: "vintage_month",
  seriesField: "funder_name",
  metric: "cost_basis",
  agg: "sum",
};

export interface ChartRow {
  category: string;
  [series: string]: string | number;
}

export interface ChartData {
  /** Series (dataKey) names, largest total first. */
  series: string[];
  rows: ChartRow[];
  valueType: FieldType;
}

export function buildChartData(records: DealRecord[], config: ChartConfig): ChartData {
  const dimDef = fieldDef(config.dimension);
  const isCount = config.metric === COUNT_METRIC;
  const metricField = isCount ? null : config.metric;
  const agg: Aggregation = isCount ? "count" : config.agg;
  const valueType: FieldType = isCount ? "number" : (fieldDef(config.metric)?.type ?? "number");
  const seriesDef =
    config.type !== "pie" && config.seriesField != null ? fieldDef(config.seriesField) : undefined;
  if (!dimDef) return { series: [], rows: [], valueType };

  const metricLabel = isCount
    ? "Deal Count"
    : `${AGGREGATION_LABELS[agg]} of ${fieldDef(config.metric)?.label ?? config.metric}`;

  const catMeta = new Map<string, string>();
  const groups = new Map<string, Map<string, DealRecord[]>>();
  const seriesTotals = new Map<string, number>();
  for (const record of records) {
    const cat = dimensionValue(record, dimDef);
    const series = seriesDef ? dimensionValue(record, seriesDef).label : metricLabel;
    catMeta.set(cat.key, cat.label);
    const bySeries = groups.get(cat.key) ?? new Map<string, DealRecord[]>();
    const cell = bySeries.get(series) ?? [];
    cell.push(record);
    bySeries.set(series, cell);
    groups.set(cat.key, bySeries);
  }

  const catKeys = [...catMeta.keys()].sort();
  const rows: ChartRow[] = catKeys.map((catKey) => {
    const row: ChartRow = { category: catMeta.get(catKey)! };
    for (const [series, cell] of groups.get(catKey)!) {
      const value = aggregate(metricValues(cell, metricField), agg) ?? 0;
      row[series] = value;
      seriesTotals.set(series, (seriesTotals.get(series) ?? 0) + value);
    }
    return row;
  });

  const series = [...seriesTotals.entries()].sort((a, b) => b[1] - a[1]).map(([name]) => name);
  // fill gaps so stacked charts don't break on missing keys
  for (const row of rows) {
    for (const name of series) if (!(name in row)) row[name] = 0;
  }

  return { series, rows, valueType };
}

/** Pie slices from chart rows: one slice per category, top slices + "Other". */
export function chartRowsToPie(data: ChartData, maxSlices = 11): { name: string; value: number }[] {
  const slices = data.rows
    .map((row) => ({
      name: row.category,
      value: data.series.reduce((acc, s) => acc + Math.max(row[s] as number, 0), 0),
    }))
    .filter((s) => s.value > 0)
    .sort((a, b) => b.value - a.value);
  if (slices.length <= maxSlices) return slices;
  const rest = slices.slice(maxSlices).reduce((acc, s) => acc + s.value, 0);
  return [...slices.slice(0, maxSlices), { name: "Other", value: rest }];
}

// ---------------------------------------------------------------------------
// CSV export
// ---------------------------------------------------------------------------

function csvEscape(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

function csvLine(values: (string | number | boolean | null)[]): string {
  return values.map((v) => csvEscape(v == null ? "" : String(v))).join(",");
}

/** Raw (unformatted) values so the CSV stays machine-readable. */
export function recordsToCsv(records: DealRecord[], fieldKeys: string[]): string {
  const defs = fieldKeys.map((key) => fieldDef(key)).filter((def): def is FieldDef => def != null);
  const lines = [csvLine(defs.map((d) => d.label))];
  for (const record of records) {
    lines.push(csvLine(defs.map((d) => record[d.key])));
  }
  return lines.join("\n");
}

export function pivotToCsv(pivot: PivotData): string {
  const lines = [csvLine([pivot.rowLabel, ...pivot.colLabels, "Total"])];
  for (const row of pivot.rows) {
    lines.push(csvLine([row.label, ...row.values, row.total]));
  }
  lines.push(csvLine(["Total", ...pivot.colTotals, pivot.grandTotal]));
  return lines.join("\n");
}

/**
 * Ask where to save and write the CSV. Returns the path, or null if the user
 * cancelled. Note the fs scope only allows ~/Downloads and ~/Excelerate.
 */
export async function saveCsvFile(defaultName: string, csv: string): Promise<string | null> {
  const defaultPath = await join(await downloadDir(), defaultName).catch(() => defaultName);
  const filePath = await save({
    defaultPath,
    filters: [{ name: "CSV", extensions: ["csv"] }],
  });
  if (!filePath) return null;
  await writeTextFile(filePath, csv);
  return filePath;
}
