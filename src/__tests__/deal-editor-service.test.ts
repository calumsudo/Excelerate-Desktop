import { describe, it, expect } from "vitest";
import {
  dealRowToFormValues,
  formToDealRow,
  validateDealForm,
  EMPTY_DEAL_FORM,
  type DealFormValues,
} from "../services/deal-editor-service";
import type { Database } from "../services/supabase.types";

type DealRow = Database["public"]["Tables"]["deals"]["Row"];

const validForm = (overrides: Partial<DealFormValues> = {}): DealFormValues => ({
  ...EMPTY_DEAL_FORM,
  portfolioId: 1,
  funderId: 2,
  merchantName: "Acme Bakery",
  dateFunded: "2025-01-15",
  ...overrides,
});

const dealRow = (overrides: Partial<DealRow> = {}): DealRow => ({
  id: "deal-1",
  merchant_id: "m-1",
  portfolio_id: 1,
  funder_id: 2,
  advance_id: "A-1",
  funder_advance_id: "F-1",
  fico: 650,
  buy_rate: 1.15,
  commission: 0.1,
  total_amount_funded: 100000,
  num_daily_payments: null,
  num_weekly_payments: 26,
  deal_length_months: 6,
  participation_on_amount: 50000,
  new_dollars: true,
  rtr: false,
  is_default: false,
  date_funded: "2025-01-15",
  date_closed: null,
  default_date: null,
  default_notes: null,
  is_deleted: false,
  deleted_at: null,
  created_at: "2025-01-15T00:00:00Z",
  updated_at: "2025-01-15T00:00:00Z",
  ...overrides,
});

describe("validateDealForm", () => {
  it("accepts a minimal valid form", () => {
    expect(validateDealForm(validForm())).toBeNull();
  });

  it("requires portfolio, funder, merchant, and date funded", () => {
    expect(validateDealForm(validForm({ portfolioId: null }))).toMatch(/Portfolio/);
    expect(validateDealForm(validForm({ funderId: null }))).toMatch(/Funder/);
    expect(validateDealForm(validForm({ merchantName: "  " }))).toMatch(/Merchant/);
    expect(validateDealForm(validForm({ dateFunded: "" }))).toMatch(/Date funded/);
  });

  it("rejects non-numeric numeric inputs but allows blanks", () => {
    expect(validateDealForm(validForm({ buyRate: "abc" }))).toMatch(/Buy rate/);
    expect(validateDealForm(validForm({ buyRate: "" }))).toBeNull();
    expect(validateDealForm(validForm({ totalAmountFunded: "1,000" }))).toMatch(/Amount funded/);
  });

  it("requires a default date when flagged as defaulted", () => {
    expect(validateDealForm(validForm({ isDefault: true }))).toMatch(/Default date/);
    expect(validateDealForm(validForm({ isDefault: true, defaultDate: "2025-06-01" }))).toBeNull();
  });
});

describe("formToDealRow", () => {
  it("parses numerics and nulls out blanks", () => {
    const row = formToDealRow(
      validForm({
        buyRate: "1.15",
        commission: "",
        totalAmountFunded: "100000",
        numPayments: "26",
        cadence: "weekly",
      })
    );
    expect(row.buy_rate).toBe(1.15);
    expect(row.commission).toBeNull();
    expect(row.total_amount_funded).toBe(100000);
    expect(row.num_weekly_payments).toBe(26);
    expect(row.num_daily_payments).toBeNull();
    expect(row.date_closed).toBeNull();
  });

  it("routes the payment count by cadence", () => {
    const daily = formToDealRow(validForm({ cadence: "daily", numPayments: "120" }));
    expect(daily.num_daily_payments).toBe(120);
    expect(daily.num_weekly_payments).toBeNull();
  });

  it("clears the default date when the deal is not defaulted", () => {
    const row = formToDealRow(validForm({ isDefault: false, defaultDate: "2025-06-01" }));
    expect(row.is_default).toBe(false);
    expect(row.default_date).toBeNull();
  });

  it("never touches advance_id or merchant_id", () => {
    const row = formToDealRow(validForm());
    expect("advance_id" in row).toBe(false);
    expect("merchant_id" in row).toBe(false);
  });
});

describe("dealRowToFormValues", () => {
  it("round-trips a deal row through the form back to the same payload", () => {
    const original = dealRow();
    const values = dealRowToFormValues(original, {
      id: "m-1",
      name: "Acme Bakery",
      portfolio_id: 1,
      funder_id: 2,
      industry_id: 5,
      state_id: 33,
      website: null,
    });
    expect(values.cadence).toBe("weekly");
    expect(values.numPayments).toBe("26");
    expect(values.merchantId).toBe("m-1");

    const row = formToDealRow(values);
    expect(row).toMatchObject({
      portfolio_id: 1,
      funder_id: 2,
      funder_advance_id: "F-1",
      fico: 650,
      buy_rate: 1.15,
      commission: 0.1,
      total_amount_funded: 100000,
      participation_on_amount: 50000,
      num_daily_payments: null,
      num_weekly_payments: 26,
      deal_length_months: 6,
      new_dollars: true,
      rtr: false,
      is_default: false,
      date_funded: "2025-01-15",
      date_closed: null,
      default_date: null,
    });
  });

  it("maps daily deals to the daily cadence", () => {
    const values = dealRowToFormValues(
      dealRow({ num_daily_payments: 120, num_weekly_payments: null }),
      null
    );
    expect(values.cadence).toBe("daily");
    expect(values.numPayments).toBe("120");
    expect(values.merchantId).toBeNull();
    expect(values.merchantName).toBe("");
  });
});
