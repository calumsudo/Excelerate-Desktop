import { supabase } from "./supabase";

export interface MerchantHit {
  id: string;
  name: string;
}

export interface DealHit {
  id: string;
  funderAdvanceId: string | null;
  merchantName: string | null;
  /** Value to seed the Deal Lookup search box with. */
  searchValue: string;
}

export interface PaletteSearchResults {
  merchants: MerchantHit[];
  deals: DealHit[];
}

export const EMPTY_RESULTS: PaletteSearchResults = { merchants: [], deals: [] };

const MERCHANT_LIMIT = 6;
const DEAL_LIMIT = 8;

/**
 * Escape LIKE wildcards, and drop characters that are PostgREST `or()` syntax
 * (commas, parens) so user input can't break the filter expression.
 */
function toLikePattern(query: string): string {
  return `%${query.replace(/[,()]/g, "").replace(/[\\%_]/g, "\\$&")}%`;
}

interface DealRow {
  id: string;
  funder_advance_id: string | null;
  advance_id: string | null;
  merchant_id: string | null;
}

/**
 * Search merchants by name and deals by advance ID or merchant name.
 * RLS scopes both tables, so results only cover what the user can see.
 */
export async function searchPalette(query: string): Promise<PaletteSearchResults> {
  const trimmed = query.trim();
  if (!trimmed) return EMPTY_RESULTS;
  const pattern = toLikePattern(trimmed);

  const [merchantsRes, dealsByIdRes] = await Promise.all([
    supabase
      .from("merchants")
      .select("id, name")
      .eq("is_deleted", false)
      .ilike("name", pattern)
      .order("name")
      .limit(MERCHANT_LIMIT),
    supabase
      .from("deals")
      .select("id, funder_advance_id, advance_id, merchant_id")
      .eq("is_deleted", false)
      .or(`funder_advance_id.ilike.${pattern},advance_id.ilike.${pattern}`)
      .limit(DEAL_LIMIT),
  ]);

  if (merchantsRes.error) throw new Error(merchantsRes.error.message);
  if (dealsByIdRes.error) throw new Error(dealsByIdRes.error.message);

  const merchants: MerchantHit[] = merchantsRes.data ?? [];
  const dealRows: DealRow[] = dealsByIdRes.data ?? [];

  // Deals whose merchant matched by name (so "Acme" surfaces Acme's deals too).
  if (merchants.length > 0 && dealRows.length < DEAL_LIMIT) {
    const { data, error } = await supabase
      .from("deals")
      .select("id, funder_advance_id, advance_id, merchant_id")
      .eq("is_deleted", false)
      .in(
        "merchant_id",
        merchants.map((m) => m.id)
      )
      .limit(DEAL_LIMIT);
    if (error) throw new Error(error.message);
    const seen = new Set(dealRows.map((d) => d.id));
    for (const row of data ?? []) {
      if (!seen.has(row.id) && dealRows.length < DEAL_LIMIT) dealRows.push(row);
    }
  }

  // Resolve merchant names for deal hits not already covered by the name search.
  const namesById = new Map(merchants.map((m) => [m.id, m.name]));
  const missingIds = [
    ...new Set(
      dealRows.flatMap((d) =>
        d.merchant_id != null && !namesById.has(d.merchant_id) ? [d.merchant_id] : []
      )
    ),
  ];
  if (missingIds.length > 0) {
    const { data, error } = await supabase
      .from("merchants")
      .select("id, name")
      .in("id", missingIds);
    if (error) throw new Error(error.message);
    for (const m of data ?? []) namesById.set(m.id, m.name);
  }

  const deals: DealHit[] = dealRows.map((d) => {
    const merchantName = d.merchant_id != null ? (namesById.get(d.merchant_id) ?? null) : null;
    return {
      id: d.id,
      funderAdvanceId: d.funder_advance_id,
      merchantName,
      // funder_advance_id is what Deal Lookup's free-text search matches on;
      // fall back to the merchant name for deals without one.
      searchValue: d.funder_advance_id ?? merchantName ?? "",
    };
  });

  return { merchants, deals };
}
