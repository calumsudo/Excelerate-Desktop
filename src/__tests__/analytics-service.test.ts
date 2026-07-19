import { describe, it, expect } from "vitest";
import {
  computeKpis,
  formatMonth,
  buildAllocationsByMonth,
  normalizeStacked,
  latestMonthAllocation,
  currentAllocation,
  buildCommissionsByMonth,
  buildRtrSeries,
  buildVintagePerformance,
  buildConcentration,
  buildCollectionsForecast,
  extendRtrWithForecast,
  UNKNOWN_BUCKET_KEY,
  FORECAST_HORIZON_MONTHS,
  formatMoney,
  formatPct,
  type ConcentrationData,
  type ConcentrationDealRow,
  type PortfolioMonthlyRow,
  type MonthlyVintageRow,
  type FunderAllocationRow,
  type WeeklyRtrRow,
  type ForecastData,
  type ForecastDealRow,
} from "../services/analytics-service";

const monthlyRow = (overrides: Partial<PortfolioMonthlyRow> = {}): PortfolioMonthlyRow => ({
  portfolio_id: 1,
  vintage_month: "2025-01-01",
  deal_count: 10,
  new_invested: 0,
  rtr_invested: 0,
  total_participation: 0,
  total_commissions: 0,
  cost_basis: 0,
  initial_net_rtr: 0,
  weighted_avg_factor: 0,
  principal_pct: 0,
  profit_pct: 0,
  rtr_received: 0,
  principal_returned: 0,
  profit_returned: 0,
  cost_basis_after_principal: 0,
  cost_basis_final: 0,
  net_rtr_outstanding: 0,
  bad_debt_rtr: 0,
  net_rtr_outstanding_after_bad_debt: 0,
  expected_weekly_payments: 0,
  weighted_avg_term_months: 0,
  avg_cost_basis_per_deal: 0,
  vintage_return: 0,
  bad_debt_pct: 0,
  points_per_month: 0,
  profit_share: 0,
  wrc_net: 0,
  wrc_net_vintage_return: 0,
  profit_share_rate: 0.2,
  dividend_rate: 0.03,
  ...overrides,
});

const vintageRow = (overrides: Partial<MonthlyVintageRow> = {}): MonthlyVintageRow =>
  ({
    portfolio_id: 1,
    funder_id: 1,
    vintage_month: "2025-01-01",
    cost_basis: 0,
    ...overrides,
  }) as MonthlyVintageRow;

const allocationRow = (overrides: Partial<FunderAllocationRow> = {}): FunderAllocationRow =>
  ({
    portfolio_id: 1,
    funder_id: 1,
    current_cost_basis: 0,
    ...overrides,
  }) as FunderAllocationRow;

const rtrRow = (overrides: Partial<WeeklyRtrRow> = {}): WeeklyRtrRow => ({
  portfolio_id: 1,
  funder_id: 1,
  payment_date: "2025-01-10",
  total_gross: 0,
  total_fee: 0,
  total_net: 0,
  ...overrides,
});

const FUNDERS = { 1: "BHB", 2: "Boom" };

