# review-process.md — this repo's slots in the workspace review standard

🔒 **Owner, 2026-11-12 (workspace letter H35):** "accept the review process and make it a standard
for all projects. each project may have differing individual issues, but the overall process should
be the same." **The process is the workspace's `../../cmem/review-process.md`** — read it before
any review; it is not repeated here. This file holds only what differs per project: this repo's
slots (its § 7), written 2026-11-13. **No review has been run under this process yet** (§ 9).

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
  - The self-tests: `compat:selftest` 26, `release:selftest` all checks, `reviews:selftest` 23.
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
never looked for. Proof (2026-11-13): `bun run reviews:selftest` 23 checks, in CI's `gates`; eight
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

No review has been run under this process (2026-11-13). The first is due before the next release:
a hardening review (which includes the security review and the review) on `v2.0.3..HEAD`.

| # | date | review / round | class | finding (file:line, scenario, run or reasoned, severity) | fix, test, inversion — or why not fixed |
| --- | --- | --- | --- | --- | --- |
