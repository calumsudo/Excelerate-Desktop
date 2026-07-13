//! Database tools exposed to the model, executed against Supabase's
//! PostgREST endpoint with the signed-in user's JWT so RLS applies exactly
//! as it does for the rest of the app.

use serde_json::{json, Value};

use super::types::ToolDef;

/// Read-only relations the model may query. Anything else is rejected.
const ALLOWED_RELATIONS: &[&str] = &[
    "deal_computed",
    "monthly_vintage_stats",
    "portfolio_monthly",
    "weekly_rtr_matrix",
    "funder_allocation_current",
    "deal_payments",
    "deals",
    "merchants",
    "funders",
    "portfolios",
    "portfolio_funders",
    "industries",
    "states",
    "net_rtr_payments",
    "funder_uploads",
];

const ALLOWED_OPS: &[&str] = &[
    "eq", "neq", "gt", "gte", "lt", "lte", "like", "ilike", "in", "is",
];

const MAX_RESULT_CHARS: usize = 35_000;
const MAX_LIMIT: u64 = 1000;
const DEFAULT_LIMIT: u64 = 100;

pub struct SupabaseCtx {
    pub client: reqwest::Client,
    pub url: String,
    pub anon_key: String,
    pub access_token: String,
}

pub fn tool_defs() -> Vec<ToolDef> {
    let filter_schema = json!({
        "type": "array",
        "description": "Filters ANDed together. Values are always strings: numbers as '125000', dates as '2024-03-01', booleans as 'true'. For op 'in' pass a comma-separated list; for 'like'/'ilike' use * as the wildcard; for 'is' pass 'null', 'true' or 'false'.",
        "items": {
            "type": "object",
            "properties": {
                "column": { "type": "string", "description": "Column name" },
                "op": { "type": "string", "enum": ALLOWED_OPS },
                "value": { "type": "string", "description": "Filter value encoded as a string" }
            },
            "required": ["column", "op", "value"]
        }
    });

    vec![
        ToolDef {
            name: "query_data",
            description: "Query rows from a table or analytics view in the Excelerate portfolio database. Returns matching rows as JSON plus the total row count. Prefer the analytics views (deal_computed, portfolio_monthly, monthly_vintage_stats, ...) — they contain the derived metrics. Use small limits and select only needed columns for wide relations.",
            input_schema: json!({
                "type": "object",
                "properties": {
                    "relation": {
                        "type": "string",
                        "enum": ALLOWED_RELATIONS,
                        "description": "Table or view to query"
                    },
                    "select": {
                        "type": "string",
                        "description": "Comma-separated columns to return (default: all)"
                    },
                    "filters": filter_schema.clone(),
                    "order_by": { "type": "string", "description": "Column to sort by" },
                    "descending": { "type": "boolean", "description": "Sort descending (default false)" },
                    "limit": { "type": "integer", "description": "Max rows to return, 1-1000 (default 100)" }
                },
                "required": ["relation"]
            }),
        },
        ToolDef {
            name: "count_rows",
            description: "Count the rows in a table or view matching the given filters, without returning row data. Use this before large queries or to answer 'how many' questions.",
            input_schema: json!({
                "type": "object",
                "properties": {
                    "relation": {
                        "type": "string",
                        "enum": ALLOWED_RELATIONS,
                        "description": "Table or view to count"
                    },
                    "filters": filter_schema
                },
                "required": ["relation"]
            }),
        },
    ]
}

