-- Phase 1: analytics views encoding the portfolio workbook's formulas.
--
-- Column letters in comments refer to the funder deal sheets (e.g. BHB),
-- the per-funder '-P' rollup sheets, and the 'ALDER Portfolio' sheet of
-- Alder_Portfolio_Updated_2026-06-30.xlsx, whose formulas were dumped and
-- transcribed verbatim on 2026-07-09.
--
-- All views are security_invoker so the querying user's RLS (portfolio_access
-- scoping on deals / net_rtr_payments) applies.

-- ---------------------------------------------------------------------------
-- deal_computed: one row per deal — the derived columns K..AV of a funder
-- deal sheet.
-- ---------------------------------------------------------------------------
CREATE VIEW deal_computed
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
    -- K: sell rate = I + J
    d.buy_rate + d.commission AS sell_rate,
    -- M: commission $ = L * J
    d.total_amount_funded * d.commission AS commission_dollars,
    -- N: total RTR = L * K
    d.total_amount_funded * (d.buy_rate + d.commission) AS total_rtr,
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

-- ---------------------------------------------------------------------------
-- monthly_vintage_stats: the per-funder '-P' sheets — one row per
-- (portfolio, funder, vintage month).
-- ---------------------------------------------------------------------------
CREATE VIEW monthly_vintage_stats
WITH (security_invoker = true) AS
WITH agg AS (
  SELECT
    dc.portfolio_id,
    dc.funder_id,
    dc.vintage_month,
    COUNT(*)::integer AS deal_count,                                -- B
    SUM(dc.new_dollars_at_work) AS new_invested,                    -- C
    SUM(dc.rtr_dollars_at_work) AS rtr_invested,                    -- D
    SUM(dc.participation_on_amount) AS total_participation,         -- E
    SUM(dc.pro_rata_commission) AS total_commissions,               -- F
    SUM(dc.cost_basis) AS cost_basis,                               -- G
    SUM(dc.net_rtr) AS initial_net_rtr,                             -- H
    SUM(dc.total_net_received) AS rtr_received,                     -- L
    SUM(dc.net_rtr_balance) AS net_rtr_outstanding,                 -- Q
    SUM(dc.bad_debt_rtr) AS bad_debt_rtr,                           -- R
    SUM(dc.weekly_payment_expected) AS expected_weekly_payments,    -- T
    -- U: workbook sums AP (= per-deal term × share of vintage cost basis),
    -- i.e. the cost-basis-weighted average term
    SUM(dc.cost_basis * dc.term_months) / NULLIF(SUM(dc.cost_basis), 0) AS weighted_avg_term_months
  FROM deal_computed dc
  GROUP BY dc.portfolio_id, dc.funder_id, dc.vintage_month
),
factors AS (
  SELECT
    a.*,
    -- I: weighted avg factor = H / G
    COALESCE(a.initial_net_rtr / NULLIF(a.cost_basis, 0), 0) AS weighted_avg_factor,
    -- J: "principal" share = 1 / I
    COALESCE(a.cost_basis / NULLIF(a.initial_net_rtr, 0), 0) AS principal_pct
  FROM agg a
),
splits AS (
  SELECT
    f.*,
    -- K: "profit" share = 1 - J
    1 - f.principal_pct AS profit_pct,
    -- M: principal returned = L * J
    f.rtr_received * f.principal_pct AS principal_returned,
    -- N: profit returned = L * K
    f.rtr_received * (1 - f.principal_pct) AS profit_returned
  FROM factors f
)
SELECT
  s.portfolio_id,
  s.funder_id,
  s.vintage_month,
  s.deal_count,
  s.new_invested,
  s.rtr_invested,
  s.total_participation,
  s.total_commissions,
  s.cost_basis,
  s.initial_net_rtr,
  s.weighted_avg_factor,
  s.principal_pct,
  s.profit_pct,
  s.rtr_received,
  s.principal_returned,
  s.profit_returned,
  -- O: cost basis after principal received = G - M
  s.cost_basis - s.principal_returned AS cost_basis_after_principal,
  -- P: cost basis final = O - N
  s.cost_basis - s.principal_returned - s.profit_returned AS cost_basis_final,
  s.net_rtr_outstanding,
  s.bad_debt_rtr,
  -- S: outstanding after bad debt = Q - R
  s.net_rtr_outstanding - s.bad_debt_rtr AS net_rtr_outstanding_after_bad_debt,
  s.expected_weekly_payments,
  s.weighted_avg_term_months,
  -- V: average cost basis per deal = G / B
  COALESCE(s.cost_basis / NULLIF(s.deal_count, 0), 0) AS avg_cost_basis_per_deal,
  -- W: vintage return = (L / G) - 1 (sheet shows "-na-" when negative;
  -- consumers decide how to render negatives)
  COALESCE(s.rtr_received / NULLIF(s.cost_basis, 0) - 1, 0) AS vintage_return,
  -- X: bad debt % per vintage = R / H
  COALESCE(s.bad_debt_rtr / NULLIF(s.initial_net_rtr, 0), 0) AS bad_debt_pct,
  -- AA: points per month = (I - 1) / U * 100
  (s.weighted_avg_factor - 1) / NULLIF(s.weighted_avg_term_months, 0) * 100 AS points_per_month,
  -- AB: R&H profit share = N * AB$1
  s.profit_returned * p.profit_share_rate AS profit_share,
  -- AC: WRC net $ = L - AB
  s.rtr_received - s.profit_returned * p.profit_share_rate AS wrc_net,
  -- AD: WRC net vintage return = (AC / G) - 1
  COALESCE(
    (s.rtr_received - s.profit_returned * p.profit_share_rate) / NULLIF(s.cost_basis, 0) - 1,
    0
  ) AS wrc_net_vintage_return
