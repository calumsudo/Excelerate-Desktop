Run the full CI gate suite to determine whether the current branch is shippable.

Run these gates **in order, fail-fast** — stop at the first failure and report it clearly.

## Gate 1 — TypeScript lint

```
npm run lint
```

Pass condition: exits 0 with ≤ 17 warnings (the project's configured max).
On failure: show the lint errors and stop.

## Gate 2 — Prettier format check

```
npm run format:check
```

Pass condition: exits 0 (no formatting violations).
On failure: list which files are unformatted. Offer to run `npm run format` to fix them, but do not run it automatically.

## Gate 3 — TypeScript build

```
npm run build
```

Pass condition: exits 0 (TypeScript type-check + Vite build both succeed).
On failure: show the compiler errors and stop.

## Gate 4 — Rust format check

```
cd src-tauri && cargo fmt --check
```

Pass condition: exits 0.
On failure: list which files need formatting. Offer to run `cargo fmt` to fix, but do not run it automatically.

## Gate 5 — Rust Clippy

```
cd src-tauri && cargo clippy --all-targets -- -D warnings
```

Pass condition: exits 0 (zero warnings, zero errors — `-D warnings` promotes warnings to errors).
On failure: show the clippy diagnostics and stop.

## Final report

After all gates pass (or after the first failure), report:

- **PASS** ✓ or **FAIL** ✗ for each gate that ran
- If all pass: "Branch is shippable — all CI gates green."
- If any fail: "Blocked on Gate N — <gate name>. Fix the issues above before merging."
