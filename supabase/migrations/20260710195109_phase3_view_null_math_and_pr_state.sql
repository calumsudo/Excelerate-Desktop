-- Phase 3 polish, found by importing the real Alder workbook locally:
--
-- 1. deal_computed treated a NULL buy_rate/commission as NULL where Excel's
--    =I+J treats blanks as 0 — every R'bull deal (buy rate, no commission)
--    reported sell_rate/total_rtr/factor as NULL/0 instead of the workbook's
--    values. CREATE OR REPLACE keeps the dependent views intact.
--
-- 2. The states lookup has the 50 states + DC but one Alder merchant is in
--    Puerto Rico — add it so the import resolves the state.

INSERT INTO states (code, name) VALUES ('PR', 'Puerto Rico')
ON CONFLICT (code) DO NOTHING;

CREATE OR REPLACE VIEW deal_computed
WITH (security_invoker = true) AS
WITH base AS (
  SELECT
    d.id,
    d.portfolio_id,
    d.funder_id,
    d.merchant_id,
    d.advance_id,
    d.funder_advance_id,
    d.fico,
    d.date_funded,
    d.date_closed,
    d.is_default,
    d.new_dollars,
    d.rtr,
    d.buy_rate,
    d.commission,
    (date_trunc('month', d.date_funded))::date AS vintage_month,
    d.total_amount_funded::numeric AS total_amount_funded,
    d.participation_on_amount::numeric AS participation_on_amount,
    COALESCE(pf.management_fee_rate, 0) AS management_fee_rate,
    -- K: sell rate = I + J. Excel treats blank cells as 0 here (R'bull rows
    -- have a buy rate but no commission; PayVa rows have neither) — COALESCE
    -- to match, otherwise NULL propagates into total RTR and the factor.
    COALESCE(d.buy_rate, 0) + COALESCE(d.commission, 0) AS sell_rate,
    -- M: commission $ = L * J
    d.total_amount_funded * COALESCE(d.commission, 0) AS commission_dollars,
    -- N: total RTR = L * K
    d.total_amount_funded * (COALESCE(d.buy_rate, 0) + COALESCE(d.commission, 0)) AS total_rtr,
    -- Q: term (months) = IF(ISBLANK(O), P/4.3, O/20)
    CASE WHEN d.num_daily_payments IS NULL
         THEN d.num_weekly_payments / 4.3
         ELSE d.num_daily_payments / 20.0
    END AS term_months,
    d.num_daily_payments IS NOT NULL AS is_daily,
    COALESCE(d.num_daily_payments, d.num_weekly_payments)::numeric AS num_payments
  FROM deals d
  LEFT JOIN portfolio_funders pf
    ON pf.portfolio_id = d.portfolio_id AND pf.funder_id = d.funder_id
),
rh AS (
  SELECT
    b.*,
    -- W: R&H % of deal = R / L
    COALESCE(b.participation_on_amount / NULLIF(b.total_amount_funded, 0), 0) AS rh_pct_of_deal
  FROM base b
),
cost AS (
  SELECT
    r.*,
    -- X: pro-rata commission paid = M * W
    COALESCE(r.commission_dollars * r.rh_pct_of_deal, 0) AS pro_rata_commission,
    -- Z: R&H pro-rata RTR = N * W
    COALESCE(r.total_rtr * r.rh_pct_of_deal, 0) AS rh_rtr
  FROM rh r
),
net AS (
  SELECT
    c.*,
    -- Y: R&H cost basis = R + X
    COALESCE(c.participation_on_amount + c.pro_rata_commission, 0) AS cost_basis,
    -- AA: net RTR (fee-adjusted) = Z - Z * B$1
    c.rh_rtr * (1 - c.management_fee_rate) AS net_rtr,
    -- AD: gross payment expected = Z / (O or P)
    c.rh_rtr / NULLIF(c.num_payments, 0) AS gross_payment_expected
  FROM cost c
),
received AS (
  SELECT
    deal_id,
    SUM(net) AS total_net_received,
    SUM(gross) AS total_gross_received,
    SUM(fee) AS total_fee_paid
  FROM net_rtr_payments
  GROUP BY deal_id
)
SELECT
  n.id,
  n.portfolio_id,
  n.funder_id,
  n.merchant_id,
  n.advance_id,
  n.funder_advance_id,
  n.fico,
  n.date_funded,
  n.date_closed,
  n.is_default,
  n.new_dollars,
  n.rtr,
  n.vintage_month,
  n.buy_rate,
  n.commission,
  n.sell_rate,
  n.total_amount_funded,
  n.participation_on_amount,
  n.management_fee_rate,
  n.commission_dollars,
  n.total_rtr,
  n.term_months,
  n.is_daily,
  n.rh_pct_of_deal,
  n.pro_rata_commission,
  n.rh_rtr,
  n.cost_basis,
  n.net_rtr,
  -- U / V: cost basis at work, split by funding source flag
  CASE WHEN n.new_dollars THEN n.cost_basis ELSE 0 END AS new_dollars_at_work,
  CASE WHEN n.rtr THEN n.cost_basis ELSE 0 END AS rtr_dollars_at_work,
  -- AB: "all in" factor = AA / Y
  n.net_rtr / NULLIF(n.cost_basis, 0) AS all_in_factor,
  -- AC: points per month = ((AB - 1) / Q) * 100
  (n.net_rtr / NULLIF(n.cost_basis, 0) - 1) / NULLIF(n.term_months, 0) * 100 AS points_per_month,
  n.gross_payment_expected,
  -- AF: net payment expected = AD - AD * fee
  n.gross_payment_expected * (1 - n.management_fee_rate) AS net_payment_expected,
  -- AG: weekly payment expected = IF(ISBLANK(O), AF, AF*5); blank once closed
  CASE WHEN n.date_closed IS NULL
       THEN n.gross_payment_expected * (1 - n.management_fee_rate)
            * CASE WHEN n.is_daily THEN 5 ELSE 1 END
       ELSE 0
  END AS weekly_payment_expected,
  -- AI: total net RTR received = SUM(payment matrix)
  COALESCE(r.total_net_received, 0) AS total_net_received,
  COALESCE(r.total_gross_received, 0) AS total_gross_received,
  COALESCE(r.total_fee_paid, 0) AS total_fee_paid,
  -- AJ: net RTR balance = AA - AI
  n.net_rtr - COALESCE(r.total_net_received, 0) AS net_rtr_balance,
  -- AK: % of RTR paid = AI / AA
  COALESCE(COALESCE(r.total_net_received, 0) / NULLIF(n.net_rtr, 0), 0) AS pct_rtr_paid,
  -- AL: return on cost basis = AI / Y
  COALESCE(COALESCE(r.total_net_received, 0) / NULLIF(n.cost_basis, 0), 0) AS return_on_cost_basis,
  -- AR: bad debt adjustment = IF(default, AJ, "")
  CASE WHEN n.is_default THEN n.net_rtr - COALESCE(r.total_net_received, 0) ELSE 0 END AS bad_debt_rtr,
  -- AT: default $ lost = IF(default, AI - Y, "")
  CASE WHEN n.is_default THEN COALESCE(r.total_net_received, 0) - n.cost_basis END AS default_dollars_lost
FROM net n
LEFT JOIN received r ON r.deal_id = n.id;
