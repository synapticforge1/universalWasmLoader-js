# release.md — how a release runs, and every release (newest first)

🔒 Owner, 2026-11-10 (workspace `release-process.md` §§ 5–8, letter H33): ONE record of releases in
every project — this file, § "Release History", newest first, a summary of what changed in each.
The older records were moved here from `overview.md` (§ Release flow's "Published" paragraph) and
`npm.md` (the release table) on 2026-11-10; those places now point here.

## How a release runs (the owner's order, 2026-11-10)

"The CI to check first, then push the tag, and then create the release page from the tag, then
publish the package to the registry." The owner's words (`working-rules.md` § Owner commands):
"release" = "push" (memory, commit, merge into `main`, push) and then the steps below.

| Slot | Here |
| --- | --- |
| U1 the go and the level | the owner's; `bun run bump` has NO default level |
| U2 merge first | release notes / memory merged into `main` first; `bun run bump <level>` makes the `bump to vX.Y.Z` commit itself, touching only `jsr.json` |
| U3 the bump tool | `scripts/bump.ts`: refuses an unclean tree (untracked files count), a stale `api-surface.json`, a level below the floor (`compat.ts`: the surface diff and the SPEC version since the last tag), and red previous-tag tests for a patch / minor |
| U4 the release script | `bun run release` (`scripts/release.ts`): clean tree; on `main`, HEAD = `origin/main` + exactly the bump commit; the tag absent here and on `origin`; JSR 404 and npm's `time` without the version; `gate` + `compat --release` + the JSR dry run; then `git push origin main` ONLY, read back with `ls-remote`. No tag, no `tag -f`. `--dry-run` = guards only |
| U5 `checks` | `publish.yml` on every push to `main`: "is this a release?" (jsr.json's version untagged, or tagged on THIS commit = a re-run); if so the full gate, `compat --release`, the release self-test, `npm:prove` (+ the `dist/` digest), both registries free, the JSR dry run on the exact sparse tree the `jsr` job publishes |
| U6 `tag` | `scripts/github-release.ts tag` (fetched alone): the annotated tag on this commit through the REST API; existing here = done; elsewhere = refused; read back |
| U7 `release` | `github-release.ts page`: the page FROM the tag, H32's order, the JSR + npm links on top, BEFORE the publish |
| U8 `jsr` / `npm` | `jsr`: the sparse published tree, pinned Deno, nothing installed, skip if JSR has it, Rekor read-back fatal. `npm`: pinned Node (npm 11.19.0) + Bun, `build.ts` must reproduce checks' digest (the stand-in for an artifact: no `uses:` here), skip if npm has it, provenance read-back fatal (10 min) |
| U9 pins | no `uses:`; Bun 1.4.4, Deno 2.9.8, Node 24.21.0 by version + sha256 (each matched to a second source); `concurrency` per ref, never cancelled |
| U10 as a user | `npm install …@X.Y.Z` in a scratch folder WITH its own `package.json` (best-practices L5), load `math_50`, see the refusals |
| U11 record | this file |
| U12 failure | "Re-run failed jobs": every job skips what is done (tag here, page there, version served) — never a new tag for the same code, never a moved tag |

**Measured locally 2026-11-10, NOT yet on GitHub:** `release:selftest` 24 checks (tag + page),
six one-line mutants each caught by its own checks; `tag` / `page` `--dry-run` alone against the
real GitHub (v2.0.2 found, a wrong commit refused, an absent tag refused); the "is this a release?"
classification on the real tags (released / rerun / new); the sparse JSR tree passes `deno publish
--dry-run` with nothing installed, and a planted type error fails it; a rehearsal against a scratch
bare `origin` — `bump` refuses no level and an untracked file, then commits `bump to v2.0.3`;
`release.ts` refuses a tag on origin, a local tag, JSR serving the version, npm having had it, an
untracked file, a commit on top of the bump, a branch other than `main`; the real run (full gate)
pushed `main` with the bump commit and NO tag. ✅ **Measured on GitHub by 2.0.3 (2026-11-10, run
42849918410):** every job green in this order; JSR and npm accept OIDC from a run started by a push
of `main`; the tag made by `GITHUB_TOKEN` started no run (one Publish run for the commit). The
non-release path was measured the same day on `a69c7fa` (run 42849639914: `checks` green, the rest
skipped). Still not exercised on GitHub: a re-run of THIS workflow (each job's skip) — JSR's
"already has the version" skip has never been needed.

## Release History

### 2.0.3 — 2026-11-10 (SPEC 4.0.1)

**What changed:** no code or API change. SPEC 4.0.1 — § 11.1's port allowance for a zero-value
options type (Go's `LoadOptions{}` = the 30 s default; the owner's "adjust for go", ledger C35);
README's Publishing section describes the new release order. The release itself is the FIRST in
the owner's order (2026-11-10, H33): `bump` → `release` pushes `main` only → CI checks → CI tags →
the page → JSR ∥ npm.

Owner: "release", level patch (asked, answered). `bump to v2.0.3` `15388fd` (bump: floor patch,
v2.0.2's tests 73/73); `bun run release` pushed `main` only (gate, compat --release and the JSR dry
run green locally; no tag). **Publish run 42849918410, green in every job, in the owner's order**
(times UTC, from the Actions API): `checks` 15:58:21–15:58:37 (a release; both registries free; the
JSR dry run on the sparse tree) → `tag` 15:58:46, the annotated tag `v2.0.3` (object `bc50aae`) by
`github-actions[bot]` on `15388fd` → `release` 15:58:55, the page by `github-actions[bot]`, not a
draft, `releases/latest`, the JSR + npm links on top; no `release/v2.0.3` branch (404) → `jsr`
15:59:00–15:59:15 and `npm` 15:59:00–16:02:02 (npm's provenance visible after about 3 minutes).
**Measured for the first time:** JSR and npm both accept OIDC from a run started by a push of
`main`; CI's REST-made tag; the JSR publish of the sparse tree with nothing installed. Read back:
JSR rekorLogId 3789195211, latest 2.0.3, score 100, its 11 stored files byte-identical to the tag
(`_meta.json` sha256); npm SLSA v1, latest 2.0.3, 11 files = the tag; a fresh `npm install` (in a
scratch package) loads `math_50` and refuses `add("x", 1)`, `imports_50` without callbacks and a
callback returning `undefined`. CI 42849918344 green.

### 2.0.2 — 2026-11-09 (SPEC 4.0.0)

**What changed:** no shipped file — the same code and docs as 2.0.1 under a new number. The release
itself: the GitHub Release page in H32's order (an existing page = no write, the tag peeled again,
a 30 s limit per request, the JSR + npm links on top, no checkout in the `release` job) and the npm
provenance wait raised to 10 minutes.

`Release v2.0.2` `1c840d2` = tag `v2.0.2` (owner: "update the project memory files, commit, push
and release"); publish run 42663185314, green in every job (npm's provenance visible after 77 s).
Page by `github-actions[bot]`, not a draft, `releases/latest`; `release/v2.0.2` at the tag. JSR
rekorLogId 3767290265, score 100; npm SLSA v1, 11 files = the tag; a fresh install loads and
refuses.

### 2.0.1 — 2026-11-09 (SPEC 4.0.0)

**What changed:** README only (the publishing flow as it is; the release self-test listed). The
release was the first run of the reworked `publish.yml`: no `gh`, every tool pinned by sha256, the
publishing jobs run nothing third-party, recoverable uploads, npm "free" read from `time` (letters
H30, C30, C34).

`Release v2.0.1` `771ac03` = tag `v2.0.1` (owner: "release"); publish run 42633902729: `verify` /
`jsr` / `release` green, `npm` published but its provenance read-back timed out at 3 minutes; the
owner's "Re-run failed jobs" (attempt 2) turned it green — the npm skip measured for the first time
(0 s, no second upload). JSR rekorLogId 3766026937, score 100; npm SLSA v1, 11 files = the tag; tag,
`release/v2.0.1` and the page read back; a fresh install loads and refuses.

### 2.0.0 — 2026-11-07 (SPEC 4.0.0, a major)

**What changed:** loud failures instead of silent ones ([spec-4.0.0.md](spec-4.0.0.md)) — only an
ABSENT `.wit` gives raw exports, every other `.wit` failure throws; strict WIT parsing; every WIT
import needs a host callback and its return value must match the WIT result; typed calls check
their arguments; a 30 s default time limit per http(s) fetch with `{ timeoutMs, signal }`.

`Release v2.0.0` `1169ab9` = tag `v2.0.0` (owner bumped, then "tag it first", then push); publish
run 42394507328 green (verify → JSR ∥ npm → page), CI 42394504835 green. JSR rekorLogId
3742189142, score 100; npm SLSA v1, 11 files = the tag; a fresh `npm install` on Node 24 loads
`math_50` and refuses `add("x", 1)`, `imports_50` without callbacks, a callback returning
`undefined`.

### 1.1.2 — 2026-10-26 (SPEC 3.0.0)

**What changed:** an HTTP error on the `.wasm` is reported as one (`wasmImport: HTTP <status> for
<url>`) instead of being masked by a swallowed `instantiateStreaming` failure and a second download.

`Release v1.1.2` `7b62387` (owner: "push and release the next version"); publish run 40380578962 —
verify → JSR ∥ npm → page, the first full run of the one-run design. JSR rekorLogId 3493886393,
score 100; npm SLSA v1, 11 files = the tag; a fresh install reports a 404 as one.

### 1.1.1 — 2026-10-21 (SPEC 3.0.0)

**What changed:** the `checkJs` fixes and two clear errors for a string import / WASI call before
the module's memory exists (they crashed with a bare `TypeError`). The first release from the
`synapticforge1` organization, and the first npm release by trusted publishing.

`Release v1.1.1` `b706cc6`; publish run 39691735587 published JSR (rekorLogId 3367515417) but
skipped npm (a switch that was off); npm 1.1.1 came by the recovery dispatch, run 39697206534, with
provenance ([npm.md](npm.md) § "1.1.1"). Both 11-file packages = the tag.

### 1.1.0 — 2026-10-12 (SPEC 3.0.0)

**What changed:** the first release from the Bun toolchain; SPEC §10 (`_initialize` called, a
minimal WASI-P1 shim always supplied); local `file:` loads work on Node (Node's `fetch` refused
them). npm 1.1.0 was published by hand on 2026-10-21 (no provenance — the package had to exist
before its trusted publisher).

JSR rekorLogId 3232619821, score 100 ([bun-migration.md](bun-migration.md)).

### 1.0.8 and earlier

On JSR only, as `@jrmarcum/universal-wasm-loader` (renamed 2026-06-15 from
`@jrmarcum/universalwasmloader-js`); 1.0.8 scored 100 with provenance from the `run:`-only
workflow. The 3.0.0 SPEC change (the Canonical ABI's callee-allocated string returns) landed in
2026-06; details in `git log` and `git show f3da283:CLAUDE.md` (the pre-2026-10-12 archive).