FROM splits s
JOIN portfolios p ON p.id = s.portfolio_id;

-- ---------------------------------------------------------------------------
-- portfolio_monthly: the 'ALDER Portfolio' sheet — the '-P' rollups summed
-- across funders per vintage month. Non-linear ratios (factor, splits) are
-- recomputed from the portfolio-level sums, exactly as the sheet does
-- (I3 = H3/G3 over the summed columns).
-- ---------------------------------------------------------------------------
CREATE VIEW portfolio_monthly
WITH (security_invoker = true) AS
WITH agg AS (
  SELECT
    dc.portfolio_id,
    dc.vintage_month,
    COUNT(*)::integer AS deal_count,
    SUM(dc.new_dollars_at_work) AS new_invested,
    SUM(dc.rtr_dollars_at_work) AS rtr_invested,
    SUM(dc.participation_on_amount) AS total_participation,
    SUM(dc.pro_rata_commission) AS total_commissions,
    SUM(dc.cost_basis) AS cost_basis,
    SUM(dc.net_rtr) AS initial_net_rtr,
    SUM(dc.total_net_received) AS rtr_received,
    SUM(dc.net_rtr_balance) AS net_rtr_outstanding,
    SUM(dc.bad_debt_rtr) AS bad_debt_rtr,
    SUM(dc.weekly_payment_expected) AS expected_weekly_payments,
    -- Sheet U is AVERAGE() of the funder terms; weighting by cost basis is
    -- used here instead (an unweighted average over-counts small funders)
    SUM(dc.cost_basis * dc.term_months) / NULLIF(SUM(dc.cost_basis), 0) AS weighted_avg_term_months
  FROM deal_computed dc
  GROUP BY dc.portfolio_id, dc.vintage_month
),
factors AS (
  SELECT
    a.*,
    COALESCE(a.initial_net_rtr / NULLIF(a.cost_basis, 0), 0) AS weighted_avg_factor,
    COALESCE(a.cost_basis / NULLIF(a.initial_net_rtr, 0), 0) AS principal_pct
  FROM agg a
)
SELECT
  f.portfolio_id,
  f.vintage_month,
  f.deal_count,
  f.new_invested,
  f.rtr_invested,
  f.total_participation,
  f.total_commissions,
  f.cost_basis,
  f.initial_net_rtr,
  f.weighted_avg_factor,
  f.principal_pct,
  1 - f.principal_pct AS profit_pct,
  f.rtr_received,
  f.rtr_received * f.principal_pct AS principal_returned,
  f.rtr_received * (1 - f.principal_pct) AS profit_returned,
  f.cost_basis - f.rtr_received * f.principal_pct AS cost_basis_after_principal,
  f.cost_basis - f.rtr_received AS cost_basis_final,
  f.net_rtr_outstanding,
  f.bad_debt_rtr,
  f.net_rtr_outstanding - f.bad_debt_rtr AS net_rtr_outstanding_after_bad_debt,
  f.expected_weekly_payments,
  f.weighted_avg_term_months,
  COALESCE(f.cost_basis / NULLIF(f.deal_count, 0), 0) AS avg_cost_basis_per_deal,
  COALESCE(f.rtr_received / NULLIF(f.cost_basis, 0) - 1, 0) AS vintage_return,
  COALESCE(f.bad_debt_rtr / NULLIF(f.initial_net_rtr, 0), 0) AS bad_debt_pct,
  (f.weighted_avg_factor - 1) / NULLIF(f.weighted_avg_term_months, 0) * 100 AS points_per_month,
  f.rtr_received * (1 - f.principal_pct) * p.profit_share_rate AS profit_share,
  f.rtr_received - f.rtr_received * (1 - f.principal_pct) * p.profit_share_rate AS wrc_net,
  COALESCE(
    (f.rtr_received - f.rtr_received * (1 - f.principal_pct) * p.profit_share_rate)
      / NULLIF(f.cost_basis, 0) - 1,
    0
  ) AS wrc_net_vintage_return,
  p.profit_share_rate,
  p.dividend_rate
