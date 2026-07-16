-- Local development seed (applied by `supabase db reset` / first `supabase start`
-- AFTER migrations; never runs against the linked remote project).
--
-- The migrations already seed all reference data (portfolios, funders +
-- portfolio_funders fees, states, industries). What a fresh local stack lacks
-- is a user: this creates a confirmed dev login and grants it admin access to
-- both portfolios, mirroring the live setup.
--
--   email:    dev@excelerate.local
--   password: excelerate-dev
--
-- It also backfills the 5 funders that were created via the dashboard on the
-- live project BEFORE the migration baseline existed — they are data, not
-- schema, so `db pull` never captured them and the Phase 1 migration's
-- UPDATE/JOIN seeding silently skips them on a fresh local stack.

INSERT INTO public.funders (name, code, sheet_name) VALUES
  ('BHB',        'BHB',  'BHB'),
  ('Clear View', 'CV',   'CV'),
  ('BIG',        'BIG',  'BIG'),
  ('eFin',       'EFin', 'EFin'),
  ('In Advance', 'InAd', 'InAd')
ON CONFLICT (name) WHERE NOT is_deleted DO UPDATE SET sheet_name = EXCLUDED.sheet_name;

-- Re-run the Phase 1 portfolio↔funder fee seeding now that all 11 funders
-- exist (same values as 20260710013530_phase1_portfolio_funder_config.sql).
INSERT INTO public.portfolio_funders (portfolio_id, funder_id, management_fee_rate)
SELECT p.id, f.id, v.fee
FROM (VALUES
  ('Alder', 'BHB',     0.03),
  ('Alder', 'BIG',     0.04),
  ('Alder', 'CV',      0.03),
  ('Alder', 'EFin',    0.03),
  ('Alder', 'InAd',    0.035),
  ('Alder', 'PayVa',   0.05),
  ('Alder', 'R''bull', 0.03),
  ('Alder', 'ACS',     0.03),
  ('Alder', 'Boom',    0.04),
  ('Alder', 'Kings',   0.03),
  ('Alder', 'VSPR',    0.03),
  ('White Rabbit', 'BHB',   0.03),
  ('White Rabbit', 'BIG',   0.03),
  ('White Rabbit', 'CV',    0.03),
  ('White Rabbit', 'EFin',  0.03),
  ('White Rabbit', 'ACS',   0.03),
  ('White Rabbit', 'Boom',  0.04),
  ('White Rabbit', 'Kings', 0.03)
) AS v(portfolio_name, sheet_name, fee)
JOIN public.portfolios p ON p.name = v.portfolio_name
JOIN public.funders f ON f.sheet_name = v.sheet_name
ON CONFLICT (portfolio_id, funder_id) DO UPDATE
  SET management_fee_rate = EXCLUDED.management_fee_rate;

DO $$
DECLARE
  -- Fixed id so `db reset` doesn't invalidate a signed-in app session:
  -- local JWTs survive resets (fixed dev secret), and a JWT whose sub no
  -- longer exists makes RLS hide everything ("Portfolio not found").
  v_user_id uuid := 'de00de00-0000-4000-8000-de00de00de00';
BEGIN
  -- GoTrue reads these columns directly; the token columns must be empty
  -- strings (not NULL) or its Go scanner errors on login.
  INSERT INTO auth.users (
    instance_id, id, aud, role, email,
    encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data,
    confirmation_token, recovery_token,
    email_change, email_change_token_new, email_change_token_current,
    phone_change, phone_change_token, reauthentication_token,
    created_at, updated_at
  ) VALUES (
    '00000000-0000-0000-0000-000000000000', v_user_id, 'authenticated', 'authenticated',
    'dev@excelerate.local',
    crypt('excelerate-dev', gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}', '{"full_name":"Local Dev"}',
    '', '', '', '', '', '', '', '',
    now(), now()
  );

  INSERT INTO auth.identities (
    provider_id, user_id, identity_data, provider,
    last_sign_in_at, created_at, updated_at
  ) VALUES (
    v_user_id::text, v_user_id,
    jsonb_build_object('sub', v_user_id::text, 'email', 'dev@excelerate.local',
                       'email_verified', true),
    'email', now(), now(), now()
  );

  -- handle_new_user created the profile as 'member'; promote to admin and
  -- grant both portfolios, like the live admin user.
  UPDATE public.user_profiles SET role = 'admin' WHERE id = v_user_id;

  INSERT INTO public.portfolio_access (user_id, portfolio_id)
  SELECT v_user_id, p.id FROM public.portfolios p
  ON CONFLICT DO NOTHING;
END;
$$;
