# Design decisions — invariants that must not be silently reverted

Kept in full. Moved here from the tracked `CLAUDE.md` on 2026-10-12 (letter H6, memory layout);
the pre-move text is `git show f3da283:CLAUDE.md`. Corrections made on the move are marked 🔁.

## 🔒 Design principles (binding for all future work)

1. The user specifies only the `.wasm` path and, optionally, flat host callbacks.
2. Both `{ greet, isEven } = await wasmImport(...)` and `m = await wasmImport(...)` must work.
3. No options objects, no ABI flags, no explicit WIT paths: zero configuration.
4. Version pinning via `@N` follows the C SONAME convention, not npm semver.
5. `createSingleton` and `InstancePool` share the same minimal signature.
6. `VISION.md` is the authoritative cross-project design directive.

## 🔒 Architectural decisions

- **Canonical ABI only; `wasic` removed.** The `"wasic"` profile (Phase 50 bindgen: `__malloc`,
  `__str_ret_ptr`, `__str_ret_len`) is gone with `buildWasicImportEnv` / `buildWasicExportProxy`.
  The only ABI is the wasmtime Canonical ABI (`cabi_realloc`; callee-allocated string returns +
  `cabi_post_<name>` since 2026-06-15, SPEC 3.0.0; before that a caller-allocated out-parameter).
  `buildComponentImportEnv` / `buildComponentExportProxy` are `abi.js`'s exports. Matches wasmtk
  and the Component Model.
- **No options object.** `wasmImport(path, options)` became `wasmImport(path, hostCallbacks?)`; WIT
  detection and ABI selection are automatic. The `"raw"` and `"component"` profile flags are gone.
  Mirrors ES-module import ergonomics, a deliberate directive.
- **Version pinning by `@N` path suffix.** `parseVersionSuffix` strips `@N` before the URL is built;
  `assertVersion` checks `rawExports.version.value === N` after instantiation and throws
  descriptively on a mismatch or a missing export. Integer only: modules export an i32 `version`
  global, not a semver string.
- **Host callbacks stay** — they are how a module calls back into JS (DOM, events, render), the
  mechanism for future graphical or interactive modules.
- **WIT auto-detection with graceful fallback.** No companion `.wit` → raw `WebAssembly.Exports`,
  so `math.wasm`-style modules work without configuration. 🔁 Since 1.1.0 (2026-10-12): a `file:`
  URL is read from disk; a missing `.wit` (ENOENT) is "no WIT" like a 404, but any other read error
  THROWS. Over `fetch`, a 404 or a network error is still "no WIT".
- **Relative paths resolve against the LOADER's `import.meta.url`** (owner, 2026-10-12): keep it;
  callers pass `new URL(path, import.meta.url)`. `SPEC.md` keeps "relative to the calling module"
  for the other ports. [bun-migration.md](bun-migration.md) item 3.

## The load path (`wasmImport`)

1. Validate `options` (`timeoutMs` default 30 000, `signal`); strip `@N`; resolve the URL; look
   for `<path>.wit`. 🔒 **SPEC 4.0.0 (owner, 2026-11-07): raw exports ONLY when the `.wit` is
   absent** (ENOENT, HTTP 404 / 410); any other HTTP status, a network error, the time limit or an
   abort throws before the `.wasm` is fetched. A path not ending in `.wasm` has no `.wit` (raw).
2. `parseWit` is strict: the wasmtk subset only, every other form throws (an unsupported type is
   never read as `s32` again). The error is wrapped as `invalid .wit <url>: …`.
3. `buildComponentImportEnv(imports, hostCallbacks)` refuses a WIT import with no callback (all
   missing ones named), then wraps the callbacks with ABI decoding and returns `{ env, memRef }`;
   the WASI-P1 shim (`wasi.js`) is always added as `wasi_snapshot_preview1`.
4. Instantiate (`fetchOnce`: one request, one time limit from request to last body byte); set
   `memRef.current` (and the shim's) to `exports.memory`, needed to decode string arguments of
   imports.
5. Call `_initialize` if exported (SPEC §10); check `@N`.
6. `buildComponentExportProxy` refuses a WIT export the module lacks, then wraps the exports with
   ABI encoding, keyed by camelCase WIT names; each typed call checks arity and argument kinds
   (`TypeError`, no coercion). 🔒 Host callbacks' RETURN values are checked too (owner,
   2026-11-07, "fix the last item"): `encodeCallbackResult` applies the argument domains in
   reverse; a void import ignores the value; a Promise is refused for every import; an import
   with a `string` result is refused at load (not implemented in this ABI profile).

No build step: the `.js` files are the source, and each links its `.d.ts` through the
`@ts-self-types` pragma.

## 🔒 WIT name conventions

- WIT export names are kebab-case; JS proxy keys are camelCase (`is-positive` → `isPositive`).
- WIT import names are kebab-case; WASM import keys are underscore (`env-mul` → `env_mul`).
- User host callbacks are camelCase (`envMul`), in one flat object, never nested.

`wit-parser.js` is regex-based with no dependencies and parses the format `wasmtk` emits
(`package local:name;`, `world name { import …; export …; }`).

## Small facts that are easy to get wrong

- The JSR name `@jrmarcum/universal-wasm-loader` and the local file names
  (`universal-wasm-loader.js`) are separate things; the old name `universalwasmloader-js` was
  retired 2026-06-15.
- `publish.yml` at the repo ROOT is an empty, unused placeholder; the workflow is
  `.github/workflows/publish.yml`.
- `math.wat` / `math.wasm` (used by `how-to-use.js`) export `calculate(a, b) = a * b + 10` and an
  i32 `version` global of 1, with no `.wit`, so it exercises the raw-exports path.
