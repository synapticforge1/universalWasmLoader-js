# review-process.md — this repo's slots in the workspace review standard

🔒 **Owner, 2026-11-12 (workspace letter H35):** "accept the review process and make it a standard
for all projects. each project may have differing individual issues, but the overall process should
be the same." **The process is the workspace's `../../cmem/review-process.md`** — read it before
any review; it is not repeated here. This file holds only what differs per project: this repo's
slots (its § 7), written 2026-11-13. The first review ran the same day: § 9 (14 findings, open).

## 1. The owner's words (workspace § 0; the commands are in [working-rules.md](working-rules.md))

- **"review"** — a targeted agent code review (workspace § 2), in rounds.
- **"security review"** — the seven surfaces (workspace § 3, § 4 below) AND the "review".
- **"hardening review"** — the seven axes (workspace § 4, § 5 below) AND the "security review" AND
  the "review".
- **"efficiency review"** — OPTIONAL, never required for a release; only AFTER the security and
  hardening reviews (workspace § 8, § 8 below).

🔒 **The tiers nest** (owner, 2026-11-13): each round of a tier briefs reviewers for every layer it
includes, and the round is empty only when all of them find nothing. 🔒 **One class at a time**
(owner, 2026-11-13): a round's findings are grouped into classes; one class is fixed, retested for
THAT class by fresh reviewers until a round finds none of it, and only then the next class; a
finding of another class met on the way is recorded and queued. 🔒 **A security review and a
hardening review are required before every release**, each run to its empty round on everything
since the last release (`git log <last tag>..HEAD`), recorded in that release's entry in
[release.md](release.md) BEFORE the bump — `bun run bump`, `bun run release` and CI refuse without
it (§ 7). A review never commits, pushes or releases.

## 2. The floor's slots (workspace § 1)

- **Private data a reviewer never reads** (§ 1.1, § 5's brief): `cmem/local/` (gitignored machine
  facts), `.claude/settings.local.json`, and the workspace's `../../cmem/local/`. The repo has no
  client data. A reviewer works in its own scratch folder under the system temp folder; the
  gitignored `.compat/`, `.npm-src/`, `.test-tmp/` and `dist/` are the tools' own and are not
  written by a reviewer.
- **The worst silent case** (§ 1.2): **a call through the typed proxy that returns a WRONG value
  with no error** — a string, bool or number lifted or lowered wrongly by `abi.js` (pointer /
  length arithmetic, a missing `cabi_post_<name>`, a host callback's result coerced instead of
  refused). Nine ports copy this implementation, so a wrong reading here is a wrong reading in ten
  languages. Next: a `.wit` that failed to load or parse treated as absent (raw exports handed back
  as if the module had none — the SPEC 4.0.0 class); then a SPEC.md sentence that the code does not
  do, since the ports are written from SPEC.md.
- **The reference results that must still hold after every group of fixes** (§ 1.3.4) — each a
  command, the number re-derived on the day it is quoted (measured 2026-11-13, Bun 1.4.4, Windows):
  - `bun run gate` green; **73 tests** in `tests/loader.test.js` on Bun, and the same 73 on Node
    (`bun run test:node`; `bun run lts` for every LTS line) and Deno (`bun run test:deno`). A lower
    count is a failure at exit 0.
  - `bun run fixtures`: **12 fixtures match the stamp** (wasmtk `4a5c3cf668d`) — the bytes all ten
    loaders share; a review NEVER changes them ([fixtures.md](fixtures.md)).
  - `bun run surface --check` (`api-surface.json` current) and `bun run compat` (the floor since
    the last tag; that tag's tests on today's source). A surface change is a finding until it is
    intended, and then a re-baseline in its own commit ([compat-gate.md](compat-gate.md)).
  - The self-tests: `compat:selftest` 26, `release:selftest` all checks, `reviews:selftest` 68
    (23 until the class F fixes of 2026-11-13; it needs `git` and builds a scratch repository).
  - `bun run npm:prove` (the tarball built, packed, installed, run: 11 files) and `bun run
    publish:dry`.
  - By hand, not a gate: the browser run, 58 of the 73 ([open-work.md](open-work.md)).
