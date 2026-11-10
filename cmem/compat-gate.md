# The compatibility gate (workspace letter H6, built 2026-10-12)

🔒 Binding (owner, 2026-09-20; workspace `../../cmem/layout-and-packaging.md` § "The compatibility
gate"): "backward compatible" is a gate result, never a judgment made at bump time.

## What runs where

| Piece | File | Runs in |
| --- | --- | --- |
| Rule 1, the SURFACE | `scripts/surface.ts` → `api-surface.json` (committed) | `bun run surface` writes it; `--check` in `bun run gate`, CI and publish |
| Rule 2, the FLOOR | `scripts/compat.ts` `floorOf` | `bun run bump <level>` (refuses below it), `bun run compat` (report), `compat --release` on the candidate commit — in `bun run release` and in `publish.yml`'s `checks`, before CI tags it (blocking; since 2026-11-10, on the tag before) |
| Rule 3, BEHAVIOUR | `scripts/compat.ts` `previousTests` | same places; required green for a patch or minor |
| Rule 4, deprecate first | README `### ⚠️ Breaking Changes` table | by hand, when a deprecation lands |
| Rule 5, re-baseline alone | CI `surface --check` | an intended surface change is its own commit, with the reason |
| Self-test | `scripts/check-compat-gate.ts` (26 checks since 2026-10-13; a malformed version now throws) | `bun run compat:selftest`, CI |

**The surface of this loader:** the manifest `exports` map; every top-level declaration of the
`.d.ts` each export names through `@ts-self-types` (one key per symbol, one per class member,
overloads as `~2`; comments and whitespace do not count); the `SPEC.md` version. The generator
FAILS on a form it cannot key (re-export, `export *`, default export, an export with no
`@ts-self-types`) rather than skipping it. 9 symbols on 2026-10-12; **12 since 2026-11-07**
(`LoadOptions` + its two members; `39eacc1`, re-baselined alone).

**The gate's first MAJOR (2.0.0, 2026-11-07):** `compat` reported floor major for the changed
signatures, the SPEC major and the added interface, AND v1.1.2's 28 tests green on the new code —
the evidence that every documented call that was correct in 1.x still works; the refusals hit
only wrong calls. `bump major` was the owner's; after the tag, the floor against `v2.0.0` is patch.

**The floor:** removed or changed → major; added → minor; nothing → patch; `SPEC.md` moves it by
its own level (lowered → major). ⚠️ A CHANGED signature is major even when it only widens (an
added optional parameter): the gate cannot tell widening from narrowing and errs high. If that
becomes a burden, add reviewed exceptions as wasmtk did (`17e2054` there), not a looser rule.

**Previous-tag tests:** the tag's `tests/` (test file AND fixtures, unmodified) are extracted with
`git archive` into `.compat/` (gitignored, deleted after) beside a copy of the CURRENT
`publish.include` files, and run with the runtime running the script (`bun test`, or
`node --test`). Both suite formats are read from their OUTPUT: `loader.test.js` (1.1.0 on) and the
older `run_tests.js` (1.0.8: 24 of 24 against the source of 2026-10-12).

**A stand-in for `@std/assert` (2026-10-21):** the tests of 1.1.0 and 1.1.1 import
`assertStrictEquals` from `@std/assert`, which the repo no longer installs (owner: no `@std` that
may disappear with Deno). `previousTests` writes a stand-in package into `.compat/run/node_modules`
for such a tag: that one function, as `node:assert/strict`'s `strictEqual` (the same `Object.is`
comparison); anything else imported fails loudly. Measured: without it the v1.1.1 suite was RED,
0 pass / 1 fail (the import); with it, green 24/24, and the bool mutant gives 15 pass / 9 fail,
the same as the original inversion with the real library. Needed until the previous release is
one whose tests use `node:assert` — **true since 1.1.2 (2026-10-26)**, so the default gate no
longer reaches it; it stays for `compat` runs against 1.1.0 / 1.1.1.

**Consumers (Rule 3, second half):** this package has no known JSR consumer that runs a suite;
`-py` and `-rs` vendor copies under `upstream/`. Nothing to run yet; revisit if one appears.

## Inverted end to end, 2026-10-12 (a scratch clone; nothing in the repo was broken)

| Mutant | Command | Result |
| --- | --- | --- |
| `createSingleton` removed from the `.d.ts`, surface NOT re-baselined | `bump patch` | refused: stale snapshot AND floor major ("symbol removed: function createSingleton") |
| same, re-baselined | `bump patch` / `bump minor` / `bump major` | refused / refused / allowed (1.1.0 → 2.0.0) |
| bool result decoding inverted in `abi.js` (surface unchanged) | `bump patch` | refused: floor patch, previous-tag tests RED 15 pass / 9 fail |
| `loaderVersion` const added | `bump patch` / `bump minor` | refused (floor minor) / allowed (→ 1.2.0) |
| tagged v1.2.0 with that addition | `compat --release` | passes (minor ≥ minor) |
| tagged v1.1.1 with that addition | `compat --release` | BLOCKED: patch below the floor (minor) |

Runtimes: `compat.ts` and the self-test also run on Node 22/24 (same results).

## Traps met building it

- Cloning this exFAT repo needs `git -c safe.directory=<repo>/.git clone`; into the session
  scratchpad it also needs `-c core.longpaths=true` (pack path too long).
- PowerShell 5.1 `Set-Content -Encoding utf8` writes a BOM; `JSON.parse` then fails on the
  manifest. Write JSON with `Write`/`Edit` or `[IO.File]::WriteAllText`.