describe("computeKpis", () => {
  it("returns zeros for an empty portfolio", () => {
    const kpis = computeKpis([]);
    expect(kpis.costBasis).toBe(0);
    expect(kpis.lifetimeReturn).toBe(0);
    expect(kpis.badDebtPct).toBe(0);
  });

  it("sums across vintage months and derives the ratios from the sums", () => {
    const kpis = computeKpis([
      monthlyRow({
        new_invested: 1000,
        rtr_invested: 500,
        cost_basis: 1500,
        initial_net_rtr: 2000,
        rtr_received: 900,
        bad_debt_rtr: 100,
        principal_returned: 600,
        profit_returned: 300,
        net_rtr_outstanding_after_bad_debt: 1000,
        deal_count: 3,
      }),
      monthlyRow({
        vintage_month: "2025-02-01",
        new_invested: 500,
        cost_basis: 500,
        initial_net_rtr: 600,
        rtr_received: 1300,
        deal_count: 2,
      }),
    ]);

    expect(kpis.dollarsAtWork).toBe(2000);
    expect(kpis.costBasis).toBe(2000);
    expect(kpis.netRtrOutstanding).toBe(1000);
    expect(kpis.principalReturned).toBe(600);
    expect(kpis.profitReturned).toBe(300);
    // (900 + 1300) / 2000 - 1
    expect(kpis.lifetimeReturn).toBeCloseTo(0.1);
    // 100 / 2600
    expect(kpis.badDebtPct).toBeCloseTo(100 / 2600);
    expect(kpis.dealCount).toBe(5);
  });

  it("treats null aggregates as zero", () => {
    const kpis = computeKpis([monthlyRow({ cost_basis: null, rtr_received: null })]);
    expect(kpis.costBasis).toBe(0);
    expect(kpis.lifetimeReturn).toBe(0);
  });
});

describe("formatMonth", () => {
  it("formats without timezone shifting", () => {
    expect(formatMonth("2025-01-01")).toBe("Jan 25");
    expect(formatMonth("2024-12-01")).toBe("Dec 24");
  });
});

describe("buildAllocationsByMonth", () => {
  it("pivots vintages into one row per month with a column per funder", () => {
    const { funders, rows } = buildAllocationsByMonth(
      [
        vintageRow({ funder_id: 1, vintage_month: "2025-01-01", cost_basis: 100 }),
        vintageRow({ funder_id: 2, vintage_month: "2025-01-01", cost_basis: 300 }),
        vintageRow({ funder_id: 1, vintage_month: "2025-02-01", cost_basis: 50 }),
      ],
      FUNDERS
    );

    // ordered by total contribution: Boom 300 > BHB 150
    expect(funders).toEqual(["Boom", "BHB"]);
    expect(rows).toEqual([
      { month: "Jan 25", Boom: 300, BHB: 100 },
      { month: "Feb 25", Boom: 0, BHB: 50 },
    ]);
  });

  it("labels unknown funder ids", () => {
    const { funders } = buildAllocationsByMonth([vintageRow({ funder_id: 99 })], FUNDERS);
    expect(funders).toEqual(["Funder 99"]);
  });
});

describe("normalizeStacked", () => {
  it("normalizes each month to 100", () => {
    const stacked = buildAllocationsByMonth(
      [
        vintageRow({ funder_id: 1, cost_basis: 100 }),
        vintageRow({ funder_id: 2, cost_basis: 300 }),
      ],
      FUNDERS
    );
    const pct = normalizeStacked(stacked);
    expect(pct.rows[0].Boom).toBe(75);
    expect(pct.rows[0].BHB).toBe(25);
  });

  it("returns zeros for an all-zero month instead of NaN", () => {
    const stacked = buildAllocationsByMonth([vintageRow({ cost_basis: 0 })], FUNDERS);
    const pct = normalizeStacked(stacked);
    expect(pct.rows[0].BHB).toBe(0);
  });
});

describe("latestMonthAllocation", () => {
  it("returns the latest vintage month's slices sorted by value", () => {
    const { month, slices } = latestMonthAllocation(
      [
        vintageRow({ funder_id: 1, vintage_month: "2025-01-01", cost_basis: 100 }),
        vintageRow({ funder_id: 1, vintage_month: "2025-03-01", cost_basis: 10 }),
        vintageRow({ funder_id: 2, vintage_month: "2025-03-01", cost_basis: 40 }),
      ],
      FUNDERS
    );
    expect(month).toBe("Mar 25");
    expect(slices).toEqual([
      { name: "Boom", value: 40 },
      { name: "BHB", value: 10 },
    ]);
  });

  it("handles no data", () => {
    expect(latestMonthAllocation([], FUNDERS)).toEqual({ month: null, slices: [] });
  });
});

