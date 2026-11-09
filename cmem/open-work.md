# Open work — universal-wasm-loader

Re-derived 2026-11-07, after the 2.0.0 release (each item measured that day, not carried over).
Details live in the linked files; this file only lists what is still open, then one line per item
closed recently with the commit that closed it.

## Open

- **The reworked `publish.yml` has not run on GitHub** (2026-11-09; H30 / C30 / C34): every
  piece was measured locally ([overview.md](overview.md) § Release flow), the whole only runs on
  the next `v*` tag. Read that run job by job: `verify` outputs a digest, `jsr` / `npm` use the
  pinned tools and match it, `release` creates the branch and the Release through the REST API.
- **CI (`ci.yml`) still installs Bun, Deno and fnm with `curl | bash`** — it holds no publishing
  credential (C30's scope), but the same pinned downloads would remove the last unpinned
  installers. Not changed without the owner.
- **Browser RUN is not a gate.** Measured by hand at every release since 2026-10-26 (headless
  Chrome, Edge, Firefox, Firefox ESR; 🔒 owner 2026-10-26: **Bun stands for Safari** — it runs
  JavaScriptCore; Bun's `fetch` is its own, so Safari's streaming-compile path is not exercised):
  the unbundled `tests/loader.test.js` under an import map that points `node:test` /
  `node:assert/strict` at small shims and stubs `node:http` / `node:fs/promises` / `node:path` /
  `node:url`; the suite blocks that need a Node server are skipped in a page (58 of 73 run there,
  2026-11-07). The harness lives in the session scratchpad and uses `import.meta.dir` (Bun-only);
  committing it as `bun run browser:run` on `node:` builtins, with the skip list in one place,
  would make it a gate. `bun run browser` today proves only that the export BUNDLES and the
  shipped source has no top-level `node:` import. Same gap in binaryang.
- **A void WIT import is UNMEASURED** (no fixture has one): SPEC §4 says its callback's return
  value is ignored; the code path is one `return undefined` ([spec-4.0.0.md](spec-4.0.0.md)).
- **C29 (the nine ports on SPEC 4.0.0): open for -v only** (2026-11-09). All nine answered and
  released; verified read-only here (tag = claimed commit on GitHub, behaviour commit inside it,
  SPEC 4.0.0 + refusal tests at the tag, registry, green CI on the tag commit) and closed for the
  other eight. -v: one run of its suite from a clean clone of `v2.0.0` gave 85 / 86 asserts —
  not investigated (owner: keep to this project); loader-v re-runs and answers in the row.
- **Publishing still needs Deno** (`deno publish`, F2 of binaryang's exit guide). By design; JSR's
  to solve before ~2027-10. Re-check when JSR ships a non-Deno publisher that keeps provenance.
- **Rule 3's CONSUMER half** (H6): no known consumer runs a suite ([compat-gate.md](compat-gate.md)).

## To hand over (not this repo's to fix)

- 🔒 **wasmtk switches to Biome** (owner, 2026-10-13: "We are making the same switch for those
  projects also"). Measured 2026-11-07: binaryang has (`biome.jsonc`, `lint` = `biome lint
  --error-on-warnings` + a canary check); **wasmtk has no Biome config and no `lint` script**.
  The reference is [linting.md](linting.md): the verified deno-lint → Biome rule map, the 5
  opt-in rules, and the `biome migrate` trap (`"preset": "none"` silently disables every rule).

## Closed recently (one line each; the record is in the linked file)

- 2026-11-07 — **2.0.0 / SPEC 4.0.0 released** (H29: the `.wit` absent-vs-failed rule, strict
  WIT, host callbacks and their return values, typed-call checks, the 30 s fetch limit):
  `39eacc1`, `e621a79`, `6b09b37`, `1169ab9` = `v2.0.0` → [spec-4.0.0.md](spec-4.0.0.md).
- 2026-11-07 — Node 26 became LTS (2026-10-28): `bun run lts` shows **3 lines**, 73 / 73 each.
- 2026-11-07 — handed-over items found resolved on re-measuring: binaryang's JSR / npm split
  (both 2.2.2), binaryang's browser check (its source-level `check-portability.ts`), binaryang's
  Biome switch; wasmtk's wrong 2.0.3 fixtures (the fix is in wasmtk `v3.0.0`, which contains
  `4a5c3cf668d`).
- 2026-10-26 — **1.1.2**: the masked HTTP error on the `.wasm` (`64551fa`) →
  [spec-4.0.0.md](spec-4.0.0.md) § The lead-in; the first full run of the one-publish-run design
  ([npm.md](npm.md)).
- 2026-10-26 — workspace letters H16, H17 (3), H20, H22 / H25 (d) / H28, H24 + C8 + H27, C13, the
  `CLAUDE.md` pull line (`36aa661`); fixtures re-stamped from wasmtk `4a5c3cf668d` (H7 / X8 / C11)
  → [fixtures.md](fixtures.md). Ledger C14 closed 2026-11-07.
- 2026-10-21 — no `@std` dependency (`node:assert/strict`); npm beside JSR, trusted publishing with
  provenance → [npm.md](npm.md); the move to `synapticforge1` (first CI run 39690350614).
- 2026-10-13 — `deno lint` replaced by `tsc` (`checkJs`) + Biome 2.5.15 → [linting.md](linting.md);
  the null-memory `TypeError`s found by `checkJs` fixed.
- 2026-10-12 — H6 (★ block, compatibility gate, memory layout) → [compat-gate.md](compat-gate.md);
  H7 reference fixtures → [fixtures.md](fixtures.md); the Bun migration →
  [bun-migration.md](bun-migration.md).
