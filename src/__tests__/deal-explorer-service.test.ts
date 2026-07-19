import { describe, it, expect } from "vitest";
import {
  applyFilters,
  buildChartData,
  buildPivot,
  chartRowsToPie,
  countActiveFilters,
  formatFieldValue,
  pivotToCsv,
  rankCandidateDeals,
  recordsToCsv,
  EMPTY_FILTERS,
  type DealRecord,
  type ExplorerFilters,
  type FilterRule,
} from "../services/deal-explorer-service";

const deal = (overrides: Partial<DealRecord> = {}): DealRecord => ({
  id: "deal-1",
  portfolio_id: 1,
  funder_id: 1,
  merchant_id: "m-1",
  advance_id: "A-1",
  funder_advance_id: "F-1",
  fico: 650,
  date_funded: "2025-01-15",
  date_closed: null,
  is_default: false,
  new_dollars: true,
  rtr: false,
  vintage_month: "2025-01-01",
  buy_rate: 1.15,
  commission: 0.1,
  sell_rate: 1.25,
  total_amount_funded: 100000,
  participation_on_amount: 50000,
  management_fee_rate: 0.04,
  commission_dollars: 10000,
  total_rtr: 125000,
  term_months: 6,
  is_daily: false,
  rh_pct_of_deal: 0.5,
  pro_rata_commission: 5000,
  rh_rtr: 62500,
  cost_basis: 55000,
  net_rtr: 60000,
  new_dollars_at_work: 55000,
  rtr_dollars_at_work: 0,
  all_in_factor: 1.09,
  points_per_month: 1.5,
  gross_payment_expected: 5000,
  net_payment_expected: 4800,
  weekly_payment_expected: 1200,
  total_net_received: 30000,
  total_gross_received: 31000,
  total_fee_paid: 1000,
  net_rtr_balance: 30000,
  pct_rtr_paid: 0.5,
  return_on_cost_basis: 0.09,
  bad_debt_rtr: 0,
  default_dollars_lost: 0,
  merchant_name: "Acme Bakery",
  industry: "Restaurants",
  state: "NY",
  merchant_website: null,
  funder_name: "BIG",
  portfolio_name: "Alder",
  status: "Active",
  health_status: "On Track",
  pace_ratio: 1,
  days_since_last_payment: 10,
  last_payment_date: "2025-06-01",
  ...overrides,
});

const filters = (overrides: Partial<ExplorerFilters> = {}): ExplorerFilters => ({
  ...EMPTY_FILTERS,
  ...overrides,
});

const rule = (overrides: Partial<FilterRule>): FilterRule => ({
  id: "r1",
  field: "total_amount_funded",
  operator: "gte",
  value: "",
  value2: "",
  ...overrides,
});

