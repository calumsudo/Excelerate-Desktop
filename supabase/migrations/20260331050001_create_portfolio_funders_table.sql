-- Join table for many-to-many relationship between portfolios and funders
CREATE TABLE portfolio_funders (
  portfolio_id integer not null references portfolios(id) on delete cascade,
  funder_id integer not null references funders(id) on delete cascade,
  primary key (portfolio_id, funder_id)
);

-- Enable RLS
ALTER TABLE portfolio_funders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view portfolio_funders"
  ON portfolio_funders FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert portfolio_funders"
  ON portfolio_funders FOR INSERT
  TO authenticated
  WITH CHECK (true);
