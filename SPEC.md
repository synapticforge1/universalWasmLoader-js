# Universal WASM Loader — Cross-Language Specification

Version: 4.0.1  
Status: Draft  
Reference implementation: `@jrmarcum/universal-wasm-loader` (JSR)

> **4.0.0 (2026-11-07) — loud failures, decided by the owner (workspace letter H29; divergences
> S8, S9, S10).** Only an ABSENT `.wit` selects raw exports; every other `.wit` failure — an HTTP
> error, a network error, a timeout, a parse error, an unsupported type — is an error (§2). A WIT
> import with no host callback is refused at load (§4). Typed calls check their arguments, and
> host callbacks' return values are checked against the import's WIT result; neither is ever
> coerced (§4). Every http(s) fetch has a time limit, 30 s by default, and loads take an
> optional `options` argument (§1, §11). Each of these refuses something 3.0.0 accepted, hence
> the major. Fixtures are unchanged.
>
> **3.0.0 (2026-06-15) — breaking ABI change.** String/aggregate returns moved from the old
> caller-allocated out-parameter convention to the Canonical ABI **callee-allocated** convention:
> the export returns an `i32` pointer to a callee-allocated `[ptr, len]` pair, paired with a
> `cabi_post_<name>` release export. Loaders and fixtures built for spec 2.x are incompatible — see
> §4, §5, §9.

---

## 1. Core Interface

Every conformant loader MUST export a single entry point called `wasmImport` (or the idiomatic equivalent in the target language) with the following logical signature:

```
wasmImport(wasmPath, hostCallbacks?, options?) → Promise<ModuleExports>
```

### Parameters

| Field | Type | Default | Description |
|---|---|---|---|
| `wasmPath` | string or URL | — | Path to the `.wasm` file, resolved relative to the calling module. Append `@N` to pin to a major version (see §3). |
| `hostCallbacks` | `Record<string, Function>` | `{}` | Host functions the WASM module calls into JS. Flat object, camelCase keys; one for every WIT `import` (§4). |
| `options.timeoutMs` | number | `30000` | Time limit for each http(s) fetch (§11). |
| `options.signal` | `AbortSignal` (or the idiomatic cancellation token) | none | Cancels the load (§11). |

### Return value

A proxy object whose keys are the camelCase names of the WIT `export` section, with all Canonical ABI translation applied. If no companion `.wit` file exists (§2), the loader MUST return raw `WebAssembly.Exports` instead.

### Usage patterns

Both of the following patterns MUST be supported by a conformant loader:

**Destructure pattern** — individual named functions:

```
const { greet, isEven } = await wasmImport("./mod.wasm")
```

**Namespace pattern** — all exports under one object:

```
const m = await wasmImport("./mod.wasm")
m.greet("World")
```

---

## 2. WIT Auto-Detection

When the loader locates a companion `.wit` file, it applies the Canonical ABI. When no `.wit` file exists, raw `WebAssembly.Exports` are returned.

Auto-detection replaces the `.wasm` suffix of the path with `.wit` relative to `wasmPath`; a URL's query and fragment are not carried over. A path that does not end in `.wasm` has no companion `.wit`, and the module loads as raw exports.

```
./math.wasm  →  ./math.wit
```

### Absent versus failed (4.0.0)

The `.wit` is **absent** — and the loader MUST return raw `WebAssembly.Exports` — only when:

- the file does not exist (a local path or `file:` URL: "not found", e.g. `ENOENT`), or
- an http(s) fetch answers **404** or **410**.

Every other outcome of reading the `.wit` MUST make the load fail with an error naming the `.wit` URL and the reason, before the `.wasm` is fetched: any other HTTP status, a network error, the time limit (§11), cancellation, an unreadable file. A module never silently loses its typed interface because a server failed.

### Parsing (4.0.0)

A `.wit` that was read MUST parse completely, or the load fails with an error naming the `.wit` URL and what is wrong. The accepted form is the subset `wasmtk` writes:

