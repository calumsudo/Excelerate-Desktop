-- Phase 2: private Storage bucket for raw monthly funder files.
--
-- Object paths follow {portfolio_id}/{funder_id}/{report_date}/{filename} so
-- the first path segment can drive per-portfolio access via
-- has_portfolio_access(), mirroring the funder_uploads table RLS.

INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('funder-uploads', 'funder-uploads', false, 16777216)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Portfolio access can read funder upload files"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'funder-uploads'
    AND has_portfolio_access(((storage.foldername(name))[1])::integer)
  );

CREATE POLICY "Portfolio access can write funder upload files"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'funder-uploads'
    AND has_portfolio_access(((storage.foldername(name))[1])::integer)
  );

CREATE POLICY "Portfolio access can update funder upload files"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'funder-uploads'
    AND has_portfolio_access(((storage.foldername(name))[1])::integer)
  )
  WITH CHECK (
    bucket_id = 'funder-uploads'
    AND has_portfolio_access(((storage.foldername(name))[1])::integer)
  );

CREATE POLICY "Portfolio access can delete funder upload files"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'funder-uploads'
    AND has_portfolio_access(((storage.foldername(name))[1])::integer)
  );
