/**
 * AI-generated monthly portfolio commentary (issue #59): pre-fetches the KPI
 * numbers the letter needs from the analytics views, packages them into a
 * purpose-built prompt, and runs it through the existing AI chat agent loop
 * (`streamChat`), which can still pull deal-level detail with its tools.
 */
import {
  aggregateMonthlyByVintage,
  buildConcentration,
  computeKpis,
  formatMonth,
  getConcentrationData,
  getNeedsAttention,
  getPortfolioAnalytics,
  type MonthlyStatsRow,
  type PortfolioAnalytics,
  type PortfolioSelection,
} from "./analytics-service";
import { streamChat, type AiChatEvent, type AiProvider, type ChatMessage } from "./ai-chat-service";

/** Everything the prompt is seeded with, fetched once per scope. */
export interface CommentarySeed {
  scopeLabel: string;
  vintages: MonthlyStatsRow[];
  /** Net collections per "YYYY-MM" month per funder name. */
  collectionsByMonth: Map<string, Record<string, number>>;
  allocations: Array<{
    funder: string;
    current_cost_basis: number | null;
    pct_current_cost_basis: number | null;
    factor: number;
  }>;
  topStates: Array<{ name: string; share: number; deals: number }>;
  topIndustries: Array<{ name: string; share: number; deals: number }>;
  atRiskDeals: Array<Record<string, unknown>>;
}

const TOP_BUCKETS = 6;
const MAX_AT_RISK_DEALS = 15;

function monthKey(isoDate: string): string {
  return isoDate.slice(0, 7);
}

/** "2026-06" → "2026-05". */
export function priorMonth(month: string): string {
  const [year, m] = month.split("-").map(Number);
  const date = new Date(Date.UTC(year, m - 2, 1));
  return date.toISOString().slice(0, 7);
}

/** "2026-06" → "June 2026", for titles and the prompt. */
export function formatMonthLong(month: string): string {
  const [year, m] = month.split("-").map(Number);
  const names = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
  ];
  return `${names[(m || 1) - 1]} ${year}`;
}

function collectionsByMonth(analytics: PortfolioAnalytics): Map<string, Record<string, number>> {
  const months = new Map<string, Record<string, number>>();
  for (const row of analytics.rtr) {
    if (!row.payment_date || row.funder_id == null) continue;
    const key = monthKey(row.payment_date);
    const funder = analytics.funderNames[row.funder_id] ?? `Funder ${row.funder_id}`;
    const bucket = months.get(key) ?? {};
    bucket[funder] = (bucket[funder] ?? 0) + (row.total_net ?? 0);
    months.set(key, bucket);
  }
  return months;
}

export async function loadCommentarySeed(
  selection: PortfolioSelection,
  scopeLabel: string
): Promise<CommentarySeed> {
  const [analytics, atRisk, concentrationData] = await Promise.all([
    getPortfolioAnalytics(selection),
    getNeedsAttention(selection),
    getConcentrationData(selection),
  ]);

  const concentration = buildConcentration(concentrationData);
  const bucketSummary = (buckets: typeof concentration.states) =>
    buckets
      .slice(0, TOP_BUCKETS)
      .map((b) => ({ name: b.name, share: b.share, deals: b.dealCount }));

  return {
    scopeLabel,
    vintages: aggregateMonthlyByVintage(analytics.monthly),
    collectionsByMonth: collectionsByMonth(analytics),
    allocations: analytics.allocations
      .filter((a) => a.funder_id != null)
      .map((a) => ({
        funder: analytics.funderNames[a.funder_id!] ?? `Funder ${a.funder_id}`,
        current_cost_basis: a.current_cost_basis,
        pct_current_cost_basis: a.pct_current_cost_basis,
        factor: a.factor,
      })),
    topStates: bucketSummary(concentration.states),
    topIndustries: bucketSummary(concentration.industries),
    atRiskDeals: atRisk.slice(0, MAX_AT_RISK_DEALS).map((deal) => ({
      merchant: deal.merchant_name,
      funder: deal.funder_name,
      status: deal.health_status,
      date_funded: deal.date_funded,
      pct_rtr_paid: deal.pct_rtr_paid,
      net_rtr_balance: deal.net_rtr_balance,
      days_since_last_payment: deal.days_since_last_payment,
      pct_term_elapsed: deal.pct_term_elapsed,
      pace_ratio: deal.pace_ratio,
    })),
  };
}

/**
 * Months the commentary can cover: every month with collections activity or
 * new vintage deployment, newest first (the default pick).
 */
export function commentaryMonths(seed: CommentarySeed): string[] {
  const months = new Set<string>(seed.collectionsByMonth.keys());
  for (const vintage of seed.vintages) {
    if (vintage.vintage_month) months.add(monthKey(vintage.vintage_month));
  }
  return [...months].sort().reverse();
}

