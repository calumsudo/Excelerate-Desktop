Create a new Supabase migration named: $ARGUMENTS

## Context

`supabase/migrations/` may not exist yet — this command will create it on first use when the Supabase CLI generates the migration file. `src/services/supabase.types.ts` is **hand-maintained** (not auto-generated) — you must update it manually after applying the migration.

## Step 1 — Create the migration file

Run:

```
supabase migration new $ARGUMENTS
```

This creates a timestamped file at `supabase/migrations/<timestamp>_$ARGUMENTS.sql`.

If the command fails because the Supabase CLI is not installed or not logged in, tell the user and stop. Do not proceed.

## Step 2 — Read the new file

Find and read the newly created file in `supabase/migrations/`. It will be empty (just a comment or blank). Display the file path so the user knows exactly where to write their SQL.

## Step 3 — Remind about the manual type update

After the user writes their SQL and runs `supabase db push`, they **must** manually update `src/services/supabase.types.ts`.

Key facts:
- This file is NOT auto-generated — do not run `supabase gen types` (it would overwrite hand-written customisations)
- Edit `src/services/supabase.types.ts` directly to reflect any new tables, columns, or changed types
- The file lives at `src/services/supabase.types.ts` — read it now so you can suggest the exact type additions needed once the user shares their SQL

## Step 4 — Offer to draft the SQL

Ask the user: "What should this migration do?" If they describe the schema change, draft the SQL for the migration file and suggest the corresponding TypeScript type additions for `supabase.types.ts`.

## Step 5 — Summarize

Tell the user:
- Migration file created: `supabase/migrations/<timestamp>_$ARGUMENTS.sql`
- Next steps:
  1. Write the SQL in the migration file
  2. Apply with: `supabase db push`
  3. Manually update `src/services/supabase.types.ts` to reflect the new schema
