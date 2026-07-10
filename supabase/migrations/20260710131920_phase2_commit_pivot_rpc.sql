-- Phase 2: transactional pivot commit + reconciliation.
--
-- commit_funder_pivot is the single write path from parser output to the
-- database. It replaces the pivot snapshot for an upload, matches rows to
-- deals, and (unless dry-run) writes net_rtr_payments — refusing the whole
-- transaction unless matched + unmatched + duplicate row totals equal the
-- parser's total_net within a cent. That is the guarantee that what lands in
-- the database equals what would have been typed into the workbook's Net RTR
-- column.
--
-- SECURITY INVOKER: every read/write inside runs under the caller's RLS, so
-- portfolio access is enforced by the existing policies, not re-implemented.

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

-- Resolve one unmatched pivot row to a deal (driven by the unmatched-deals
-- modal). Recomputes the deal's payment for that report date from all rows in
-- the same pivot now matched to it, so repeated calls are idempotent.
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

REVOKE EXECUTE ON FUNCTION commit_funder_pivot(uuid, jsonb, numeric, numeric, numeric, boolean) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION resolve_pivot_row(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION commit_funder_pivot(uuid, jsonb, numeric, numeric, numeric, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION resolve_pivot_row(uuid, uuid) TO authenticated;
