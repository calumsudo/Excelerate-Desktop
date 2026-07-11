# Local Development Environment

Run the app against a full local Supabase stack (Postgres, Auth, PostgREST,
Storage) in Docker instead of the production project. Real login, real RLS,
real RPCs — no fake-auth code paths, no risk to live data.

## Prerequisites

- Docker Desktop running
- Supabase CLI (`brew install supabase/tap/supabase`)

## Run the app locally

```bash
npm run dev:local
```

That script (`tools/dev-local.sh`):

1. Starts the local Supabase stack if it isn't running (`supabase start` —
   first run downloads Docker images, applies every migration in
   `supabase/migrations/`, then runs `supabase/seed.sql`)
2. Launches `npm run tauri dev` with `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`
   pointed at `http://127.0.0.1:54321`

Because process env beats `.env` in Vite, the plain `npm run tauri dev` still
targets production. Only `dev:local` switches to the local stack.

**Log in with** `dev@excelerate.local` / `excelerate-dev` — a confirmed admin
user seeded with access to both portfolios.

## What's in the local database

Migrations seed everything the real project has except data that was created
via the dashboard before the migration baseline existed:

| Data | Source |
|---|---|
| portfolios (Alder, White Rabbit), states, industries, 6 funders, views, RLS, RPCs | `supabase/migrations/` |
| the 5 pre-baseline funders (BHB, Clear View, BIG, eFin, In Advance) + all 18 portfolio_funders fee rows | `supabase/seed.sql` |
| dev login + admin role + portfolio_access | `supabase/seed.sql` |

`deals` / `net_rtr_payments` start empty — run the **Import Portfolio
Workbook** wizard from a portfolio page (workbooks are in `examples/`) to
populate them, which is also the end-to-end test for Phase 3.

## Useful commands

```bash
npm run db:wipe:local    # fast: delete portfolio DATA only (deals, merchants,
                         # payments, uploads + Storage) — schema, seeds, and the
                         # dev login survive; also applies pending migrations
npm run db:reset:local   # full: wipe local DB, re-apply migrations + seed
supabase status          # URLs + keys of the running stack
supabase stop            # shut the stack down (add --no-backup to also wipe)
```

`db:wipe:local` is the loop for import/upload testing: import a workbook,
poke at it, wipe, repeat. It refuses to run against anything but the local
Docker stack.

Supabase Studio runs at <http://127.0.0.1:54323> for poking at local data.

## Notes

- `supabase/seed.sql` only ever runs locally (`db reset` / first `start`);
  `supabase db push` ignores it, so it can never touch production.
- The local SQLite/file flow (`~/Excelerate/`) is shared between modes — the
  Rust side doesn't know about Supabase. If you want a clean slate there too,
  move `~/Excelerate` aside before testing.
- Testing an RPC without the app:
  `curl -s "http://127.0.0.1:54321/auth/v1/token?grant_type=password" -H "apikey: <ANON_KEY>" -H "Content-Type: application/json" -d '{"email":"dev@excelerate.local","password":"excelerate-dev"}'`
  then call `/rest/v1/rpc/<fn>` with the returned `access_token` as a Bearer token.
