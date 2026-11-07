# Overview — universal-wasm-loader

The **JS/TS reference implementation** of the Universal WASM Loader (Project 2 of the polyglot
ecosystem; see `wasmtk`). Published to JSR as `@jrmarcum/universal-wasm-loader` (renamed 2026-06-15
from `@jrmarcum/universalwasmloader-js`; the manifest `name` — `jsr.json` since the 2026-10-12 Bun
migration, `deno.json` before — must exactly equal the JSR package name or `deno publish` fails). The nine
other-language ports (`-rs`, `-py`, `-go`, `-jvm`, `-c`, `-dotnet`, `-dart`, `-zig`, `-v`) must
match this implementation's behavior and the cross-language `SPEC.md`, with ONE accepted
JS-specific difference: path resolution (below).

## Where it lives (2026-10-21)

- **GitHub:** `https://github.com/synapticforge1/universalWasmLoader-js`, a public repo of the
  **`synapticforge1` organization** (owner-controlled). 🔁 Moved there by the owner by 2026-10-21;
  before: `jrmarcum/universalWasmLoader-js` (from 2026-10-12), `jrmarcum/universalWasmLoader`
  before that. GitHub redirects both old URLs. binaryang moved to `synapticforge1` too, and wasmtk
  followed on 2026-10-23 (`synapticforge1/wasmtk`; this repo's links to it fixed 2026-10-26, H17).
- **JSR:** the package stays `@jrmarcum/universal-wasm-loader` (the JSR scope did not move). JSR's
  GitHub link already names `synapticforge1/universalWasmLoader-js` (`api.jsr.io`, updated
  2026-10-20); proven by JSR 1.1.1's provenance (rekorLogId `3367515417`, 2026-10-21).
- **npm** (owner, 2026-10-21): `@synapticforge1/universal-wasm-loader` — 1.1.0 by hand, **1.1.1
  by trusted publishing with provenance** (SLSA v1), the same bytes as JSR's 1.1.1 —
  [npm.md](npm.md).
- **Trusted publishing after the move (letter H20, recorded 2026-10-26).** Both registries
  published 1.1.1 from the ORG repo on 2026-10-21, after the move, so neither policy is stuck on
  the old owner. JSR: the package is linked to `synapticforge1/universalWasmLoader-js` (the link
  updated by the owner 2026-10-20) and `deno publish` in `publish.yml` gets its OIDC token from
  that run; the 1.1.1 provenance (rekorLogId `3367515417`) names the org repo. npm: the trusted
  publisher was CREATED after the move (`npm trust list`: `github`, `publish.yml`,
  `synapticforge1/universalWasmLoader-js`), so whatever IDs it locked are the org's. UNMEASURED:
  whether either registry pins the repository/owner numeric IDs (neither UI shows them); it
  matters only on a further transfer or rename — then re-check both before the next release.

## What it does

Loads a `.wasm` module like an ESM import, auto-detecting its companion `.wit` and applying the
Canonical ABI so the caller gets a typed JS proxy. Works in Deno, Node 22.18+, Bun, and browsers.
Local-file loads on Node work only from 1.1.0: earlier releases failed there because Node's
`fetch` rejects `file:` URLs ([bun-migration.md](bun-migration.md)).

## Public surface (`universal-wasm-loader.js`)

- **`wasmImport(wasmPath, hostCallbacks?, options?)`** — instantiate + return a proxy keyed by the
  WIT export names. Auto-detects `<path>.wit`; raw `WebAssembly.Exports` only if it is ABSENT
  (SPEC 4.0.0, 2026-11-07: every other `.wit` failure, a malformed `.wit`, a missing host callback
  and a wrong-typed call throw). `options` = `{ timeoutMs (default 30 000), signal }`. Supports an
  optional `@N` version-pin suffix (checked against the module's exported `version` global).
  🔒 A relative STRING path resolves against the LOADER's own `import.meta.url`, not the caller's;
  callers keep modules where they like and pass `new URL("./wasm_modules/mod.wasm", import.meta.url)`.
  Owner decision 2026-10-12: keep this behaviour, and keep `SPEC.md`'s "relative to the calling
  module" wording for the other ports ([bun-migration.md](bun-migration.md) item 3).
- **`createSingleton(wasmPath, hostCallbacks?, options?)`** — caches the load promise; returns the
  same instance on every call (CLI / bounded-call pattern).
- **`InstancePool(wasmPath, hostCallbacks?, size=4, options?)`** — `acquire()` / `release()` / `run(fn)` over
  N independent instances (server / high-throughput pattern; distributes bump-allocator memory).

Internal modules: `wit-parser.js` (parse `.wit` → imports/exports), `abi.js`
(`buildComponentImportEnv` / `buildComponentExportProxy` — the ABI marshalling).

## ABI implemented (Canonical, wasmtime profile)

Numerics pass through; `bool` is `v?1:0` / `r!==0`; string PARAMS flatten to `(ptr,len)` via
`cabi_realloc`. **String RETURNS use the canonical callee-allocated convention (aligned 2026-06-15,
SPEC 3.0.0):** the export returns an i32 pointer to a callee-allocated `[ptr,len]` pair; the loader
reads it via `DataView`, decodes, then calls the paired **`cabi_post_<name>(retPtr)`** export. This
replaced the old caller-allocated out-parameter convention. The change lives in `abi.js`
`buildComponentExportProxy`. See [[abi-notes]] if added later.

## Conformance / SPEC

`SPEC.md` is the cross-language contract; currently **v4.0.0** (2026-11-07, owner's decisions on
workspace letter H29: absent-vs-failed `.wit`, strict WIT, host callbacks required, typed-call
argument checks, the §11 time limit — each a refusal, hence the major; package 2.0.0 when
released). Before it, the 3.0.0 major WAS the return-convention change above (breaking vs. 2.x).
The nine ports re-align to 4.0.0 (ledger row from loader-js, 2026-11-07).

## Tests

`bun run test` (also `test:node`, `test:deno`) runs `tests/loader.test.js` (`node:test` +
`node:assert` — no dependency; `@std/assert` 2026-10-12 → 2026-10-21, `tests/run_tests.js` before) against fixtures produced by `wasmtk`
(`math_50` / `booleans_50` / `strings_50` / `imports_50` / `wasi_io_50`, plus the hand-written
`init_check`) and the lifecycle scenarios (`createSingleton`, `InstancePool`). Current (2026-10-13):
**26 assertions in 24 tests, 24/24 on Bun 1.4.3, Node 22, 24 and 26, Deno 2.9.7**. Current
(2026-10-26): **34 assertions in 28 tests** — four load over a local `node:http` server (the
`fetch` path: a 404, `application/wasm`, `application/octet-stream`, a module that does not
compile), so `test:deno` needs `--allow-net=127.0.0.1` — **28/28 on Bun 1.4.4, Node 22, 24, 26
and Deno 2.9.8**. Current (2026-11-07, SPEC 4.0.0): **63 tests** — the refusals of §2, §4 and §11;
`test:deno` also needs `--allow-write=.test-tmp` (one test writes a malformed `.wit` beside a copy
of `math_50.wasm` in that gitignored folder) — **63/63 on Bun 1.4.4, Node 22, 24, 26 and Deno
2.9.8**; in a page (Chrome 156, Edge 157, Firefox 159, ESR 153) the 49 that need no `node:http`
pass. The fixtures are
the stamped reference set every port copies, regenerated 2026-10-12 from wasmtk `f50c8e4` and
re-stamped byte-identical 2026-10-26 from its post-purge twin `4a5c3cf668d`
([fixtures.md](fixtures.md)). The shipped `.js` is type-checked (`checkJs`) and linted by Biome
since 2026-10-13 ([linting.md](linting.md)).

## Release flow

`jsr.json` version is the package version (since 2026-10-12; `deno.json` before). `bun run bump
[patch|minor|major]` raises it, after the compatibility gate allows that level
([compat-gate.md](compat-gate.md)); `bun run release` commits, tags `vX.Y.Z`, and pushes → the
`publish.yml` GitHub Action verifies everything for BOTH registries first (gate, compatibility
gate, the npm tarball, the version free on JSR and npm), then publishes to JSR and npm in parallel
with OIDC provenance and reads both attestations back ([npm.md](npm.md) § "The release path",
since 2026-10-21). `bun run release` spawns plain `git`; that works on this exFAT drive
because the repo's path is in the global `safe.directory` list (added 2026-10-12).
Provenance requires the GitHub OIDC token to reach the runner — the workflow has an
"Check OIDC availability" diagnostic step (added 2026-06-15, mirroring wasmtk) because that org's
OIDC was found to be environmentally gated.

**The workflows use only `run:` steps — never `uses:` (third-party actions).** Under the
`jrmarcum` owner the Actions policy permitted only actions owned by `jrmarcum`. 🔒 **For the
`synapticforge1` organization, owner, 2026-10-21: "it has the same policy as before, and is the same
as was used with binaryang."** Observed the same day: binaryang's workflows in that organization DO
use `actions/checkout`, `oven-sh/setup-bun`, `actions/setup-node`, `denoland/setup-deno` and run
green. `run:` steps work under either reading, so this repo keeps them; switching to `uses:` would
be a deliberate change, not a fix. Under the old policy any `uses: actions/checkout` /
`uses: denoland/setup-deno` made the run end in `startup_failure` (no step executes, so nothing reaches JSR even though the local
`deno task publish` still creates the tag/release — making it look "published on GitHub" but absent on
JSR). The v1.0.6 tag hit exactly this when the workflow was briefly switched to external actions
(2026-06-15); reverted to `git clone` + curl-install-Deno `run:` steps. The triggering workflow file is
the one **at the tagged commit**, so the tag must point at a commit that already contains a `run:`-only
`publish.yml`.

**Published:** `@jrmarcum/universal-wasm-loader@1.1.2` is live on JSR and
`@synapticforge1/universal-wasm-loader@1.1.2` on npm (2026-10-26, owner: "push and release the
next version") — the masked-HTTP-error fix. Publish run 40380578962: verify → JSR ∥ npm → GitHub
Release, all green, the first full run of the one-run design. Read back independently: JSR
rekorLogId **3493886393**, latest 1.1.2, **score 100**, linked to the org repo; npm latest 1.1.2,
provenance SLSA v1; npm's 11 files byte-identical to the `v1.1.2` tag (git blob ids; `package.json`
generated); a fresh `npm install …@1.1.2` on Node 24 loads `math_50` and reports a 404 as
`wasmImport: HTTP 404 Not Found for <url>`. Before it, **1.1.1** (2026-10-21, rekorLogId
3367515417) was the first release from the `synapticforge1` org. Before that, 1.1.0 (2026-10-12, rekorLogId 3232619821): It was the first release from the Bun toolchain, and it
contains SPEC §10 plus the Node `file:` fix ([bun-migration.md](bun-migration.md)). 1.0.8 before it
also scored 100 with provenance. The `run:`-only workflow delivered provenance cleanly both times.

## Producer model + SPEC §10 capabilities (IMPLEMENTED 2026-06-15)

The loader consumes **reactor/library** modules — the `wasmtk modc` shape (no `_start`; `_initialize`
+ named exports). NOT command (`_start`) modules. Both SPEC §10 capabilities are now **implemented**:

1. **`_initialize`** — `callInitialize()` in `universal-wasm-loader.js` calls the export once after
   instantiation (both the WIT and raw-exports paths), if present. (`wasmtk modc` doesn't currently
   emit `_initialize`, but other reactor producers — Rust/Zig/TinyGo — do; guarded, so it's a no-op
   otherwise.) Tested via the hand-written `tests/init_check.wasm` (its `_initialize` sets a global to
   99 that `getValue` reads back).
2. **WASI-P1 shim** — `wasi.js` `buildWasiShim(memRef)` is always merged into the import object as
   `wasi_snapshot_preview1` (unused namespace is ignored, so pure-compute modules are unaffected).
   Covers `fd_write` (stdout→`console.log` / stderr→`console.error`), `proc_exit` (throws),
   `random_get`, `clock_time_get`, and `environ`/`args`/`fd_*` stubs. Reads/writes memory via a
   `memRef` set after instantiation. Tested via `tests/wasi_io_50.wasm` (a `modc` library that calls
   `console.log` → imports `fd_write`; without the shim it would fail to instantiate). Suite now 26/26.

`wasi.js`/`wasi.d.ts` added to the publish include-list (now in `jsr.json`). The public API is unchanged
(`buildWasiShim` is internal). **Other ports SHOULD mirror both** (SPEC §10). Released in 1.1.0
(2026-10-12).
