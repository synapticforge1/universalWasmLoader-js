# Linting and type checking (2026-10-13)

🔒 Owner, 2026-10-13: TypeScript covers what it can; **Biome** replaces `deno lint` ("Biome has
better backing. We will use that."), and **binaryang and wasmtk make the same switch** ("We are
making the same switch for those projects also"), each in its own session, with this file as
the reference (measured 2026-11-07: binaryang has switched; wasmtk has not — [open-work.md](open-work.md)). Bun 1.4.3 has no linter (`bun lint` outside a project:
"Script not found"); it has `bun check`, a type checker equivalent to `tsc` (not adopted: this
repo's own `check` script shadows the name; unmeasured).

## TypeScript (`bun run check` = `tsc -p tsconfig.json`)

- **`checkJs` over the four shipped `.js` files**, which nothing type-checked before. The JSDoc
  imports its types from the published `.d.ts` (`/** @import … from "./x.js" */` resolves to
  `x.d.ts`), so the implementation is checked against what consumers see. 49 errors at the start,
  fixed in `7cb996a`. Inverted: a `number` passed where `wit-parser` needs a `string` → TS2345.
- **Lint-like flags:** `noUnusedLocals`, `noUnusedParameters`, `allowUnreachableCode: false`,
  `allowUnusedLabels: false`, `noImplicitOverride`, on top of `strict`,
  `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`.
- TypeScript also validates regular-expression syntax, which covers deno's `no-invalid-regexp`
  in every checked file.
- **A real defect it found (fixed 2026-10-13):** a string-param import or a WASI call arriving
  while `memRef.current` was still `null` (a module with no exported `memory`, or a call from its
  start function) crashed with a bare `TypeError` on `null`; it now throws an `Error` naming the
  import and the likely cause. Probed before / after; nothing else changed (floor patch).
- `exactOptionalPropertyTypes` and `noUncheckedIndexedAccess` each caught one 2.0.0 line before
  CI did (2026-11-07 / 2026-10-26): `fetch(url, { signal })` with a possibly-`undefined` signal,
  and `split(";")[0]` — pass `null` / use an index-free form.

## Biome (`bun run lint` = `biome lint`, 2.5.15 pinned)

`biome.json`: linter only (formatter and assist OFF, so no reformatting churn); scope `*.js`,
`*.d.ts`, `scripts/**/*.ts`, `tests/*.js` — never `cmem/` or fixtures. Rules: `"preset":
"recommended"` plus five opt-ins (below). Day one: 25 findings, all fixed, none suppressed.

⚠️ **`biome migrate` is a trap here (2.5.15):** for the deprecated `"recommended": true` it
proposed `"preset": "none"`, which turns every rule OFF and leaves a lint step that cannot fail.
Measured on a probe file: `recommended` → 3 findings, exit 1; `none` → 0, exit 0. The right value
is `"preset": "recommended"` (schema enum: `recommended | all | none`). Re-run the probe after any
Biome upgrade or config migration.

### deno lint's 87 recommended rules, mapped (verified with `biome explain`, 2026-10-13)

| result | count | rules |
| --- | --- | --- |
| in Biome's recommended preset | 56 | every name exists; e.g. `no-unused-vars` → `noUnusedVariables`, `prefer-const` → `useConst`, `no-cond-assign` → `noAssignInExpressions` |
| Biome has it but OFF by default → **enabled in `biome.json`** | 5 | `no-empty` → `noEmptyBlockStatements`, `no-var` → `noVar`, `require-await` → `useAwait`, `no-namespace` → `noNamespace`, `prefer-as-const` → `useAsConstAssertion` (inverted on a probe: each fires) |
| JSX only (no JSX here) | 11 | `jsx-*` |
| about deno-lint ignore comments | 3 | `ban-unknown-rule-code`, `ban-untagged-ignore`, `ban-unused-ignore` (Biome reports unused suppressions itself) |
| Deno-only, or already a syntax error in a module | 10 | `no-sloppy-imports`, `no-unversioned-import`, `no-window`, `no-window-prefix`, `no-deprecated-deno-api`, `no-import-assertions`, `no-invalid-triple-slash-reference`, `no-await-in-sync-fn`, `no-delete-var`, `no-octal` |
| **DROPPED** (no counterpart found) | 2 | `no-empty-enum` (no enums here), `no-invalid-regexp` (covered by `tsc` for checked files) |

The `no-sloppy-imports` mystery of the Bun migration ends with `deno lint`: Deno now runs only
`deno publish` and the Deno test leg.
