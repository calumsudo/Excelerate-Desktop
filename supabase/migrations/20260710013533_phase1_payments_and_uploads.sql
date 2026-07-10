-- Phase 1: payment + monthly-upload tables (cloud replacements for the
-- SQLite funder_uploads / funder_pivot_tables and the workbook's weekly
-- Net RTR payment matrix).

-- Monthly funder file uploads. The unique constraint is the DB-level version
-- of the ClearView re-upload idempotency fix: one upload per
-- (portfolio, funder, report_date, upload_type); re-uploads replace it.
CREATE TABLE funder_uploads (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  portfolio_id integer NOT NULL REFERENCES portfolios(id) ON DELETE CASCADE,
  funder_id integer NOT NULL REFERENCES funders(id) ON DELETE CASCADE,
  report_date date NOT NULL,
  upload_type text NOT NULL DEFAULT 'monthly' CHECK (upload_type IN ('monthly')),
  original_filename text NOT NULL,
  storage_path text,
  file_size bigint,
  uploaded_by uuid REFERENCES user_profiles(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now(),
  UNIQUE (portfolio_id, funder_id, report_date, upload_type)
);

CREATE INDEX idx_funder_uploads_portfolio_funder_date
  ON funder_uploads (portfolio_id, funder_id, report_date);

-- Parser output header: totals must reconcile against the sum of rows
-- (Phase 2 validation RPC enforces this on insert).
CREATE TABLE funder_pivot_tables (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  upload_id uuid NOT NULL UNIQUE REFERENCES funder_uploads(id) ON DELETE CASCADE,
  portfolio_id integer NOT NULL REFERENCES portfolios(id) ON DELETE CASCADE,
  funder_id integer NOT NULL REFERENCES funders(id) ON DELETE CASCADE,
  report_date date NOT NULL,
  total_gross numeric NOT NULL DEFAULT 0,
  total_fee numeric NOT NULL DEFAULT 0,
  total_net numeric NOT NULL DEFAULT 0,
  row_count integer NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

-- Parser output rows: (advance_id, merchant, gross, fee, net).
-- matched_deal_id records resolution from the unmatched-deals flow.
CREATE TABLE funder_pivot_rows (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  pivot_table_id uuid NOT NULL REFERENCES funder_pivot_tables(id) ON DELETE CASCADE,
  advance_id text,
  merchant_name text NOT NULL DEFAULT '',
  gross numeric NOT NULL DEFAULT 0,
  fee numeric NOT NULL DEFAULT 0,
  net numeric NOT NULL DEFAULT 0,
  matched_deal_id uuid REFERENCES deals(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX idx_funder_pivot_rows_pivot_table ON funder_pivot_rows (pivot_table_id);

-- Net RTR received per deal per date. Historical workbook data is
-- weekly-grained (one column per week-ending date); the go-forward flow is
-- monthly — a single payment_date column covers both cadences.
CREATE TABLE net_rtr_payments (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  deal_id uuid NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
  payment_date date NOT NULL,
  gross numeric NOT NULL DEFAULT 0,
  fee numeric NOT NULL DEFAULT 0,
  net numeric NOT NULL DEFAULT 0,
  source_upload_id uuid REFERENCES funder_uploads(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now(),
  UNIQUE (deal_id, payment_date)
);

CREATE INDEX idx_net_rtr_payments_payment_date ON net_rtr_payments (payment_date);

-- RLS: everything scoped through portfolio_access
ALTER TABLE funder_uploads ENABLE ROW LEVEL SECURITY;
ALTER TABLE funder_pivot_tables ENABLE ROW LEVEL SECURITY;
ALTER TABLE funder_pivot_rows ENABLE ROW LEVEL SECURITY;
ALTER TABLE net_rtr_payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users with access can manage funder_uploads"
  ON funder_uploads FOR ALL
  TO authenticated
  USING (has_portfolio_access(portfolio_id))
  WITH CHECK (has_portfolio_access(portfolio_id));

CREATE POLICY "Users with access can manage funder_pivot_tables"
  ON funder_pivot_tables FOR ALL
  TO authenticated
  USING (has_portfolio_access(portfolio_id))
  WITH CHECK (has_portfolio_access(portfolio_id));

-- funder_pivot_rows has no portfolio_id; scope through its pivot table.
-- funder_pivot_tables' own RLS applies inside the subquery, but its policy is
-- the same has_portfolio_access check, so the result is consistent.
CREATE POLICY "Users with access can manage funder_pivot_rows"
  ON funder_pivot_rows FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM funder_pivot_tables t
      WHERE t.id = pivot_table_id AND has_portfolio_access(t.portfolio_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM funder_pivot_tables t
      WHERE t.id = pivot_table_id AND has_portfolio_access(t.portfolio_id)
    )
  );

-- net_rtr_payments has no portfolio_id; scope through the deal.
CREATE POLICY "Users with access can manage net_rtr_payments"
  ON net_rtr_payments FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM deals d
      WHERE d.id = deal_id AND has_portfolio_access(d.portfolio_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM deals d
      WHERE d.id = deal_id AND has_portfolio_access(d.portfolio_id)
    )
  );
