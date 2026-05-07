# PLAN.md — Optimizing Excelerate for Claude Code

A roadmap for tightening the feedback loop between you and Claude Code. Items are ordered by leverage — finish the top section before reaching for anything below it.

## Current state

- **CLAUDE.md**: minimal — only describes structure. No conventions, no pitfalls, no Supabase context.
- **`.claude/settings.local.json`**: only allows two `WebFetch` domains. Every `npm run`, `cargo`, `git`, etc. triggers a permission prompt.
- **No hooks**: nothing auto-formats on edit. Easy for Claude to leave unformatted code that fails CI (`cargo fmt --check` and `npm run format:check` are blocking).
- **No subagents, no slash commands, no project skills.**
- **No tests**: nothing in `src-tauri/tests/`, no vitest config. Claude can't verify changes beyond `cargo clippy` and `npm run build`.
- **Repetitive surface area**: 10 funder parsers in `src-tauri/src/parsers/` that all follow a similar pattern → ripe for templating via a slash command.
- **In-flight migration**: SQLite + Excel → Supabase. Phase 1 schema landed; data migration script is next. Claude has stale memory about this.

---

## Phase 1 — Cut the friction (do these first)

### 1.1 Expand CLAUDE.md

Current file is a structure map. Add the things Claude has to re-derive every session:

- **Parser conventions**: trait `BaseParser`, output is `PivotTable`, expected columns per funder, where to register a new parser (`parsers/mod.rs` + `lib.rs` invoke handler list).
- **Tauri command pattern**: every Rust command is wired through `lib.rs::run()` `invoke_handler![…]`. Forgetting this is the #1 paper-cut.
- **Supabase migration state** (single source of truth, not memory): which tables are live, what's still in SQLite, where migrations live (`supabase/migrations/`), that schema changes go through the CLI not the dashboard.
- **CI gate list**: `npm run lint`, `npm run format:check`, `npm run build`, `cargo fmt --check`, `cargo clippy --all-targets -- -D warnings`. Claude should run the matching check after edits in that area.
- **Commit format**: conventional commits enforced by commitlint + husky. Format violations block the commit.
- **What NOT to touch**: `dist/`, `node_modules/`, `target/`, generated `supabase.types.ts` (regenerated from schema), `pro-examples/`, `examples/`, `monthlys/` (gitignored data).

### 1.2 Project `.claude/settings.json` with a real allowlist

Promote the local file to a checked-in `.claude/settings.json` and pre-allow the read-only / safe commands you run constantly. Run `/fewer-permission-prompts` to base this on actual transcript history. Starting set worth allowing:

- `Bash(npm run lint)`, `Bash(npm run lint:fix)`, `Bash(npm run format)`, `Bash(npm run format:check)`, `Bash(npm run build)`
- `Bash(cargo check:*)`, `Bash(cargo clippy:*)`, `Bash(cargo fmt:*)`, `Bash(cargo test:*)`
- `Bash(git status)`, `Bash(git diff:*)`, `Bash(git log:*)`, `Bash(git branch:*)`
- `Bash(supabase status)`, `Bash(supabase db diff:*)`, `Bash(supabase migration list)`
- Keep destructive ops (`git push --force`, `supabase db reset`, `rm -rf`) **off** the allowlist.

### 1.3 Auto-format hooks

Add `PostToolUse` hooks in `.claude/settings.json` so Claude never leaves CI-failing formatting:

- After `Edit`/`Write` on `*.rs` → `cargo fmt -- <file>` (or `cargo fmt` if path resolution is awkward).
- After `Edit`/`Write` on `src/**/*.{ts,tsx,css}` → `prettier --write <file>` then `eslint --fix <file>`.

Use `/update-config` to wire these — the harness runs them, not Claude, so they're reliable.

### 1.4 Sync Claude's memory with reality

The two memory files are 39 days old and refer to dates in March 2026. Verify against current `supabase/migrations/` and `src/services/supabase.types.ts`, then update or delete. Stale memory is worse than no memory.

---

## Phase 2 — Custom slash commands

Repetitive scaffolding tasks that benefit from a single, well-tested prompt. Put these in `.claude/commands/`:

### 2.1 `/new-parser <funder-name>`

Generates a new parser following the `BaseParser` pattern: stub file in `src-tauri/src/parsers/<name>_parser.rs`, registers in `parsers/mod.rs`, adds the corresponding Tauri command(s) to `lib.rs`. Pre-fill the column-mapping section with TODO markers so you don't forget to wire columns.

