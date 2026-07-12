import { supabase } from "./supabase";
import type { Database } from "./supabase.types";

type DealInsert = Database["public"]["Tables"]["deals"]["Insert"];
type DealRow = Database["public"]["Tables"]["deals"]["Row"];

// ---------------------------------------------------------------------------
// Lookups for the deal form selects
// ---------------------------------------------------------------------------

export interface IdName {
  id: number;
  name: string;
}

export interface MerchantOption {
  id: string;
  name: string;
  portfolio_id: number | null;
  funder_id: number | null;
  industry_id: number | null;
  state_id: number | null;
  website: string | null;
}

export interface EditorLookups {
  portfolios: IdName[];
  funders: IdName[];
  industries: IdName[];
  states: { id: number; code: string }[];
  merchants: MerchantOption[];
}

const PAGE_SIZE = 1000; // PostgREST response cap; merchants can exceed it

export async function getEditorLookups(): Promise<EditorLookups> {
  const [portfolios, funders, industries, states] = await Promise.all([
    supabase.from("portfolios").select("id, name").order("name"),
    supabase.from("funders").select("id, name").order("name"),
    supabase.from("industries").select("id, name").order("name"),
    supabase.from("states").select("id, code").order("code"),
  ]);
  for (const lookup of [portfolios, funders, industries, states]) {
    if (lookup.error) throw new Error(`Failed to load lookups: ${lookup.error.message}`);
  }

  const merchants: MerchantOption[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from("merchants")
      .select("id, name, portfolio_id, funder_id, industry_id, state_id, website")
      .order("name")
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(`Failed to load merchants: ${error.message}`);
    if (!data || data.length === 0) break;
    merchants.push(...data);
    if (data.length < PAGE_SIZE) break;
  }

  return {
    portfolios: portfolios.data ?? [],
    funders: funders.data ?? [],
    industries: industries.data ?? [],
    states: states.data ?? [],
    merchants,
  };
}

// ---------------------------------------------------------------------------
// Form model — strings for numeric inputs, parsed on submit
// ---------------------------------------------------------------------------

export type PaymentCadence = "daily" | "weekly";

export interface DealFormValues {
  portfolioId: number | null;
  funderId: number | null;
  /** Existing merchant when picked from the autocomplete; null creates one. */
  merchantId: string | null;
  merchantName: string;
  industryId: number | null;
  stateId: number | null;
  website: string;
  funderAdvanceId: string;
  fico: string;
  /** Rate factors as entered on the funder sheet, e.g. 1.15 buy + 0.10 commission. */
  buyRate: string;
  commission: string;
  totalAmountFunded: string;
  participation: string;
  cadence: PaymentCadence;
  numPayments: string;
  dealLengthMonths: string;
  dateFunded: string;
  dateClosed: string;
  newDollars: boolean;
  rtrReinvestment: boolean;
  isDefault: boolean;
  defaultDate: string;
}

export const EMPTY_DEAL_FORM: DealFormValues = {
  portfolioId: null,
  funderId: null,
  merchantId: null,
  merchantName: "",
  industryId: null,
  stateId: null,
  website: "",
  funderAdvanceId: "",
  fico: "",
  buyRate: "",
  commission: "",
  totalAmountFunded: "",
  participation: "",
  cadence: "weekly",
  numPayments: "",
  dealLengthMonths: "",
  dateFunded: "",
  dateClosed: "",
  newDollars: true,
  rtrReinvestment: false,
  isDefault: false,
  defaultDate: "",
};

/** Load a deal's raw input row (deal_computed lacks the payment-count inputs). */
export async function getDealFormValues(dealId: string): Promise<DealFormValues> {
  const { data: deal, error } = await supabase.from("deals").select("*").eq("id", dealId).single();
  if (error) throw new Error(`Failed to load deal: ${error.message}`);

  let merchant: MerchantOption | null = null;
  if (deal.merchant_id != null) {
    const { data, error: merchantError } = await supabase
      .from("merchants")
      .select("id, name, portfolio_id, funder_id, industry_id, state_id, website")
      .eq("id", deal.merchant_id)
      .single();
    if (merchantError) throw new Error(`Failed to load merchant: ${merchantError.message}`);
    merchant = data;
  }

  return dealRowToFormValues(deal, merchant);
}

const numToStr = (value: number | null) => (value != null ? String(value) : "");