describe("applyFilters", () => {
  const records = [
    deal({ id: "1", merchant_name: "Acme Bakery", industry: "Restaurants" }),
    deal({
      id: "2",
      merchant_name: "Bolt Trucking",
      industry: "Transportation",
      vintage_month: "2025-03-01",
      total_amount_funded: 250000,
      status: "Defaulted",
      is_default: true,
      pct_rtr_paid: 0.2,
    }),
    deal({
      id: "3",
      merchant_name: "Corner Deli",
      industry: "Restaurants",
      vintage_month: "2024-11-01",
      funder_name: "CFG",
      status: "Closed",
      date_closed: "2025-02-01",
    }),
  ];

  it("matches free-text search across merchant and IDs", () => {
    expect(applyFilters(records, filters({ search: "bolt" })).map((r) => r.id)).toEqual(["2"]);
    expect(applyFilters(records, filters({ search: "F-1" }))).toHaveLength(3);
  });

  it("filters by multi-select facets", () => {
    expect(
      applyFilters(records, filters({ industries: ["Restaurants"] })).map((r) => r.id)
    ).toEqual(["1", "3"]);
    expect(applyFilters(records, filters({ funders: ["CFG"] })).map((r) => r.id)).toEqual(["3"]);
    expect(applyFilters(records, filters({ statuses: ["Defaulted"] })).map((r) => r.id)).toEqual([
      "2",
    ]);
  });

  it("filters by health status labels", () => {
    const withHealth = [
      deal({ id: "1", health_status: "Slipping" }),
      deal({ id: "2", health_status: "On Track" }),
      deal({ id: "3", health_status: null, status: "Closed", date_closed: "2025-02-01" }),
    ];
    expect(applyFilters(withHealth, filters({ health: ["Slipping"] })).map((r) => r.id)).toEqual([
      "1",
    ]);
    expect(applyFilters(withHealth, filters({ health: ["On Track"] })).map((r) => r.id)).toEqual([
      "2",
    ]);
  });

  it("filters by vintage month range", () => {
    expect(
      applyFilters(records, filters({ monthFrom: "2025-01", monthTo: "2025-03" })).map((r) => r.id)
    ).toEqual(["1", "2"]);
    expect(applyFilters(records, filters({ monthTo: "2024-12" })).map((r) => r.id)).toEqual(["3"]);
  });

  it("applies numeric rules", () => {
    const out = applyFilters(
      records,
      filters({ rules: [rule({ field: "total_amount_funded", operator: "gt", value: "100000" })] })
    );
    expect(out.map((r) => r.id)).toEqual(["2"]);
  });

  it("treats percent rule values as percentages", () => {
    const out = applyFilters(
      records,
      filters({ rules: [rule({ field: "pct_rtr_paid", operator: "lt", value: "30" })] })
    );
    expect(out.map((r) => r.id)).toEqual(["2"]);
  });

  it("ignores incomplete rules", () => {
    const out = applyFilters(records, filters({ rules: [rule({ value: "" })] }));
    expect(out).toHaveLength(3);
  });

  it("applies boolean rules", () => {
    const out = applyFilters(
      records,
      filters({ rules: [rule({ field: "is_default", operator: "is_true" })] })
    );
    expect(out.map((r) => r.id)).toEqual(["2"]);
  });

  it("counts active filters", () => {
    expect(countActiveFilters(EMPTY_FILTERS)).toBe(0);
    expect(
      countActiveFilters(
        filters({
          search: "x",
          industries: ["Restaurants"],
          monthFrom: "2025-01",
          rules: [rule({})],
        })
      )
    ).toBe(4);
  });
});

describe("buildPivot", () => {
  const records = [
    deal({ id: "1", funder_name: "BIG", vintage_month: "2025-01-01", cost_basis: 100 }),
    deal({ id: "2", funder_name: "BIG", vintage_month: "2025-02-01", cost_basis: 200 }),
    deal({ id: "3", funder_name: "CFG", vintage_month: "2025-01-01", cost_basis: 50 }),
  ];

  it("sums by row and column dimensions with totals", () => {
    const pivot = buildPivot(records, {
      rowField: "vintage_month",
      colField: "funder_name",
      valueField: "cost_basis",
      agg: "sum",
    });
    expect(pivot.colLabels).toEqual(["BIG", "CFG"]);
    expect(pivot.rows).toEqual([
      { label: "Jan 25", values: [100, 50], total: 150 },
      { label: "Feb 25", values: [200, null], total: 200 },
    ]);
    expect(pivot.colTotals).toEqual([300, 50]);
    expect(pivot.grandTotal).toBe(350);
  });

  it("counts deals when agg is count", () => {
    const pivot = buildPivot(records, {
      rowField: "funder_name",
      colField: null,
      valueField: "cost_basis",
      agg: "count",
    });
    expect(pivot.rows).toEqual([
      { label: "BIG", values: [2], total: 2 },
      { label: "CFG", values: [1], total: 1 },
    ]);
    expect(pivot.grandTotal).toBe(3);
  });

  it("averages over underlying deals, not over cell averages", () => {
    const pivot = buildPivot(records, {
      rowField: "vintage_month",
      colField: "funder_name",
      valueField: "cost_basis",
      agg: "avg",
    });
    // Jan: (100 + 50) / 2, not (100 + 50) / 2 cells' averages
    expect(pivot.rows[0].total).toBe(75);
    expect(pivot.grandTotal).toBeCloseTo(350 / 3);
  });
});