```
wit      ::= ("package" name ";")? "world" ident "{" (func ";")* "}"
func     ::= ("import" | "export") ident ":" "func" "(" (param ("," param)* ","?)? ")" ("->" type)?
param    ::= ident ":" type
type     ::= "s32" | "s64" | "f32" | "f64" | "bool" | "string"
ident    ::= kebab-case word of letters and digits (e.g. is-positive, math-50, p0)
```

`//` line comments may appear anywhere. Anything else is an error, in particular: an empty file or text outside the one `world`; a statement that is not an `import` / `export` function; a parameter without `name: type`; a **type outside the table** (e.g. `u32`, `list<u8>` — never read as another type); a duplicate parameter, import or export name. After instantiation, a WIT `export` the module does not export MUST also fail the load, naming it.

---

## 3. Version Pinning

A loader conformant with this spec MUST support an optional `@N` suffix on `wasmPath`, where `N` is a non-negative integer. This follows the C shared-library SONAME major-version convention.

### Syntax

```
wasmPath ::= path ("@" version)?
version  ::= [0-9]+
```

Examples: `"./mod.wasm@1"`, `"./mod.wasm@2"`, `"https://cdn.example.com/mod.wasm@3"`

### Behavior

1. Strip the `@N` suffix before constructing the fetch URL. The suffix MUST NOT be included in the `.wasm` or auto-detected `.wit` URL.
2. After instantiation, read the module's exported `version` global (a mutable or immutable `i32`).
3. If `@N` was specified and the module does not export a `version` global, the loader MUST throw with a descriptive error.
4. If `@N` was specified and `exports.version.value !== N`, the loader MUST throw with an error identifying the path, the requested version, and the actual version.
5. If no `@N` suffix is present, version checking is skipped entirely.

### Rationale

WASM modules are compiled binary artifacts. Like C shared libraries, they carry their own ABI version in the binary (the exported `version` global) rather than in an external manifest. The `@N` suffix is the call-site equivalent of linking against `libfoo.so.2` — the major version is stated at the point of use, and the loader enforces the contract at load time.

---

## 4. Canonical ABI (wasmtime)

The loader applies the Canonical ABI as produced by `wasmtk` (wasmtime). Requires the WASM module to export `cabi_realloc` when string types are used.

### Export wrapper (JS → WASM → JS)

For each WIT `export`:

| WIT type | JS → WASM param | WASM return → JS |
|---|---|---|
| `s32` | pass as-is (number) | return as-is |
| `s64` | pass as-is (bigint) | return as-is |
| `f32` | pass as-is (number) | return as-is |
| `f64` | pass as-is (number) | return as-is |
| `bool` | `value ? 1 : 0` | `result !== 0` |
| `string` | `TextEncoder` → `cabi_realloc(0,0,1,len)` → write bytes → pass `(ptr, len)` | call the export → it returns an `i32` pointer to a callee-allocated `[ptr, len]` pair; read both via `DataView` (little-endian i32), decode, then call `cabi_post_<name>(retPtr)` |

### Typed-call arguments (4.0.0)

A typed call MUST check its arguments against the WIT signature before calling WASM, and MUST NOT coerce. A wrong argument count, or an argument outside its type's domain, fails the call with an error (in JS a `TypeError`) naming the export, the parameter and its WIT type:

| WIT type | Accepted argument (JS) | Ports |
|---|---|---|
| `s32` | an integer `number` in [-2³¹, 2³¹ − 1] | the language's 32-bit integer; out of range is an error |
| `s64` | a `bigint` in [-2⁶³, 2⁶³ − 1] | the 64-bit integer |
| `f32`, `f64` | a `number` | the floating type |
| `bool` | a `boolean` | the boolean type, never an integer |
| `string` | a `string` | the string type; no conversion from other values |

A port whose API returns a result through a kind-specific accessor (e.g. `call_i32`) MUST also refuse a kind that does not match the export's WIT result, never return a zero or empty value. Raw exports (no `.wit`) are outside this rule: they are the engine's own functions.

### Import wrapper (WASM → JS → WASM)