- **CI** (§ 1.5): `ci.yml` on every push — `gates` (ubuntu-latest, Bun 1.4.4) and `runtimes`
  (Node 22.18 floor, 22, 24, 26; Bun 1.4.4; Deno 2.x), all Linux x86_64. `publish.yml`'s `checks`
  on a push of `main`. Local: Windows x86_64. **No CI job runs on Windows or macOS**; browsers are
  by hand. CI's run on the pushed commit is part of done, and waits for the owner's "push".
- **Classes for a class-by-class review** (§ 2.2) — the "look for code issues" audit's four, plus
  two this repo has paid for: (1) wrong ABI marshalling; (2) silent fall-throughs (a default
  instead of an error); (3) workarounds still or no longer needed; (4) dead code; (5) SPEC.md /
  README / `.d.ts` saying what the code does not do; (6) runtime differences (Bun / Node / Deno /
  browser: `fetch`, `file:` URLs, streaming compile).

## 3. Review areas (workspace § 2.1 — cut along the risk)

A full-project round uses these four, one reviewer each: **(a) the ABI** — `abi.js`, `wasi.js`
and their `.d.ts`; **(b) loading** — `universal-wasm-loader.js`, `wit-parser.js`: paths, URLs,
`fetch`, the time limit, the `.wit` absent-vs-failed rule, `@N` pins, `createSingleton`,
`InstancePool`; **(c) the release path** — `scripts/`, `.github/workflows/`, `jsr.json`,
`scripts/npm/`; **(d) the claims** — `tests/loader.test.js` (can each test fail for the reason it
names?), `SPEC.md`, `README.md`, the `.d.ts` against the code. A change review takes the areas the
commit range touches.

## 4. The seven security surfaces here (workspace § 3.1)

1. **Untrusted input runs nothing and loads nothing beyond itself.** The inputs: a `.wasm` module
   (it RUNS, by design, inside the WebAssembly sandbox), its companion `.wit` (text, parsed, never
   evaluated), a path or URL, and the host callbacks' return values. What a hostile module can
   reach is exactly its imports: the caller's host callbacks and the WASI shim (`wasi.js`:
   `fd_write`, `proc_exit`, `random_get`, `clock_time_get`, empty `environ` / `args`, no `path_*`
   or file access — re-read the file before relying on this list). Attack: a `.wit` or module that
   makes the loader fetch, import or evaluate something else; `proc_exit` ending the HOST process;
   `fd_write` with hostile pointers / lengths reading outside the guest's memory view.
2. **Malformed input is a refusal by name.** A truncated or hostile `.wasm`, a malformed `.wit`, a
   `.wit` that disagrees with the module's exports, a wrong-typed argument, a callback returning the
   wrong kind — each throws an error that names it (SPEC 4.0.0), never a bare `TypeError`, never a
   guessed value. Guest-supplied pointers and lengths (a returned `[ptr,len]`, `cabi_realloc`'s
   result) are untrusted numbers.
3. **Archives and paths.** The loader writes nothing. A relative string path resolves against the
   loader's own URL (🔒 [design-decisions.md](design-decisions.md)); the `.wit` URL is derived from
   the `.wasm` URL — check that it cannot be steered to another origin or file. The scripts write
   only the gitignored `dist/`, `.npm-src/`, `.compat/`, `.test-tmp/`, and `jsr.json` /
   `api-surface.json` on their own commands; a refused `bump` or `release` writes nothing.
4. **Resources.** Every http(s) fetch has a 30 s default limit and an abort signal (SPEC § 11);
   every script request has its own limit (best-practices 7.21). UNMEASURED and to be attacked: a
   huge `.wit` (parser time), a huge or never-ending `.wasm` body, a guest that grows memory
   without bound or never returns — the loader has no limit on guest run time (a synchronous call
   cannot be interrupted in JavaScript), which is a written limit, not a defect, if the docs say so.
5. **The release path.** [release.md](release.md) § "How a release runs" and
   [working-rules.md](working-rules.md) Tooling 8–11: publishing only from CI, OIDC provenance read
   back from both registries, tools pinned by version + sha256, no `uses:`, top-level
   `permissions: {}`, token-less clones, no `gh`, the publishing jobs run nothing third-party.