export function dealRowToFormValues(
  deal: DealRow,
  merchant: MerchantOption | null
): DealFormValues {
  return {
    portfolioId: deal.portfolio_id,
    funderId: deal.funder_id,
    merchantId: merchant?.id ?? null,
    merchantName: merchant?.name ?? "",
    industryId: merchant?.industry_id ?? null,
    stateId: merchant?.state_id ?? null,
    website: merchant?.website ?? "",
    funderAdvanceId: deal.funder_advance_id ?? "",
    fico: numToStr(deal.fico),
    buyRate: numToStr(deal.buy_rate),
    commission: numToStr(deal.commission),
    totalAmountFunded: numToStr(deal.total_amount_funded),
    participation: numToStr(deal.participation_on_amount),
    cadence: deal.num_daily_payments != null ? "daily" : "weekly",
    numPayments: numToStr(deal.num_daily_payments ?? deal.num_weekly_payments),
    dealLengthMonths: numToStr(deal.deal_length_months),
    dateFunded: deal.date_funded ?? "",
    dateClosed: deal.date_closed ?? "",
    newDollars: deal.new_dollars,
    rtrReinvestment: deal.rtr,
    isDefault: deal.is_default,
    defaultDate: deal.default_date ?? "",
  };
}

// ---------------------------------------------------------------------------
// Validation + payload building (pure, unit-tested)
// ---------------------------------------------------------------------------

const parseNum = (value: string): number | null => {
  const trimmed = value.trim();
  if (trimmed === "") return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
};

export function validateDealForm(values: DealFormValues): string | null {
  if (values.portfolioId == null) return "Portfolio is required";
  if (values.funderId == null) return "Funder is required";
  if (!values.merchantName.trim()) return "Merchant name is required";
  if (!values.dateFunded) return "Date funded is required";
  const numerics: [string, string][] = [
    [values.fico, "FICO"],
    [values.buyRate, "Buy rate"],
    [values.commission, "Commission rate"],
    [values.totalAmountFunded, "Amount funded"],
    [values.participation, "Participation"],
    [values.numPayments, "Payment count"],
    [values.dealLengthMonths, "Deal length"],
  ];
  for (const [raw, label] of numerics) {
    if (raw.trim() !== "" && parseNum(raw) == null) return `${label} must be a number`;
  }
  if (values.isDefault && !values.defaultDate) return "Default date is required for defaults";
  return null;
}

/**
 * The deals columns the form edits. advance_id is intentionally absent so
 * workbook-imported IDs survive edits.
 */
export function formToDealRow(values: DealFormValues): Omit<DealInsert, "id" | "merchant_id"> {
  const numPayments = parseNum(values.numPayments);
  return {
    portfolio_id: values.portfolioId,
    funder_id: values.funderId,
    funder_advance_id: values.funderAdvanceId.trim() || null,
    fico: parseNum(values.fico),
    buy_rate: parseNum(values.buyRate),
    commission: parseNum(values.commission),
    total_amount_funded: parseNum(values.totalAmountFunded),
    participation_on_amount: parseNum(values.participation),
    num_daily_payments: values.cadence === "daily" ? numPayments : null,
    num_weekly_payments: values.cadence === "weekly" ? numPayments : null,
    deal_length_months: parseNum(values.dealLengthMonths),
    new_dollars: values.newDollars,
    rtr: values.rtrReinvestment,
    is_default: values.isDefault,
    date_funded: values.dateFunded || null,
    date_closed: values.dateClosed || null,
    default_date: values.isDefault ? values.defaultDate || null : null,
  };
}

// ---------------------------------------------------------------------------
// Mutations — direct table writes; RLS scopes them by portfolio_access
// ---------------------------------------------------------------------------

/** Create the merchant when none was picked, update it when one was. */
async function upsertMerchant(values: DealFormValues): Promise<string> {
  const fields = {
    name: values.merchantName.trim(),
    industry_id: values.industryId,
    state_id: values.stateId,
    website: values.website.trim() || null,
    portfolio_id: values.portfolioId,
    funder_id: values.funderId,
  };
  if (values.merchantId != null) {
    const { error } = await supabase.from("merchants").update(fields).eq("id", values.merchantId);
    if (error) throw new Error(`Failed to update merchant: ${error.message}`);
    return values.merchantId;
  }
  const { data, error } = await supabase.from("merchants").insert(fields).select("id").single();
  if (error) throw new Error(`Failed to create merchant: ${error.message}`);
  return data.id;
}

export async function createDeal(values: DealFormValues): Promise<void> {
  const merchantId = await upsertMerchant(values);
  const { error } = await supabase
    .from("deals")
    .insert({ ...formToDealRow(values), merchant_id: merchantId });
  if (error) throw new Error(`Failed to create deal: ${error.message}`);
}

export async function updateDeal(dealId: string, values: DealFormValues): Promise<void> {
  const merchantId = await upsertMerchant(values);
  const { error } = await supabase
    .from("deals")
    .update({ ...formToDealRow(values), merchant_id: merchantId })
    .eq("id", dealId);
  if (error) throw new Error(`Failed to update deal: ${error.message}`);
}

/** Deletes the deal; its net_rtr_payments rows cascade with it. */
export async function deleteDeal(dealId: string): Promise<void> {
  const { error } = await supabase.from("deals").delete().eq("id", dealId);
  if (error) throw new Error(`Failed to delete deal: ${error.message}`);
}
