# Universal WASM Loader — Cross-Language Specification

Version: 4.0.0  
Status: Draft  
Reference implementation: `@jrmarcum/universal-wasm-loader` (JSR)

> **3.0.0 (2026-06-15) — breaking ABI change.** String/aggregate returns moved from the old
> caller-allocated out-parameter convention to the Canonical ABI **callee-allocated** convention:
> the export returns an `i32` pointer to a callee-allocated `[ptr, len]` pair, paired with a
> `cabi_post_<name>` release export. Loaders and fixtures built for spec 2.x are incompatible — see
> §4, §5, §9.

---

## 1. Core Interface

Every conformant loader MUST export a single entry point called `wasmImport` (or the idiomatic equivalent in the target language) with the following logical signature:

```
wasmImport(wasmPath, hostCallbacks?) → Promise<ModuleExports>
```

### Parameters

| Field | Type | Default | Description |
|---|---|---|---|
| `wasmPath` | string or URL | — | Path to the `.wasm` file, resolved relative to the calling module. Append `@N` to pin to a major version (see §3). |
| `hostCallbacks` | `Record<string, Function>` | `{}` | Host functions the WASM module calls into JS. Flat object, camelCase keys. |

### Return value

A proxy object whose keys are the camelCase names of the WIT `export` section, with all Canonical ABI translation applied. If no companion `.wit` file is found, the loader MUST return raw `WebAssembly.Exports` instead.

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

Auto-detection replaces the `.wasm` suffix with `.wit` relative to `wasmPath`:

```
./math.wasm  →  ./math.wit
```

If the `.wit` file cannot be fetched (e.g. 404 or network error), the loader MUST fall back to returning raw `WebAssembly.Exports` rather than throwing.

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

### Import wrapper (WASM → JS → WASM)

For each WIT `import`, the loader builds a WASM-callable function registered under the `env` namespace using the underscore-converted name (e.g. WIT `env-mul` → WASM key `env_mul`). The user provides host callbacks under camelCase names (e.g. `envMul`):

| WIT type | WASM raw arg → JS call arg |
|---|---|
| `s32` / `f64` / numeric | pass as-is |
| `bool` | `rawArg !== 0` |
| `string` | read `(ptr, len)` pair from WASM call stack, decode with `TextDecoder` from linear memory |

Return values from host callbacks follow the same encoding as export params in reverse.

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

1. Accept the same logical signature: `wasmImport(wasmPath, hostCallbacks?)` (§1).
2. Support both the destructure and namespace usage patterns (§1).
3. Apply WIT auto-detection and fall back to raw exports when no `.wit` file is found (§2).
4. Implement version pinning via the `@N` path suffix as specified (§3).
5. Implement the Canonical ABI exactly as specified (§4, §5).
6. Expose `createSingleton` and `InstancePool` (or idiomatic equivalents) as specified (§6).
7. Pass the reference test suite (§8) without modification to the fixture `.wasm` files.

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

This section is **informative** for v3.0.0. The WASI-P1 shim is currently OPTIONAL; a future spec
version may promote a minimal shim to a REQUIRED capability so every port can consume I/O-using
libraries consistently. **The reference loader (`-js`) implements BOTH §10 capabilities as of
2026-06-15:** it calls `_initialize` once after instantiation when the export is present, and always
provides a minimal `wasi_snapshot_preview1` shim (the subset listed in §10.2; `fd_write` routes
stdout→`console.log` / stderr→`console.error`). Pure-compute modules are unaffected (the unused import
namespace is ignored). Other ports SHOULD follow.
