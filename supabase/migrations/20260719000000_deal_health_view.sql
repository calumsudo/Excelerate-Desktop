-- deal_health: proactive at-risk flags for open deals ("Needs Attention").
--
-- A deal's expected collection pace is linear over its term; comparing the
-- fraction of net RTR collected against the fraction of term elapsed flags
-- deals that are quietly going bad long before they are marked default.
--
-- Statuses (checked in severity order, first match wins):
--   * past_term (3) — term fully elapsed with net RTR still outstanding
--   * stale     (2) — no payment recorded in STALE_DAYS+ days (measured from
--                     date_funded when the deal has never paid)
--   * slipping  (1) — at least SLIPPING_MIN_ELAPSED through the term but the
--                     collected fraction is below SLIPPING_PACE × the elapsed
--                     fraction (e.g. 60% through term, under 30% collected)
--   * on_track  (0)
--
-- Thresholds are constants for now (candidates for per-portfolio settings):
--   STALE_DAYS = 60, SLIPPING_MIN_ELAPSED = 0.25, SLIPPING_PACE = 0.5,
--   BALANCE_EPSILON = $1 (deals with no meaningful balance are on_track).
--
-- Scope: open, non-defaulted deals only — closed deals need no attention and
-- defaulted deals are already flagged (bad debt). Building on deal_computed
-- inherits its soft-delete filter; security_invoker keeps RLS on the reader.
CREATE VIEW deal_health
WITH (security_invoker = true) AS
WITH last_pay AS (
  SELECT deal_id, MAX(payment_date) AS last_payment_date
  FROM net_rtr_payments
  GROUP BY deal_id
),
base AS (
  SELECT
    dc.id,
    dc.portfolio_id,
    dc.funder_id,
    dc.merchant_id,
    dc.advance_id,
    dc.funder_advance_id,
    dc.date_funded,
    dc.term_months,
    dc.net_rtr,
    dc.total_net_received,
    dc.net_rtr_balance,
    dc.pct_rtr_paid,
    lp.last_payment_date,
    -- date_funded is timestamptz; cast so date - date yields integer days
    (CURRENT_DATE - COALESCE(lp.last_payment_date, dc.date_funded::date))
      AS days_since_last_payment,
    -- calendar days → the sheet's fractional months
    (CURRENT_DATE - dc.date_funded::date) / 30.44 AS months_elapsed
  FROM deal_computed dc
  LEFT JOIN last_pay lp ON lp.deal_id = dc.id
  WHERE dc.date_closed IS NULL AND NOT dc.is_default
),
pace AS (
  SELECT
    b.*,
    -- capped at 1: past the term end the question is only "is it paid off"
    LEAST(b.months_elapsed / NULLIF(b.term_months, 0), 1) AS pct_term_elapsed,
    -- 1.0 = exactly on schedule, below 1 = behind, above 1 = ahead
    b.pct_rtr_paid
      / NULLIF(LEAST(b.months_elapsed / NULLIF(b.term_months, 0), 1), 0)
      AS pace_ratio
  FROM base b
),
flagged AS (
  SELECT
    p.*,
    CASE
      WHEN COALESCE(p.net_rtr_balance, 0) <= 1 THEN 'on_track'
      WHEN p.pct_term_elapsed >= 1 THEN 'past_term'
      WHEN p.days_since_last_payment >= 60 THEN 'stale'
      WHEN p.pct_term_elapsed >= 0.25 AND p.pace_ratio < 0.5 THEN 'slipping'
      ELSE 'on_track'
    END AS health_status
  FROM pace p
)
SELECT
  f.*,
  CASE f.health_status
    WHEN 'past_term' THEN 3
    WHEN 'stale' THEN 2
    WHEN 'slipping' THEN 1
    ELSE 0
  END AS severity
FROM flagged f;
