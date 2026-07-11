import { describe, it, expect } from "vitest";
import {
  buildFunderSheets,
  buildRtrExport,
  type FunderSheetInputs,
} from "../services/workbook-export-service";
import type { Database } from "../services/supabase.types";

type DealComputedRow = Database["public"]["Views"]["deal_computed"]["Row"];
type DealPaymentRow = Database["public"]["Views"]["deal_payments"]["Row"];
type WeeklyRtrRow = Database["public"]["Views"]["weekly_rtr_matrix"]["Row"];

const dealRow = (overrides: Partial<DealComputedRow> = {}): DealComputedRow => ({
  id: "deal-1",
  portfolio_id: 1,
  funder_id: 1,
  merchant_id: "m-1",
  advance_id: "BHB-001",
  funder_advance_id: "40538",
  fico: 675,
  date_funded: "2024-02-08",
  date_closed: null,
  is_default: false,
  new_dollars: true,
  rtr: false,
  vintage_month: "2024-02-01",
  buy_rate: 1.29,
  commission: 0.14,
  sell_rate: 1.43,
  total_amount_funded: 15000,
  participation_on_amount: 2000,
  management_fee_rate: 0.03,
  commission_dollars: 2100,
  total_rtr: 21450,
  term_months: 7.44,
  is_daily: false,
  rh_pct_of_deal: 0.1333,
  pro_rata_commission: 280,
  rh_rtr: 2860,
  cost_basis: 2280,
  net_rtr: 2774.2,
  new_dollars_at_work: 2280,
  rtr_dollars_at_work: 0,
  all_in_factor: 1.2167,
  points_per_month: 2.91,
  gross_payment_expected: 89.4,
  net_payment_expected: 86.7,
  weekly_payment_expected: 86.7,
  total_net_received: 1000,
  total_gross_received: 1031,
  total_fee_paid: 31,
  net_rtr_balance: 1774.2,
  pct_rtr_paid: 0.36,
  return_on_cost_basis: 0.44,
  bad_debt_rtr: 0,
  default_dollars_lost: null,
  ...overrides,
});

const paymentRow = (overrides: Partial<DealPaymentRow> = {}): DealPaymentRow => ({
  portfolio_id: 1,
  funder_id: 1,
  deal_id: "deal-1",
  payment_date: "2025-01-03",
  gross: 103.09,
  fee: 3.09,
  net: 100,
  ...overrides,
});

const baseInputs = (): FunderSheetInputs => ({
  deals: [],
  payments: [],
  funders: [
    { id: 1, name: "BHB", sheet_name: "BHB" },
    { id: 2, name: "Boom Funding", sheet_name: "Boom" },
  ],
  feeByFunder: new Map([
    [1, 0.03],
    [2, 0.04],
  ]),
  merchantsById: new Map([
    ["m-1", { id: "m-1", name: "MARCUS TRAILERS LLC", website: null, industry_id: 7, state_id: 2 }],
  ]),
  industriesById: new Map([[7, "Automotive: Trailer Sales"]]),
  statesById: new Map([[2, "NE"]]),
  auxByDeal: new Map([
    ["deal-1", { default_date: null, num_daily_payments: null, num_weekly_payments: 32 }],
  ]),
});

describe("buildFunderSheets", () => {
  it("groups deals by funder and skips funders without deals", () => {
    const inputs = baseInputs();
    inputs.deals = [dealRow()];
    const sheets = buildFunderSheets(inputs);
    expect(sheets).toHaveLength(1);
    expect(sheets[0].sheet_name).toBe("BHB");
    expect(sheets[0].funder_label).toBe("BHB");
    expect(sheets[0].management_fee_rate).toBe(0.03);
    expect(sheets[0].deals).toHaveLength(1);
  });

  it("resolves merchant, industry, state, and deal aux fields", () => {
    const inputs = baseInputs();
    inputs.deals = [dealRow()];
    const [sheet] = buildFunderSheets(inputs);
    const deal = sheet.deals[0];
    expect(deal.merchant_name).toBe("MARCUS TRAILERS LLC");
    expect(deal.industry).toBe("Automotive: Trailer Sales");
    expect(deal.state).toBe("NE");
    expect(deal.num_weekly_payments).toBe(32);
    expect(deal.num_daily_payments).toBeNull();
  });

  it("aligns sparse payments to the sheet's ascending payment dates", () => {
    const inputs = baseInputs();
    inputs.deals = [dealRow(), dealRow({ id: "deal-2", advance_id: "BHB-002" })];
    inputs.payments = [
      paymentRow({ deal_id: "deal-2", payment_date: "2025-02-07", net: 55 }),
      paymentRow({ deal_id: "deal-1", payment_date: "2025-01-03", net: 100 }),
      paymentRow({ deal_id: "deal-1", payment_date: "2025-02-07", net: 60 }),
    ];
    const [sheet] = buildFunderSheets(inputs);
    expect(sheet.payment_dates).toEqual(["2025-01-03", "2025-02-07"]);
    const byAdvanceId = new Map(sheet.deals.map((d) => [d.advance_id, d]));
    expect(byAdvanceId.get("BHB-001")!.payments).toEqual([
      [0, 100],
      [1, 60],
    ]);
    expect(byAdvanceId.get("BHB-002")!.payments).toEqual([[1, 55]]);
  });

  it("orders deals by date funded then advance id", () => {
    const inputs = baseInputs();
    inputs.deals = [
      dealRow({ id: "d3", advance_id: "BHB-010", date_funded: "2024-03-01" }),
      dealRow({ id: "d2", advance_id: "BHB-002", date_funded: "2024-03-01" }),
      dealRow({ id: "d1", advance_id: "BHB-001", date_funded: "2024-02-08" }),
    ];
    inputs.auxByDeal = new Map();
    const [sheet] = buildFunderSheets(inputs);
    expect(sheet.deals.map((d) => d.advance_id)).toEqual(["BHB-001", "BHB-002", "BHB-010"]);
  });
});

describe("buildRtrExport", () => {
  it("pivots long-form rows into a funder × date matrix", () => {
    const rtr: WeeklyRtrRow[] = [
      {
        portfolio_id: 1,
        funder_id: 1,
        payment_date: "2025-01-03",
        total_gross: 0,
        total_fee: 0,
        total_net: 100,
      },
      {
        portfolio_id: 1,
        funder_id: 2,
        payment_date: "2025-02-07",
        total_gross: 0,
        total_fee: 0,
        total_net: 40,
      },
      {
        portfolio_id: 1,
        funder_id: 1,
        payment_date: "2025-02-07",
        total_gross: 0,
        total_fee: 0,
        total_net: 60,
      },
    ];
    const result = buildRtrExport(rtr, [
      { id: 1, name: "BHB" },
      { id: 2, name: "Boom Funding" },
      { id: 3, name: "No Payments" },
    ]);
    expect(result.dates).toEqual(["2025-01-03", "2025-02-07"]);
    expect(result.funders).toEqual([
      { name: "BHB", values: [100, 60] },
      { name: "Boom Funding", values: [0, 40] },
    ]);
  });
});
