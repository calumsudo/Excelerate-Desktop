-- Soft-delete protection ("recycle bin") for the master-data tables.
--
-- Nothing the app manages directly is ever hard-deleted anymore:
--   * industries, states, funders, portfolios, merchants, deals get
--     is_deleted + deleted_at; deleting from the app just flips the flag.
--   * The client DELETE policies on deals/merchants are dropped, so a hard
--     delete cannot be issued through the API at all (lookup tables and
--     portfolios never had one).
--   * Soft-deleted rows stay SELECTable (that is the Recently Deleted page)
--     but are excluded from the analytics views and from pivot-row matching.
--   * purge_soft_deleted() hard-deletes rows that have been soft-deleted for
--     30+ days, skipping any row something still references; a daily pg_cron
--     job runs it.
--
-- Derived data (net_rtr_payments, funder_pivot_tables/rows, funder_uploads)
-- deliberately keeps hard deletes: those rows are rebuilt from uploads and
-- the monthly flow's replace-on-re-upload depends on real deletes.

-- ---------------------------------------------------------------------------
-- 1. Columns + deleted_at sync trigger
-- ---------------------------------------------------------------------------

ALTER TABLE industries ADD COLUMN is_deleted boolean NOT NULL DEFAULT false,
                       ADD COLUMN deleted_at timestamptz;
ALTER TABLE states     ADD COLUMN is_deleted boolean NOT NULL DEFAULT false,
                       ADD COLUMN deleted_at timestamptz;
ALTER TABLE funders    ADD COLUMN is_deleted boolean NOT NULL DEFAULT false,
                       ADD COLUMN deleted_at timestamptz;
ALTER TABLE portfolios ADD COLUMN is_deleted boolean NOT NULL DEFAULT false,
                       ADD COLUMN deleted_at timestamptz;
ALTER TABLE merchants  ADD COLUMN is_deleted boolean NOT NULL DEFAULT false,
                       ADD COLUMN deleted_at timestamptz;
ALTER TABLE deals      ADD COLUMN is_deleted boolean NOT NULL DEFAULT false,
                       ADD COLUMN deleted_at timestamptz;

-- deleted_at is derived from is_deleted so the 30-day purge clock can't be
-- forgotten or forged by a client: it is stamped when the flag flips on and
-- cleared when a row is restored.
CREATE OR REPLACE FUNCTION sync_soft_delete_timestamp()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.is_deleted THEN
    IF TG_OP = 'INSERT' OR NOT OLD.is_deleted OR NEW.deleted_at IS NULL THEN
      NEW.deleted_at := now();
    END IF;
  ELSE
    NEW.deleted_at := NULL;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER sync_soft_delete BEFORE INSERT OR UPDATE ON industries
  FOR EACH ROW EXECUTE FUNCTION sync_soft_delete_timestamp();
CREATE TRIGGER sync_soft_delete BEFORE INSERT OR UPDATE ON states
  FOR EACH ROW EXECUTE FUNCTION sync_soft_delete_timestamp();
CREATE TRIGGER sync_soft_delete BEFORE INSERT OR UPDATE ON funders
  FOR EACH ROW EXECUTE FUNCTION sync_soft_delete_timestamp();
CREATE TRIGGER sync_soft_delete BEFORE INSERT OR UPDATE ON portfolios
  FOR EACH ROW EXECUTE FUNCTION sync_soft_delete_timestamp();
CREATE TRIGGER sync_soft_delete BEFORE INSERT OR UPDATE ON merchants
  FOR EACH ROW EXECUTE FUNCTION sync_soft_delete_timestamp();
CREATE TRIGGER sync_soft_delete BEFORE INSERT OR UPDATE ON deals
  FOR EACH ROW EXECUTE FUNCTION sync_soft_delete_timestamp();

-- ---------------------------------------------------------------------------
-- 2. Unique names only need to be unique among live rows, so a deleted
--    industry/state/funder doesn't block re-creating the same name.
--    (deals_import_key / merchants_import_key stay full-table on purpose:
--    import_funder_sheet's ON CONFLICT upserts must hit soft-deleted rows —
--    and resurrect them, see section 6 — rather than insert hidden twins.)
-- ---------------------------------------------------------------------------

ALTER TABLE industries DROP CONSTRAINT industries_name_key;
CREATE UNIQUE INDEX industries_name_active_key ON industries (name) WHERE NOT is_deleted;

ALTER TABLE states DROP CONSTRAINT states_code_key;
ALTER TABLE states DROP CONSTRAINT states_name_key;
CREATE UNIQUE INDEX states_code_active_key ON states (code) WHERE NOT is_deleted;
CREATE UNIQUE INDEX states_name_active_key ON states (name) WHERE NOT is_deleted;

ALTER TABLE funders DROP CONSTRAINT funders_name_key;
ALTER TABLE funders DROP CONSTRAINT funders_code_key;
ALTER TABLE funders DROP CONSTRAINT funders_sheet_name_key;
CREATE UNIQUE INDEX funders_name_active_key ON funders (name) WHERE NOT is_deleted;
CREATE UNIQUE INDEX funders_code_active_key ON funders (code) WHERE NOT is_deleted;
CREATE UNIQUE INDEX funders_sheet_name_active_key ON funders (sheet_name) WHERE NOT is_deleted;