/// System prompt: role, schema reference, and tool guidance. Kept static so
/// provider-side prompt caching can apply.
pub fn system_prompt() -> String {
    let today = chrono::Local::now().format("%Y-%m-%d");
    format!(
        r#"You are the AI assistant inside Excelerate, a desktop app for managing MCA (Merchant Cash Advance) participation portfolios. You answer questions about the user's portfolio data by querying their database with the provided tools, and you help analyze files they upload.

Today's date: {today}.

# Database reference (PostgreSQL via Supabase; all reads are scoped to the signed-in user's portfolios by row-level security)

Core tables:
- portfolios(id, name, profit_share_rate, dividend_rate) — the participation portfolios (e.g. Alder, White Rabbit).
- funders(id, name, code, sheet_name) — MCA funders the portfolios participate with.
- portfolio_funders(portfolio_id, funder_id, management_fee_rate).
- merchants(id, name, industry_id, state_id, website, funder_id, portfolio_id).
- deals(id, merchant_id, portfolio_id, funder_id, advance_id, funder_advance_id, fico, buy_rate, commission, total_amount_funded, num_daily_payments, num_weekly_payments, deal_length_months, participation_on_amount, new_dollars, rtr, is_default, date_funded, date_closed, default_date) — deal inputs only; derived metrics live in deal_computed.
- net_rtr_payments(id, deal_id, payment_date, gross, fee, net) — payment history per deal.
- funder_uploads(id, portfolio_id, funder_id, report_date, original_filename, created_at) — monthly report uploads.
- industries(id, name), states(id, code, name) — lookups for merchants.

Analytics views (prefer these — they implement the portfolio math):
- deal_computed — one row per deal with derived metrics: vintage_month, sell_rate, commission_dollars, total_rtr, term_months, rh_pct_of_deal, cost_basis, net_rtr, all_in_factor, points_per_month, total_net_received, net_rtr_balance, pct_rtr_paid, return_on_cost_basis, bad_debt_rtr, default_dollars_lost, plus the deal input columns.
- monthly_vintage_stats — per portfolio_id × funder_id × vintage_month: deal_count, new_invested, rtr_invested, cost_basis, initial_net_rtr, weighted_avg_factor, rtr_received, principal_returned, profit_returned, net_rtr_outstanding, bad_debt_rtr, net_rtr_outstanding_after_bad_debt, weighted_avg_term_months, vintage_return, bad_debt_pct, points_per_month, profit_share.
- portfolio_monthly — same metrics rolled up per portfolio_id × vintage_month (plus profit_share_rate, dividend_rate).
- weekly_rtr_matrix — per portfolio_id × funder_id × payment_date: total_gross, total_fee, total_net.
- funder_allocation_current — current allocation snapshot per portfolio_id × funder_id: initial_cost_basis, current_cost_basis, rtr_received, factor, pct_current_cost_basis.
- deal_payments — per deal_id × payment_date payment rows with portfolio_id/funder_id scope.

# How to work
- Resolve names first: portfolio and funder names live in `portfolios` and `funders`; most other relations reference them by portfolio_id/funder_id.
- Dates are ISO strings (YYYY-MM-DD); vintage_month is the first day of the month. Money columns are numeric dollars; rates/factors are decimals.
- Use count_rows for "how many" questions and to gauge result sizes; keep query_data limits small and select only the columns you need on wide relations like deal_computed.
- When the user uploads a spreadsheet/CSV its contents appear as text in the conversation; PDFs and images are attached natively.
- Present results clearly: use markdown tables for tabular answers, state the portfolio/funder scope you used, and round money to cents. If a query returns nothing, say so and suggest what to check.
- You have read-only access. You cannot modify data; if asked to, explain that changes are made through the app's pages."#
    )
}

fn valid_ident(s: &str) -> bool {
    !s.is_empty() && s.chars().all(|c| c.is_ascii_alphanumeric() || c == '_')
}

/// Builds the PostgREST query string pieces shared by both tools.
fn build_params(input: &Value) -> Result<Vec<(String, String)>, String> {
    let mut params: Vec<(String, String)> = Vec::new();

    if let Some(filters) = input["filters"].as_array() {
        for filter in filters {
            let column = filter["column"].as_str().unwrap_or_default();
            let op = filter["op"].as_str().unwrap_or_default();
            let value = match &filter["value"] {
                Value::String(s) => s.clone(),
                other => other.to_string(),
            };
            if !valid_ident(column) {
                return Err(format!("Invalid filter column: {column:?}"));
            }
            if !ALLOWED_OPS.contains(&op) {
                return Err(format!("Invalid filter op: {op:?}"));
            }
            let rhs = if op == "in" {
                let list = value
                    .split(',')
                    .map(|v| {
                        let v = v.trim();
                        if v.parse::<f64>().is_ok() {
                            v.to_string()
                        } else {
                            format!("\"{}\"", v.replace('"', ""))
                        }
                    })
                    .collect::<Vec<_>>()
                    .join(",");
                format!("in.({list})")
            } else {
                format!("{op}.{value}")
            };
            params.push((column.to_string(), rhs));
        }
    }
    Ok(params)
}

