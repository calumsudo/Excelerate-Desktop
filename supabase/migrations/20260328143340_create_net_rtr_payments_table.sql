-- Create the net_rtr_payments table: normalized time-series for Net RTR date columns (48+)
-- Replaces the unbounded "Net RTR {date}" columns with one row per deal per date

CREATE TABLE net_rtr_payments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  deal_id UUID NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
  report_date DATE NOT NULL,
  net_rtr_amount DECIMAL(15,2) NOT NULL,
  gross_amount DECIMAL(15,2),
  management_fee DECIMAL(15,2),
  created_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(deal_id, report_date)
);

-- Indexes for common queries
CREATE INDEX idx_nrtr_deal_date ON net_rtr_payments(deal_id, report_date);
CREATE INDEX idx_nrtr_date ON net_rtr_payments(report_date);

-- Enable RLS
ALTER TABLE net_rtr_payments ENABLE ROW LEVEL SECURITY;

-- RLS policies: access controlled through the parent deals table
CREATE POLICY "Users can view net_rtr_payments for their deals"
  ON net_rtr_payments FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM deals WHERE deals.id = net_rtr_payments.deal_id AND deals.user_id = auth.uid()
  ));

CREATE POLICY "Users can insert net_rtr_payments for their deals"
  ON net_rtr_payments FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM deals WHERE deals.id = net_rtr_payments.deal_id AND deals.user_id = auth.uid()
  ));

CREATE POLICY "Users can update net_rtr_payments for their deals"
  ON net_rtr_payments FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM deals WHERE deals.id = net_rtr_payments.deal_id AND deals.user_id = auth.uid()
  ));

CREATE POLICY "Users can delete net_rtr_payments for their deals"
  ON net_rtr_payments FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM deals WHERE deals.id = net_rtr_payments.deal_id AND deals.user_id = auth.uid()
  ));
