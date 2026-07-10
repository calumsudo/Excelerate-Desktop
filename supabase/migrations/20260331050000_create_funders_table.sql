-- Create funders table
CREATE TABLE funders (
  id integer generated always as identity primary key,
  name text not null unique,
  code text unique
);

-- Enable RLS
ALTER TABLE funders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view funders"
  ON funders FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert funders"
  ON funders FOR INSERT
  TO authenticated
  WITH CHECK (true);
