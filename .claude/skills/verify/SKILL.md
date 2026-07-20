---
name: verify
description: Verify frontend changes by driving the app in a browser against the local Supabase stack — build/launch/drive recipe that avoids needing the Tauri window.
---

# Verifying Excelerate frontend changes

Frontend-only changes (no Tauri `invoke()` in the changed path) can be verified
in a plain browser: the React app runs fine under Vite, and Supabase
auth/reads/writes work identically. Tauri APIs throw a benign
`transformCallback` pageerror on load — ignore it.

## Launch

1. Local Supabase stack must be running (`supabase status`; `npm run dev:local`
   starts it as a side effect, or `supabase start`).
2. Get the anon key:
   `supabase status -o json | python3 -c "import json,sys; d=json.load(sys.stdin); print(d['ANON_KEY'])"`
3. Start Vite only (not Tauri), in the background:
   `VITE_SUPABASE_URL=http://127.0.0.1:54321 VITE_SUPABASE_ANON_KEY=<key> npm run dev`
   → serves http://localhost:1420

## Drive (Playwright)

Playwright is not a project dep — `npm i playwright` in a scratch dir (chromium
is already cached in `~/Library/Caches/ms-playwright`).

- Login: goto `/login`, `getByLabel("Email")` → `dev@excelerate.local`,
  `getByRole("textbox", { name: /Password/ })` → `excelerate-dev` (plain
  `getByLabel("Password")` is ambiguous with the show-password button), submit,
  `waitForURL(/dashboard/)`.
- Routes: `/alder-portfolio`, `/white-rabbit-portfolio`, `/dashboard`, etc.
  (see `src/App.tsx`).
- HeroUI tooltips ignore instant synthetic hovers — glide the mouse in with
  `page.mouse.move(x, y, { steps: 8 })` toward the target, then wait ~1s.

## Test data

Seed directly via psql (`postgresql://postgres:postgres@127.0.0.1:54322/postgres`).
Portfolios: 1 = Alder, 2 = White Rabbit. `funders`/`portfolio_funders` are
pre-seeded; `deals`, `funder_uploads`, `net_rtr_payments` start empty.
Delete seeded rows afterward to leave the stack clean, or use
`npm run db:wipe:local`.
