import { describe, it, expect } from "vitest";
import {
  calculateMetrics,
  groupByFunder,
  getMonthlyTrends,
  type MerchantData,
} from "../services/dashboard-service";

const makeMerchant = (overrides: Partial<MerchantData> = {}): MerchantData => ({
  id: "m1",
  portfolio_name: "Test Portfolio",
  funder_name: "FunderA",
  merchant_name: "Acme Corp",
  created_timestamp: "2025-01-01T00:00:00Z",
  updated_timestamp: "2025-01-01T00:00:00Z",
  ...overrides,
});

describe("calculateMetrics", () => {
  it("returns zeros for an empty merchant list", () => {
    const metrics = calculateMetrics([]);
    expect(metrics.totalMerchants).toBe(0);
    expect(metrics.totalFunded).toBe(0);
    expect(metrics.avgBuyRate).toBe(0);
    expect(metrics.avgCommission).toBe(0);
    expect(metrics.activeFunders).toBe(0);
    expect(metrics.recentFundings).toBe(0);
  });

  it("counts total merchants correctly", () => {
    const merchants = [makeMerchant(), makeMerchant({ id: "m2" })];
    expect(calculateMetrics(merchants).totalMerchants).toBe(2);
  });

  it("sums total_amount_funded", () => {
    const merchants = [
      makeMerchant({ total_amount_funded: 10000 }),
      makeMerchant({ id: "m2", total_amount_funded: 5000 }),
    ];
    expect(calculateMetrics(merchants).totalFunded).toBe(15000);
  });

  it("averages buy rates over merchants that have one", () => {
    const merchants = [
      makeMerchant({ buy_rate: 1.2 }),
      makeMerchant({ id: "m2", buy_rate: 1.4 }),
      makeMerchant({ id: "m3" }), // no buy_rate — excluded from average
    ];
    const { avgBuyRate } = calculateMetrics(merchants);
    expect(avgBuyRate).toBeCloseTo(1.3);
  });

  it("counts distinct funders as activeFunders", () => {
    const merchants = [
      makeMerchant({ funder_name: "Alpha" }),
      makeMerchant({ id: "m2", funder_name: "Beta" }),
      makeMerchant({ id: "m3", funder_name: "Alpha" }), // duplicate
    ];
    expect(calculateMetrics(merchants).activeFunders).toBe(2);
  });

  it("counts fundings from the last 30 days", () => {
    const recent = new Date();
    recent.setDate(recent.getDate() - 5);
    const old = new Date();
    old.setDate(old.getDate() - 60);

    const merchants = [
      makeMerchant({ date_funded: recent.toISOString() }),
      makeMerchant({ id: "m2", date_funded: old.toISOString() }),
    ];
    expect(calculateMetrics(merchants).recentFundings).toBe(1);
  });
});

describe("groupByFunder", () => {
  it("returns empty array for no merchants", () => {
    expect(groupByFunder([])).toEqual([]);
  });

  it("aggregates amounts by funder name", () => {
    const merchants = [
      makeMerchant({ funder_name: "Alpha", total_amount_funded: 3000 }),
      makeMerchant({ id: "m2", funder_name: "Alpha", total_amount_funded: 2000 }),
      makeMerchant({ id: "m3", funder_name: "Beta", total_amount_funded: 1000 }),
    ];
    const result = groupByFunder(merchants);
    const alpha = result.find((r) => r.name === "Alpha");
    expect(alpha?.value).toBe(5000);
    expect(alpha?.percentage).toBeCloseTo(83.33, 1);
  });

  it("sorts results descending by value", () => {
    const merchants = [
      makeMerchant({ funder_name: "Small", total_amount_funded: 100 }),
      makeMerchant({ id: "m2", funder_name: "Large", total_amount_funded: 9000 }),
    ];
    const result = groupByFunder(merchants);
    expect(result[0].name).toBe("Large");
    expect(result[1].name).toBe("Small");
  });

  it("caps results at 8 funders", () => {
    const merchants = Array.from({ length: 10 }, (_, i) =>
      makeMerchant({ id: `m${i}`, funder_name: `Funder${i}`, total_amount_funded: i * 100 })
    );
    expect(groupByFunder(merchants).length).toBe(8);
  });
});

describe("getMonthlyTrends", () => {
  it("always returns exactly 6 months", () => {
    expect(getMonthlyTrends([]).length).toBe(6);
  });

  it("accumulates funded amounts into the correct month bucket", () => {
    // Use first of this month to avoid edge cases
    const thisMonth = new Date();
    thisMonth.setDate(1);

    const merchants = [
      makeMerchant({ date_funded: thisMonth.toISOString(), total_amount_funded: 5000 }),
      makeMerchant({ id: "m2", date_funded: thisMonth.toISOString(), total_amount_funded: 3000 }),
    ];
    const trends = getMonthlyTrends(merchants);
    const last = trends[trends.length - 1];
    expect(last.amount).toBe(8000);
    expect(last.count).toBe(2);
  });

  it("returns zeros for months with no data", () => {
    const trends = getMonthlyTrends([]);
    expect(trends.every((t) => t.amount === 0 && t.count === 0)).toBe(true);
  });
});
