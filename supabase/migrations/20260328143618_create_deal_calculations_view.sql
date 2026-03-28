-- Computed view for deal calculations
-- Replaces Excel columns 18-47 (all formula-driven derived fields)

CREATE OR REPLACE VIEW deal_calculations AS
SELECT
  d.*,
  -- R&H Participation Amount (col 18)
  d.total_funded_amount * d.buy_rate AS rh_participation_amount,
  -- R&H Cost Basis (col 25)
  (d.total_funded_amount * d.buy_rate) - COALESCE(d.commission_amount * d.buy_rate, 0) AS rh_cost_basis,
  -- R&H Pro-Rata RTR (col 26)
  d.total_rtr * d.buy_rate AS rh_pro_rata_rtr,
  -- Total Net RTR Payment Received (col 34)
  COALESCE(nrtr.total_received, 0) AS total_net_rtr_received,
  -- R&H Net RTR Balance (col 35)
  (d.total_rtr * d.buy_rate) - COALESCE(nrtr.total_received, 0) AS rh_net_rtr_balance,
  -- Total Paid % of RTR (col 36)
  CASE WHEN d.total_rtr * d.buy_rate > 0
    THEN COALESCE(nrtr.total_received, 0) / (d.total_rtr * d.buy_rate)
    ELSE 0
  END AS total_paid_pct
FROM deals d
LEFT JOIN (
  SELECT deal_id, SUM(net_rtr_amount) AS total_received
  FROM net_rtr_payments GROUP BY deal_id
) nrtr ON nrtr.deal_id = d.id;