fn relation_from(input: &Value) -> Result<&str, String> {
    let relation = input["relation"].as_str().unwrap_or_default();
    if !ALLOWED_RELATIONS.contains(&relation) {
        return Err(format!(
            "Unknown relation {relation:?}. Allowed: {}",
            ALLOWED_RELATIONS.join(", ")
        ));
    }
    Ok(relation)
}

async fn send_query(
    ctx: &SupabaseCtx,
    relation: &str,
    params: &[(String, String)],
) -> Result<(u64, Value), String> {
    let url = format!("{}/rest/v1/{}", ctx.url.trim_end_matches('/'), relation);
    let response = ctx
        .client
        .get(&url)
        .query(params)
        .header("apikey", &ctx.anon_key)
        .bearer_auth(&ctx.access_token)
        .header("Prefer", "count=exact")
        .send()
        .await
        .map_err(|e| format!("Database request failed: {e}"))?;

    let status = response.status();
    let total = response
        .headers()
        .get("content-range")
        .and_then(|v| v.to_str().ok())
        .and_then(|v| v.rsplit('/').next().map(str::to_string))
        .and_then(|v| v.parse::<u64>().ok())
        .unwrap_or(0);
    let body = response
        .text()
        .await
        .map_err(|e| format!("Failed to read database response: {e}"))?;
    if !status.is_success() {
        return Err(format!("Database error ({status}): {body}"));
    }
    let rows: Value =
        serde_json::from_str(&body).map_err(|e| format!("Invalid database response: {e}"))?;
    Ok((total, rows))
}

pub async fn execute_tool(name: &str, input: &Value, ctx: &SupabaseCtx) -> Result<String, String> {
    match name {
        "query_data" => {
            let relation = relation_from(input)?;
            let mut params = build_params(input)?;

            let select = input["select"].as_str().unwrap_or("*").trim();
            let select_ok = select == "*" || select.split(',').all(|c| valid_ident(c.trim()));
            if !select_ok {
                return Err(format!("Invalid select list: {select:?}"));
            }
            params.push(("select".into(), select.to_string()));

            if let Some(order_by) = input["order_by"].as_str() {
                if !valid_ident(order_by) {
                    return Err(format!("Invalid order_by column: {order_by:?}"));
                }
                let dir = if input["descending"].as_bool().unwrap_or(false) {
                    "desc"
                } else {
                    "asc"
                };
                params.push(("order".into(), format!("{order_by}.{dir}")));
            }

            let limit = input["limit"]
                .as_u64()
                .unwrap_or(DEFAULT_LIMIT)
                .clamp(1, MAX_LIMIT);
            params.push(("limit".into(), limit.to_string()));

            let (total, rows) = send_query(ctx, relation, &params).await?;
            let all_rows = rows.as_array().cloned().unwrap_or_default();

            // Keep tool results bounded so they don't blow up the context.
            let mut kept: Vec<Value> = Vec::new();
            let mut size = 0usize;
            let mut truncated = false;
            for row in &all_rows {
                let s = row.to_string();
                if size + s.len() > MAX_RESULT_CHARS && !kept.is_empty() {
                    truncated = true;
                    break;
                }
                size += s.len();
                kept.push(row.clone());
            }

            let result = json!({
                "relation": relation,
                "total_matching_rows": total,
                "returned_rows": kept.len(),
                "truncated_for_size": truncated,
                "rows": kept,
            });
            Ok(result.to_string())
        }
        "count_rows" => {
            let relation = relation_from(input)?;
            let mut params = build_params(input)?;
            params.push(("select".into(), "*".into()));
            params.push(("limit".into(), "1".into()));
            let (total, _) = send_query(ctx, relation, &params).await?;
            Ok(json!({ "relation": relation, "total_matching_rows": total }).to_string())
        }
        other => Err(format!("Unknown tool: {other}")),
    }
}