For each WIT `import`, the loader builds a WASM-callable function registered under the `env` namespace using the underscore-converted name (e.g. WIT `env-mul` → WASM key `env_mul`). The user provides host callbacks under camelCase names (e.g. `envMul`):

| WIT type | WASM raw arg → JS call arg |
|---|---|
| `s32` / `f64` / numeric | pass as-is |
| `bool` | `rawArg !== 0` |
| `string` | read `(ptr, len)` pair from WASM call stack, decode with `TextDecoder` from linear memory |

Return values from host callbacks follow the same encoding as export params in reverse.

**Every WIT `import` MUST have a host callback (4.0.0).** A missing one fails the load — before instantiation, with an error naming every missing callback (its camelCase key and its WIT name) — never a default value returned when WASM calls it. Callbacks for names the `.wit` does not import are ignored.

**A host callback's return value MUST match the import's WIT result (4.0.0)** — the domains of "Typed-call arguments" below, in reverse, never coerced: `undefined`, `null`, `"12"`, `2.9` or `2 ** 31` for an `s32` result is an error (in JS a `TypeError`) naming the callback, its WIT import and result type, and the value; it is raised when WASM calls the import and reaches the caller of the export that called it. A callback for an import with no result may return anything; the value is ignored. A callback that returns a Promise (an `async` function) is an error for every import: WASM cannot wait for it. An import whose WIT result is `string` is not supported by this ABI profile and MUST fail the load, naming it.

---

## 5. String Encoding Details

### String params (export, JS → WASM)

1. Encode the JS string to UTF-8 bytes using `TextEncoder`.
2. Call `cabi_realloc(0, 0, 1, byteLength)` — exported from the WASM module. Returns an `i32` pointer.
3. Write the bytes into WASM linear memory at that pointer.
4. Pass `(ptr: i32, len: i32)` as two consecutive WASM parameters.

### String returns (export, WASM → JS) — Canonical ABI callee-allocated

1. Call the WASM export with the encoded params (no return area is passed in). The export returns
   an `i32` pointer (`retArea`) to a callee-allocated 8-byte `[ptr, len]` pair.
2. Read `strPtr = DataView.getInt32(retArea, true)` and `strLen = DataView.getInt32(retArea + 4, true)`.
3. Decode `memory.buffer[strPtr .. strPtr + strLen]` with `TextDecoder` (this copies the bytes into a
   JS string, so it remains valid after step 4).
4. Call the paired `cabi_post_<name>(retArea)` export to release the return buffer, where `<name>` is
   the camelCase export name. The loader MUST call it when the export exists; under a bump allocator
   the body is an empty no-op, but the call keeps the contract intact for runtimes that do free.

### String params (import callbacks, WASM → JS)

When WASM calls a host import with a `string` parameter, it passes `(ptr: i32, len: i32)`. The loader MUST:

1. Have access to WASM linear memory (set the memory reference after instantiation).
2. Read `memory.buffer[ptr .. ptr + len]` and decode with `TextDecoder`.
3. Pass the resulting JS string to the user callback.

---

## 6. Instance Lifecycle

### 6.1 `createSingleton`

```
createSingleton(wasmPath, hostCallbacks?) → () => Promise<ModuleExports>
```

Returns an accessor function that loads the WASM instance on the first call and caches the result for all subsequent calls. The underlying `wasmImport` promise is cached (not the resolved value), so concurrent first-callers all await the same instantiation.

Appropriate for CLI tools and bounded-call scenarios.

### 6.2 `InstancePool`

```
new InstancePool(wasmPath, hostCallbacks?, size?) → InstancePool
```

Pre-instantiates `size` (default: 4) independent WASM instances and manages acquire/release semantics so that no two concurrent callers share the same instance.

| Method | Description |
|---|---|
| `acquire() → Promise<ModuleExports>` | Check out an instance. Waits if all are in use. |
| `release(instance)` | Return an instance to the pool. |
| `run(fn) → Promise<T>` | Acquire, call `fn(instance)`, release — even on throw. |

Appropriate for servers and loop-intensive workloads. Distributing state across N independent linear memories extends longevity under bump allocators.