ALTER TABLE portfolios DROP CONSTRAINT portfolios_name_key;
CREATE UNIQUE INDEX portfolios_name_active_key ON portfolios (name) WHERE NOT is_deleted;

-- ---------------------------------------------------------------------------
-- 3. RLS: no client may hard-delete. Soft delete/restore is just UPDATE, so
--    the existing UPDATE policies (admin for lookups/portfolios, portfolio
--    access for merchants/deals) already gate it. states had no write
--    policies at all — give admins the same insert/update rights as on the
--    other lookups so the Database page can manage it.
-- ---------------------------------------------------------------------------

DROP POLICY "Users with access can delete deals" ON deals;
DROP POLICY "Users with access can delete merchants" ON merchants;

CREATE POLICY "Admins can insert states"
  ON states FOR INSERT
  TO authenticated
  WITH CHECK (is_admin());

CREATE POLICY "Admins can update states"
  ON states FOR UPDATE
  TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());

-- ---------------------------------------------------------------------------
-- 4. Views: exclude soft-deleted deals. monthly_vintage_stats,
--    portfolio_monthly and funder_allocation_current all read from
--    deal_computed, so filtering its base CTE covers them; weekly_rtr_matrix
--    and deal_payments join deals directly and get their own filter.
--    (Definition otherwise identical to 20260710195109.)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE VIEW deal_computed
WITH (security_invoker = true) AS
WITH base AS (
  SELECT
    d.id,
    d.portfolio_id,
    d.funder_id,
    d.merchant_id,
    d.advance_id,
    d.funder_advance_id,
    d.fico,
    d.date_funded,
    d.date_closed,
    d.is_default,
    d.new_dollars,
    d.rtr,
    d.buy_rate,
    d.commission,
    (date_trunc('month', d.date_funded))::date AS vintage_month,
    d.total_amount_funded::numeric AS total_amount_funded,
    d.participation_on_amount::numeric AS participation_on_amount,
    COALESCE(pf.management_fee_rate, 0) AS management_fee_rate,
    -- K: sell rate = I + J. Excel treats blank cells as 0 here (R'bull rows
    -- have a buy rate but no commission; PayVa rows have neither) — COALESCE
    -- to match, otherwise NULL propagates into total RTR and the factor.
    COALESCE(d.buy_rate, 0) + COALESCE(d.commission, 0) AS sell_rate,
    -- M: commission $ = L * J
    d.total_amount_funded * COALESCE(d.commission, 0) AS commission_dollars,
    -- N: total RTR = L * K
    d.total_amount_funded * (COALESCE(d.buy_rate, 0) + COALESCE(d.commission, 0)) AS total_rtr,
    -- Q: term (months) = IF(ISBLANK(O), P/4.3, O/20)
    CASE WHEN d.num_daily_payments IS NULL
         THEN d.num_weekly_payments / 4.3
         ELSE d.num_daily_payments / 20.0
    END AS term_months,
    d.num_daily_payments IS NOT NULL AS is_daily,
    COALESCE(d.num_daily_payments, d.num_weekly_payments)::numeric AS num_payments
  FROM deals d
  LEFT JOIN portfolio_funders pf
    ON pf.portfolio_id = d.portfolio_id AND pf.funder_id = d.funder_id
  WHERE NOT d.is_deleted
),
rh AS (
  SELECT
    b.*,
    -- W: R&H % of deal = R / L
    COALESCE(b.participation_on_amount / NULLIF(b.total_amount_funded, 0), 0) AS rh_pct_of_deal
  FROM base b
),
cost AS (
  SELECT
    r.*,
    -- X: pro-rata commission paid = M * W
    COALESCE(r.commission_dollars * r.rh_pct_of_deal, 0) AS pro_rata_commission,
    -- Z: R&H pro-rata RTR = N * W
    COALESCE(r.total_rtr * r.rh_pct_of_deal, 0) AS rh_rtr
  FROM rh r
),
net AS (
  SELECT
    c.*,
    -- Y: R&H cost basis = R + X
    COALESCE(c.participation_on_amount + c.pro_rata_commission, 0) AS cost_basis,
    -- AA: net RTR (fee-adjusted) = Z - Z * B$1
    c.rh_rtr * (1 - c.management_fee_rate) AS net_rtr,
    -- AD: gross payment expected = Z / (O or P)
    c.rh_rtr / NULLIF(c.num_payments, 0) AS gross_payment_expected
  FROM cost c
),
received AS (
  SELECT
    deal_id,
    SUM(net) AS total_net_received,
    SUM(gross) AS total_gross_received,
    SUM(fee) AS total_fee_paid
  FROM net_rtr_payments
  GROUP BY deal_id
)
SELECT
  n.id,
  n.portfolio_id,
  n.funder_id,
  n.merchant_id,
  n.advance_id,
  n.funder_advance_id,
  n.fico,
  n.date_funded,
  n.date_closed,
  n.is_default,
  n.new_dollars,
  n.rtr,
  n.vintage_month,
  n.buy_rate,
  n.commission,
  n.sell_rate,
  n.total_amount_funded,
  n.participation_on_amount,
  n.management_fee_rate,
  n.commission_dollars,
  n.total_rtr,
  n.term_months,
  n.is_daily,
  n.rh_pct_of_deal,
  n.pro_rata_commission,
  n.rh_rtr,
  n.cost_basis,
  n.net_rtr,
  -- U / V: cost basis at work, split by funding source flag
  CASE WHEN n.new_dollars THEN n.cost_basis ELSE 0 END AS new_dollars_at_work,
  CASE WHEN n.rtr THEN n.cost_basis ELSE 0 END AS rtr_dollars_at_work,
  -- AB: "all in" factor = AA / Y
  n.net_rtr / NULLIF(n.cost_basis, 0) AS all_in_factor,
  -- AC: points per month = ((AB - 1) / Q) * 100
  (n.net_rtr / NULLIF(n.cost_basis, 0) - 1) / NULLIF(n.term_months, 0) * 100 AS points_per_month,
  n.gross_payment_expected,
  -- AF: net payment expected = AD - AD * fee
  n.gross_payment_expected * (1 - n.management_fee_rate) AS net_payment_expected,
  -- AG: weekly payment expected = IF(ISBLANK(O), AF, AF*5); blank once closed
  CASE WHEN n.date_closed IS NULL
       THEN n.gross_payment_expected * (1 - n.management_fee_rate)
            * CASE WHEN n.is_daily THEN 5 ELSE 1 END
       ELSE 0
  END AS weekly_payment_expected,
  -- AI: total net RTR received = SUM(payment matrix)
  COALESCE(r.total_net_received, 0) AS total_net_received,
  COALESCE(r.total_gross_received, 0) AS total_gross_received,
  COALESCE(r.total_fee_paid, 0) AS total_fee_paid,
  -- AJ: net RTR balance = AA - AI
  n.net_rtr - COALESCE(r.total_net_received, 0) AS net_rtr_balance,
  -- AK: % of RTR paid = AI / AA
  COALESCE(COALESCE(r.total_net_received, 0) / NULLIF(n.net_rtr, 0), 0) AS pct_rtr_paid,
  -- AL: return on cost basis = AI / Y
  COALESCE(COALESCE(r.total_net_received, 0) / NULLIF(n.cost_basis, 0), 0) AS return_on_cost_basis,
  -- AR: bad debt adjustment = IF(default, AJ, "")
  CASE WHEN n.is_default THEN n.net_rtr - COALESCE(r.total_net_received, 0) ELSE 0 END AS bad_debt_rtr,
  -- AT: default $ lost = IF(default, AI - Y, "")
  CASE WHEN n.is_default THEN COALESCE(r.total_net_received, 0) - n.cost_basis END AS default_dollars_lost
