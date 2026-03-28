-- Create the deals table: comprehensive replacement for merchants table
-- Maps funder deal sheet columns 1-17 (source data) + 42-44 (status fields)

CREATE TABLE deals (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  portfolio_name TEXT NOT NULL,
  funder_code TEXT NOT NULL,

  -- Identity (cols 1-8)
  date_funded DATE,
  merchant_name TEXT NOT NULL,
  website TEXT,
  advance_id TEXT,
  funder_advance_id TEXT,
  industry_code TEXT,
  state TEXT,
  fico TEXT,

  -- Financial terms (cols 9-17)
  buy_rate DECIMAL(8,4),
  commission_rate DECIMAL(8,4),
  sell_rate DECIMAL(8,4),
  total_funded_amount DECIMAL(15,2),
  commission_amount DECIMAL(15,2),
  total_rtr DECIMAL(15,2),
  num_daily_payments INTEGER,
  num_weekly_payments INTEGER,
  term_months DECIMAL(6,2),

  -- Status (cols 42-44)
  is_default BOOLEAN DEFAULT FALSE,
  bad_debt_adjustment DECIMAL(15,2) DEFAULT 0,
  default_date DATE,

  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  user_id UUID REFERENCES auth.users(id) NOT NULL,

  UNIQUE(portfolio_name, funder_code, advance_id)
);

-- Enable RLS
ALTER TABLE deals ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Users can view deals they created"
  ON deals FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own deals"
  ON deals FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own deals"
  ON deals FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own deals"
  ON deals FOR DELETE
  USING (auth.uid() = user_id);

-- Indexes for common queries
CREATE INDEX idx_deals_portfolio ON deals(portfolio_name);
CREATE INDEX idx_deals_funder ON deals(funder_code);
CREATE INDEX idx_deals_portfolio_funder ON deals(portfolio_name, funder_code);
CREATE INDEX idx_deals_user ON deals(user_id);
