-- Create deals table
CREATE TABLE deals (
  id uuid default gen_random_uuid() primary key,
  merchant_id uuid references merchants(id),
  portfolio_id integer references portfolios(id),
  funder_id integer references funders(id),
  advance_id text,
  funder_advance_id text,
  fico integer,
  buy_rate numeric,
  commission numeric,
  total_amount_funded integer,
  num_daily_payments integer,
  num_weekly_payments integer,
  deal_length_months numeric,
  participation_on_amount integer,
  new_dollars boolean default false,
  rtr boolean default false,
  is_default boolean default false,
  date_funded timestamptz,
  default_date timestamptz,
  default_notes jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Enable RLS
ALTER TABLE deals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view deals"
  ON deals FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert deals"
  ON deals FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update deals"
  ON deals FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);
