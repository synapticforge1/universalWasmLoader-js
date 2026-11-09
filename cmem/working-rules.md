# Working rules — the checklist for every change

Rules, not lessons (the lessons are [best-practices.md](best-practices.md)). The workspace floor is
`../../cmem/working-rules.md`; where this file is silent, the floor applies. Written 2026-10-12
(letter H6).

## Git

- **Branch → gate → `merge --no-ff` to `main`**, docs and memory in the same commit as the code
  they describe. Commit granularity is decided before editing (no hunk staging here).
- **Messages go through a file**: `git commit -F <file>` written with `Write`; never a heredoc,
  never `-m` with backticks or `$`.
- **Nothing is pushed, tagged or published unless the owner says so.** The `jsr.json` version line
  stays at the released version until a deliberate `bun run bump`.
- **Prefer a new commit over `--amend`.** Never `git checkout <file>` to drop a probe; copy aside.

## The gate

- **The local gate is CI's gate**: the `gates` steps of `.github/workflows/ci.yml` —
  `bun run check`, `manifest`, `surface --check`, `fixtures`, `compat:selftest`, `compat`, `browser`, `test`, `npm:prove`,
  `lint`, `publish:dry` — plus the `runtimes` matrix (`bun run test:node` with a Node on PATH,
  `test:deno`; `bun run lts` for every Node LTS line). Run on the COMMITTED tree, after the last edit.
- **Diff the output, not the exit code**: 73 tests on every runtime (2026-11-07; 28 from 2026-10-26, 24 from 2026-10-12); a lower count is a
  failure even at exit 0.
- **Every bump goes through `bun run bump`** (gated, [compat-gate.md](compat-gate.md)). An intended
  surface change re-baselines `api-surface.json` in its own commit, with the reason, first.
- **Invert every new test or gate** before trusting it, in a scratch copy where possible.

## Tooling (workspace hard rules, 🔒 2026-09-19/20; Bun form since 2026-10-12)

1. **Scripts are TypeScript on `node:` builtins**, run by `bun run` (and runnable on Node and Deno).
   Never `Bun.*` or `Deno.*` in scripts or shipped code; `tsc` (`types: ["node"]`) enforces it.
   No Python, no shell / PowerShell / `.bat` scripts; ad-hoc probes are `.ts` files in the session
   scratchpad. CI YAML `run:` steps are the one accepted shell.
2. **No heredocs, ever**, for any content: not `<<'EOF'`, not `@'…'@`, not `node -e` / `bun -e`.
   Content goes through `Write` / `Edit`.
3. **Use the dedicated tools** (`Grep`, `Read`, `Edit`, `Write`) for matching and editing content.
4. **Read back** the lines a scripted edit changed; "0 replacements" is a failure.
5. **When the exit code IS the measurement, do not pipe**: redirect to a file, then read the code.
6. **Line endings are LF**, pinned in `.gitattributes` wildcard-first; verify with `git check-attr`.
7. **Never run a formatter on `cmem/`** or on `tests/` fixtures.
8. **`.github/workflows/*` use `run:` steps only** — under the old `jrmarcum` owner the Actions
   policy turned any `uses:` into a `startup_failure`; the `synapticforge1` organization (since
   2026-10-21) has "the same policy as before, and … as was used with binaryang" (owner), and
   `run:` works under any policy ([overview.md](overview.md) § Release flow).
9. 🔒 **No `gh`, in CI too** (owner, 2026-11-08, letter H30): check the repo instead (`git
   ls-remote`, the repo's files, registry APIs); a workflow talks to GitHub through its REST API
   from a Bun step with `GITHUB_TOKEN` (`scripts/github-release.ts`); a web-UI task is an OWNER
   item, never "blocked on gh".
10. 🔒 **A publishing job runs nothing it does not have to** (owner, 2026-11-09, ledgers C30 /
    C34): a job holding `id-token: write` runs no installer script, no dependency code (`bun
    install` only with `--ignore-scripts`), no tests and no build of its own; every clone is
    token-less; every tool is downloaded by version and checked by sha256, each pin matched
    against two sources (our own hash + the publisher's sums or GitHub's release digest). A pin
    is changed only that way, never copied from memory. `scripts/check-github-release.ts` checks
    the release step ([overview.md](overview.md) § Release flow).

## Boundaries

- **Never write into a sibling repo.** Findings about a sibling go to the owner (and the workspace
  letters); [open-work.md](open-work.md) § "To hand over".
- **Machine facts** (exFAT `safe.directory`, long paths, PowerShell's UTF-8 BOM) live in the
  workspace's `cmem/local/environment.md` and this repo's gitignored `cmem/local/`, never in a
  committed file. The traps that shaped a tool are recorded beside the tool.

## No secrets or personal information (🔒 owner, 2026-10-22/23/26; letters H18, H22, H28)

- **The path test is "is it machine-specific?", not "is it absolute?"** Not public: any path that
  records the owner's own machine layout — a user profile, the project tree, other drives, scoop /
  AppData installs, scratchpad or session ids. Fine: repo- or sibling-relative paths, env vars,
  placeholders (`<repo-root>`), and a convention path that names nothing about one machine. A scan
  hit is a CANDIDATE judged by that test. Full rule: `../../cmem/working-rules.md` § Records.
- **No secrets** (tokens, keys, passwords) in any committed file, commit message, package or issue.
- **One maintainer contact address**, allowed only in a registry manifest's maintainer field, as
  the commit author/committer address, and in ONE committed `cmem/` contact note. This repo uses
  only the commit address: neither `jsr.json` nor the npm manifest carries an email, and no
  `cmem/` note names one (checked 2026-10-26).
- **Scan before committing memory, binaries included** (`git grep -a`, not `-I`: DWARF in a
  `.wasm` carries build paths). 2026-10-26: no hit at HEAD in text or binary files; H25 measured
  no drive path in any commit of any ref, so no history purge is needed here.
- `.claude/settings.local.json` is per-machine and gitignored (2026-10-26, H25 (b)'s lesson).
