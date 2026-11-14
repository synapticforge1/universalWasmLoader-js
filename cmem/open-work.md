# Open work — universal-wasm-loader

Re-derived 2026-11-07, after the 2.0.0 release (each item measured that day, not carried over).
Details live in the linked files; this file only lists what is still open, then one line per item
closed recently with the commit that closed it.

## Open

- **Review of `v2.0.3..HEAD`, round 1 done 2026-11-13: 14 findings, none fixed** (3 reviewers;
  [review-process.md](review-process.md) § 9, classes A–F, each re-verified by a run). Next: the
  owner chooses scope and order; then one class at a time — fix, a test that fails without it,
  fresh reviewers on that class until a round finds none — and round 2 on the fixes. Worst first:
  #7 (a wrong answer to loader-go's SPEC reading, also in ledger C47), #3 (a correctly written
  review record that wraps "empty / round" is refused), #1–#2 (wordings and a fenced example that
  pass the record check). These edits to `cmem/` are uncommitted until the owner's "commit".
  **Paused 2026-11-13 (owner: "F first", then "pause here for today"), mid class F (#14), NOT yet
  cleared:** the fixes so far were committed and pushed on the owner's "commit and push"
  (2026-11-13, branch `review-r1-fixes`: `scripts/release-record.ts`, `check-release-record.ts`,
  `bump.ts`) — pushed as work in progress, the class is NOT cleared. Four class-F retests each found more of the class (a
  misleading hint; the self-test never running the script as a process; a silent exit 0 under
  Node through a linked path; the `bump` / `release` callers untested), all fixed: self-test 68
  checks, green on Bun, Deno, Node 22 and 26; 23 mutants caught; gate green, 73 tests. **Retest 5
  was started and its result not read — on resuming, run a fresh class-F retest (same brief:
  failure paths + whether the self-test catches a regression) until a round finds nothing, then
  record #14 as cleared with the retest history and take the owner's next class** (recommended:
  D, then A + B + C, then E). Queued, found on the way: **#15** — the old `isMain` comparison in
  `compat.ts`, `surface.ts`, `github-release.ts`, `regen-fixtures.ts`, `npm/build.ts` does nothing
  and exits 0 under Node through a linked path (always run by Bun today, so not exposed).
- 🔒 **The next release needs a security review and a hardening review first** (owner,
  2026-11-12, letter H35; [review-process.md](review-process.md)): none has been run under the
  process yet. One "hardening review" on `v2.0.3..HEAD`, run to its empty round, is both (the
  tiers nest); its record goes in the new version's entry in [release.md](release.md) before
  `bun run bump`, which refuses without it. The `publish.yml` step that repeats the check is
  unmeasured on GitHub until that release.
- **Efficiency review: no benchmark is committed** (optional; [review-process.md](review-process.md)
  § 8). The thresholds there (10 % time, 5 % size) are a session's proposal — the owner's to set.
- 🗓️ **OWNER — two SPEC readings need a ruling** ([spec-4.0.0.md](spec-4.0.0.md) § Port
  readings, 2026-11-13): (1) -dotnet and -go refuse a wrong-typed host callback at LOAD, by its
  static signature, where § 4 says "when WASM calls the import"; (2) a void accessor on a non-void
  export is refused by -zig and discarded by -c and -v, under one § 4 sentence. Recommended: allow
  both in a SPEC 4.0.2 clarification; no port changes. Nothing in SPEC.md was changed.
- **§ 8 has no `s64` or `f32` PARAMETER** (found by loader-zig, 2026-11-08): no fixture can catch
  a port that narrows or widens one. A new fixture comes from one `wasmtk modc` run and a re-stamp
  that all ten loaders copy ([fixtures.md](fixtures.md)) — the owner's to schedule.
- **A re-run of the new `publish.yml` has never been needed** (2026-11-10): each job's skip (tag
  at this commit, page there, version served) is tested on mocks and the npm skip ran once under
  the old workflow (2.0.1); JSR's skip has never run on GitHub. Measure it at the first failure.
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

- 2026-11-13 — **H35** (the review standard, with its three addenda: "efficiency review", the
  nesting tiers, one class at a time): the four words in `working-rules.md`, this repo's slots in
  [review-process.md](review-process.md), and `bump` / `release` / `publish.yml` refusing a version
  whose `release.md` entry does not record both reviews (`scripts/release-record.ts`, 23-check
  self-test in CI's gates, 8 mutants caught). Also re-measured for H19 / C36: a blob-level scan of
  all 104 commits finds no machine path — no purge needed here.
- 2026-11-13 — **the ports' readings of SPEC 4.0.0 answered** (-dotnet, -go, -zig, -v; unanswered
  since 2026-11-08): five accepted against SPEC.md's text, two left for the owner (above) →
  [spec-4.0.0.md](spec-4.0.0.md) § Port readings.
- 2026-11-10 — **2.0.3 released, the first release in the owner's order** (`15388fd`, run
  42849918410: checks → CI tag → page → JSR ∥ npm, all green; OIDC from a `main` push works for
  both registries) → [release.md](release.md).
- 2026-11-10 — **H33 / C45 / H34** (the owner's release order; no `release/<tag>` branch; the
  owner's three words): `bump <level>` required and self-committing, `release.ts` pushes `main`
  only, `publish.yml` on `main` (checks → tag → page → JSR ∥ npm), the JSR job installs nothing;
  `release.md` is the one record → [release.md](release.md).
- 2026-11-09 — **2.0.2 released** (`1c840d2`): every job green; the first page in H32's order,
  by `github-actions[bot]`, with the registry links, no checkout in the `release` job →
  [overview.md](overview.md) § Release flow.
- 2026-11-09 — **H32 recipe** (letter H32, owner via loader-py C41): `github-release.ts` now
  stops with no write when the page exists, peels the tag again after the POST, limits every
  request to 30 s, puts the JSR + npm links on top; the `release` job checks out nothing →
  [working-rules.md](working-rules.md) 9. First run: the next tag. **H31** recorded (rule 11):
  every Bun notation was already 1.4.4.
- 2026-11-09 — **2.0.1 released** (`771ac03`), the reworked `publish.yml`'s first run; npm's
  provenance wait raised 3 → 10 minutes after it timed out; the owner's re-run turned the run
  green and measured the npm "already has the version" skip → [npm.md](npm.md).
- 2026-11-09 — **H30 / C30 / C34 implemented** (owner: "Fix H30 + C30 + C34"): `publish.yml`
  without `gh`, pinned tools in the `id-token` jobs, recoverable uploads, npm "free" from `time`;
  `scripts/github-release.ts` + its self-test; CI on Bun 1.4.4 (`e6d589e`) →
  [overview.md](overview.md) § Release flow. Its first GitHub run is the open item above.
- 2026-11-09 — **C29 closed for eight ports** (-c, -dart, -dotnet, -go, -jvm, -py, -rs, -zig),
  verified read-only; ledger C14 closed 2026-11-07.
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
