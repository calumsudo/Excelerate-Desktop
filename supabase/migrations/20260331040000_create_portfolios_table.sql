-- Create portfolios lookup table
CREATE TABLE portfolios (
  id integer generated always as identity primary key,
  name text not null unique
);

-- Enable RLS
ALTER TABLE portfolios ENABLE ROW LEVEL SECURITY;

-- All authenticated users can view portfolios
CREATE POLICY "Authenticated users can view portfolios"
  ON portfolios FOR SELECT
  TO authenticated
  USING (true);

-- All authenticated users can insert portfolios
CREATE POLICY "Authenticated users can insert portfolios"
  ON portfolios FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Seed the two existing portfolios
INSERT INTO portfolios (name) VALUES ('Alder'), ('White Rabbit');
