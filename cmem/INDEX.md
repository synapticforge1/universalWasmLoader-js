# cmem — Portable Project Memory for universal-wasm-loader

This folder is the **authoritative, portable project memory** for `universal-wasm-loader`. It lives
inside the project tree, so it travels with the repo and is committed to git (unlike a machine-local
`CLAUDE.md`). Keep files small and single-topic — one focused topic file per domain.

## Policy

- **`cmem/` is the single home for ALL project memory.** When the owner (or anyone) says "**update
  the project memory**," update the matching `cmem/` topic file with the latest decisions, found
  bugs, design changes, and current state — then add/refresh its one-line pointer in the table below.
  Convert relative dates to absolute; update existing entries rather than duplicating.
- **`README.md` and `SPEC.md` are NOT project memory.** They are the public, user-facing docs (how to
  use the loader; the cross-language conformance spec). Keep internal decision logs / bug
  post-mortems out of them — those live here in `cmem/`.

### The "update the project memory" trigger (binding on every agent)

When the owner says **"update the project memory"** (or any clear synonym — "update memory", "record
this", "remember this for the project"), the required action is BOTH of:

1. **Revise all relevant `cmem/` files** — fold the latest decisions, found bugs, design changes, and
   current state into the matching topic file(s); refresh the one-line pointer in the Files table;
   convert relative dates to absolute; update existing entries instead of duplicating.
2. **Sync `README.md` / `SPEC.md` where, and only where, the change is user-relevant** — i.e. update
   the user-facing API surface, usage, the conformance spec, and status so they *match* the new
   reality. Do NOT copy internal decision logs / bug post-mortems into them.

### The "look for code issues" trigger (binding on every agent)

When the owner says **"look for code issues"** (or a clear synonym — "code audit", "audit the code",
"hunt for bugs"), perform a **comprehensive audit** across both tested AND untested paths for:
(1) workarounds / temporary hacks (still-needed vs. stale); (2) dead code (unused exports/helpers,
duplicates); (3) bugs (wrong ABI marshalling, off-by-one pointer/length math, endianness, missing
`cabi_post` calls, fall-back paths that mask errors); and (4) silent fall-throughs (returning a
default instead of erroring). Report `file:line` + severity, fix the safe/clear ones, and keep the
reference test suite green (`bun run gate`, plus `bun run test:node` / `test:deno`).

## Files

| File | What it holds |
| --- | --- |
| [open-work.md](open-work.md) | **Start here for what is left** (re-derived 2026-11-07): the open items, hand-overs, one line per item closed recently |
| [spec-4.0.0.md](spec-4.0.0.md) | 2.0.0 / SPEC 4.0.0 (2026-11-07): what it refuses that 3.0.0 accepted, measured before; the owner's decisions (H29); the 1.1.2 HTTP-error lead-in; commits, proof, edges left |
| [npm.md](npm.md) | npm beside JSR (2026-10-21): `@synapticforge1/universal-wasm-loader`, the build and tarball proof, the one-run publish job (reworked 2026-11-09, see overview), every release read back (1.1.2, 2.0.0), the recipe for a new package |
| [linting.md](linting.md) | `tsc` (`checkJs` + lint-like flags) and Biome 2.5.15: config, the deno-lint rule map, the `biome migrate` trap, what `checkJs` caught |
| [best-practices.md](best-practices.md) | METHOD rules: this repo's own (§ L) + the workspace's 28 ★ convergent rules, copied verbatim, stamped 2026-10-26 |
| [working-rules.md](working-rules.md) | The checklist: git, the gate (= CI's steps), the tooling hard rules in their Bun form (9: no `gh`; 10: publishing jobs run only pinned tools), boundaries, the privacy rule |
| [design-decisions.md](design-decisions.md) | 🔒 Invariants kept in full: the six design principles, the architectural decisions, the load path (with SPEC 4.0.0's refusals), WIT name conventions |
| [fixtures.md](fixtures.md) | The reference fixture set (H7/S4): the stamp, regenerate/verify, the 2026-10-12 wasmtk comparison, the per-port hand-over |
| [compat-gate.md](compat-gate.md) | The compatibility gate (H6): surface snapshot, floor, previous-tag tests, where each runs, the inversion record |
| [overview.md](overview.md) | Where it lives (GitHub `synapticforge1/universalWasmLoader-js`, JSR `@jrmarcum/universal-wasm-loader`, npm `@synapticforge1/universal-wasm-loader`), what this loader is, the API surface, ABI it implements, conformance/SPEC status (4.0.0), test suite (73; the runtime and browser matrix), and the release flow (2.0.0 latest; the 2026-11-09 job graph: pinned tools, REST release script, recoverable uploads — not yet run on GitHub) |
| [bun-migration.md](bun-migration.md) | 2026-10-12 move off Deno to Bun (+ Node): `jsr.json` manifest, `bun run` scripts, `node:test` suite, CI matrix, the Node `file:` URL bug it surfaced, open items |