describe("currentAllocation", () => {
  it("drops non-positive current cost basis (fully repaid funders)", () => {
    const slices = currentAllocation(
      [
        allocationRow({ funder_id: 1, current_cost_basis: 500 }),
        allocationRow({ funder_id: 2, current_cost_basis: -3 }),
      ],
      FUNDERS
    );
    expect(slices).toEqual([{ name: "BHB", value: 500 }]);
  });
});

describe("buildCommissionsByMonth", () => {
  it("maps participation and commissions per vintage", () => {
    const rows = buildCommissionsByMonth([
      monthlyRow({ total_participation: 1000, total_commissions: 120 }),
    ]);
    expect(rows).toEqual([{ month: "Jan 25", participation: 1000, commissions: 120 }]);
  });
});

describe("buildRtrSeries", () => {
  it("builds per-funder points with a running cumulative total", () => {
    const { funders, points } = buildRtrSeries(
      [
        rtrRow({ funder_id: 1, payment_date: "2025-01-10", total_net: 100 }),
        rtrRow({ funder_id: 2, payment_date: "2025-01-10", total_net: 200 }),
        rtrRow({ funder_id: 1, payment_date: "2025-01-17", total_net: 50 }),
      ],
      FUNDERS
    );

    expect(funders).toEqual(["Boom", "BHB"]);
    expect(points).toHaveLength(2);
    expect(points[0]).toMatchObject({ date: "2025-01-10", total: 300, cumulative: 300 });
    expect(points[1]).toMatchObject({
      date: "2025-01-17",
      total: 50,
      cumulative: 350,
      BHB: 50,
      Boom: 0,
    });
  });

  it("sorts dates chronologically regardless of input order", () => {
    const { points } = buildRtrSeries(
      [
        rtrRow({ payment_date: "2025-02-07", total_net: 10 }),
        rtrRow({ payment_date: "2025-01-03", total_net: 20 }),
      ],
      FUNDERS
    );
    expect(points.map((p) => p.date)).toEqual(["2025-01-03", "2025-02-07"]);
    expect(points[1].cumulative).toBe(30);
  });
});

