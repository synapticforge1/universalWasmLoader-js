# CLAUDE.md — universal-wasm-loader (pointer)

> **At session start, and before each new work item, read `../../cmem/workspace-correspondence.md`**
> (every row whose "to" names this repo, or whose subject touches the work), then the letter it
> points to in `../../cmem/handoffs.md` (owner, 2026-10-26; was handoffs-first). The workspace
> session (`../../cmem/INDEX.md`) reviews across the sibling repos and reports there; nothing is ever
> written into this repo from outside. (owner directive, 2026-09-20)

**All project memory lives in [`cmem/`](cmem/INDEX.md).** Start at `cmem/INDEX.md`; what is left
to do is [`cmem/open-work.md`](cmem/open-work.md). This file is only the pointer (the pre-2026-10-12
archive is `git show f3da283:CLAUDE.md`).

## What this is

The JS/TS **reference implementation** of the Universal WASM Loader, published to JSR as
`@jrmarcum/universal-wasm-loader`. Nine other-language ports follow it and the cross-language
`SPEC.md`. Hand-written JavaScript + `.d.ts`, no build step.

## Triggers (defined in `cmem/INDEX.md`, binding)

- **"update the project memory"** — revise the `cmem/` files; sync `README.md` / `SPEC.md` only where
  user-relevant.
- **"look for code issues"** — the comprehensive audit; keep the gate green.

## Three things that bite immediately

1. **Bun is the toolchain** (since 2026-10-12): `bun run gate`, `bun run test` (also `test:node`,
   `test:deno`), `bun run bump <level>` (required), `bun run release` (pushes `main` only; CI tags
   and publishes — `cmem/release.md`). `jsr.json` is the one manifest. Publishing
   still runs `deno publish` in CI.
2. **Every bump is gated** (`cmem/compat-gate.md`): the surface floor and the previous tag's tests;
   an intended API change re-baselines `api-surface.json` in its OWN commit first.
3. **Nothing is pushed, tagged or published unless the owner says so.** Commit messages go through a
   file (`git commit -F`), never a heredoc. Rules: `cmem/working-rules.md`.

**Current state:** 2.0.3 (SPEC 4.0.1) on JSR (score 100) and npm
(`@synapticforge1/universal-wasm-loader`), both with provenance, the same bytes (2026-11-10) — the
first release in the owner's order: a push of `main` with a new `jsr.json` version → CI checks →
CI tags → the GitHub Release page → JSR ∥ npm (`cmem/release.md`). GitHub:
`synapticforge1/universalWasmLoader-js`.
