-- Phase 3: one-time workbook import.
--
-- import_funder_sheet is the single write path from the parsed workbook
-- (Rust parse_portfolio_workbook command) into deals + net_rtr_payments,
-- one call per funder sheet. Like commit_funder_pivot it is SECURITY INVOKER
-- (caller's RLS applies) and refuses the transaction unless the payload's
-- payment total matches the parser's total within a cent.
--
-- Import identity: the workbooks contain duplicate *internal* advance ids
-- that are genuinely distinct deals (e.g. Alder BHB-264 covers both CRICKET
-- MOVES and UNCLOG NYC with different funder advance ids), and a handful of
-- rows with no funder advance id — so neither column alone is a key. The
-- composite (advance_id, funder_advance_id) was verified unique across every
-- sheet of both workbooks (2026-07-10), and becomes the re-import upsert key.

-- The real data has funded/participation amounts with cents (39 PayVa deals,
-- e.g. $1,346.16); integer columns would corrupt the cost-basis math. The
-- Phase 1 views depend on these columns, so they are dropped and recreated
-- verbatim around the ALTER (weekly_rtr_matrix doesn't reference them and
-- stays put).
DROP VIEW funder_allocation_current;
DROP VIEW portfolio_monthly;
DROP VIEW monthly_vintage_stats;
DROP VIEW deal_computed;

ALTER TABLE deals
  ALTER COLUMN total_amount_funded TYPE numeric,
  ALTER COLUMN participation_on_amount TYPE numeric;

-- Recreated from 20260710013534_phase1_analytics_views.sql, definitions
-- unchanged (the ::numeric casts on the widened columns are now no-ops).
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

-- Idempotent re-import keys. Partial on advance_id: the import skips rows
-- without one, and the monthly flow never inserts deals.
CREATE UNIQUE INDEX deals_import_key
  ON deals (portfolio_id, funder_id, advance_id, COALESCE(funder_advance_id, ''))
  WHERE advance_id IS NOT NULL;

-- merchants is empty live; one merchant row per (portfolio, funder, name).
CREATE UNIQUE INDEX merchants_import_key
  ON merchants (portfolio_id, funder_id, lower(name));

CREATE OR REPLACE FUNCTION import_funder_sheet(
  p_portfolio_id integer,
  p_funder_id integer,
  p_management_fee_rate numeric,
  p_deals jsonb,
  p_total_net_payments numeric
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_fee numeric;
  v_payload_net numeric;
  v_deals_in_payload integer;
  v_rows_skipped integer;
  v_net_skipped numeric;
  v_dupes_dropped integer;
  v_net_duped numeric;
  v_deals_imported integer;
  v_merchants_upserted integer;
  v_payments_deleted integer;
  v_payments_inserted integer;
  v_net_inserted numeric;
  v_unmatched_industries jsonb;
  v_unmatched_states jsonb;
  c_tolerance CONSTANT numeric := 0.01;
BEGIN
  IF NOT has_portfolio_access(p_portfolio_id) THEN
    RAISE EXCEPTION 'No access to portfolio %', p_portfolio_id;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM funders WHERE id = p_funder_id) THEN
    RAISE EXCEPTION 'Funder % not found', p_funder_id;
  END IF;
  IF p_deals IS NULL OR jsonb_typeof(p_deals) <> 'array' THEN
    RAISE EXCEPTION 'p_deals must be a JSON array of workbook deals';
  END IF;
  IF p_management_fee_rate IS NOT NULL
     AND (p_management_fee_rate < 0 OR p_management_fee_rate >= 1) THEN
    RAISE EXCEPTION 'Management fee rate % out of range [0, 1)', p_management_fee_rate;
  END IF;

  v_deals_in_payload := jsonb_array_length(p_deals);

  -- Record the sheet's B1 fee on the portfolio↔funder link (creating the
  -- link if the funder is new to this portfolio).
  INSERT INTO portfolio_funders (portfolio_id, funder_id, management_fee_rate)
  VALUES (p_portfolio_id, p_funder_id, p_management_fee_rate)
  ON CONFLICT (portfolio_id, funder_id) DO UPDATE
    SET management_fee_rate = COALESCE(EXCLUDED.management_fee_rate,
                                       portfolio_funders.management_fee_rate);

  SELECT COALESCE(p_management_fee_rate, management_fee_rate, 0) INTO v_fee
  FROM portfolio_funders
  WHERE portfolio_id = p_portfolio_id AND funder_id = p_funder_id;

  -- Guard 1: the payments as received must sum to the parser's total —
  -- catches truncation or corruption between the Rust parser and this call.
  SELECT COALESCE(SUM((p->>'net')::numeric), 0)
  INTO v_payload_net
  FROM jsonb_array_elements(p_deals) AS d
  CROSS JOIN LATERAL jsonb_array_elements(COALESCE(d->'payments', '[]'::jsonb)) AS p;

  IF abs(v_payload_net - p_total_net_payments) > c_tolerance THEN
    RAISE EXCEPTION
      'Payload payments sum to % but parser total is % (difference exceeds % tolerance)',
      v_payload_net, p_total_net_payments, c_tolerance;
  END IF;

  DROP TABLE IF EXISTS _import_rows;
  CREATE TEMP TABLE _import_rows ON COMMIT DROP AS
  SELECT
    t.ord,
    NULLIF(trim(t.d->>'advance_id'), '')        AS advance_id,
    NULLIF(trim(t.d->>'funder_advance_id'), '') AS funder_advance_id,
    NULLIF(trim(t.d->>'merchant_name'), '')     AS merchant_name,
    NULLIF(trim(t.d->>'website'), '')           AS website,
    NULLIF(trim(t.d->>'industry'), '')          AS industry,
    NULLIF(trim(t.d->>'state'), '')             AS state,
    (t.d->>'fico')::integer                     AS fico,
    (t.d->>'buy_rate')::numeric                 AS buy_rate,
    (t.d->>'commission_rate')::numeric          AS commission,
    (t.d->>'total_funded_amount')::numeric      AS total_amount_funded,
    (t.d->>'num_daily_payments')::integer       AS num_daily_payments,
    (t.d->>'num_weekly_payments')::integer      AS num_weekly_payments,
    (t.d->>'participation_amount')::numeric     AS participation_on_amount,
    COALESCE((t.d->>'new_dollars')::boolean, false) AS new_dollars,
    COALESCE((t.d->>'rtr')::boolean, false)         AS rtr,
    COALESCE((t.d->>'is_default')::boolean, false)  AS is_default,
    (t.d->>'date_funded')::timestamptz          AS date_funded,
    (t.d->>'date_closed')::timestamptz          AS date_closed,
    (t.d->>'default_date')::timestamptz         AS default_date,
    COALESCE(t.d->'payments', '[]'::jsonb)      AS payments
  FROM jsonb_array_elements(p_deals) WITH ORDINALITY AS t(d, ord);

  -- Rows the import cannot key (the Rust parser already skips these; belt
  -- and braces) — drop and account for their payments.
  SELECT count(*),
         COALESCE(SUM((SELECT COALESCE(SUM((p->>'net')::numeric), 0)
                       FROM jsonb_array_elements(r.payments) AS p)), 0)
  INTO v_rows_skipped, v_net_skipped
  FROM _import_rows r
  WHERE r.advance_id IS NULL OR r.merchant_name IS NULL;

  DELETE FROM _import_rows
  WHERE advance_id IS NULL OR merchant_name IS NULL;

  -- Defensive dedupe on the import key (verified unique in the real
  -- workbooks; keeps the first occurrence if that ever regresses).
  WITH dupes AS (
    DELETE FROM _import_rows a
    USING _import_rows b
    WHERE a.advance_id = b.advance_id
      AND COALESCE(a.funder_advance_id, '') = COALESCE(b.funder_advance_id, '')
      AND a.ord > b.ord
    RETURNING a.payments
  )
  SELECT count(*),
         COALESCE(SUM((SELECT COALESCE(SUM((p->>'net')::numeric), 0)
                       FROM jsonb_array_elements(d.payments) AS p)), 0)
  INTO v_dupes_dropped, v_net_duped
  FROM dupes d;

  -- Merchants: one row per name, industry/state resolved against the lookups
  -- (unmatched names import with NULL and are reported below).
  INSERT INTO merchants (name, website, industry_id, state_id, funder_id, portfolio_id)
  SELECT DISTINCT ON (lower(r.merchant_name))
         r.merchant_name, r.website, i.id, s.id, p_funder_id, p_portfolio_id
  FROM _import_rows r
  LEFT JOIN industries i ON lower(i.name) = lower(r.industry)
  LEFT JOIN states s ON upper(s.code) = upper(r.state) OR lower(s.name) = lower(r.state)
  ORDER BY lower(r.merchant_name), r.ord
  ON CONFLICT (portfolio_id, funder_id, lower(name)) DO UPDATE
    SET website = COALESCE(EXCLUDED.website, merchants.website),
        industry_id = COALESCE(EXCLUDED.industry_id, merchants.industry_id),
        state_id = COALESCE(EXCLUDED.state_id, merchants.state_id),
        updated_at = now();
  GET DIAGNOSTICS v_merchants_upserted = ROW_COUNT;

  INSERT INTO deals (
    portfolio_id, funder_id, merchant_id, advance_id, funder_advance_id,
    fico, buy_rate, commission, total_amount_funded,
    num_daily_payments, num_weekly_payments, participation_on_amount,
    new_dollars, rtr, is_default, date_funded, date_closed, default_date
  )
  SELECT
    p_portfolio_id, p_funder_id, m.id, r.advance_id, r.funder_advance_id,
    r.fico, r.buy_rate, r.commission, r.total_amount_funded,
    r.num_daily_payments, r.num_weekly_payments, r.participation_on_amount,
    r.new_dollars, r.rtr, r.is_default, r.date_funded, r.date_closed, r.default_date
  FROM _import_rows r
  LEFT JOIN merchants m
    ON m.portfolio_id = p_portfolio_id
   AND m.funder_id = p_funder_id
   AND lower(m.name) = lower(r.merchant_name)
  ON CONFLICT (portfolio_id, funder_id, advance_id, COALESCE(funder_advance_id, ''))
    WHERE advance_id IS NOT NULL
  DO UPDATE SET
    merchant_id = EXCLUDED.merchant_id,
    fico = EXCLUDED.fico,
    buy_rate = EXCLUDED.buy_rate,
    commission = EXCLUDED.commission,
    total_amount_funded = EXCLUDED.total_amount_funded,
    num_daily_payments = EXCLUDED.num_daily_payments,
    num_weekly_payments = EXCLUDED.num_weekly_payments,
    participation_on_amount = EXCLUDED.participation_on_amount,
    new_dollars = EXCLUDED.new_dollars,
    rtr = EXCLUDED.rtr,
    is_default = EXCLUDED.is_default,
    date_funded = EXCLUDED.date_funded,
    date_closed = EXCLUDED.date_closed,
    default_date = EXCLUDED.default_date,
    updated_at = now();
  GET DIAGNOSTICS v_deals_imported = ROW_COUNT;

  -- Payments: resolve each row's payment list to its deal. Grouped per
  -- (deal, date) in case two Net RTR columns ever parse to the same date.
  DROP TABLE IF EXISTS _import_payments;
  CREATE TEMP TABLE _import_payments ON COMMIT DROP AS
  SELECT d.id AS deal_id,
         (p->>'payment_date')::date AS payment_date,
         SUM((p->>'net')::numeric) AS net
  FROM _import_rows r
  JOIN deals d
    ON d.portfolio_id = p_portfolio_id
   AND d.funder_id = p_funder_id
   AND d.advance_id = r.advance_id
   AND COALESCE(d.funder_advance_id, '') = COALESCE(r.funder_advance_id, '')
  CROSS JOIN LATERAL jsonb_array_elements(r.payments) AS p
  GROUP BY d.id, (p->>'payment_date')::date;

  -- The workbook is the source of truth for history: replace all
  -- import-sourced payments for this portfolio+funder (source_upload_id is
  -- NULL only for imports; monthly-flow payments keep their upload id).
  WITH deleted AS (
    DELETE FROM net_rtr_payments np
    USING deals d
    WHERE np.deal_id = d.id
      AND d.portfolio_id = p_portfolio_id
      AND d.funder_id = p_funder_id
      AND np.source_upload_id IS NULL
    RETURNING np.id
  )
  SELECT count(*) INTO v_payments_deleted FROM deleted;

  -- Historical Net RTR is recorded net of the management fee; reconstruct
  -- gross/fee the same way the monthly parsers compute them (fee = gross ×
  -- rate), so imported and monthly rows are consistent in the RTR views.
  INSERT INTO net_rtr_payments (deal_id, payment_date, gross, fee, net, source_upload_id)
  SELECT
    ip.deal_id,
    ip.payment_date,
    round(ip.net / (1 - v_fee), 2),
    round(ip.net / (1 - v_fee), 2) - ip.net,
    ip.net,
    NULL
  FROM _import_payments ip
  ON CONFLICT (deal_id, payment_date) DO UPDATE
    SET gross = EXCLUDED.gross,
        fee = EXCLUDED.fee,
        net = EXCLUDED.net,
        source_upload_id = NULL;
  GET DIAGNOSTICS v_payments_inserted = ROW_COUNT;

  SELECT COALESCE(SUM(net), 0) INTO v_net_inserted FROM _import_payments;

  -- Guard 2: every dollar of the parser's payment total must be written or
  -- explicitly accounted for by a skipped/duplicate row.
  IF abs((v_net_inserted + v_net_skipped + v_net_duped) - p_total_net_payments) > c_tolerance THEN
    RAISE EXCEPTION
      'Import reconciliation failed: inserted % + skipped % + duplicate % != parser total % (tolerance %)',
      v_net_inserted, v_net_skipped, v_net_duped, p_total_net_payments, c_tolerance;
  END IF;

  SELECT COALESCE(jsonb_agg(DISTINCT r.industry), '[]'::jsonb)
  INTO v_unmatched_industries
  FROM _import_rows r
  WHERE r.industry IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM industries i WHERE lower(i.name) = lower(r.industry));

  SELECT COALESCE(jsonb_agg(DISTINCT r.state), '[]'::jsonb)
  INTO v_unmatched_states
  FROM _import_rows r
  WHERE r.state IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM states s
      WHERE upper(s.code) = upper(r.state) OR lower(s.name) = lower(r.state)
    );

  RETURN jsonb_build_object(
    'deals_in_payload', v_deals_in_payload,
    'deals_imported', v_deals_imported,
    'rows_skipped', v_rows_skipped,
    'duplicate_rows_dropped', v_dupes_dropped,
    'merchants_upserted', v_merchants_upserted,
    'payments_deleted', v_payments_deleted,
    'payments_inserted', v_payments_inserted,
    'payments_net_inserted', v_net_inserted,
    'payments_net_dropped', v_net_skipped + v_net_duped,
    'management_fee_rate', v_fee,
    'unmatched_industries', v_unmatched_industries,
    'unmatched_states', v_unmatched_states
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION import_funder_sheet(integer, integer, numeric, jsonb, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION import_funder_sheet(integer, integer, numeric, jsonb, numeric) TO authenticated;
