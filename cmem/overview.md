# Overview — universal-wasm-loader

The **JS/TS reference implementation** of the Universal WASM Loader (Project 2 of the polyglot
ecosystem; see `wasmtk`). Published to JSR as `@jrmarcum/universal-wasm-loader` (renamed 2026-06-15
from `@jrmarcum/universalwasmloader-js`; the manifest `name` — `jsr.json` since the 2026-10-12 Bun
migration, `deno.json` before — must exactly equal the JSR package name or `deno publish` fails). The nine
other-language ports (`-rs`, `-py`, `-go`, `-jvm`, `-c`, `-dotnet`, `-dart`, `-zig`, `-v`) must
match this implementation's behavior and the cross-language `SPEC.md`, with ONE accepted
JS-specific difference: path resolution (below).

## Where it lives (2026-10-21; the latest release: [release.md](release.md))

- **GitHub:** `https://github.com/synapticforge1/universalWasmLoader-js`, a public repo of the
  **`synapticforge1` organization** (owner-controlled). 🔁 Moved there by the owner by 2026-10-21;
  before: `jrmarcum/universalWasmLoader-js` (from 2026-10-12), `jrmarcum/universalWasmLoader`
  before that. GitHub redirects both old URLs. binaryang moved to `synapticforge1` too, and wasmtk
  followed on 2026-10-23 (`synapticforge1/wasmtk`; this repo's links to it fixed 2026-10-26, H17).
- **JSR:** the package stays `@jrmarcum/universal-wasm-loader` (the JSR scope did not move). JSR's
  GitHub link already names `synapticforge1/universalWasmLoader-js` (`api.jsr.io`, updated
  2026-10-20); first proven by JSR 1.1.1's provenance (rekorLogId `3367515417`, 2026-10-21); every
  release's id since is in [release.md](release.md).
- **npm** (owner, 2026-10-21): `@synapticforge1/universal-wasm-loader` — 1.1.0 by hand, every
  release since **by trusted publishing with provenance** (SLSA v1), the same bytes as JSR's —
  [npm.md](npm.md) (how), [release.md](release.md) (each release).
- **Trusted publishing after the move (letter H20, recorded 2026-10-26).** Both registries
  published 1.1.1 from the ORG repo on 2026-10-21, after the move, so neither policy is stuck on
  the old owner. JSR: the package is linked to `synapticforge1/universalWasmLoader-js` (the link
  updated by the owner 2026-10-20) and `deno publish` in `publish.yml` gets its OIDC token from
  that run; the 1.1.1 provenance (rekorLogId `3367515417`) names the org repo. npm: the trusted
  publisher was CREATED after the move (`npm trust list`: `github`, `publish.yml`,
  `synapticforge1/universalWasmLoader-js`), so whatever IDs it locked are the org's; 1.1.2 and
  2.0.0 then published through both with no change. UNMEASURED:
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

`SPEC.md` is the cross-language contract; currently **v4.0.1** on `main` (2026-11-09, unreleased;
the published 2.0.2 ships 4.0.0). 4.0.1 is a clarification: §11.1's port allowance for a
zero-value options type, the owner's "adjust for go" ruling (ledger C35; [spec-4.0.0.md](spec-4.0.0.md)
§ Port allowances). 4.0.0 (2026-11-07, owner's decisions on workspace letter H29: absent-vs-failed
`.wit`, strict WIT, host callbacks required, typed-call argument checks, the §11 time limit — each
a refusal, hence the major; package 2.0.0). Before it, the 3.0.0 major WAS the return-convention
change above (breaking vs. 2.x). The nine ports re-align to 4.0.0 (ledger row C29, 2026-11-07).

## Tests

`bun run test` (also `test:node`, `test:deno`) runs `tests/loader.test.js` (`node:test` +
`node:assert` — no dependency; `@std/assert` 2026-10-12 → 2026-10-21, `tests/run_tests.js` before) against fixtures produced by `wasmtk`
(`math_50` / `booleans_50` / `strings_50` / `imports_50` / `wasi_io_50`, plus the hand-written
`init_check`) and the lifecycle scenarios (`createSingleton`, `InstancePool`).

