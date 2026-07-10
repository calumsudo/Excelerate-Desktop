-- Phase 1: per-portfolio access control.
--
-- Replaces the permissive "any authenticated user can read/write everything"
-- policies on portfolio-scoped tables with grants driven by portfolio_access.
-- Lookup tables (funders, industries, states) stay readable/writable by any
-- authenticated user — they are not portfolio-scoped.

CREATE TABLE portfolio_access (
  user_id uuid NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  portfolio_id integer NOT NULL REFERENCES portfolios(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  PRIMARY KEY (user_id, portfolio_id)
);

ALTER TABLE portfolio_access ENABLE ROW LEVEL SECURITY;

-- SECURITY DEFINER so policies can consult these tables without recursing
-- into their own RLS.
CREATE OR REPLACE FUNCTION has_portfolio_access(p_portfolio_id integer)
RETURNS boolean
LANGUAGE sql SECURITY DEFINER STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM portfolio_access
    WHERE user_id = auth.uid() AND portfolio_id = p_portfolio_id
  );
$$;

CREATE OR REPLACE FUNCTION is_admin()
RETURNS boolean
LANGUAGE sql SECURITY DEFINER STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM user_profiles
    WHERE id = auth.uid() AND role = 'admin'
  );
$$;

CREATE POLICY "Users can view own portfolio access"
  ON portfolio_access FOR SELECT
  TO authenticated
  USING (user_id = auth.uid() OR is_admin());

CREATE POLICY "Admins manage portfolio access"
  ON portfolio_access FOR ALL
  TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());

-- Seed: every existing user keeps access to both portfolios (one admin user
-- exists today, so this changes nothing in practice).
INSERT INTO portfolio_access (user_id, portfolio_id)
SELECT up.id, p.id FROM user_profiles up CROSS JOIN portfolios p
ON CONFLICT DO NOTHING;

-- portfolios: visible only with access; only admins create/rename
DROP POLICY "Authenticated users can view portfolios" ON portfolios;
DROP POLICY "Authenticated users can insert portfolios" ON portfolios;
DROP POLICY "Authenticated users can update portfolios" ON portfolios;

CREATE POLICY "Users with access can view portfolios"
  ON portfolios FOR SELECT
  TO authenticated
  USING (has_portfolio_access(id) OR is_admin());

CREATE POLICY "Admins can insert portfolios"
  ON portfolios FOR INSERT
  TO authenticated
  WITH CHECK (is_admin());

CREATE POLICY "Admins can update portfolios"
  ON portfolios FOR UPDATE
  TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());

-- portfolio_funders: scoped to the portfolio
DROP POLICY "Authenticated users can view portfolio_funders" ON portfolio_funders;
DROP POLICY "Authenticated users can insert portfolio_funders" ON portfolio_funders;

CREATE POLICY "Users with access can view portfolio_funders"
  ON portfolio_funders FOR SELECT
  TO authenticated
  USING (has_portfolio_access(portfolio_id) OR is_admin());

CREATE POLICY "Admins can manage portfolio_funders"
  ON portfolio_funders FOR ALL
  TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());

-- deals: full CRUD scoped to portfolio access
DROP POLICY "Authenticated users can view deals" ON deals;
DROP POLICY "Authenticated users can insert deals" ON deals;
DROP POLICY "Authenticated users can update deals" ON deals;

CREATE POLICY "Users with access can view deals"
  ON deals FOR SELECT
  TO authenticated
  USING (has_portfolio_access(portfolio_id));

CREATE POLICY "Users with access can insert deals"
  ON deals FOR INSERT
  TO authenticated
  WITH CHECK (has_portfolio_access(portfolio_id));

CREATE POLICY "Users with access can update deals"
  ON deals FOR UPDATE
  TO authenticated
  USING (has_portfolio_access(portfolio_id))
  WITH CHECK (has_portfolio_access(portfolio_id));

CREATE POLICY "Users with access can delete deals"
  ON deals FOR DELETE
  TO authenticated
  USING (has_portfolio_access(portfolio_id));

-- merchants: same scoping
DROP POLICY "Authenticated users can view merchants" ON merchants;
DROP POLICY "Authenticated users can insert merchants" ON merchants;
DROP POLICY "Authenticated users can update merchants" ON merchants;

CREATE POLICY "Users with access can view merchants"
  ON merchants FOR SELECT
  TO authenticated
  USING (has_portfolio_access(portfolio_id));

CREATE POLICY "Users with access can insert merchants"
  ON merchants FOR INSERT
  TO authenticated
  WITH CHECK (has_portfolio_access(portfolio_id));

CREATE POLICY "Users with access can update merchants"
  ON merchants FOR UPDATE
  TO authenticated
  USING (has_portfolio_access(portfolio_id))
  WITH CHECK (has_portfolio_access(portfolio_id));

CREATE POLICY "Users with access can delete merchants"
  ON merchants FOR DELETE
  TO authenticated
  USING (has_portfolio_access(portfolio_id));