const round = (value: number | null | undefined) =>
  value == null ? null : Math.round(value * 100) / 100;

/** The purpose-built user prompt: task, section spec, style, seeded data. */
export function buildCommentaryPrompt(seed: CommentarySeed, month: string): string {
  const monthLabel = formatMonthLong(month);
  const prior = priorMonth(month);
  const kpis = computeKpis(seed.vintages);

  const vintageTable = seed.vintages.map((v) => ({
    vintage: v.vintage_month ? formatMonth(v.vintage_month) : "?",
    deals: v.deal_count,
    new_invested: round(v.new_invested),
    cost_basis: round(v.cost_basis),
    factor: round(v.weighted_avg_factor),
    rtr_received: round(v.rtr_received),
    outstanding: round(v.net_rtr_outstanding_after_bad_debt),
    bad_debt_rtr: round(v.bad_debt_rtr),
    points_per_month: round(v.points_per_month),
  }));

  const collections = {
    [month]: seed.collectionsByMonth.get(month) ?? {},
    [prior]: seed.collectionsByMonth.get(prior) ?? {},
  };

  const data = {
    scope: seed.scopeLabel,
    month: monthLabel,
    portfolio_kpis: {
      deal_count: kpis.dealCount,
      dollars_at_work: round(kpis.dollarsAtWork),
      cost_basis: round(kpis.costBasis),
      net_rtr_outstanding: round(kpis.netRtrOutstanding),
      principal_returned: round(kpis.principalReturned),
      profit_returned: round(kpis.profitReturned),
      lifetime_return_on_cost_basis: round(kpis.lifetimeReturn),
      bad_debt_pct_of_initial_net_rtr: round(kpis.badDebtPct),
    },
    vintage_performance: vintageTable,
    net_collections_by_funder: collections,
    funder_allocation_current: seed.allocations,
    top_states_by_dollars_at_work: seed.topStates,
    top_industries_by_dollars_at_work: seed.topIndustries,
    at_risk_deals_from_deal_health: seed.atRiskDeals,
  };

  return `Write the monthly investor commentary (LP-letter style) for ${seed.scopeLabel}, covering ${monthLabel}.

Use the pre-fetched data below as your primary source — it comes from the same analytics views your tools query. You may run query_data for supporting detail (e.g. a specific deal in deal_computed), but keep tool calls to a minimum (at most 3) and never re-fetch what is already provided.

# Output
Respond with the commentary markdown only — no preamble, no closing note about how it was produced. Start with a "# ${seed.scopeLabel} — Monthly Commentary, ${monthLabel}" title, then exactly these sections:

## Portfolio Overview
Scale and health at a glance: deal count, dollars at work, net RTR outstanding, lifetime return, and what changed in ${monthLabel}.

## Vintage Performance
How the vintages are tracking: deployment pace, weighted factors, points per month, and which vintages stand out (good or bad).

## Collections
${monthLabel} net collections versus the prior month, in total and by funder where the movement is notable.

## Notable Deals & Slippage
The at-risk picture: past-term, stale, and slipping deals with merchant names and dollar amounts; bad-debt exposure and any concentration of risk in one funder.

## Concentration
State and industry exposure — call out anything above roughly 20% of dollars at work, and note diversification breadth otherwise.

# Style
- Professional, factual LP-letter prose. Short paragraphs; use a small markdown table only where it genuinely helps (e.g. collections by funder).
- Cite concrete figures: dollars as $1.23M / $456k style, rates and factors to two decimals, percentages to one decimal.
- Numbers must come from the data below or your tool results — never estimate or invent. If a section has no data, say so in one sentence.
- Month labels like "May 26" in the data mean May 2026.

# Pre-fetched data (JSON)
${JSON.stringify(data, null, 1)}`;
}

/**
 * Runs the commentary prompt through the AI chat agent loop and returns the
 * final markdown. `onEvent` receives the same live events as the chat page.
 */
export async function generateCommentary(params: {
  provider: AiProvider;
  model: string;
  prompt: string;
  onEvent: (event: AiChatEvent) => void;
}): Promise<string> {
  const messages: ChatMessage[] = [
    { role: "user", blocks: [{ kind: "text", text: params.prompt }] },
  ];
  const newMessages = await streamChat({
    provider: params.provider,
    model: params.model,
    messages,
    onEvent: params.onEvent,
  });

  const text = newMessages
    .filter((message) => message.role === "assistant")
    .flatMap((message) => message.blocks)
    .filter((block): block is Extract<typeof block, { kind: "text" }> => block.kind === "text")
    .map((block) => block.text)
    .join("\n\n")
    .trim();

  if (!text) throw new Error("The model returned no commentary text.");
  return text;
}