**Current (2026-11-07, 2.0.0): 73 tests, 73/73 on Bun 1.4.4, Node 22, 24 and 26 (`bun run lts`:
3 LTS lines), Deno 2.9.8.** Beside the reference calls they cover the SPEC 4.0.0 refusals (§2
absent-vs-failed `.wit` and strict parsing, §4 host callbacks and their return values and
typed-call arguments, §11 time limit and abort — [spec-4.0.0.md](spec-4.0.0.md)) and the http
`fetch` path, on a local `node:http` server; so `test:deno` needs `--allow-net=127.0.0.1` and
`--allow-write=.test-tmp` (one test writes a malformed `.wit` in that gitignored folder). By hand,
headless Chrome 156, Edge 157, Firefox 159, ESR 153: the 58 tests that need no Node server
(open-work: not yet a gate; 🔒 Bun stands for Safari). Counts before: 24 (2026-10-12), 28
(2026-10-26), 63 → 73 (2026-11-07). The fixtures are
the stamped reference set every port copies, regenerated 2026-10-12 from wasmtk `f50c8e4` and
re-stamped byte-identical 2026-10-26 from its post-purge twin `4a5c3cf668d`
([fixtures.md](fixtures.md)). The shipped `.js` is type-checked (`checkJs`) and linted by Biome
since 2026-10-13 ([linting.md](linting.md)).

## Release flow

`jsr.json` version is the package version (since 2026-10-12; `deno.json` before). 🔒 **Since
2026-11-10, the owner's order (workspace letter H33):** `bun run bump <level>` (the level is
required) runs the compatibility gate ([compat-gate.md](compat-gate.md)) and commits `bump to
vX.Y.Z`; `bun run release` checks everything it can locally and pushes `main` ONLY; `publish.yml`
on that push runs `checks` → CI makes the tag → the GitHub Release page from the tag → JSR ∥ npm
with OIDC provenance, both read back. Nothing is tagged from a machine. Slot by slot, what was
measured and what is still to measure: [release.md](release.md) § "How a release runs"; every
release: [release.md](release.md) § "Release History". `bun run release` spawns plain `git`; on
this exFAT drive that works because the system git config holds a `safe.directory` wildcard for
the workspace folder (ledger C9). Provenance requires the GitHub OIDC token to reach the runner —
the workflow keeps its "Check OIDC availability" diagnostic step (added 2026-06-15, mirroring
wasmtk) because that org's OIDC was found to be environmentally gated.

**History of the job graph:** until 2026-11-09 a tag pushed from this machine started `verify` →
JSR ∥ npm → `release` (`gh release create` and a `release/<tag>` branch). 2026-11-09 (ledgers H30,
C30, C34, H32): no `gh` (the REST script), every tool pinned by sha256, the publishing jobs run no
third-party code, every clone token-less, recoverable uploads (each job skips what the registry
has), npm "free" read from the package document's `time`, the page in H32's order with no checkout
in its job — first run by 2.0.1, then 2.0.2 green. 2026-11-10 (H33, C45): the trigger moved from the
tag to `main`, CI makes the tag, the page comes before the publish, the `release/<tag>` branch is
gone, and the `jsr` job publishes a sparse tree of the shipped files with nothing installed.

**The workflows use only `run:` steps — never `uses:` (third-party actions).** Under the
`jrmarcum` owner the Actions policy permitted only actions owned by `jrmarcum`. 🔒 **For the
`synapticforge1` organization, owner, 2026-10-21: "it has the same policy as before, and is the same
as was used with binaryang."** Observed the same day: binaryang's workflows in that organization DO
use `actions/checkout`, `oven-sh/setup-bun`, `actions/setup-node`, `denoland/setup-deno` and run
green. `run:` steps work under either reading, so this repo keeps them; switching to `uses:` would
be a deliberate change, not a fix. Under the old policy any `uses: actions/checkout` /
`uses: denoland/setup-deno` made the run end in `startup_failure` (no step executes, so nothing
reaches JSR even though the local `deno task publish` still creates the tag/release — making it
look "published on GitHub" but absent on JSR). The v1.0.6 tag hit exactly this when the workflow was
briefly switched to external actions (2026-06-15); reverted to `git clone` + curl-install-Deno
`run:` steps. The workflow that runs is the one **at the pushed `main` commit** (it was the one at
the tagged commit until 2026-11-10), so a changed `publish.yml` takes effect with the push that
carries it.

**Published:** every release, newest first, with what changed and its read-backs —
[release.md](release.md) § "Release History" (moved there 2026-11-10, D3).

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