describe("buildChartData", () => {
  const records = [
    deal({ id: "1", funder_name: "BIG", vintage_month: "2025-01-01", cost_basis: 100 }),
    deal({ id: "2", funder_name: "CFG", vintage_month: "2025-02-01", cost_basis: 200 }),
  ];

  it("builds stacked series with zero-filled gaps, months formatted", () => {
    const data = buildChartData(records, {
      type: "bar",
      dimension: "vintage_month",
      seriesField: "funder_name",
      metric: "cost_basis",
      agg: "sum",
    });
    expect(data.series).toEqual(["CFG", "BIG"]); // largest total first
    expect(data.rows).toEqual([
      { category: "Jan 25", BIG: 100, CFG: 0 },
      { category: "Feb 25", BIG: 0, CFG: 200 },
    ]);
    expect(data.valueType).toBe("money");
  });

  it("supports count metric without a series split", () => {
    const data = buildChartData(records, {
      type: "bar",
      dimension: "funder_name",
      seriesField: null,
      metric: "count",
      agg: "sum",
    });
    expect(data.rows).toEqual([
      { category: "BIG", "Deal Count": 1 },
      { category: "CFG", "Deal Count": 1 },
    ]);
  });

  it("collapses small slices into Other for pies", () => {
    const many = Array.from({ length: 14 }, (_, i) =>
      deal({
        id: String(i),
        industry: `Industry ${String(i).padStart(2, "0")}`,
        cost_basis: 100 - i,
      })
    );
    const data = buildChartData(many, {
      type: "pie",
      dimension: "industry",
      seriesField: null,
      metric: "cost_basis",
      agg: "sum",
    });
    const slices = chartRowsToPie(data, 11);
    expect(slices).toHaveLength(12);
    expect(slices[11].name).toBe("Other");
    expect(slices.reduce((acc, s) => acc + s.value, 0)).toBe(
      many.reduce((acc, d) => acc + (d.cost_basis ?? 0), 0)
    );
  });
});

describe("CSV export", () => {
  it("writes raw values with escaped labels", () => {
    const records = [
      deal({ merchant_name: 'Joe\'s "Best" Pizza, LLC', total_amount_funded: 1234.5 }),
    ];
    const csv = recordsToCsv(records, ["merchant_name", "total_amount_funded", "status"]);
    expect(csv.split("\n")).toEqual([
      "Merchant,Amount Funded,Status",
      '"Joe\'s ""Best"" Pizza, LLC",1234.5,Active',
    ]);
  });

  it("round-trips a pivot with totals", () => {
    const pivot = buildPivot(
      [
        deal({ id: "1", funder_name: "BIG", vintage_month: "2025-01-01", cost_basis: 100 }),
        deal({ id: "2", funder_name: "CFG", vintage_month: "2025-01-01", cost_basis: 50 }),
      ],
      { rowField: "vintage_month", colField: "funder_name", valueField: "cost_basis", agg: "sum" }
    );
    expect(pivotToCsv(pivot).split("\n")).toEqual([
      "Vintage Month,BIG,CFG,Total",
      "Jan 25,100,50,150",
      "Total,100,50,150",
    ]);
  });
});

describe("rankCandidateDeals", () => {
  const pivotRow = {
    advance_id: "ADV-42",
    merchant_name: "Acme Bakery",
    portfolio_id: 1,
    funder_id: 2,
  };
  const deals = [
    deal({ id: "other-scope", portfolio_id: 2, funder_id: 2, funder_advance_id: "ADV-42" }),
    deal({
      id: "old",
      portfolio_id: 1,
      funder_id: 2,
      funder_advance_id: "X",
      merchant_name: "Bolt Trucking",
      date_funded: "2024-01-01",
    }),
    deal({
      id: "name-match",
      portfolio_id: 1,
      funder_id: 2,
      funder_advance_id: "Y",
      merchant_name: "Acme Bakery LLC",
      date_funded: "2024-06-01",
    }),
    deal({
      id: "exact",
      portfolio_id: 1,
      funder_id: 2,
      funder_advance_id: "ADV-42",
      merchant_name: "Renamed Corp",
      date_funded: "2023-01-01",
    }),
  ];

  it("scopes to the row's portfolio + funder and ranks exact ID first", () => {
    const ranked = rankCandidateDeals(pivotRow, deals);
    expect(ranked.map((d) => d.id)).toEqual(["exact", "name-match", "old"]);
  });

  it("falls back to merchant-name and recency without an advance id", () => {
    const ranked = rankCandidateDeals({ ...pivotRow, advance_id: null }, deals);
    expect(ranked.map((d) => d.id)).toEqual(["name-match", "old", "exact"]);
  });
});

describe("formatFieldValue", () => {
  it("formats each field type", () => {
    expect(formatFieldValue(1234.5, "money")).toBe("$1,234.50");
    expect(formatFieldValue(0.256, "percent")).toBe("25.6%");
    expect(formatFieldValue(1.2345, "number")).toBe("1.235");
    expect(formatFieldValue("2025-01-01", "month")).toBe("Jan 25");
    expect(formatFieldValue(true, "boolean")).toBe("Yes");
    expect(formatFieldValue(null, "money")).toBe("—");
  });
});
