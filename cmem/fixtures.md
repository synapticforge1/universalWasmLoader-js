# Reference fixtures (workspace letter H7 / divergence S4, 2026-10-12)

This repo's `tests/` is the **reference fixture set** for all ten loader ports. SPEC §7: ports use
the fixtures "without modification". `tests/fixtures.json` is the stamp: the wasmtk commit that
built them, the git blob id of each source, and the sha256 of every fixture file.

- **Regenerate:** `bun scripts/regen-fixtures.ts <wasmtk-checkout>` (needs Deno). The checkout
  must be clean, and must be a scratch clone, never the sibling repo (Deno writes into the tree
  it runs in). It builds the five `wasmtk modc` fixtures, deletes `modc`'s intermediate `.wat`
  files, and rewrites the stamp. `init_check.wat` / `.wasm` are hand-written here; they are
  stamped, never regenerated.
- **Verify:** `bun run fixtures` (in `bun run gate` and CI) fails on a byte difference or on an
  unstamped `.wasm` / `.wit` / `.wat` in `tests/`. Inverted 2026-10-12 (one flipped byte + one
  stray `.wit` → both named, exit 1).

## The 2026-10-26 re-stamp (H7 / drift X8 / ledger C11)

wasmtk rewrote its history twice (2026-10-23, 2026-10-26: paths only), so `f50c8e4` no longer
exists anywhere; its rewritten twin is **`4a5c3cf668d`** (`v2.0.3-64-g4a5c3cf`, the same commit
date 2026-10-09T20:13:12-04:00, map `../../wasmtk/cmem/history-purge-2026-10-26.md`), and it IS
on `synapticforge1/wasmtk` `origin/main` (`git branch -r --contains`). Measured 2026-10-26: a
fresh clone from GitHub, checked out at that commit (clean); the five source blob ids equal the
old stamp's; `bun scripts/regen-fixtures.ts <clone>` rebuilt all ten `.wasm` / `.wit`
**byte-identical** to the 2026-10-12 set — only the stamp's `repository`, `commit` and `describe`
changed. The generator's URL in `scripts/regen-fixtures.ts` now names the org. The ports copy
`tests/fixtures.json` again (their `files` hashes are unchanged; only `generator` moved).

## The 2026-10-12 regeneration

🔒 Owner, 2026-10-12: the reference set comes from **wasmtk HEAD `f50c8e4`**
(`v2.0.3-64-gf50c8e419a0`, committed 2026-10-09), "after a push": the owner pushes wasmtk's
`main` so the stamped commit is pinnable. On 2026-10-12, and again 2026-10-13, `f50c8e4` was on NO remote branch
(`git branch -r --contains` empty). ✅ Superseded by the 2026-10-26 re-stamp above.

Measured the same day, the same five sources built three ways:

| build | `.wasm` | `.wit` | JS suite |
| --- | --- | --- | --- |
| this repo's fixtures before (2026-06-15, wasmtk version unrecorded) | 104/124/571/115/156 B | = HEAD | 24/24 |
| **wasmtk HEAD `f50c8e4`** (installed CLI, and a clean clone; byte-identical) | 115/140/533/134/295 B | — | **24/24** on Bun, Node 22/24, Deno |
| wasmtk **2.0.3 from JSR** (the published version) | 114/161/540/128/307 B | differ | 🔴 **15 pass / 9 fail** |

- ✅ (2026-11-07: fixed in a release — wasmtk `v3.0.0` contains `4a5c3cf668d`, measured with
  `git tag --contains`.) **Published wasmtk 2.0.3's `modc` output was wrong for this loader:** its `math_50.wit`
  declares `add` / `square` as `f64` where the source and HEAD say `s32`, and every bool function
  fails. HEAD fixes it. Until a wasmtk release ships HEAD's fixes, anyone regenerating from JSR
  gets broken fixtures. → for the owner / wasmtk.
- **dart's "odd" 115 B `math_50.wasm`** (drift-register L3) is the size HEAD builds: dart was
  likely built with a NEWER wasmtk, not a wrong one. Confirm by hash before deleting the row.
- Import / export lists of the new fixtures are identical to the old ones (`cabi_post_greet`,
  `cabi_post_shout`, `cabi_realloc`, `env.env_mul` / `env.env_add`,
  `wasi_snapshot_preview1.fd_write`), so the suite still reaches every ABI path.
- `cabi_post` wording (S4): this repo's `SPEC.md` §5 ("MUST call it when the export exists") and
  `abi.js` (call if present) agree. The difference S4 records is in the other ports' copies. The
  fix there is to LINK this SPEC, not copy it.

## Hand-over: what each port's own session does (never written from here)

Each port copies `tests/*.wasm`, `tests/*.wit` and `tests/fixtures.json` from this repo at the
commit that lands them, verifies every sha256 in `files`, and runs its own suite.

| port | from H7 / the drift register |
| --- | --- |
| all nine | copy the stamped set; verify the hashes; link `-js/SPEC.md` instead of a local copy |
| -dart | its 3 differing `.wasm` (L3): replace with the stamped set |
| -jvm | `imports_50.wit` uses `p0/p1` (L3): replace; groupId and local SPEC (L6) |
| -py | ships its own fixtures (L3): switch to the stamped set; tests advisory in CI (L8) |
| -go, -dotnet | un-ignore `cmem/` (L1); -go keeps wazero |
| -rs | `overview.md` says published, it is not (L4); vendored `abi.js` is 2.x (L5) |
| -rs, -c, -jvm | cut tracked `CLAUDE.md` to a pointer (L2) |
| -v | `overview.md` tag line (L7); needs tests |
| -zig | needs tests |
