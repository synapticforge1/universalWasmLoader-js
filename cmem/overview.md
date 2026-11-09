# Overview — universal-wasm-loader

The **JS/TS reference implementation** of the Universal WASM Loader (Project 2 of the polyglot
ecosystem; see `wasmtk`). Published to JSR as `@jrmarcum/universal-wasm-loader` (renamed 2026-06-15
from `@jrmarcum/universalwasmloader-js`; the manifest `name` — `jsr.json` since the 2026-10-12 Bun
migration, `deno.json` before — must exactly equal the JSR package name or `deno publish` fails). The nine
other-language ports (`-rs`, `-py`, `-go`, `-jvm`, `-c`, `-dotnet`, `-dart`, `-zig`, `-v`) must
match this implementation's behavior and the cross-language `SPEC.md`, with ONE accepted
JS-specific difference: path resolution (below).

## Where it lives (2026-10-21; latest release 2.0.0, 2026-11-07)

- **GitHub:** `https://github.com/synapticforge1/universalWasmLoader-js`, a public repo of the
  **`synapticforge1` organization** (owner-controlled). 🔁 Moved there by the owner by 2026-10-21;
  before: `jrmarcum/universalWasmLoader-js` (from 2026-10-12), `jrmarcum/universalWasmLoader`
  before that. GitHub redirects both old URLs. binaryang moved to `synapticforge1` too, and wasmtk
  followed on 2026-10-23 (`synapticforge1/wasmtk`; this repo's links to it fixed 2026-10-26, H17).
- **JSR:** the package stays `@jrmarcum/universal-wasm-loader` (the JSR scope did not move). JSR's
  GitHub link already names `synapticforge1/universalWasmLoader-js` (`api.jsr.io`, updated
  2026-10-20); first proven by JSR 1.1.1's provenance (rekorLogId `3367515417`, 2026-10-21), last
  by **2.0.0's (rekorLogId `3742189142`, 2026-11-07)**.
- **npm** (owner, 2026-10-21): `@synapticforge1/universal-wasm-loader` — 1.1.0 by hand, every
  release since **by trusted publishing with provenance** (SLSA v1), the same bytes as JSR's:
  1.1.1, 1.1.2, **2.0.0** — [npm.md](npm.md).
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

**The job graph since 2026-11-09** (owner, on ledgers H30 / C30 / C34; working-rules 9 and 10):
`verify` {contents: read} does everything that runs third-party code (gate, compat, release
self-test, `npm:prove`, JSR dry run) and outputs the proved `dist/`'s digest; `jsr` and `npm`
{id-token: write} hold the publishing credential and run only pinned Deno / Node / Bun — `jsr`
a `bun install --ignore-scripts` for `deno publish`'s type check, `npm` a dependency-free
`scripts/npm/build.ts` that must reproduce verify's digest — and each skips an upload the
registry already has, so "Re-run failed jobs" is safe after a failure past the upload; `release`
{contents: write} runs once verify passed, whatever `jsr` / `npm` exited with, checks out
nothing, and runs `scripts/github-release.ts` fetched alone at `github.sha` (REST API, no `gh`;
H32's order since 2026-11-09): it waits for both registries, requires the tag to peel to
`github.sha`, stops with NO write when the page exists, else creates `release/<tag>` and the
page (JSR + npm links on top of generated notes), reads it back and peels the tag again; every
request has a 30 s limit (18-check self-test, five mutants caught). npm "free" means the
version is absent from the package document's `time` (a removed number counts as taken — S3D's
measurement; this package has none, measured 2026-11-09). Every clone is token-less; tools are
pinned by version + sha256 (Bun 1.4.4, Deno 2.9.8, Node 24.21.0 with npm 11.19.0). Measured
locally 2026-11-09, before its first run: the release script (then a 13-check self-test, 18
since the H32 rework the same day; two mutants, five since
caught, and a read-only dry run against the real GitHub / JSR / npm for `v2.0.0`, `v1.1.2`, a
wrong commit and an absent tag), the tag peel (lightweight here, annotated on loader-c's
`v1.1.2`), the jq expressions, the pinned installs (Git Bash; a wrong pin stops the step under
`bash -eo pipefail`), and the digest (`npm:prove`'s `dist/` = `build.ts`'s, 12 files). **First
run: 2.0.1, 2026-11-09** — every job did its part (the pinned installs, verify's digest matched
by the npm job, the REST release step); only npm's provenance read-back was too short (now 10
minutes). The owner's re-run of the npm job (attempt 2, green) exercised the npm skip; JSR's
skip is the one path not yet run on GitHub.

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

**Published:** **2.0.2, 2026-11-09** (owner: "update the project memory files, commit, push and
release"; a patch with NO shipped file changed — the first tag run of the release page in H32's
order): `Release v2.0.2` `1c840d2` = tag `v2.0.2`; publish run 42663185314 green in every job
(npm's provenance read-back took 77 s of its 10 minutes). The page, read back through the REST
API: `author.login` `github-actions[bot]`, not a draft, `releases/latest` = v2.0.2, the JSR and
npm links on top of the generated notes; `release/v2.0.2` = the tag's commit; the `release` job
ran no checkout (pinned Bun, the script fetched alone, the page in 4 s). JSR rekorLogId
**3767290265**, score 100; npm SLSA v1, 11 files = the tag; a fresh install loads and refuses.
Before it, **2.0.1, 2026-11-09** (owner: "release"; a patch — only the shipped README
changed): `Release v2.0.1` `771ac03` = tag `v2.0.1`; publish run 42633902729 — the first run of
the 2026-11-09 job graph: `verify` / `jsr` / `release` green, `npm` published but its provenance
read-back timed out at 3 minutes; green after the owner's re-run ([npm.md](npm.md) § the table). Read back independently: JSR
rekorLogId **3766026937**, latest 2.0.1, score 100; npm latest 2.0.1, SLSA v1, 11 files = the
tag; GitHub: tag, `release/v2.0.1` and the Release (`github-release.ts --dry-run`); a fresh
`npm install …@2.0.1` on Node 24 loads `math_50` and gives the three refusals. Before it,
**2.0.0 (SPEC 4.0.0), 2026-11-07** (owner: "tag it first", then push): `Release
v2.0.0` `1169ab9`, tag `v2.0.0`; publish run 42394507328 green (verify → JSR ∥ npm → GitHub
Release), CI 42394504835 green. Read back independently: JSR rekorLogId **3742189142**, latest
2.0.0, score 100, linked to the org repo; npm latest 2.0.0, SLSA v1 provenance, its 11 files
byte-identical to the tag; a fresh `npm install …@2.0.0` on Node 24 loads `math_50` and refuses
`add("x", 1)`, `imports_50` without callbacks, and a callback returning `undefined`, each with its
message. Before it, `@jrmarcum/universal-wasm-loader@1.1.2` was live on JSR and
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
