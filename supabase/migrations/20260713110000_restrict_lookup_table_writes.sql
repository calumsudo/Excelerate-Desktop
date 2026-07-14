-- Security: restrict writes to the funders and industries lookup tables.
--
-- These tables were created (20260331050000 / 20260331030000) with permissive
-- "any authenticated user can INSERT" policies, and add_update_policies
-- (20260331060000) added equally permissive UPDATE policies. Phase 1
-- (20260710013532) tightened the portfolio-scoped tables but deliberately left
-- the lookup tables open.
--
-- In practice the app only ever SELECTs funders/industries; both tables are
-- seeded through migrations (phase1_portfolio_funder_config /
-- phase1_seed_industries), which run as superuser and bypass RLS. So gating
-- runtime writes behind is_admin() closes the finding (React Doctor issue #28)
-- without affecting any app flow. SELECT stays open to all authenticated users.
--
-- (states, the third lookup table, already has no write policy at all — RLS
-- default-deny — so it needs no change.)

-- industries: replace permissive INSERT/UPDATE with admin-only
DROP POLICY "Authenticated users can insert industries" ON industries;
DROP POLICY "Authenticated users can update industries" ON industries;

CREATE POLICY "Admins can insert industries"
  ON industries FOR INSERT
  TO authenticated
  WITH CHECK (is_admin());

CREATE POLICY "Admins can update industries"
  ON industries FOR UPDATE
  TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());

-- funders: replace permissive INSERT/UPDATE with admin-only
DROP POLICY "Authenticated users can insert funders" ON funders;
DROP POLICY "Authenticated users can update funders" ON funders;

CREATE POLICY "Admins can insert funders"
  ON funders FOR INSERT
  TO authenticated
  WITH CHECK (is_admin());

CREATE POLICY "Admins can update funders"
  ON funders FOR UPDATE
  TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());
