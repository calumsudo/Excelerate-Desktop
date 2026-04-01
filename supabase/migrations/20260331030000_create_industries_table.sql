-- Drop existing table if it exists
DROP TABLE IF EXISTS industries;

-- Create industries lookup table
CREATE TABLE industries (
  id integer generated always as identity primary key,
  name text not null unique
);

-- Enable RLS
ALTER TABLE industries ENABLE ROW LEVEL SECURITY;

-- All authenticated users can view industries
CREATE POLICY "Authenticated users can view industries"
  ON industries FOR SELECT
  TO authenticated
  USING (true);

-- All authenticated users can insert industries
CREATE POLICY "Authenticated users can insert industries"
  ON industries FOR INSERT
  TO authenticated
  WITH CHECK (true);