FROM factors f
JOIN portfolios p ON p.id = f.portfolio_id;

-- ---------------------------------------------------------------------------
-- weekly_rtr_matrix: the 'RTR' sheet — funder × payment-date totals in long
-- form (pivot to a matrix client-side). Historical rows are weekly-grained;
-- go-forward rows are monthly.
-- ---------------------------------------------------------------------------
CREATE VIEW weekly_rtr_matrix
WITH (security_invoker = true) AS
SELECT
  d.portfolio_id,
  d.funder_id,
  p.payment_date,
  SUM(p.gross) AS total_gross,
  SUM(p.fee) AS total_fee,
  SUM(p.net) AS total_net
FROM net_rtr_payments p
JOIN deals d ON d.id = p.deal_id
GROUP BY d.portfolio_id, d.funder_id, p.payment_date;

-- ---------------------------------------------------------------------------
-- funder_allocation_current: the 'R&H-ALDER-P' snapshot — current allocation
-- per funder. Current cost basis is the '-P' P-column total, which reduces to
-- cost_basis - rtr_received (P = G - M - N and M + N = L).
-- ---------------------------------------------------------------------------
CREATE VIEW funder_allocation_current
WITH (security_invoker = true) AS
WITH per_funder AS (
  SELECT
    dc.portfolio_id,
    dc.funder_id,
    SUM(dc.cost_basis) AS initial_cost_basis,
    SUM(dc.net_rtr) AS initial_net_rtr,
    SUM(dc.total_net_received) AS rtr_received,
    SUM(dc.cost_basis * dc.term_months) / NULLIF(SUM(dc.cost_basis), 0) AS weighted_avg_term_months
  FROM deal_computed dc
  GROUP BY dc.portfolio_id, dc.funder_id
),
calc AS (
  SELECT
    pf.*,
    COALESCE(pf.initial_net_rtr / NULLIF(pf.initial_cost_basis, 0), 0) AS factor,
    pf.initial_cost_basis - pf.rtr_received AS current_cost_basis
  FROM per_funder pf
)
SELECT
  c.portfolio_id,
  c.funder_id,
  c.initial_cost_basis,
  c.current_cost_basis,
  c.rtr_received,
  c.factor,
  c.weighted_avg_term_months,
  -- row 3: % of initial cost basis
  c.initial_cost_basis
    / NULLIF(SUM(c.initial_cost_basis) OVER (PARTITION BY c.portfolio_id), 0)
    AS pct_initial_cost_basis,
  -- row 5: % of current cost basis
  c.current_cost_basis
    / NULLIF(SUM(c.current_cost_basis) OVER (PARTITION BY c.portfolio_id), 0)
    AS pct_current_cost_basis,
  -- row 7: term × current allocation share
  c.weighted_avg_term_months
    * (c.current_cost_basis
       / NULLIF(SUM(c.current_cost_basis) OVER (PARTITION BY c.portfolio_id), 0))
    AS weighted_term_contribution
FROM calc c;