describe("buildCollectionsForecast", () => {
  const TODAY = new Date(2026, 6, 19); // Jul 2026 → projection starts 2026-08-01

  const forecastDeal = (overrides: Partial<ForecastDealRow> = {}): ForecastDealRow => ({
    id: "d1",
    funder_id: 1,
    net_rtr_balance: 12000,
    term_months: 12,
    months_elapsed: 0,
    health_status: "on_track",
    ...overrides,
  });

  const data = (overrides: Partial<ForecastData> = {}): ForecastData => ({
    deals: [forecastDeal()],
    recentPayments: [],
    windowDays: 91,
    ...overrides,
  });

  it("falls back to straight-line over the remaining term without payment history", () => {
    const { points, total, dealCount } = buildCollectionsForecast(data(), null, TODAY);
    // 12,000 over 12 remaining months → 1,000/mo
    expect(dealCount).toBe(1);
    expect(points).toHaveLength(FORECAST_HORIZON_MONTHS);
    expect(points[0]).toEqual({ month: "2026-08-01", projected: 1000 });
    expect(points[11]).toEqual({ month: "2027-07-01", projected: 1000 });
    expect(total).toBeCloseTo(12000);
  });

  it("uses the observed recent pace and caps at the remaining balance", () => {
    const { points, total } = buildCollectionsForecast(
      data({
        deals: [forecastDeal({ net_rtr_balance: 2000 })],
        recentPayments: [
          { deal_id: "d1", payment_date: "2026-06-19", net: 1500 },
          { deal_id: "d1", payment_date: "2026-07-10", net: 1500 },
        ],
      }),
      null,
      TODAY
    );
    // 3,000 over 91 days → ~1,003.5/mo; balance of 2,000 exhausts in month 2
    const pace = 3000 / (91 / 30.44);
    expect(points[0].projected).toBeCloseTo(pace);
    expect(points[1].projected).toBeCloseTo(2000 - pace);
    expect(points[2].projected).toBe(0);
    expect(total).toBeCloseTo(2000);
  });

  it("ignores a single payment date — one payment is not a pace", () => {
    const { points } = buildCollectionsForecast(
      data({
        recentPayments: [{ deal_id: "d1", payment_date: "2026-07-10", net: 9000 }],
      }),
      null,
      TODAY
    );
    expect(points[0].projected).toBeCloseTo(1000); // straight-line fallback
  });

  it("excludes stale and past-term deals and settled balances", () => {
    const { points, total, dealCount } = buildCollectionsForecast(
      data({
        deals: [
          forecastDeal({ id: "d1", health_status: "stale" }),
          forecastDeal({ id: "d2", health_status: "past_term" }),
          forecastDeal({ id: "d3", net_rtr_balance: 0.5 }),
        ],
      }),
      null,
      TODAY
    );
    expect(dealCount).toBe(0);
    expect(total).toBe(0);
    expect(points).toEqual([]);
  });

  it("narrows to the funder drill-down", () => {
    const { total } = buildCollectionsForecast(
      data({
        deals: [
          forecastDeal({ id: "d1", funder_id: 1, net_rtr_balance: 12000 }),
          forecastDeal({ id: "d2", funder_id: 2, net_rtr_balance: 6000 }),
        ],
      }),
      2,
      TODAY
    );
    expect(total).toBeCloseTo(6000);
  });

  it("includes slipping deals at their observed (slower) pace", () => {
    const { dealCount, points } = buildCollectionsForecast(
      data({
        deals: [forecastDeal({ health_status: "slipping" })],
        recentPayments: [
          { deal_id: "d1", payment_date: "2026-06-19", net: 100 },
          { deal_id: "d1", payment_date: "2026-07-10", net: 100 },
        ],
      }),
      null,
      TODAY
    );
    expect(dealCount).toBe(1);
    expect(points[0].projected).toBeCloseTo(200 / (91 / 30.44));
  });
});

describe("extendRtrWithForecast", () => {
  it("appends cumulative projected points and bridges the seam", () => {
    const series = buildRtrSeries(
      [
        rtrRow({ funder_id: 1, payment_date: "2026-07-10", total_net: 100 }),
        rtrRow({ funder_id: 1, payment_date: "2026-07-17", total_net: 50 }),
      ],
      FUNDERS
    );
    const points = extendRtrWithForecast(series, [
      { month: "2026-08-01", projected: 40 },
      { month: "2026-09-01", projected: 10 },
    ]);

    expect(points).toHaveLength(4);
    // last historical point carries both keys so the dashed line connects
    expect(points[1]).toMatchObject({ date: "2026-07-17", cumulative: 150, projected: 150 });
    expect(points[2]).toEqual({ date: "2026-08-01", projected: 190 });
    expect(points[3]).toEqual({ date: "2026-09-01", projected: 200 });
    expect(points[2].cumulative).toBeUndefined();
  });

  it("returns the series unchanged when either side is empty", () => {
    const series = buildRtrSeries(
      [rtrRow({ payment_date: "2026-07-10", total_net: 100 })],
      FUNDERS
    );
    expect(extendRtrWithForecast(series, [])).toEqual(series.points);
    expect(
      extendRtrWithForecast({ funders: [], points: [] }, [{ month: "2026-08-01", projected: 1 }])
    ).toEqual([]);
  });
});

describe("buildVintagePerformance", () => {
  it("carries term, factor and points per vintage month", () => {
    const rows = buildVintagePerformance([
      monthlyRow({
        weighted_avg_factor: 1.32,
        weighted_avg_term_months: 6.5,
        points_per_month: 4.9,
      }),
    ]);
    expect(rows).toEqual([
      { month: "Jan 25", weightedAvgFactor: 1.32, termMonths: 6.5, pointsPerMonth: 4.9 },
    ]);
  });
});

