-- Allow authenticated users to update lookup tables
CREATE POLICY "Authenticated users can update industries"
  ON industries FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update portfolios"
  ON portfolios FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update funders"
  ON funders FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);
