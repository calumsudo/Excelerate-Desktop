-- Create merchants table
CREATE TABLE merchants (
  id uuid default gen_random_uuid() primary key,
  name text not null,
  industry_id integer references industries(id),
  state_id integer references states(id),
  website text,
  funder_id integer references funders(id),
  portfolio_id integer references portfolios(id),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Enable RLS
ALTER TABLE merchants ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view merchants"
  ON merchants FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert merchants"
  ON merchants FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update merchants"
  ON merchants FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);
