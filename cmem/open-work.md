# Open work — universal-wasm-loader

Re-derived 2026-10-12, after the 1.1.0 release. Details live in the linked files; this file only
lists what is still open. Close an item by striking it here with the commit that closed it.

## Dated

- ✅ **Node 26** (LTS on 2026-10-28): installed in fnm (26.11.1) and measured 2026-10-12: suite
  24/24, `compat.ts`, the gate self-test and `how-to-use.js` all pass. CI leg added the same day.
  `bun run lts` adds it by itself on 2026-10-28 (it reads Node's schedule). Remaining on that
  date: confirm `bun run lts` shows 3 lines.
- ✅ **`deno lint` replaced, 2026-10-13** (owner: "Biome has better backing. We will use that."):
  `tsc` with `checkJs` + lint-like flags, then Biome 2.5.15 with deno lint's recommended rules
  mapped (56 in Biome's preset, 5 opted in, 2 dropped). [linting.md](linting.md). Tell binaryang
  (it has not chosen a linter) — hand-over below.
- **Found by `checkJs`, fixed 2026-10-13:** a string-param import or a WASI call that arrives
  while `memRef.current` is still `null` (a module with no exported `memory`, or a call from its
  start function) crashed with a bare `TypeError` on `null`; it now throws an `Error` naming the
  import and the likely cause. Probed before/after; no other behaviour changed (surface floor:
  patch).
- ✅ **No `@std` dependency (2026-10-21, owner: "I would rather not depend on any @std features
  that may disappear with deno")**: the tests use `node:assert/strict`; `@std/assert` and `.npmrc`
  (its JSR registry line) removed; the compatibility gate stands in for `@std/assert` when it runs
  1.1.0's / 1.1.1's tests ([compat-gate.md](compat-gate.md)). What still needs Deno: `deno publish`
  (below) and `regen-fixtures.ts` (wasmtk is a Deno project); Deno stays a TESTED runtime for users.
- **Publishing still needs Deno** (`deno publish`, F2 of binaryang's exit guide). By design; JSR's
  to solve before ~2027-10. Re-check when JSR ships a non-Deno publisher that keeps provenance.

## The move to the `synapticforge1` organization (by 2026-10-21)

- ✅ **First CI run in the new organization**: run 39690350614 on `23aa737` (2026-10-21), all seven
  jobs green, the new `npm:prove` step in Gates included (its first run on CI).
- ✅ **The new organization's Actions policy** — owner, 2026-10-21: "it has the same policy as
  before, and is the same as was used with binaryang." The workflows stay `run:`-only (valid under
  any policy; [overview.md](overview.md) § Release flow).
- ✅ **Provenance from the new repo**: JSR 1.1.1, rekorLogId `3367515417` (2026-10-21).

## npm (owner, 2026-10-21: "setup an npm repository just as we did for binaryang")

- ✅ **npm is live and in step with JSR (2026-10-21).** 1.1.0 by hand; **1.1.1 by trusted
  publishing with provenance** (recovery dispatch run 39697206534), byte-identical to the tag, as
  on JSR. The README has the npm route. One run now publishes both (`verify` → `jsr` ∥ `npm` →
  `release`, no on/off switch). The way there (a secret instead of a variable; the trusted
  publisher never saved, found by `npm trust list`): [npm.md](npm.md).
- ✅ **First full run of the one-run design: v1.1.2, 2026-10-26** (publish run 40380578962):
  `verify` → `jsr` ∥ `npm` → `release` (GitHub Release after both), all green; read-backs JSR
  rekorLogId 3493886393, npm SLSA v1 provenance ([overview.md](overview.md) § Release flow).

## Unmeasured

- **Browser RUN — measured once by hand 2026-10-26, not yet a gate.** The unbundled
  `tests/loader.test.js` ran headless in **Chrome 156, Edge 156, Firefox 158 and Firefox ESR 153**
  (both Firefox builds from scoop): an import map pointed `node:test` / `node:assert/strict` at two
  small shims, a local http server served the repo, and every fixture was fetched over http
  (`.wasm` as `application/wasm`): **24/24 in all four**. Inverted: `math_50.wasm` answering 404 →
  exactly its 8 tests failed in each (V8: "BufferSource argument is empty"; Gecko: "failed to
  match magic number" — the masked-error finding below, in both engines). Same day: Bun 1.4.4
  24/24, Node 22.23.3 / 24.21.0 / 26.12.0 24/24 each, Deno 2.9.8 24/24 steps.
  🔒 **Safari (owner, 2026-10-26): Bun is the test for Safari — it runs JavaScriptCore**, Safari's
  engine. (What that covers: JSC's JavaScript and WebAssembly engine. Bun's `fetch` and module
  loader are Bun's own, not WebKit's, so Safari's streaming-compile path is not exercised.)
  The harness was a one-time scratchpad script (it used `import.meta.dir`, Bun-only); committing it
  as `bun run browser:run` on `node:` builtins would make this a gate (same gap in binaryang).
- ✅ **FIXED 2026-10-26 (owner: "fix the bug you found"), RELEASED in 1.1.2 the same day: an HTTP
  error on the `.wasm` was masked.** Before: `instantiateWasm` swallowed every `instantiateStreaming` failure
  (`catch (_e) {}`) and fetched AGAIN, reading the 404 body without checking `res.ok` — the user
  saw an engine's empty-module error (V8 "BufferSource argument is empty", Gecko "failed to match
  magic number", JSC "expected a module of at least 8 bytes") instead of the 404, and every
  compile/link error or non-`application/wasm` response cost a second download. Now: ONE fetch;
  `!res.ok` throws `wasmImport: HTTP <status> [<text>] for <url>`; streaming only when the
  `Content-Type` is `application/wasm` (the one case it accepts), else `arrayBuffer`; no catch.
  Four tests on a local `node:http` server (28 tests now); inverted against the old loader: 3 red
  for the right reasons (the 404 message; 2 requests for octet-stream; 2 for a CompileError).
  Gate: every CI step green incl. `compat` (previous tags' tests) and `surface --check` (no API
  change → floor patch); Node 22/24/26, Deno 28/28; Chrome, Edge, Firefox, Firefox ESR 24/24 with
  the 404 inversion now reading "HTTP 404 Not Found for <url>" in every engine. The `.wit` fetch
  keeps SPEC §63's "404 → raw exports". Shipped as 1.1.2 (`Release v1.1.2` `7b62387`).
  The nine ports follow this load path: the workspace was told (C14 note).

## Workspace letters (`../../cmem/handoffs.md`)

- ✅ **H6 (every repo), DONE 2026-10-12 on branch `h6`** (owner: "lets implement the H6 item"):
  SemVer was already met; the ★ block `4048256` ([best-practices.md](best-practices.md)); the
  compatibility gate `f3da283` ([compat-gate.md](compat-gate.md)); the memory layout (`CLAUDE.md`
  → pointer, [design-decisions.md](design-decisions.md), [working-rules.md](working-rules.md),
  `.gitattributes` LF pin) in the commit after. The workspace letter closes when the owner closes it.
  Not done: Rule 3's CONSUMER half — no known consumer runs a suite ([compat-gate.md](compat-gate.md)).
- **H7 (all loaders)** — this repo's part DONE 2026-10-12 on branch `h7`: the reference set is
  regenerated from wasmtk `f50c8e4` and stamped (`tests/fixtures.json`, `bun run fixtures`;
  [fixtures.md](fixtures.md)). L1–L8 are all other ports' items (none names -js). ✅ **Re-stamped
  2026-10-26** from the pushed post-purge twin `4a5c3cf668d` (`synapticforge1/wasmtk`), bytes
  unchanged (drift X8, ledger C11); the nine ports may copy the set now (hand-over table in
  [fixtures.md](fixtures.md)).
- ✅ **Workspace letters pulled 2026-10-26** (owner: "fix the open items, then make notations
  for the workspace to verify"), on branch `workspace-letters-2026-10-26`: H16 (`maintenance.strategy
  gc`, private note in `cmem/local/`), H17 part 3 (`VISION.md`, `regen-fixtures.ts`), H20 recorded
  ([overview.md](overview.md) § Where it lives), H22 / H25 (d) / H28 recorded
  ([working-rules.md](working-rules.md) § No secrets), H24 + C8 + H27 (★ re-copied and re-stamped,
  [best-practices.md](best-practices.md)), the pull line in `CLAUDE.md` now reads the workspace
  ledger first. Answers written to `../../cmem/workspace-correspondence.md`; the workspace closes.
- ✅ **H29 (S8, S9, S10) — measured, decided by the owner, implemented as SPEC 4.0.0, 2026-11-07,
  on branch `spec-4.0.0`; NOT released** (owner: "review workspace … make the requested fixes").
  **Measured on 1.1.2 first** (scratch probe, Bun and Node 24, identical): `.wasm` 404 / 500 → one
  request, error names the status ✅; a server that never answers → **hang** (`.wasm` and `.wit`;
  a stalled `.wit` blocks the `.wasm` from ever being requested); `.wit` 500 → raw exports,
  silently; **a malformed `.wit` → an EMPTY typed proxy** (the parser never failed: garbage gave an
  empty world, `func(a: s32 b: s32)` dropped `b`, `-> s99` / `u32` read as `s32`) — found here,
  beyond H29's list; raw `multiply(2.5, 4.0)` = 10 ✅; typed calls coerced (`add("x",1)` = 1,
  `add(2.7,1)` = 3, `add(1)` = 1, `greet(42)` = "Hello, 42!"); `imports_50` with no callbacks
  loaded and returned 0. 🔒 **Owner, 2026-11-07:** a malformed `.wit` and an unknown type throw;
  only an ABSENT `.wit` (ENOENT, 404, 410) is raw, every other failure throws; 30 s default per
  fetch plus `{ timeoutMs, signal }`; a missing host callback is refused at load; typed calls check
  arity and kinds. Commits: `39eacc1` (surface re-baseline ALONE, rule 5: `LoadOptions`, the
  options parameter, SPEC 4.0.0; 9 → 12 symbols) and the behaviour commit after it. Tests 28 → 63;
  inverted against 1.1.2: the 32 new negative tests red, the 31 others green. Gate: every CI step,
  `compat` floor **major** with v1.1.2's 28 tests green on the new code. ⬜ **To release: `bun run
  bump major` → 2.0.0 and a tag — the owner's word.** ⬜ Not decided, so not changed: a host
  callback's RETURN value is not checked (`undefined` still becomes `0`; SPEC §4 "same encoding in
  reverse") — the same class as S9, for the owner. The nine ports follow SPEC 4.0.0 (ledger row).

## To hand over (not this repo's to fix)

- 🔴 **binaryang's releases can split the same way** (seen 2026-10-21): JSR latest **1.13.2**,
  npm only **1.13.1**. Its `publish.yml` runs `npm` after JSR, gated on `vars.NPM_PUBLISH`; a
  gate that is false skips npm silently. This repo's answer (one `verify` before either publish,
  no switch, a recovery dispatch): [npm.md](npm.md) § "The release path".

- 🔒 **binaryang and wasmtk switch to Biome too** (owner, 2026-10-13: "We are making the same
  switch for those projects also."). Their own sessions do it; this repo's
  [linting.md](linting.md) is the reference: the verified deno-lint → Biome rule map (and which 5
  rules to opt in), the linter-only config, and the `biome migrate` trap (`"preset": "none"`
  silently disables every rule — prove the rules fire on a probe file after any migration).

- 🔴 **wasmtk 2.0.3 on JSR builds wrong fixtures** (`f64` for `s32` in `math_50.wit`; every bool
  function fails; 9/24 red). Fixed at wasmtk HEAD `f50c8e4`, unreleased. [fixtures.md](fixtures.md).
- **The nine ports**: copy the stamped fixture set and fix their L-items; table in
  [fixtures.md](fixtures.md).

- **binaryang `scripts/check-browser.ts`**: Bun 1.4.3's browser target replaces a top-level
  `node:fs` import with an empty-object stub, so a bundle-only check passes code that breaks in a
  page. This repo's check adds a source scan ([bun-migration.md](bun-migration.md) § "Checks").
  Reported to the owner 2026-10-12.
- ✅ **`safe.directory`**: since 2026-10-26 the owner's SYSTEM config holds a wildcard for the
  whole workspace folder (ledger C9, closed); no per-command override is needed here.