FROM net n
LEFT JOIN received r ON r.deal_id = n.id;

CREATE OR REPLACE VIEW weekly_rtr_matrix
WITH (security_invoker = true) AS
SELECT
  d.portfolio_id,
  d.funder_id,
  p.payment_date,
  SUM(p.gross) AS total_gross,
  SUM(p.fee) AS total_fee,
  SUM(p.net) AS total_net
FROM net_rtr_payments p
JOIN deals d ON d.id = p.deal_id
WHERE NOT d.is_deleted
GROUP BY d.portfolio_id, d.funder_id, p.payment_date;

CREATE OR REPLACE VIEW deal_payments
WITH (security_invoker = true) AS
SELECT
  d.portfolio_id,
  d.funder_id,
  p.deal_id,
  p.payment_date,
  p.gross,
  p.fee,
  p.net
FROM net_rtr_payments p
JOIN deals d ON d.id = p.deal_id
WHERE NOT d.is_deleted;

-- ---------------------------------------------------------------------------
-- 5. Write-path RPCs: pivot matching must not resolve rows to soft-deleted
--    deals (their dollars land in the unmatched bucket instead, keeping the
--    guard-2 reconciliation intact). Re-emitted from 20260710131920 with
--    "AND NOT d.is_deleted" on the three deal lookups; resolve_pivot_row
--    additionally refuses a deleted target deal.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION commit_funder_pivot(
  p_upload_id uuid,
  p_rows jsonb,
  p_total_gross numeric,
  p_total_fee numeric,
  p_total_net numeric,
  p_dry_run boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_upload funder_uploads%ROWTYPE;
  v_pivot_id uuid;
  v_rows_net numeric;
  v_matched_count integer;
  v_matched_net numeric;
  v_unmatched jsonb;
  v_unmatched_count integer;
  v_unmatched_net numeric;
  v_duplicates jsonb;
  v_duplicate_count integer;
  v_duplicate_net numeric;
  c_tolerance CONSTANT numeric := 0.01;
BEGIN
  SELECT * INTO v_upload FROM funder_uploads WHERE id = p_upload_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Upload % not found or not accessible', p_upload_id;
  END IF;

  IF p_rows IS NULL OR jsonb_typeof(p_rows) <> 'array' THEN
    RAISE EXCEPTION 'p_rows must be a JSON array of pivot rows';
  END IF;

  -- Guard 1: the rows as received must sum to the parser's totals — catches
  -- truncation or corruption between the Rust parser and this call.
  SELECT COALESCE(SUM((r->>'net')::numeric), 0) INTO v_rows_net
  FROM jsonb_array_elements(p_rows) AS r;

  IF abs(v_rows_net - p_total_net) > c_tolerance THEN
    RAISE EXCEPTION
      'Pivot rows sum to % but parser total_net is % (difference exceeds % tolerance)',
      v_rows_net, p_total_net, c_tolerance;
  END IF;

  -- Replace the pivot snapshot for this upload (re-uploads are idempotent;
  -- ON DELETE CASCADE clears the old rows).
  DELETE FROM funder_pivot_tables WHERE upload_id = p_upload_id;

  INSERT INTO funder_pivot_tables
    (upload_id, portfolio_id, funder_id, report_date,
     total_gross, total_fee, total_net, row_count)
  VALUES
    (p_upload_id, v_upload.portfolio_id, v_upload.funder_id, v_upload.report_date,
     p_total_gross, p_total_fee, p_total_net, jsonb_array_length(p_rows))
  RETURNING id INTO v_pivot_id;

  INSERT INTO funder_pivot_rows (pivot_table_id, advance_id, merchant_name, gross, fee, net)
  SELECT
    v_pivot_id,
    NULLIF(trim(r->>'advance_id'), ''),
    COALESCE(r->>'merchant_name', ''),
    COALESCE((r->>'gross')::numeric, 0),
    COALESCE((r->>'fee')::numeric, 0),
    COALESCE((r->>'net')::numeric, 0)
  FROM jsonb_array_elements(p_rows) AS r;

  -- Match rows to deals on the funder's advance id, scoped to this
  -- portfolio + funder. Rows whose advance id hits more than one deal (e.g.
  -- an original deal plus an add-on) are flagged as duplicates and left
  -- unresolved — same behaviour as the workbook updater.
  UPDATE funder_pivot_rows pr
  SET matched_deal_id = m.deal_id
  FROM (
    SELECT pr2.id AS row_id, min(d.id::text)::uuid AS deal_id
    FROM funder_pivot_rows pr2
    JOIN deals d
      ON d.portfolio_id = v_upload.portfolio_id
     AND d.funder_id = v_upload.funder_id
     AND d.funder_advance_id = pr2.advance_id
     AND NOT d.is_deleted
    WHERE pr2.pivot_table_id = v_pivot_id
    GROUP BY pr2.id
    HAVING count(*) = 1
  ) m
  WHERE pr.id = m.row_id;

  SELECT count(*), COALESCE(SUM(net), 0)
  INTO v_matched_count, v_matched_net
  FROM funder_pivot_rows
  WHERE pivot_table_id = v_pivot_id AND matched_deal_id IS NOT NULL;

  -- Duplicate-match rows: advance id present on more than one deal
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'row_id', pr.id,
           'advance_id', pr.advance_id,
           'merchant_name', pr.merchant_name,
           'gross', pr.gross, 'fee', pr.fee, 'net', pr.net,
           'match_count', dm.match_count
         ) ORDER BY pr.merchant_name), '[]'::jsonb),
         count(*), COALESCE(SUM(pr.net), 0)
  INTO v_duplicates, v_duplicate_count, v_duplicate_net
  FROM funder_pivot_rows pr
  JOIN LATERAL (
    SELECT count(*) AS match_count
    FROM deals d
    WHERE d.portfolio_id = v_upload.portfolio_id
      AND d.funder_id = v_upload.funder_id
      AND d.funder_advance_id = pr.advance_id
      AND NOT d.is_deleted
  ) dm ON dm.match_count > 1
  WHERE pr.pivot_table_id = v_pivot_id AND pr.matched_deal_id IS NULL;

  -- Unmatched rows: no deal at all
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'row_id', pr.id,
           'advance_id', pr.advance_id,
           'merchant_name', pr.merchant_name,
           'gross', pr.gross, 'fee', pr.fee, 'net', pr.net
         ) ORDER BY pr.merchant_name), '[]'::jsonb),
         count(*), COALESCE(SUM(pr.net), 0)
  INTO v_unmatched, v_unmatched_count, v_unmatched_net
  FROM funder_pivot_rows pr
  WHERE pr.pivot_table_id = v_pivot_id
    AND pr.matched_deal_id IS NULL
    AND NOT EXISTS (
      SELECT 1 FROM deals d
      WHERE d.portfolio_id = v_upload.portfolio_id
        AND d.funder_id = v_upload.funder_id
        AND d.funder_advance_id = pr.advance_id
        AND NOT d.is_deleted
    );

  -- Guard 2 (the core requirement): every dollar of the parser's total must
  -- be accounted for as matched, unmatched, or duplicate-flagged.
  IF abs((v_matched_net + v_unmatched_net + v_duplicate_net) - p_total_net) > c_tolerance THEN
    RAISE EXCEPTION
      'Reconciliation failed: matched % + unmatched % + duplicate % != total_net % (tolerance %)',
      v_matched_net, v_unmatched_net, v_duplicate_net, p_total_net, c_tolerance;
  END IF;

  IF NOT p_dry_run THEN
    -- Replace payments previously written by this upload, then write the
    -- current matched set. Aggregated per deal in case a pivot ever carries
    -- two rows for the same advance id.
    DELETE FROM net_rtr_payments WHERE source_upload_id = p_upload_id;

    INSERT INTO net_rtr_payments (deal_id, payment_date, gross, fee, net, source_upload_id)
    SELECT matched_deal_id, v_upload.report_date,
           SUM(gross), SUM(fee), SUM(net), p_upload_id
    FROM funder_pivot_rows
    WHERE pivot_table_id = v_pivot_id AND matched_deal_id IS NOT NULL
    GROUP BY matched_deal_id
    ON CONFLICT (deal_id, payment_date) DO UPDATE
      SET gross = EXCLUDED.gross,
          fee = EXCLUDED.fee,
          net = EXCLUDED.net,
          source_upload_id = EXCLUDED.source_upload_id;
  END IF;

  RETURN jsonb_build_object(
    'committed', NOT p_dry_run,
    'pivot_table_id', v_pivot_id,
    'report_date', v_upload.report_date,
    'total_net', p_total_net,
    'matched_count', v_matched_count,
    'matched_net', v_matched_net,
    'unmatched_count', v_unmatched_count,
    'unmatched_net', v_unmatched_net,
    'duplicate_count', v_duplicate_count,
    'duplicate_net', v_duplicate_net,
    'unmatched', v_unmatched,
    'duplicates', v_duplicates
  );
