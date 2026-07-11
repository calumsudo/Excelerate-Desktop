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
  formatMoney,
  formatPct,
  type PortfolioMonthlyRow,
  type MonthlyVintageRow,
  type FunderAllocationRow,
  type WeeklyRtrRow,
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
