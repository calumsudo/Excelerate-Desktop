-- Phase 5: per-deal payment rows with portfolio/funder scope.
--
-- The workbook export rebuilds each funder sheet's "Net RTR M/D/YY" payment
-- matrix, which needs every payment keyed by deal — weekly_rtr_matrix only
-- exposes funder-level sums. security_invoker so net_rtr_payments/deals RLS
-- (portfolio_access scoping) applies to the querying user.

CREATE VIEW deal_payments
WITH (security_invoker = true) AS
SELECT
  d.portfolio_id,
  d.funder_id,
  p.deal_id,
  p.payment_date,
  p.gross,
  p.fee,
  p.net
FROM net_rtr_payments p
JOIN deals d ON d.id = p.deal_id;
