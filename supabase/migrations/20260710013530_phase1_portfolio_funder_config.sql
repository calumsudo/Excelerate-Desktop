-- Phase 1: funder/portfolio configuration columns + seeds.
--
-- management_fee_rate lives on portfolio_funders, NOT funders: the workbooks
-- show the same funder charging different portfolios differently (BIG!B1 is
-- 0.04 in the Alder workbook but 0.03 in White Rabbit). funders.sheet_name is
-- the stable workbook-sheet key (WR's BHB/EFin sheets carry different A1
-- display labels, but the sheet names match across both workbooks).

-- funders: workbook sheet mapping
ALTER TABLE funders ADD COLUMN sheet_name text UNIQUE;

UPDATE funders SET sheet_name = 'BHB'  WHERE name = 'BHB';
UPDATE funders SET sheet_name = 'CV'   WHERE name = 'Clear View';
UPDATE funders SET sheet_name = 'BIG'  WHERE name = 'BIG';
UPDATE funders SET sheet_name = 'EFin' WHERE name = 'eFin';
UPDATE funders SET sheet_name = 'InAd' WHERE name = 'In Advance';

-- Seed the 6 funders present in the workbooks but missing from the DB
INSERT INTO funders (name, code, sheet_name) VALUES
  ('PayVa',  'PayVa', 'PayVa'),
  ('R''bull', 'RBull', 'R''bull'),
  ('ACS',    'ACS',   'ACS'),
  ('Boom',   'Boom',  'Boom'),
  ('Kings',  'Kings', 'Kings'),
  ('VSPR',   'VSPR',  'VSPR')
ON CONFLICT (name) DO NOTHING;

-- portfolios: workbook-level rates ('-P' sheet AB1 = profit share,
-- portfolio sheet Z1 = dividend)
ALTER TABLE portfolios
  ADD COLUMN profit_share_rate numeric NOT NULL DEFAULT 0.20,
  ADD COLUMN dividend_rate numeric NOT NULL DEFAULT 0.03;

-- portfolio_funders: per-portfolio management fee (funder sheet B1 cell)
ALTER TABLE portfolio_funders ADD COLUMN management_fee_rate numeric;

-- Seed portfolio ↔ funder links with the B1 fee read from each workbook.
-- Alder has all 11 funders; White Rabbit has 7.
INSERT INTO portfolio_funders (portfolio_id, funder_id, management_fee_rate)
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
JOIN portfolios p ON p.name = v.portfolio_name
JOIN funders f ON f.sheet_name = v.sheet_name
ON CONFLICT (portfolio_id, funder_id) DO UPDATE
  SET management_fee_rate = EXCLUDED.management_fee_rate;

-- deals: Date Closed (funder sheet column AH) is an input the table was
-- missing; expected-payment math depends on open/closed status
ALTER TABLE deals ADD COLUMN date_closed timestamptz;