describe("buildConcentration", () => {
  const data = (overrides: Partial<ConcentrationData> = {}): ConcentrationData => ({
    deals: [],
    merchants: [],
    states: [
      { id: 1, code: "CA", name: "California" },
      { id: 2, code: "NY", name: "New York" },
    ],
    industries: [
      { id: 1, name: "Restaurants" },
      { id: 2, name: "Retail" },
    ],
    ...overrides,
  });

  const deal = (overrides: Partial<ConcentrationDealRow> = {}): ConcentrationDealRow => ({
    funder_id: 1,
    merchant_id: "m1",
    new_dollars_at_work: 0,
    rtr_dollars_at_work: 0,
    ...overrides,
  });

  it("buckets dollars at work by merchant state and industry with shares", () => {
    const result = buildConcentration(
      data({
        deals: [
          deal({ merchant_id: "m1", new_dollars_at_work: 600, rtr_dollars_at_work: 150 }),
          deal({ merchant_id: "m2", new_dollars_at_work: 250 }),
        ],
        merchants: [
          { id: "m1", state_id: 1, industry_id: 1 },
          { id: "m2", state_id: 2, industry_id: 1 },
        ],
      })
    );

    expect(result.total).toBe(1000);
    expect(result.states).toEqual([
      { key: "CA", name: "California", value: 750, dealCount: 1, share: 0.75 },
      { key: "NY", name: "New York", value: 250, dealCount: 1, share: 0.25 },
    ]);
    expect(result.industries).toEqual([
      { key: "Restaurants", name: "Restaurants", value: 1000, dealCount: 2, share: 1 },
    ]);
  });

  it("sends unclassified merchants to an unknown bucket sorted last", () => {
    const result = buildConcentration(
      data({
        deals: [
          deal({ merchant_id: "m1", new_dollars_at_work: 100 }),
          deal({ merchant_id: "m2", new_dollars_at_work: 900 }),
          deal({ merchant_id: null, new_dollars_at_work: 500 }),
        ],
        merchants: [
          { id: "m1", state_id: 1, industry_id: 1 },
          { id: "m2", state_id: null, industry_id: null },
        ],
      })
    );

    expect(result.total).toBe(1500);
    // Unknown holds the most dollars but still sorts after every named bucket.
    expect(result.states.map((b) => b.key)).toEqual(["CA", UNKNOWN_BUCKET_KEY]);
    expect(result.states[1]).toMatchObject({ value: 1400, dealCount: 2 });
    expect(result.industries.map((b) => b.key)).toEqual(["Restaurants", UNKNOWN_BUCKET_KEY]);
  });

  it("narrows to a funder when funderId is passed", () => {
    const result = buildConcentration(
      data({
        deals: [
          deal({ funder_id: 1, merchant_id: "m1", new_dollars_at_work: 100 }),
          deal({ funder_id: 2, merchant_id: "m2", new_dollars_at_work: 300 }),
        ],
        merchants: [
          { id: "m1", state_id: 1, industry_id: 1 },
          { id: "m2", state_id: 2, industry_id: 2 },
        ],
      }),
      2
    );

    expect(result.total).toBe(300);
    expect(result.states).toEqual([
      { key: "NY", name: "New York", value: 300, dealCount: 1, share: 1 },
    ]);
  });

  it("returns zero shares for an empty scope", () => {
    const result = buildConcentration(data());
    expect(result).toEqual({ total: 0, states: [], industries: [] });
  });
});

describe("formatters", () => {
  it("formats money with K/M scaling", () => {
    expect(formatMoney(1_234_567)).toBe("$1.23M");
    expect(formatMoney(45_600)).toBe("$45.6K");
    expect(formatMoney(999)).toBe("$999");
    expect(formatMoney(-2_000_000)).toBe("$-2.00M");
  });

  it("formats fractions as percentages", () => {
    expect(formatPct(0.1234)).toBe("12.3%");
    expect(formatPct(-0.05, 0)).toBe("-5%");
  });
});
