# npm — a second registry beside JSR (2026-10-21)

🔒 Owner, 2026-10-21: "We will also need to setup an npm repository just as we did for binaryang.
see that project for proper setup." **JSR stays the source**; npm is added beside it. Modelled on
binaryang (`../binaryang/cmem/publishing.md` § "npm as a SECOND registry", `scripts/npm/`), read,
not copied: this package is hand-written JavaScript + `.d.ts`, so nothing is compiled.

## The package

| | |
| --- | --- |
| name | **`@synapticforge1/universal-wasm-loader`** — npm org `synapticforge1` (binaryang's pattern: npm org + the JSR package name). FREE on registry.npmjs.org on 2026-10-21 (404) |
| contents | exactly JSR's `publish.include` (the 4 `.js` + 4 `.d.ts`, README, SPEC) + `LICENSE`; 12 files, 16.8 KiB (2026-10-21) |
| manifest | `dist/package.json` GENERATED from `jsr.json` by `scripts/npm/build.ts` `npmManifest()`: the version has one source; `exports: { ".": { types, default } }` (types read from the file's `@ts-self-types`), `license: MIT`, `engines.node >=22.18`, repository / homepage / bugs on `synapticforge1/universalWasmLoader-js`, `publishConfig: { access: public, provenance: true }`. No `bin`. The repo's own `package.json` stays private (`bun run manifest`) |
| reference | JSR's own npm build (`npm.jsr.io/@jsr/jrmarcum__universal-wasm-loader`) has the same files minus LICENSE plus `jsr.json`, and the same single `.` export |

## Build and proof

- `bun run npm:build [--tag vX.Y.Z]` → `dist/` (gitignored). `--tag` builds from that release's
  OWN files (`git archive` into `.npm-src/`, deleted after) so an npm version holds the same code as
  the JSR version of that number. Checked 2026-10-21: `--tag v1.1.0` gives 11 files byte-identical
  to `v1.1.0` (git blob ids).
- `bun run npm:prove [--tag vX.Y.Z]` (in CI's Gates, on Node 24 + Bun): builds, `npm pack`s,
  installs the TARBALL into a scratch consumer outside the repo, then: only the expected files and
  every path the manifest names; exports equal `jsr.json`'s; on Node 22 / 24 / 26 (each fnm line;
  `node` from PATH without fnm, as in CI) and Bun, the installed package LOADS `math_50` and
  `strings_50` through `wasmImport`, `createSingleton`, `InstancePool` (strings run `cabi_realloc`
  and `cabi_post_<name>`); a TypeScript consumer (`nodenext`, `types: []`) type-checks against the
  shipped `.d.ts`; the installed package bundles for the browser AND its `.js` has no top-level
  `node:` import (the bundle alone cannot see one: best-practices L1); the export list equals JSR's
  npm build. `dist/` is left for the publish step.
- npm on Windows is a `.cmd` shim that `fnm exec` cannot spawn, so the proof runs
  `node <npm-cli.js>` beside the chosen Node (binaryang, measured).

**Inverted 2026-10-21, 6 of 6 caught for the right reason** (scratch clone; driver
`npm-mutants.ts` in the session scratchpad): a retyped `wasmImport` parameter in the `.d.ts` →
the consumer type check (TS2345); `abi.js` left out of `publish.include` → `ERR_MODULE_NOT_FOUND`
on every runtime; string returns one byte short → `greet("World"): got "Hello, World"`; a
top-level `node:fs` import → the source scan; a wrong `types` path → "names files the tarball
lacks"; `jsr.json` shipped → "unexpected files". Two first attempts were bad: removing `export`
from a `.d.ts` type changes nothing (declarations in a module `.d.ts` are exported anyway), and a
clone without `typescript` installed made every type check fail for the wrong reason.

## The release path — ONE run publishes BOTH (owner, 2026-10-21)

🔒 Owner, 2026-10-21: "we will need to setup this workflow … so that the jsr and npm publish at
the same time. publishing at different times is an issue." `publish.yml` from then until
2026-11-09 (the table below; 🔁 **reworked 2026-11-09** for H30 / C30 / C34 — no `gh`, the
`id-token` jobs run only pinned tools, npm rebuilds `dist/` to verify's digest, re-runs skip an
upload already made, `release` follows the registries; 🔁 **and again 2026-11-10** for H33 — a push
of `main` (not a tag) starts it, `checks` → CI makes the tag → the page → JSR ∥ npm, and the
recovery dispatch is gone (a re-run of the failed job replaces it): [release.md](release.md)
§ "How a release runs"). The 2026-10-21 shape, kept as history:

| job | does |
| --- | --- |
| `verify` | tag = `jsr.json` version; the version FREE on both registries (JSR and npm answer 404 for a missing version, measured); `bun run gate`; `compat --release`; `npm:prove`; the JSR dry run. Publishes nothing |
| `jsr` | after `verify`: `deno publish` (OIDC), the Rekor read-back |
| `npm` | after `verify`, IN PARALLEL with `jsr`: `npm:build`, `npm publish` by **trusted publishing** (OIDC, no token, npm ≥ 11.5), the attestation read-back (`dist.attestations.provenance.predicateType`) |
| `release` | after BOTH: `release/<tag>` and the GitHub Release |

- **No on/off switch.** The `NPM_PUBLISH` variable gate (binaryang's design) was REMOVED: a gate
  that silently skips npm is how 1.1.1 reached JSR alone. A variable named `NPM_PUBLISH` (the owner
  set it, 2026-10-21) is now unused.
- **Not atomic**: the registries cannot be published together. Everything that can fail on our
  side fails in `verify`; a registry failing during its own publish leaves a split, fixed by
  "Re-run failed jobs" on that job (never re-tag: both are immutable).
- ~~**`workflow_dispatch` (input `tag`) = recovery only**~~ (removed 2026-11-10; "Re-run failed
  jobs" skips whatever is published): the npm job alone, for a tag JSR HAS and
  npm LACKS (both checked), proving the tarball itself. JSR is never published by dispatch
  (binaryang's record: JSR's OIDC actor on a dispatched run differs).
- `deno publish` needs `node_modules` IN A FULL CHECKOUT: `tsconfig.json`'s `types: ["node"]`
  makes its type check look for `@types/node` ("Could not find @types/node", measured 2026-10-21).
  🔁 **2026-11-10: not in the published tree** — `jsr.json` + its `publish.include` alone (no
  `tsconfig.json`, `package.json` or `node_modules`) passes `deno publish --dry-run`, and a planted
  type error fails it (measured), so the `jsr` job now publishes that sparse tree with nothing
  installed.

## ✅ 1.1.0 on npm, published by hand (2026-10-21T23:03:05Z)

By the owner, from `dist/` built and proved with `npm:prove --tag v1.1.0` (11 files byte-identical
to the tag; npm 12.2.0, user `synapticforgeun`, `--provenance=false`). The public metadata
answered 404 for about a minute after the publish (binaryang saw the same). Checked as a user
from registry.npmjs.org: `npm install @synapticforge1/universal-wasm-loader@1.1.0`, then
`math_50` and `strings_50` load through `wasmImport` / `createSingleton` on Node 22, 24, 26 and
Bun. Trusted publisher and `NPM_PUBLISH`: the owner's (not readable from here: `npm trust list`
asks for a fresh one-time password on every call; repository variables need GitHub auth); the
1.1.1 release's `npm` job is their proof.

On this machine npm runs as `fnm exec --using=24 cmd /c npm …` (`fnm exec npm` cannot start the
`.cmd` shim).

## 1.1.1 (2026-10-21): JSR published, npm job SKIPPED

`bun run bump patch` (gate: floor patch, v1.1.0's tests 24/24), `Release v1.1.1` `b706cc6`,
`bun run release`. Publish run 39691735587: the JSR job green — **JSR 1.1.1 rekorLogId
`3367515417`**, latest, score 100, the first JSR provenance from the `synapticforge1` org; CI
green. **The `npm` job was SKIPPED:** `vars.NPM_PUBLISH == 'true'` was false although the owner
had "added a secret". A SECRET is invisible to `vars.`; it must be a repository VARIABLE (or an
org variable granted to this repo) with the value `true`. GitHub compares strings
case-insensitively, so the value's case is not the cause.

Re-running that run cannot help (it uses the workflow AT the tag, and its JSR job would fail on
the existing 1.1.1), so `publish.yml` gained a **`workflow_dispatch`** with a `tag` input (owner's
choice, 2026-10-21): it runs ONLY the npm job, for a release tag JSR already has (checked against
`api.jsr.io` first; the input reaches the shell through an env var and must match `vX.Y.Z`). Same
workflow file name, so the trusted publisher still matches. 🔁 Superseded the same day by the
one-run design above (the owner then found the cause: "I created a secret instead of a variable",
and corrected it; the variable is no longer read). ⏳ Owner: Actions → Publish → Run workflow →
`v1.1.1` (the recovery dispatch); its provenance read-back is the proof of trusted publishing.
npmjs.org also lists a `0.0.0-stage` version not published from here (seen 2026-10-21); the
owner's to explain.

### The recovery dispatch's first try: `ENEEDAUTH` (2026-10-21, run 39693562553)

Every step passed up to `npm publish`, which failed: `npm error code ENEEDAUTH … You need to
authorize this machine using npm adduser` (owner pasted the log; GitHub serves job logs only to
signed-in users, 403 anonymously). Nothing was published. `ENEEDAUTH` is npm's SILENT fallback
when its trusted-publishing (OIDC) exchange does not yield a token — the reason goes only to the
runner's debug log. Note: binaryang's trusted publishing has never run either (its npm has only
the hand-published 1.13.1), so there is no working reference in the workspace.

Added to the `npm` job: an npm ≥ 11.5.1 check; a diagnostic step that makes the same exchange
(GitHub OIDC token for audience `npm:registry.npmjs.org`, POST to the registry's
`/-/npm/v1/oidc/token/exchange/package/…`) and prints the token's public claims (repository,
`workflow_ref`, ref, environment) and the registry's answer, never a token — a WARNING, since the
endpoint is reproduced from npm's behaviour, not tested outside a runner; and on a failed publish,
the OIDC / auth lines of npm's debug log, token-shaped strings masked. The shell pieces (version
compare, base64url padding, masking) were tested in Git Bash.

**Second try, same day (with the diagnostics):** npm's debug log, as printed by the job: GitHub
issued the OIDC token (`audience=npm:registry.npmjs.org`, HTTP 200), then
`POST 404 …/-/npm/v1/oidc/token/exchange/package/@synapticforge1%2funiversal-wasm-loader` and
`verbose oidc Failed token exchange request with body message: OIDC token exchange error -
package not found`, then `ENEEDAUTH`. The package IS public (1.1.0), so "package not found" is
npm declining to match a trusted publisher for this run: the workflow side works; the trusted
publisher on npmjs.com is missing from THIS package or differs in a field (owner
`synapticforge1`, repository `universalWasmLoader-js`, workflow `publish.yml`, no environment).
Also confirmed the endpoint the diagnostic step uses is the one npm itself calls. A third try gave
the same. **Cause found by the owner's `npm trust list @synapticforge1/universal-wasm-loader`:
"No trust configurations found for package"** — the trusted publisher had never been saved on
this package (2026-10-21). ⏳ Owner: `npm trust github @synapticforge1/universal-wasm-loader
--file publish.yml --repo synapticforge1/universalWasmLoader-js --allow-publish` (or the package's
Settings page), `npm trust list` to confirm one entry, then the dispatch. 🎓 "package not found"
from the OIDC exchange, for a package that exists, = no trusted publisher configured for it; check
with `npm trust list` FIRST next time. binaryang's never-run trusted publishing should be checked
the same way.

### ✅ npm 1.1.1 published by trusted publishing, with provenance (2026-10-21)

The owner created the trusted publisher (`npm trust list`: type `github`, file `publish.yml`,
repository `synapticforge1/universalWasmLoader-js`, permissions `publish, stage publish` — the
`stage publish` permission is what the `0.0.0-stage` versions on npm come from). Recovery dispatch
run 39697206534: the npm job green. registry.npmjs.org: **1.1.1 published, provenance
`https://slsa.dev/provenance/v1`, `latest` = 1.1.1**, `repository` = the org repo. Checked as a
user: `npm install …@1.1.1` loads `math_50` / `strings_50` on Node 22, 24, 26 and Bun; its 11
files are byte-identical to the `v1.1.1` tag (git blob ids). **JSR and npm now hold the same 1.1.1.**
The first trusted publish in the workspace (binaryang's had not run yet, 2026-10-21). The next tag
push was the first test of the one-run design (`verify` → `jsr` ∥ `npm` → `release`).

### Every release since: [release.md](release.md) § "Release History"

The table of runs, Rekor ids and read-backs that stood here (1.1.2, 2.0.0, 2.0.1 with its re-run, 2.0.2)
moved to `release.md` on 2026-11-10 (workspace D3: one record per project, newest first). The
npm method facts it carried stay true: the provenance read-back waits up to 10 minutes (2.0.1's
appeared after more than 3, 2.0.2's after 77 s), and a re-run skips a version npm already serves
(measured on 2.0.1's re-run: 0 s, no second upload).

## ✅ Done 2026-10-21, in this order — the recipe, kept for a new npm package (binaryang's experience, `publishing.md` § 1.13.1)

1. **The first version by hand** — npm's trusted publisher is configured on the PACKAGE, which must
   already exist. As `synapticforgeun`: `bun run npm:prove --tag v1.1.0` (builds `dist/` from the
   v1.1.0 tree and proves it), then `npm login`, then from `dist/`:
   `npm publish --provenance=false` (the manifest asks for provenance, which only CI can produce;
   this one version goes without it, as binaryang's 1.13.1 did).
2. **The trusted publisher** on that package: GitHub Actions, repository
   `synapticforge1/universalWasmLoader-js`, workflow `publish.yml` — on the package's settings page
   (Packages → the package → Settings → Trusted publishing) or
   `npm trust github @synapticforge1/universal-wasm-loader --file publish.yml --repo synapticforge1/universalWasmLoader-js --allow-publish`
   (npm ≥ 11.15).
3. ~~**The repository variable `NPM_PUBLISH=true`** on GitHub.~~ Superseded the same day: the
   one-run design has no on/off switch (§ "The release path").
4. **A release within 2 days** of step 2: npm requires a new trusted-publisher configuration to
   complete a publish within 2 days (binaryang's record). `main` already holds a patch's worth
   (the `checkJs` fixes and the two null-memory errors since 1.1.0), so the next release can be
   1.1.1. Its `npm` job and provenance read-back are the proof of steps 2 and 3.

Then the README gains the npm install route (binaryang did this once the package was on npm).