---

## 7. Conformance Requirements

A port of this loader to another language or runtime MUST:

1. Accept the same logical signature: `wasmImport(wasmPath, hostCallbacks?, options?)` (§1).
2. Support both the destructure and namespace usage patterns (§1).
3. Apply WIT auto-detection; fall back to raw exports only when the `.wit` is absent, and fail on every other `.wit` failure and on any `.wit` that does not parse (§2).
4. Implement version pinning via the `@N` path suffix as specified (§3).
5. Implement the Canonical ABI exactly as specified (§4, §5), including the argument checks and the host-callback rule.
6. Expose `createSingleton` and `InstancePool` (or idiomatic equivalents) as specified (§6).
7. Pass the reference test suite (§8) without modification to the fixture `.wasm` files.
8. If it fetches over http(s): report an HTTP error as an error naming the status and URL, fetch each file once, and apply the time limit and cancellation of §11.

---

## 8. Reference Test Suite

Fixture files are in `tests/`. Each fixture consists of a `.wasm` binary and a companion `.wit` produced by `wasmtk`.

### math_50 — numeric round-trip

Fixture: `tests/math_50.wasm` + `tests/math_50.wit`

| Call | Expected return |
|---|---|
| `add(3, 4)` | `7` |
| `multiply(2.5, 4.0)` | `10.0` |
| `square(5)` | `25` |

### booleans_50 — bool normalization

Fixture: `tests/booleans_50.wasm` + `tests/booleans_50.wit`

| Call | Expected return |
|---|---|
| `isPositive(1.0)` | `true` |
| `isPositive(-1.0)` | `false` |
| `inRange(5.0, 0.0, 10.0)` | `true` |
| `inRange(11.0, 0.0, 10.0)` | `false` |
| `isEven(4)` | `true` |
| `isEven(3)` | `false` |

### strings_50 — string param + return via Canonical ABI

Fixture: `tests/strings_50.wasm` + `tests/strings_50.wit`

| Call | Expected return |
|---|---|
| `greet("World")` | `"Hello, World!"` |
| `shout("hi")` | `"hihi"` |
| `strLen("hello")` | `5` |

### imports_50 — host import callbacks

Fixture: `tests/imports_50.wasm` + `tests/imports_50.wit`

Host callbacks: `{ envMul: (a, b) => a * b, envAdd: (a, b) => a + b }`

| Call | Expected return |
|---|---|
| `scale(3.0, 4.0)` | `12.0` |
| `combine(10, 7)` | `17` |

### Instance lifecycle

Using any available fixture:

| Scenario | Requirement |
|---|---|
| `createSingleton` called twice | Both calls return the same instance object |
| `InstancePool.run()` | Returns correct result from pooled instance |
| `InstancePool` with `size=2`, 2 concurrent `run()` calls | Both complete without error |

### Refusals (4.0.0)

Each MUST fail with an error (the message naming what the right-hand column names):

| Scenario | Names |
|---|---|
| `imports_50` loaded with no host callbacks | both `envMul` and `envAdd` |
| `imports_50` with only `envMul` | `envAdd` |
| `imports_50`, `envAdd` returns `undefined`, `null`, `2.9`, `2 ** 31`, `true`, `"17"` or `17n`, then `combine(10, 7)` | the callback, its WIT import and result type, the value |
| `imports_50`, `envMul` is `async`, then `scale(3.0, 4.0)` | the callback; that it returned a Promise |
| a `.wit` declaring `import env-mul: func(p0: f64, p1: f64) -> string` beside `imports_50.wasm` | the import (load fails before the `.wasm` is fetched) |
| `add("x", 1)`, `add(2.7, 1)`, `add(1, 2 ** 31)`, `add(1)` on `math_50` | the export and the parameter (or the count) |
| `greet(42)` on `strings_50`; `isEven("4")` on `booleans_50` | the export and the parameter |
| `math_50.wasm` beside a `.wit` that does not parse (e.g. `func(a: s32 b: s32)`) or uses `u32` | the `.wit` and the fault |
| over http: the `.wit` answers 500; the `.wasm` answers 404 or 500 | the URL and the status; one request per file |
| over http: a server that never answers, with a short time limit | the URL and the limit |