END;
$$;

CREATE OR REPLACE FUNCTION resolve_pivot_row(
  p_row_id uuid,
  p_deal_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_row funder_pivot_rows%ROWTYPE;
  v_pivot funder_pivot_tables%ROWTYPE;
  v_deal deals%ROWTYPE;
BEGIN
  SELECT * INTO v_row FROM funder_pivot_rows WHERE id = p_row_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pivot row % not found or not accessible', p_row_id;
  END IF;

  SELECT * INTO v_pivot FROM funder_pivot_tables WHERE id = v_row.pivot_table_id;

  SELECT * INTO v_deal FROM deals WHERE id = p_deal_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Deal % not found or not accessible', p_deal_id;
  END IF;

  IF v_deal.is_deleted THEN
    RAISE EXCEPTION 'Deal % is in Recently Deleted — restore it before matching payments to it', p_deal_id;
  END IF;

  IF v_deal.portfolio_id IS DISTINCT FROM v_pivot.portfolio_id
     OR v_deal.funder_id IS DISTINCT FROM v_pivot.funder_id THEN
    RAISE EXCEPTION
      'Deal % belongs to a different portfolio/funder than the pivot row', p_deal_id;
  END IF;

  UPDATE funder_pivot_rows SET matched_deal_id = p_deal_id WHERE id = p_row_id;

  INSERT INTO net_rtr_payments (deal_id, payment_date, gross, fee, net, source_upload_id)
  SELECT p_deal_id, v_pivot.report_date,
         SUM(gross), SUM(fee), SUM(net), v_pivot.upload_id
  FROM funder_pivot_rows
  WHERE pivot_table_id = v_row.pivot_table_id AND matched_deal_id = p_deal_id
  ON CONFLICT (deal_id, payment_date) DO UPDATE
    SET gross = EXCLUDED.gross,
        fee = EXCLUDED.fee,
        net = EXCLUDED.net,
        source_upload_id = EXCLUDED.source_upload_id;

  RETURN jsonb_build_object(
    'row_id', p_row_id,
    'deal_id', p_deal_id,
    'payment_date', v_pivot.report_date
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- 6. import_funder_sheet: re-emitted from 20260710135856 with three changes —
--    a deleted funder can't be imported into, lookups resolve against live
--    rows only, and upserting onto a soft-deleted merchant/deal resurrects it
--    (a re-import explicitly declares the sheet's rows current; without this
--    the ON CONFLICT update would modify a row that stays hidden).
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION import_funder_sheet(
  p_portfolio_id integer,
  p_funder_id integer,
  p_management_fee_rate numeric,
  p_deals jsonb,
  p_total_net_payments numeric
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_fee numeric;
  v_payload_net numeric;
  v_deals_in_payload integer;
  v_rows_skipped integer;
  v_net_skipped numeric;
  v_dupes_dropped integer;
  v_net_duped numeric;
  v_deals_imported integer;
  v_merchants_upserted integer;
  v_payments_deleted integer;
  v_payments_inserted integer;
  v_net_inserted numeric;
  v_unmatched_industries jsonb;
  v_unmatched_states jsonb;
  c_tolerance CONSTANT numeric := 0.01;
BEGIN
  IF NOT has_portfolio_access(p_portfolio_id) THEN
    RAISE EXCEPTION 'No access to portfolio %', p_portfolio_id;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM funders WHERE id = p_funder_id AND NOT is_deleted) THEN
    RAISE EXCEPTION 'Funder % not found', p_funder_id;
  END IF;
  IF p_deals IS NULL OR jsonb_typeof(p_deals) <> 'array' THEN
    RAISE EXCEPTION 'p_deals must be a JSON array of workbook deals';
  END IF;
  IF p_management_fee_rate IS NOT NULL
     AND (p_management_fee_rate < 0 OR p_management_fee_rate >= 1) THEN
    RAISE EXCEPTION 'Management fee rate % out of range [0, 1)', p_management_fee_rate;
  END IF;

  v_deals_in_payload := jsonb_array_length(p_deals);

  -- Record the sheet's B1 fee on the portfolio↔funder link (creating the
  -- link if the funder is new to this portfolio).
  INSERT INTO portfolio_funders (portfolio_id, funder_id, management_fee_rate)
  VALUES (p_portfolio_id, p_funder_id, p_management_fee_rate)
  ON CONFLICT (portfolio_id, funder_id) DO UPDATE
    SET management_fee_rate = COALESCE(EXCLUDED.management_fee_rate,
                                       portfolio_funders.management_fee_rate);

  SELECT COALESCE(p_management_fee_rate, management_fee_rate, 0) INTO v_fee
  FROM portfolio_funders
  WHERE portfolio_id = p_portfolio_id AND funder_id = p_funder_id;

  -- Guard 1: the payments as received must sum to the parser's total —
  -- catches truncation or corruption between the Rust parser and this call.
  SELECT COALESCE(SUM((p->>'net')::numeric), 0)
  INTO v_payload_net
  FROM jsonb_array_elements(p_deals) AS d
  CROSS JOIN LATERAL jsonb_array_elements(COALESCE(d->'payments', '[]'::jsonb)) AS p;

  IF abs(v_payload_net - p_total_net_payments) > c_tolerance THEN
    RAISE EXCEPTION
      'Payload payments sum to % but parser total is % (difference exceeds % tolerance)',
      v_payload_net, p_total_net_payments, c_tolerance;
  END IF;

  DROP TABLE IF EXISTS _import_rows;
  CREATE TEMP TABLE _import_rows ON COMMIT DROP AS
  SELECT
    t.ord,
    NULLIF(trim(t.d->>'advance_id'), '')        AS advance_id,
    NULLIF(trim(t.d->>'funder_advance_id'), '') AS funder_advance_id,
    NULLIF(trim(t.d->>'merchant_name'), '')     AS merchant_name,
    NULLIF(trim(t.d->>'website'), '')           AS website,
    NULLIF(trim(t.d->>'industry'), '')          AS industry,
    NULLIF(trim(t.d->>'state'), '')             AS state,
    (t.d->>'fico')::integer                     AS fico,
    (t.d->>'buy_rate')::numeric                 AS buy_rate,
    (t.d->>'commission_rate')::numeric          AS commission,
    (t.d->>'total_funded_amount')::numeric      AS total_amount_funded,
    (t.d->>'num_daily_payments')::integer       AS num_daily_payments,
    (t.d->>'num_weekly_payments')::integer      AS num_weekly_payments,
    (t.d->>'participation_amount')::numeric     AS participation_on_amount,
    COALESCE((t.d->>'new_dollars')::boolean, false) AS new_dollars,
    COALESCE((t.d->>'rtr')::boolean, false)         AS rtr,
    COALESCE((t.d->>'is_default')::boolean, false)  AS is_default,
    (t.d->>'date_funded')::timestamptz          AS date_funded,
    (t.d->>'date_closed')::timestamptz          AS date_closed,
    (t.d->>'default_date')::timestamptz         AS default_date,
    COALESCE(t.d->'payments', '[]'::jsonb)      AS payments
  FROM jsonb_array_elements(p_deals) WITH ORDINALITY AS t(d, ord);

  -- Rows the import cannot key (the Rust parser already skips these; belt
  -- and braces) — drop and account for their payments.
  SELECT count(*),
         COALESCE(SUM((SELECT COALESCE(SUM((p->>'net')::numeric), 0)
                       FROM jsonb_array_elements(r.payments) AS p)), 0)
  INTO v_rows_skipped, v_net_skipped
  FROM _import_rows r
  WHERE r.advance_id IS NULL OR r.merchant_name IS NULL;

  DELETE FROM _import_rows
  WHERE advance_id IS NULL OR merchant_name IS NULL;

  -- Defensive dedupe on the import key (verified unique in the real
  -- workbooks; keeps the first occurrence if that ever regresses).
  WITH dupes AS (
    DELETE FROM _import_rows a
    USING _import_rows b
    WHERE a.advance_id = b.advance_id
      AND COALESCE(a.funder_advance_id, '') = COALESCE(b.funder_advance_id, '')
      AND a.ord > b.ord
    RETURNING a.payments
  )
  SELECT count(*),
         COALESCE(SUM((SELECT COALESCE(SUM((p->>'net')::numeric), 0)
                       FROM jsonb_array_elements(d.payments) AS p)), 0)
  INTO v_dupes_dropped, v_net_duped
  FROM dupes d;

  -- Merchants: one row per name, industry/state resolved against the live
  -- lookups (unmatched names import with NULL and are reported below).
  INSERT INTO merchants (name, website, industry_id, state_id, funder_id, portfolio_id)
  SELECT DISTINCT ON (lower(r.merchant_name))
         r.merchant_name, r.website, i.id, s.id, p_funder_id, p_portfolio_id
  FROM _import_rows r
  LEFT JOIN industries i ON lower(i.name) = lower(r.industry) AND NOT i.is_deleted
  LEFT JOIN states s
    ON (upper(s.code) = upper(r.state) OR lower(s.name) = lower(r.state))
   AND NOT s.is_deleted
  ORDER BY lower(r.merchant_name), r.ord
  ON CONFLICT (portfolio_id, funder_id, lower(name)) DO UPDATE
    SET website = COALESCE(EXCLUDED.website, merchants.website),
        industry_id = COALESCE(EXCLUDED.industry_id, merchants.industry_id),
        state_id = COALESCE(EXCLUDED.state_id, merchants.state_id),
        is_deleted = false,
        updated_at = now();
  GET DIAGNOSTICS v_merchants_upserted = ROW_COUNT;

  INSERT INTO deals (
    portfolio_id, funder_id, merchant_id, advance_id, funder_advance_id,
    fico, buy_rate, commission, total_amount_funded,
    num_daily_payments, num_weekly_payments, participation_on_amount,
    new_dollars, rtr, is_default, date_funded, date_closed, default_date
  )
  SELECT
    p_portfolio_id, p_funder_id, m.id, r.advance_id, r.funder_advance_id,
    r.fico, r.buy_rate, r.commission, r.total_amount_funded,
    r.num_daily_payments, r.num_weekly_payments, r.participation_on_amount,
    r.new_dollars, r.rtr, r.is_default, r.date_funded, r.date_closed, r.default_date
  FROM _import_rows r
  LEFT JOIN merchants m
    ON m.portfolio_id = p_portfolio_id
   AND m.funder_id = p_funder_id
   AND lower(m.name) = lower(r.merchant_name)
  ON CONFLICT (portfolio_id, funder_id, advance_id, COALESCE(funder_advance_id, ''))
    WHERE advance_id IS NOT NULL
  DO UPDATE SET
    merchant_id = EXCLUDED.merchant_id,
    fico = EXCLUDED.fico,
    buy_rate = EXCLUDED.buy_rate,
    commission = EXCLUDED.commission,
    total_amount_funded = EXCLUDED.total_amount_funded,
    num_daily_payments = EXCLUDED.num_daily_payments,
    num_weekly_payments = EXCLUDED.num_weekly_payments,
    participation_on_amount = EXCLUDED.participation_on_amount,
    new_dollars = EXCLUDED.new_dollars,
    rtr = EXCLUDED.rtr,
    is_default = EXCLUDED.is_default,
    date_funded = EXCLUDED.date_funded,
    date_closed = EXCLUDED.date_closed,
    default_date = EXCLUDED.default_date,
    is_deleted = false,
    updated_at = now();
  GET DIAGNOSTICS v_deals_imported = ROW_COUNT;

  -- Payments: resolve each row's payment list to its deal. Grouped per
  -- (deal, date) in case two Net RTR columns ever parse to the same date.
  DROP TABLE IF EXISTS _import_payments;
  CREATE TEMP TABLE _import_payments ON COMMIT DROP AS
  SELECT d.id AS deal_id,
         (p->>'payment_date')::date AS payment_date,
         SUM((p->>'net')::numeric) AS net
  FROM _import_rows r
  JOIN deals d
    ON d.portfolio_id = p_portfolio_id
   AND d.funder_id = p_funder_id
   AND d.advance_id = r.advance_id
   AND COALESCE(d.funder_advance_id, '') = COALESCE(r.funder_advance_id, '')
  CROSS JOIN LATERAL jsonb_array_elements(r.payments) AS p
  GROUP BY d.id, (p->>'payment_date')::date;

  -- The workbook is the source of truth for history: replace all
  -- import-sourced payments for this portfolio+funder (source_upload_id is
  -- NULL only for imports; monthly-flow payments keep their upload id).
  WITH deleted AS (
    DELETE FROM net_rtr_payments np
    USING deals d
    WHERE np.deal_id = d.id
      AND d.portfolio_id = p_portfolio_id
      AND d.funder_id = p_funder_id
      AND np.source_upload_id IS NULL
    RETURNING np.id
  )
  SELECT count(*) INTO v_payments_deleted FROM deleted;

  -- Historical Net RTR is recorded net of the management fee; reconstruct
  -- gross/fee the same way the monthly parsers compute them (fee = gross ×
  -- rate), so imported and monthly rows are consistent in the RTR views.
  INSERT INTO net_rtr_payments (deal_id, payment_date, gross, fee, net, source_upload_id)
  SELECT
    ip.deal_id,
    ip.payment_date,
    round(ip.net / (1 - v_fee), 2),
    round(ip.net / (1 - v_fee), 2) - ip.net,
    ip.net,
    NULL
  FROM _import_payments ip
  ON CONFLICT (deal_id, payment_date) DO UPDATE
    SET gross = EXCLUDED.gross,
        fee = EXCLUDED.fee,
        net = EXCLUDED.net,
        source_upload_id = NULL;
  GET DIAGNOSTICS v_payments_inserted = ROW_COUNT;

  SELECT COALESCE(SUM(net), 0) INTO v_net_inserted FROM _import_payments;

  -- Guard 2: every dollar of the parser's payment total must be written or
  -- explicitly accounted for by a skipped/duplicate row.
  IF abs((v_net_inserted + v_net_skipped + v_net_duped) - p_total_net_payments) > c_tolerance THEN
    RAISE EXCEPTION
      'Import reconciliation failed: inserted % + skipped % + duplicate % != parser total % (tolerance %)',
      v_net_inserted, v_net_skipped, v_net_duped, p_total_net_payments, c_tolerance;
  END IF;

  SELECT COALESCE(jsonb_agg(DISTINCT r.industry), '[]'::jsonb)
  INTO v_unmatched_industries
  FROM _import_rows r
  WHERE r.industry IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM industries i
      WHERE lower(i.name) = lower(r.industry) AND NOT i.is_deleted
    );

  SELECT COALESCE(jsonb_agg(DISTINCT r.state), '[]'::jsonb)
  INTO v_unmatched_states
  FROM _import_rows r
  WHERE r.state IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM states s
      WHERE (upper(s.code) = upper(r.state) OR lower(s.name) = lower(r.state))
        AND NOT s.is_deleted
    );

  RETURN jsonb_build_object(
    'deals_in_payload', v_deals_in_payload,
    'deals_imported', v_deals_imported,
    'rows_skipped', v_rows_skipped,
    'duplicate_rows_dropped', v_dupes_dropped,
    'merchants_upserted', v_merchants_upserted,
    'payments_deleted', v_payments_deleted,
    'payments_inserted', v_payments_inserted,
    'payments_net_inserted', v_net_inserted,
    'payments_net_dropped', v_net_skipped + v_net_duped,
    'management_fee_rate', v_fee,
    'unmatched_industries', v_unmatched_industries,
    'unmatched_states', v_unmatched_states
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- 7. The 30-day purge. SECURITY DEFINER (runs as the migration role, past
--    RLS) and not executable by clients — only the cron job and a superuser
--    console can call it. Rows still referenced by anything are skipped and
--    retried on later runs (e.g. a deleted industry keeps waiting until no
--    merchant points at it). deals go first: purging one cascades its
--    net_rtr_payments and un-matches its pivot rows, which is the same
--    contract the old hard delete had.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION purge_soft_deleted(p_retention interval DEFAULT interval '30 days')
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cutoff timestamptz := now() - p_retention;
  v_deals integer;
  v_merchants integer;
  v_industries integer;
  v_states integer;
  v_funders integer;
  v_portfolios integer;
BEGIN
  DELETE FROM deals
  WHERE is_deleted AND deleted_at < v_cutoff;
  GET DIAGNOSTICS v_deals = ROW_COUNT;

  DELETE FROM merchants m
  WHERE m.is_deleted AND m.deleted_at < v_cutoff
    AND NOT EXISTS (SELECT 1 FROM deals d WHERE d.merchant_id = m.id);
  GET DIAGNOSTICS v_merchants = ROW_COUNT;

  DELETE FROM industries i
  WHERE i.is_deleted AND i.deleted_at < v_cutoff
    AND NOT EXISTS (SELECT 1 FROM merchants m WHERE m.industry_id = i.id);
  GET DIAGNOSTICS v_industries = ROW_COUNT;

  DELETE FROM states s
  WHERE s.is_deleted AND s.deleted_at < v_cutoff
    AND NOT EXISTS (SELECT 1 FROM merchants m WHERE m.state_id = s.id);
  GET DIAGNOSTICS v_states = ROW_COUNT;

  DELETE FROM funders f
  WHERE f.is_deleted AND f.deleted_at < v_cutoff
    AND NOT EXISTS (SELECT 1 FROM merchants m WHERE m.funder_id = f.id)
    AND NOT EXISTS (SELECT 1 FROM deals d WHERE d.funder_id = f.id)
    AND NOT EXISTS (SELECT 1 FROM funder_uploads u WHERE u.funder_id = f.id);
  GET DIAGNOSTICS v_funders = ROW_COUNT;

  DELETE FROM portfolios p
  WHERE p.is_deleted AND p.deleted_at < v_cutoff
    AND NOT EXISTS (SELECT 1 FROM merchants m WHERE m.portfolio_id = p.id)
    AND NOT EXISTS (SELECT 1 FROM deals d WHERE d.portfolio_id = p.id)
    AND NOT EXISTS (SELECT 1 FROM funder_uploads u WHERE u.portfolio_id = p.id);
  GET DIAGNOSTICS v_portfolios = ROW_COUNT;

  RETURN jsonb_build_object(
    'cutoff', v_cutoff,
    'deals', v_deals,
    'merchants', v_merchants,
    'industries', v_industries,
    'states', v_states,
    'funders', v_funders,
    'portfolios', v_portfolios
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION purge_soft_deleted(interval) FROM PUBLIC, anon, authenticated;

-- Daily purge at 08:00 UTC. Guarded so environments without pg_cron (or
-- without permission to create it) still apply the migration cleanly — the
-- purge is a hygiene job, not a correctness requirement.
DO $$
BEGIN
  CREATE EXTENSION IF NOT EXISTS pg_cron;
  PERFORM cron.schedule(
    'purge-soft-deleted-daily',
    '0 8 * * *',
    'SELECT public.purge_soft_deleted()'
  );
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'pg_cron unavailable, purge job not scheduled: %', SQLERRM;
END;
$$;