6. **Dependencies.** The shipped package has NONE (`jsr.json` and the built npm manifest name no
   dependency — check both at each review). Three dev dependencies, pinned in `package.json` and
   `bun.lock`: `@biomejs/biome`, `@types/node`, `typescript`; `bun audit` at each review; the
   package is MIT and ships no third-party file — check at each review that what each registry
   serves carries or names the licence.
7. **Privacy.** No secret, personal datum or machine path in any committed file, message or package
   ([working-rules.md](working-rules.md) § No secrets). The scan covers every commit of every ref,
   binaries included (`git grep -a` over `git rev-list --all`; a `.wasm` can carry build paths) —
   0 hits on 2026-11-13 over 104 commits.

Run on planted hostile inputs, measured, on every runtime line that will run it (Bun, Node, Deno;
the browser path where the finding is about `fetch` or streaming compile).

## 5. The hardening environment matrix (workspace § 4.1)

- **Runtimes:** Bun 1.4.4 (🔒 also stands for Safari: JavaScriptCore); Node 22.18 (the floor), 22,
  24, 26; Deno 2.x; browsers by hand — Chrome, Edge, Firefox, Firefox ESR.
- **OS:** Linux x86_64 (CI), Windows x86_64 (local). macOS: unmeasured, named as such.
- **From the artifact users get:** the npm tarball installed into a scratch folder WITH its own
  `package.json` (`bun run npm:prove`; U10 after a release) and the JSR package (`deno publish
  --dry-run` on the exact sparse tree; after a release, JSR's stored files against the tag) — not
  the working tree.
- **Limits written down by name** (axis 3): README and SPEC.md say what the loader refuses; each
  refusal in the code has its sentence there, and the reverse.
- **CI's half:** the Linux runs of all six runtime lines, and everything in `publish.yml`.

## 6. Records (workspace § 6)

| what | where |
| --- | --- |
| each finding: what, measured, the class, the fix, the test, the inversion — and what was found and NOT fixed, with why | **§ 9 below**, one row `#n` each |
| the round: reviewers, scope, counts, what is next | [open-work.md](open-work.md) |
| the release's security and hardening reviews: the rounds and the empty round that ended each | [release.md](release.md), in that release's entry, BEFORE the bump (§ 7) |
| a claim found wrong (memory, docs, a commit) | corrected where it stands, marked 🔁 with the date and the row |

Commit messages name the round and the rows: `Review <scope>, round <n>: … (#a–#b)`.

## 7. "release" checks the record (workspace § 7.3)

`scripts/release-record.ts` (`bun run reviews [X.Y.Z]`) reads [release.md](release.md): the
`### X.Y.Z` entry must hold one paragraph starting `**Security review` and one starting
`**Hardening review`, each saying **"empty round"** and neither saying it is still to do (pending,
TODO, TBD, not yet, not run, not done). It checks that the record exists, not that the review was
good. Three places run it:

- `bun run bump <level>` — for the version it is ABOUT to write, before it writes anything;
- `bun run release` — for the version in `jsr.json`, before the gate;
- `publish.yml` `checks`, on a new release — so a hand-edited `jsr.json` pushed to `main` is
  stopped before the tag.

A nested review meets both records: a hardening review run to its empty round is also the security
review, and the `**Security review` paragraph says so and names that round. An efficiency review is
never looked for. Since the class F fixes (§ 9 #14) the command also refuses, in one named line,
an unreadable record or `jsr.json`, a version that is not X.Y.Z and a second argument; `bump` runs
the check BEFORE its compatibility gate; and the self-test (68 checks) runs the script as a
process, through a link, and runs `bump` (all three levels) and `release` (both ways) in a scratch
git repository. Proof as first written (2026-11-13): `bun run reviews:selftest` 23 checks, in CI's `gates`; eight
one-line mutants of the check, each caught (the unfinished words, the empty-round rule, the
version-heading boundary, a mention inside another paragraph, the entry's end, a duplicate, a
missing paragraph, a missing entry); `bun run bump patch` on the committed tree refused "no
`### 2.0.4` entry" and wrote nothing; in a scratch clone, an entry with only the security
paragraph → `bump patch` refused "no `**Hardening review` paragraph", `jsr.json` untouched, and
with both paragraphs → `bump to v2.0.4` committed, `jsr.json` only; `bun run reviews` on 2.0.3 (released before the rule) is
refused, as it should be. NOT yet measured: the `publish.yml` step on GitHub — the next release.

## 8. Efficiency review (workspace § 8; optional)

- **Benchmarks: none committed** (2026-11-13). The numbers that exist: the suite's wall time (73
  tests in about 0.7 s on Bun 1.4.4, Windows — a test time, not a benchmark) and the shipped size
  (the four `.js` files, 36,162 bytes together, not minified). An efficiency review's first job is
  a committed benchmark: load + first call of `math_50`, `strings_50` (string in / out) and
  `imports_50` (callbacks), per runtime, and `InstancePool` under load.
- **Thresholds** (this session's proposal, the owner's to change): (a) a regression is more than
  10 % slower, or more than 5 % larger shipped size, than the last release on the same machine and
  runtime; (b) a hot spot is a measured ≥ 10 % of a load-and-call's time with a fix shown to work.
- **Where the numbers go:** a `cmem/benchmarks.md`, created by the first efficiency review; the
  release's entry when one is run before a release.
- An efficiency fix never weakens a refusal: every SPEC 4.0.0 check and the time limit stay.

## 9. Findings ledger

The first review under this process: a "review" (change review) of `v2.0.3..HEAD` (`504532a`),
2026-11-13. Round 1: three reviewers (the record check and its self-test; its wiring into `bump`
/ `release` / the workflows; the claims in the changed docs and memory). The wiring reviewer found
no defect. Every row below was re-verified by a run by the author the same day. **Scope and order
are the owner's** (workspace § 1.5: "F first", 2026-11-13); the classes are fixed one at a time —
class F is in progress (#14), every other row is open.
Still due before the next release: a hardening review (which includes the security review and the
review) on everything since `v2.0.3`.

Classes: **A** the record check passes a review that is not recorded as finished (silent);
**B** the record check refuses a correct record (loud); **C** a self-test that cannot fail for
the reason it names; **D** a claim the code or SPEC.md does not support; **E** a network request
with no time limit; **F** cosmetic.

| # | date | review / round | class | finding (file:line, scenario, run or reasoned, severity) | fix, test, inversion — or why not fixed |
| --- | --- | --- | --- | --- | --- |
| 1 | 2026-11-13 | review, r1 | A | `scripts/release-record.ts:59` — "empty round" is a bare keyword: "there was no empty round", "in progress, empty round expected", "to do; empty round" each pass. RUN. Silent, but needs a record that contradicts itself | open |
| 2 | 2026-11-13 | review, r1 | A | `release-record.ts:33` — the FIRST `### X.Y.Z` line wins, fences ignored: a fenced numeric example with both paragraphs ABOVE the real, unreviewed entry passes. RUN. Silent, low likelihood (today's template heading is `### X.Y.Z`, not a number) | open |
| 3 | 2026-11-13 | review, r1 | B | `release-record.ts:59` — a correct record hard-wrapped between "empty" and "round" (or with two spaces) is refused; entries wrap at ~100 columns, so this is LIKELY at the first real release. RUN. Loud | open |
| 4 | 2026-11-13 | review, r1 | B | `release-record.ts:28` — the unfinished words match anywhere in the paragraph: "reviewers did not run the browser half; round 2 was the empty round" and "nothing pending" are refused. RUN. Loud | open |
| 5 | 2026-11-13 | review, r1 | B | `release-record.ts:36`, `:48` — a `# comment` line inside a fence ends the entry early; a review paragraph without a blank line before it, or written as a list item / blockquote, is "missing". RUN by the reviewer. Loud | open |
| 6 | 2026-11-13 | review, r1 | C | `scripts/check-release-record.ts` — three mutants survive 23 / 23: dropping `tbd`, `not run`, `not done` from the list; removing the `i` flag of `/empty round/i`; an entry not ended by a level-1 heading. No check covers a wrapped phrase, a fence, or two entries for one version. RUN by the reviewer (the author's 8 mutants did not include these) | open |
| 7 | 2026-11-13 | review, r1 | D | [spec-4.0.0.md](spec-4.0.0.md) § Port readings, the -go (a) row — "range-checked integers (-go, -js) is the floor" is WRONG: `abi.js:27-31` takes only an integer `number` for `s32` and only a `bigint` for `s64` (`add(1n, 2)` → TypeError, RUN), so -js is on the exact-kind side with -dotnet and -zig; and "Accepted" for -go contradicts row 1's "the letter" (§ 4's Ports column: "the language's 32-bit integer"). The same answer is in workspace ledger row C47 (a 🔁 caution was added there 2026-11-13). Highest of class D: ports read it | open — the -go (a) reading should be "open, the owner's ruling", not accepted |
| 8 | 2026-11-13 | review, r1 | D | the same table, -dotnet (c) / -go (d) row — "Accepted" cites § 11 and § 7.8 but not § 7.1's MUST ("the same logical signature … `options?`") nor § 11.4. READ. The answer is arguable; its stated basis is incomplete | open |
| 9 | 2026-11-13 | review, r1 | D | § 2 above — "`bun run npm:prove` (… 11 files)": it prints **12 files** (RUN; [npm.md](npm.md) says 12 — the tarball has `LICENSE`; "11" in release.md's history is the tag's files) | open |
| 10 | 2026-11-13 | review, r1 | D | § 4 above — "every script request has its own limit" is false (row 13); the `wasi.js` list omits `fd_close`, `fd_fdstat_get`, `fd_seek` (stubs; "no file access" holds); "the loader writes nothing" ignores `fd_write` → the host console; "pinned in `package.json`" — `@types/node` is `~22.18.0` (exact only in `bun.lock`). READ / RUN | open |
| 11 | 2026-11-13 | review, r1 | D | stale beside the change: [overview.md](overview.md) § Release flow, [working-rules.md](working-rules.md) § The gate ("Every bump…") and `CLAUDE.md` item 2 describe `bump`'s gate without the review record; the "104 commits" scan count is 107 after this session's three commits (dated, so labelled) | open |
| 12 | 2026-11-13 | review, r1 | D | README § Publishing names `cmem/release.md`, which is in neither package (GitHub only); [release.md](release.md) § "An entry's shape" does not warn that an unfinished word ANYWHERE in a required paragraph refuses the release (row 4) | open |
| 13 | 2026-11-13 | review, r1 | E | `scripts/check-lts.ts:59`, `scripts/npm/prove.ts:230`, `:236` — `fetch` with no time limit (workspace best-practices 7.21); code older than the reviewed range, found through row 10. READ + grep. A stalled server hangs `bun run lts` / `npm:prove` (and CI's and `publish.yml`'s `npm:prove` step) until the job's own limit | open |
| 14 | 2026-11-13 | review, r1 | F | `release-record.ts:69`, `:75` — a missing `cmem/release.md` or `jsr.json` ends in a stack trace (non-zero exit: fails safe); `bump` prints the compat report before the review refusal; `bun run reviews` with no argument is red on a released version that predates the rule (2.0.3) | **in progress, not cleared** (owner: "F first"; paused 2026-11-13; committed and pushed that day on the owner's word, as work in progress). Fixed on `review-r1-fixes`: named refusals for an unreadable record / `jsr.json`; the record check before the compat gate in `bump`; a neutral "(checked: X, the version in jsr.json…)" line. Class retests 1–4 each found more, all fixed: the hint said "nothing to do"; malformed versions and `null`; the script never run as a process by its self-test (3 mutants survived); exit 0 under Node through a link (`sameProgram`, real paths); `bump` / `release` callers untested (now run in a scratch git repo, all three levels, `release` both ways); two arguments. Self-test 23 → 68 checks; 23 mutants caught on Bun (the link one first inverted on Node 22). Retest 5 started, result unread — see [open-work.md](open-work.md) |
| 15 | 2026-11-13 | review, class F retest 3 | F (older code) | `scripts/compat.ts:207`, `surface.ts:160`, `github-release.ts:219`, `regen-fixtures.ts:40`, `npm/build.ts:107` — the plain `isMain` comparison: under Node through a symlink or junction the script does nothing and exits 0 (RUN for `release-record.ts` before its fix; READ for these five). Not exposed today: every one is run by Bun, which does not resolve the link | queued — not in the reviewed range |

Reasoned and NOT a finding: a tag pushed by hand on an unchecked commit makes `publish.yml` read
"rerun" and skip the record check — it needs the owner's own tag push, which no tool here makes.
