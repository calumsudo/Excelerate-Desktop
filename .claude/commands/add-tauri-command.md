Add a new Tauri command named: $ARGUMENTS

This is a two-part task — the Rust side and the TypeScript side. The most common mistake is adding the Rust function but forgetting to register it in `tauri::generate_handler![…]`. Do both.

## Step 1 — Confirm target module

The default module is `src-tauri/src/file_handler.rs`. If the command name clearly belongs elsewhere (e.g. auth → `auth.rs`, database → `database.rs`), use that instead. Ask the user only if it's genuinely ambiguous.

## Step 2 — Read the target module

Read the full file to understand the existing patterns (imports, return types, error handling style).

## Step 3 — Add the Rust function

Append a `#[tauri::command]` stub to the bottom of the target module (before the last `}` if the file is a module block, or at the end of the file). Follow the exact style of neighbouring commands — use the same error type, same serialisation pattern.

Template (adapt to match the file's style):

```rust
#[tauri::command]
pub fn $ARGUMENTS() -> Result<(), String> {
    // TODO: implement
    Ok(())
}
```

If the command takes parameters or returns data, add them — but keep it a stub with `// TODO: implement` until the user fills it in.

## Step 4 — Register in lib.rs (THE STEP PEOPLE ALWAYS FORGET)

Read `src-tauri/src/lib.rs`. Find the `tauri::generate_handler![…]` block and add the new command:
- Format: `<module>::$ARGUMENTS,`
- Place it after the last entry in the same module group, or at the end of the list

**Do not skip this step.** A missing entry here compiles fine but the frontend call silently fails at runtime.

## Step 5 — Add the TypeScript wrapper

Determine the best `src/services/*.ts` file based on the command name:
- File/storage operations → `file-service.ts` (or the existing file handler service)
- Auth → `auth-service.ts`
- If unclear, default to the most-used services file

Read the target `.ts` file, then append a typed `invoke()` wrapper matching the existing function style. Example:

```typescript
export async function $ARGUMENTS(): Promise<void> {
  return invoke("$ARGUMENTS");
}
```

Adjust parameter types and return type to match the Rust signature.

## Step 6 — Compile check

Run: `cd src-tauri && cargo check`

Report whether it succeeded. If there are errors, fix them before reporting done.

## Step 7 — Summarize

Tell the user:
- Rust function added to: `<module file>`
- Registered in `lib.rs` `generate_handler!`
- TypeScript wrapper added to: `<service file>`
- Current signature (parameters + return type) — note any `// TODO: implement` that still needs real logic
