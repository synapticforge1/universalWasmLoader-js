# SPEC 4.0.0 / package 2.0.0 — loud failures (2026-10-26 → 2026-11-07)

Released 2026-11-07 as **2.0.0** (`Release v2.0.0` `1169ab9`, tag `v2.0.0`; read-backs in
[overview.md](overview.md) § Release flow). The rules are in `SPEC.md` §2, §4, §8 "Refusals" and
§11; the load path that implements them is [design-decisions.md](design-decisions.md) § "The load
path". This file is the record of WHY and of what was measured.

## What 4.0.0 refuses that 3.0.0 accepted

| Rule (SPEC) | 1.1.2 did (measured) | 2.0.0 does |
| --- | --- | --- |
| §2 only an ABSENT `.wit` is raw | a `.wit` answering 500 → raw exports, silently | absent = ENOENT / HTTP 404 / 410 → raw; any other status, network error, time limit or abort → throws, before the `.wasm` is fetched |
| §2 strict parsing | **the parser never failed**: garbage → an empty world → an EMPTY typed proxy; `func(a: s32 b: s32)` dropped `b`; `-> s99` / `u32` read as `s32` | the wasmtk subset (grammar in SPEC §2) or `invalid .wit <url>: <fault>`; a WIT export the module lacks fails the load |
| §4 a callback for every WIT import | `imports_50` with no callbacks loaded; `scale` / `combine` returned 0 | refused at load, naming every missing one |
| §4 callback return values | `undefined` / `null` → 0, `"12"` → 12, `2.9` → 2, `2 ** 31` → −2147483648, `true` → 1, `async` → NaN / 0 (only `bigint` refused, by the engine) | the argument domains in reverse, `TypeError` naming callback, import, type and value; void imports ignore it; a Promise is always refused; a `string`-result import is refused at load (not implemented in this profile) |
| §4 typed-call arguments | coerced: `add("x",1)` = 1, `add(2.7,1)` = 3, `add(1)` = 1, `greet(42)` = "Hello, 42!" | arity and kinds checked, `TypeError`, no coercion (s32 integer in range, s64 bigint, f32/f64 number, bool boolean, string string) |
| §11 time limit | a server that never answered HUNG the load (a stalled `.wit` also kept the `.wasm` from being requested) | 30 s per http(s) fetch, request to last byte; `{ timeoutMs, signal }` on `wasmImport`, `createSingleton`, `InstancePool` |

Measured with a scratchpad probe (a local `node:http` server with 404 / 500 / stall routes and a
request counter) on Bun 1.4.4 and Node 24, identical. The parser finding was BEYOND the letter's
list: the letter asked about the `.wit` fetch, the probe also served a malformed `.wit`.

## How it was decided

- **The trigger:** this repo's own 404 inversion, 2026-10-26 (below), became divergence S10 and
  workspace letter **H29** to the ten ports, with -js as SPEC owner and 🗓️ the owner for the SPEC
  questions (S8 typed calls, S9 missing callback, S10 HTTP / `.wit` fallback).
- 🔒 **Owner, 2026-11-07** (answers to four questions): "A malformed wit file should throw an
  error. Unknown wit types should also throw an error." Then, asked about the open case: absent =
  raw, every other `.wit` failure throws. Timeout: 30 s default + an option. S9: refuse at load.
  S8: check arguments and throw. Each refuses something 3.0.0 accepted → MAJOR (SPEC 4.0.0,
  package 2.0.0).
- 🔒 **Owner, same day: "fix the last item on the callback return values"** — the return side
  of S9, added inside the unreleased 4.0.0.
- 🔒 **Release:** the owner bumped `jsr.json` to 2.0.0, then "tag it first", then push.

## The lead-in: the masked HTTP error (1.1.2, 2026-10-26)

`instantiateWasm` used to swallow every `instantiateStreaming` failure (`catch (_e) {}`) and fetch
AGAIN without checking `res.ok`, so a 404 surfaced as an engine's empty-module error (V8
"BufferSource argument is empty", Gecko "failed to match magic number", JSC "expected a module of
at least 8 bytes"), and every compile / link error or non-`application/wasm` response cost a second
download. Found by inverting the by-hand browser run (a 404 on `math_50.wasm`). Fixed `64551fa`,
released 1.1.2: one fetch, `!res.ok` → `wasmImport: HTTP <status> for <url>`, streaming only for
`application/wasm`. Four tests on a local `node:http` server; inverted: 3 red for the right reasons.

## Commits and proof

| Commit | What |
| --- | --- |
| `39eacc1` | surface re-baseline ALONE (rule 5): `LoadOptions`, the options parameter, SPEC 4.0.0; `api-surface.json` 9 → 12 symbols |
| `e621a79` (merge `bb21168`) | the §2 / §4 / §11 behaviour, tests 28 → 63, SPEC text, README error table and Breaking Changes rows |
| `6b09b37` (merge `cfd621b`) | callback return values, tests 63 → 73 |
| `1169ab9` = tag `v2.0.0` | the owner's bump |

- Inverted: the 63-test suite against the 1.1.2 loader → the 32 new negative tests red, 31 green;
  the 73-test suite against `e621a79` → exactly the 9 new return-value tests red.
- Gate: every CI step green; `compat` floor MAJOR, v1.1.2's 28 tests green on the new code (so
  every documented 1.x call that was CORRECT still works — only wrong ones now fail).