### 2.2 `/add-tauri-command <name>`

Catches the common mistake of writing a `#[tauri::command]` and forgetting to add it to `invoke_handler![…]` in `lib.rs`. Generates the function, registers it, and adds a matching TypeScript wrapper in the right service file.

### 2.3 `/run-checks`

Runs the same gates CI runs — `npm run lint && npm run format:check && npm run build && (cd src-tauri && cargo fmt --check && cargo clippy --all-targets -- -D warnings)`. One command, fail fast, matches CI exactly.

### 2.4 `/new-migration <name>`

Wraps `supabase migration new <name>`, opens the file, reminds Claude to regenerate `supabase.types.ts` after the migration applies. Good guard against schema drift.

---

## Phase 3 — Subagents for heavyweight work

Reach for these when the work spans many files or needs isolation from your main conversation context.

### 3.1 `parser-author` agent

Specialized for adding/modifying funder parsers. Knows the `BaseParser` trait, the `PivotTable` output shape, the validation errors model (`notification::ValidationError`), and the `parsers/mod.rs` + `lib.rs` registration dance. Useful because each parser is ~150–300 lines and the pattern is repetitive — a focused agent avoids polluting your main context with parser-specific exploration.

### 3.2 `supabase-migration` agent

Owns the migration loop: write SQL migration → `supabase db push` → regenerate types → update services that hit the changed tables. Knows which tables are still SQLite-backed vs Supabase-backed (read from CLAUDE.md, not memory).

### 3.3 `tauri-command-author` agent

Adds a Rust command and the matching TypeScript invoke wrapper. Fixes the easy-to-forget `invoke_handler![…]` registration. Smaller scope than `parser-author`.

Skip building agents until you actually feel the pain — `parser-author` is the obvious first one given there are 10 of them and more funders likely coming.

---

## Phase 4 — Testing & verification surface

Right now Claude can verify "does it compile" and "does it lint" but not "does it work." That's a real gap for parsers and Supabase code.

### 4.1 Rust parser tests

Add `src-tauri/tests/` with one fixture file per parser (sample CSV/XLSX in `src-tauri/tests/fixtures/`) and a snapshot test asserting the resulting `PivotTable`. With this in place, Claude can actually validate parser changes instead of just trusting clippy.

### 4.2 Vitest for services

`src/services/*.ts` is 1,800 lines, including the 628-line `pyodide-service.ts`. Add vitest with a smoke test per service. Claude can run `npm test` after changes.

### 4.3 `npm run check` script

Bundle the CI commands into one npm script so both `/run-checks` and CI use the same entry point. Single source of truth for "is this PR shippable."

---

## Phase 5 — MCP integrations (optional)

Only worth it if you find yourself asking Claude to do these often:

- **Supabase MCP**: lets Claude query the live DB schema/data during dev instead of reading TypeScript types. Useful while the migration is in flight; less useful once it stabilizes.
- **GitHub MCP**: you already have `gh` CLI on the allowlist path — MCP is mostly redundant unless you want richer PR review flows.

---

## Phase 6 — Internal docs Claude can grep

Drop these in `docs/` (new directory). Short, factual, no narrative:

- `docs/parsers.md` — column mappings per funder, what each parser outputs, where the source files come from.
- `docs/database.md` — current schema (link to `supabase/migrations/`), which writes go to SQLite vs Supabase, the Excel-as-DB legacy bits.
- `docs/tauri-commands.md` — table of every command in `lib.rs`, what it does, where it's called from in TS.

CLAUDE.md links to these. Keeps CLAUDE.md short while still giving Claude a place to find detail.

---

## Suggested order

1. Phase 1.1 + 1.2 + 1.3 (one session, ~30 min). Biggest immediate quality-of-life win.
2. Phase 1.4 — verify and refresh memory.
3. Phase 2.3 (`/run-checks`) — easiest win, used every session.
4. Phase 4.1 — parser tests. Without them, parser changes are flying blind.
5. Phase 2.1 (`/new-parser`) once you add the next funder.
6. Phase 3.1 (`parser-author` agent) only after 2–3 more parsers are added and you've felt the repetition.
7. Phase 5 + 6 — opportunistic, as friction surfaces.

---

## Non-goals

- No CLAUDE.md bloat. Keep it under ~150 lines; push detail into `docs/`.
- No agents that duplicate built-ins (`Explore`, `general-purpose`, `Plan`).
- No hooks that block Claude on slow operations (e.g., full `cargo build` after every edit).
- No premature MCP setup. Add when a workflow demands it.
