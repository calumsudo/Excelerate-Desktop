-- Create the industries lookup table
-- Maps the Industries sheet from the workbook

CREATE TABLE industries (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  category TEXT
);

-- Enable RLS
ALTER TABLE industries ENABLE ROW LEVEL SECURITY;

-- Industries are a shared lookup table - all authenticated users can read
CREATE POLICY "Authenticated users can view industries"
  ON industries FOR SELECT
  TO authenticated
  USING (true);