- Runtimes: Bun 1.4.4, Node 22 / 24 / 26, Deno 2.9.8 73 / 73 (`test:deno` gains
  `--allow-net=127.0.0.1 --allow-write=.test-tmp`); by hand, headless Chrome 156, Edge 157,
  Firefox 159, ESR 153: the 58 page-runnable tests (15 need `node:http` / `node:fs`).
- As a user: a fresh `npm install …@2.0.0` on Node 24 loads `math_50` and refuses `add("x", 1)`,
  `imports_50` without callbacks, and a callback returning `undefined`, each with its message.

## Port allowances (SPEC 4.0.1, 2026-11-09)

- **A zero-value options type (§11.1).** loader-go flagged in C29 / C35 that Go's zero-value
  `LoadOptions{}` cannot say "unset", so it reads `Timeout: 0` as the 30 s default where §11.1
  made zero an error. 🔒 **Owner, 2026-11-08: "adjust for go."** C35 then waited on loader-js to
  record it (loader-go, 2026-11-09: "the only open item for loader-go"). Recorded in the SPEC as
  an allowance with three conditions — a negative limit is still an error, "no limit" has its own
  name, the port documents it — measured on loader-go `v0.3.2` (`26f668b`, read-only):
  `loader.go:57`–`:60` (negative → error, zero → `DefaultTimeout`), `NoTimeout` at `:42`. A
  clarification under SPEC §9 (no loader has to change; -js still refuses zero) → 4.0.1, floor
  patch; surface re-baselined alone in `a76f3a8`.
- **Not in the SPEC:** loader-jvm's `LoadOptions` against its own design principle 3 ("no options
  objects") is -jvm's internal exception, confirmed by the owner in -jvm (C36), not a SPEC matter.

## Port readings of 4.0.0, answered 2026-11-13

Four ports wrote "readings for -js to accept or correct" into the workspace's `handoffs.md` on
2026-11-08 (their notes, indexed by ledger rows C32 -dotnet, C35 -go, C37 -zig, C38 -v). Only
-go's §11.1 reading had an answer (4.0.1, above). The rest, each judged against SPEC.md's text
(§ 4 "Typed-call arguments" and "Import wrapper", § 7, § 8, § 11) — no port's code was read or
run for this, so each "accepted" accepts the READING as the port stated it:

| port | reading | answer |
| --- | --- | --- |
| -dotnet (a), -zig (a) | "never coerced" is the EXACT type: an `int` is refused for `f64` and for `s64`; an `i64` is never sent for `s32` even when it fits | **Accepted — the letter.** § 4's Ports column: "the language's 32-bit integer", "the 64-bit integer", "the floating type" |
| -go (a) | `s32` / `s64` take ANY Go integer kind, range-checked; `f32` / `f64` only floating kinds | **Accepted.** The rule refuses "an argument outside its type's domain": an in-range integer of another integer kind is the same value (as JS's own integer `number`), nothing is coerced, and float ↔ integer stays refused. Exact type (-dotnet, -zig) is stricter, range-checked integers (-go, -js) is the floor; a port must not go below it |
| -dotnet (c), -go (d) | § 11.4 n/a: the loader reads local files only, so `Load` / `CreateSingleton` / `InstancePool` take no options | **Accepted.** § 11 "applies to every http(s) fetch"; § 7.8 begins "If it fetches over http(s)". As -c |
| -zig (b) | an untyped integer literal for an `s64` parameter goes as `s32` and is refused (write `@as(i64, 5)`); tested in -zig | **Accepted as a documented port limit**: a loud refusal naming the parameter and type, never a wrong value. ⚠️ It exposes a gap HERE: no fixture has an `s64` or `f32` PARAMETER, so § 8 cannot catch a port that narrows or widens one (open-work) |
| -v (a) | § 8's string-result-import row can only report the missing callback (-c checks missing callbacks first and the V test passes none); it names `env-mul` before any `.wasm` is read | **Accepted**: the row requires the import named and the load failed before the `.wasm` is fetched, both met. Suggested, not required: pass callbacks in that test (`import_module_with`), so the string-result refusal itself is what fails |
| -dotnet (b), -go (b) | a callback is checked by its STATIC signature at load; only an `object` / `any` result is checked by value when called. Refused earlier than § 4's "raised when WASM calls the import" | **Open — the owner's ruling.** It meets the rule's purpose (never coerced; the error names the callback, the import and the type) but not the sentence's timing. This session's recommendation: allow it as a clarification in the next SPEC patch (as § 11.1's allowance), no port changes. Until ruled, nothing to correct |
| -zig (c) vs -v (b), -c | a void accessor on a non-void export: -zig's `call(void, …)` REFUSES it; -c's `uwl_call_void` and -v's `call_void` DISCARD the result | **Open — the owner's ruling.** § 4: an accessor "MUST also refuse a kind that does not match the export's WIT result, never return a zero or empty value" — by the letter -zig is right; by the purpose, discarding returns no wrong value (JS callers discard results freely). Two ports diverge under one sentence, so the sentence needs one more clause either way. Recommendation: say that discarding is allowed and refusing is allowed, in the same SPEC patch |

-v (c) (the `uwl_str` leak does not apply to -v) and -dotnet's `HostFault` note need no answer.
Nothing in SPEC.md was changed for this: both open rows would be a 4.0.2 clarification, which
is the owner's to decide.

## Edges left

- UNMEASURED: a void WIT import (no fixture has one; the path is one `return undefined`).
- A `string`-result import is refused, not implemented; implementing it needs the import-side
  return-pointer convention — a feature (minor), if a producer ever emits one.
- The ports: ledger **C29** (from loader-js) carries the rules; loader-js verifies and closes per
  port.