And over http, a `.wit` answering 404 or 410 loads `math_50` as raw exports (`add(3, 4)` = `7`).

---

## 9. Versioning

This specification follows [Semantic Versioning](https://semver.org/).

- **Patch** — clarifications, typo fixes, no behavior change.
- **Minor** — new optional parameters, additive behavior. Backward compatible.
- **Major** — breaking changes to the core interface, ABI encoding, or test fixture expectations.

The spec version is independent of the package version in `jsr.json`. Changes to the spec that require loader updates MUST bump the spec version.

---

## 10. Producer model & WASI modules (informative)

The loader consumes **reactor / library** modules — the shape `wasmtk modc` produces: no `_start`, with
named exports described by the companion `.wit`. Do **not** feed it **command** modules (a `_start`
that runs `main` and calls `proc_exit`) — those are executables, not libraries; their exports are not
meant to be called as a DLL.

### 10.1 `_initialize`

If the module exports `_initialize` (the reactor initializer), a conformant loader SHOULD call it once
immediately after instantiation and before invoking any other export. (Active data segments are applied
at instantiation; `_initialize` runs any module constructors / one-time setup.)

### 10.2 WASI imports

Whether a module can be loaded depends on its imports, not on whether it is "WASI":

- A library that performs **no I/O** imports nothing from WASI and instantiates with an empty import
  object — this is the common, zero-config case (a pure-compute `modc` library).
- A library that performs **I/O** (e.g. `console.log` → `fd_write`, or `proc_exit`) imports
  `wasi_snapshot_preview1` functions. To instantiate it, the host MUST satisfy those imports. Browsers
  have no native WASI, so a conformant loader MAY provide a **minimal WASI Preview 1 shim**. The
  commonly-needed subset: `fd_write` (stdout/stderr), `proc_exit`, `random_get`, `clock_time_get`,
  `environ_get`/`environ_sizes_get`, `args_get`/`args_sizes_get`, and the `fd_*` stubs
  (`fd_close`/`fd_seek`/`fd_fdstat_get`). A pure-compute library needs none of these.

This section is **informative** (since v3.0.0; unchanged in 4.0.0). The WASI-P1 shim is currently OPTIONAL; a future spec
version may promote a minimal shim to a REQUIRED capability so every port can consume I/O-using
libraries consistently. **The reference loader (`-js`) implements BOTH §10 capabilities as of
2026-06-15:** it calls `_initialize` once after instantiation when the export is present, and always
provides a minimal `wasi_snapshot_preview1` shim (the subset listed in §10.2; `fd_write` routes
stdout→`console.log` / stderr→`console.error`). Pure-compute modules are unaffected (the unused import
namespace is ignored). Other ports SHOULD follow.

---

## 11. Fetch Time Limit and Cancellation (4.0.0)

Applies to every http(s) fetch the loader makes: the `.wit` (§2), then the `.wasm`. Local files
are read without a limit.

1. **Time limit.** Each fetch MUST complete — from the request to the last byte of the body —
   within `options.timeoutMs` milliseconds, **default 30000**. A positive number; `Infinity` (or
   the port's idiomatic "no limit") disables it; zero, a negative value or a non-number is an
   error. When the limit passes, the load fails with an error naming the URL and the limit. A
   port whose HTTP client separates connect and response phases MAY apply them separately
   (e.g. 10 s connect / 30 s response, as loader-jvm does) as long as no fetch can wait longer
   than its documented total without failing.
2. **Cancellation.** `options.signal` (an `AbortSignal`, or the language's cancellation token)
   cancels the load; the load fails with the signal's reason. An already-cancelled signal fails
   the load before any fetch.
3. **One request per file.** A fetch is never retried. An HTTP error on the `.wasm` fails the load
   naming the status and URL; a compile or link error reaches the caller as it is.
4. `createSingleton` and `InstancePool` accept the same `options` and apply them to each load.
