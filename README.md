# universal-wasm-loader

A lightweight, zero-dependency WebAssembly loader for JavaScript, TypeScript, and the Web. Works in **Node.js 22.18+**, **Bun**, **Deno**, and all **modern browsers** without any configuration or bundler setup. Every release is tested on every current Node LTS line, on Bun and on Deno.

Published to two registries with the same code under the same version number:
[npm](https://www.npmjs.com/package/@synapticforge1/universal-wasm-loader) as
`@synapticforge1/universal-wasm-loader` and [JSR](https://jsr.io/@jrmarcum/universal-wasm-loader) as
`@jrmarcum/universal-wasm-loader`, both with build provenance (from 1.1.1 on npm).

## Installation

### From npm

```sh
npm install @synapticforge1/universal-wasm-loader   # or: bun add / pnpm add / yarn add
```

```javascript
import { wasmImport } from "@synapticforge1/universal-wasm-loader";
```

No `.npmrc` or extra registry is needed.

### From JSR

Install via [JSR](https://jsr.io/@jrmarcum/universal-wasm-loader):

**Deno:**

```sh
deno add jsr:@jrmarcum/universal-wasm-loader
```

**npm:**

```sh
npx jsr add @jrmarcum/universal-wasm-loader
```

**Bun:**

```sh
bunx jsr add @jrmarcum/universal-wasm-loader
```

**pnpm:**

```sh
pnpm dlx jsr add @jrmarcum/universal-wasm-loader
```

**Yarn:**

```sh
yarn dlx jsr add @jrmarcum/universal-wasm-loader
```

**vlt:**

```sh
vlt install jsr:@jrmarcum/universal-wasm-loader
```

After installing, the import line is the same on every runtime:

```javascript
import { wasmImport } from "@jrmarcum/universal-wasm-loader";
```

`npx jsr add` and `bunx jsr add` write the dependency to `package.json` and the `@jsr` registry
line to `.npmrc`; commit both. Importing `jsr:@jrmarcum/universal-wasm-loader` with no install
step works on **Deno only**: Node and Bun do not resolve the `jsr:` prefix.

The examples below import the JSR name; with the npm package, import
`@synapticforge1/universal-wasm-loader` instead. Everything else is identical.

## Usage

### Basic — destructure exports

```javascript
import { wasmImport } from "@jrmarcum/universal-wasm-loader";

const { greet, isEven } = await wasmImport("./mod.wasm");

console.log(greet("World")); // "Hello, World!"
console.log(isEven(4));      // true
```

### Namespace style

```javascript
const m = await wasmImport("./mod.wasm");

m.greet("World");
m.isEven(4);
```

### Version pinning

Append `@N` to pin to a specific major version. The loader checks the module's
exported `version` global and throws a descriptive error if it doesn't match —
the same convention C shared libraries use with SONAME major versioning.

```javascript
const { greet } = await wasmImport("./mod.wasm@2");
// Throws if the module's exported `version` global !== 2
```

### With host import callbacks

When your WASM module calls back into JS, pass the host functions as a flat camelCase object. The loader maps WIT kebab-case names (`env-mul`) to camelCase JS keys (`envMul`) automatically. Every WIT import needs one, and each must return its WIT result type synchronously (an `s32` import must return an integer, never `undefined` or a Promise).

```javascript
const { scale, combine } = await wasmImport("./math.wasm", {
  envMul: (a, b) => a * b,
  envAdd: (a, b) => a + b,
});

console.log(scale(3.0, 4.0)); // 12.0
```

## How It Works

1. Resolves a relative `.wasm` path against the **loader's own location** (its `import.meta.url`); a `URL` or absolute path is used as given (see [Where your modules live](#where-your-modules-live))
2. Auto-detects the companion `.wit` file by replacing `.wasm` → `.wit`, and parses it strictly (an unsupported type or a malformed statement throws)
3. Applies the Canonical ABI (wasmtime) — bool and string types handled automatically; every WIT import must have a host callback, and typed calls check their arguments
4. Reads a `file:` URL from disk on Node, Bun and Deno (Node's `fetch` does not accept `file:` URLs); otherwise fetches it once, within a time limit (30 s by default): an HTTP error throws `wasmImport: HTTP <status> for <url>`; a response served as `application/wasm` compiles with `WebAssembly.instantiateStreaming`, any other `Content-Type` through `arrayBuffer`
5. Returns an ABI-translated proxy keyed by camelCase WIT export names

If no `.wit` file **exists** (absent on disk, or HTTP 404 / 410), raw `WebAssembly.Exports` are
returned. Every other `.wit` failure throws, so a module never silently loses its typed interface:

| Situation | Result |
| --- | --- |
| `.wit` absent (no file, 404, 410) | raw `WebAssembly.Exports` |
| `.wit` answers another HTTP error, the network fails, or the time limit passes | throws, naming the `.wit` URL and the status or reason |
| `.wit` does not parse, or uses a type outside the table below | throws `wasmImport: invalid .wit <url>: <what is wrong>` |
| `.wit` declares an export the module does not export | throws at load, naming it |
| a WIT `import` has no host callback | throws at load, naming every missing one |
| a host callback returns a value outside its WIT result type, or a Promise | throws a `TypeError` from the export call that reached it, naming the callback and the value |
| a WIT `import` has a `string` result | throws at load (not supported) |
| a typed call gets the wrong number or kind of arguments | throws a `TypeError` naming the export and the parameter |

## API

### `wasmImport(wasmPath, hostCallbacks?, options?)`

| Parameter | Type | Description |
| --- | --- | --- |
| `wasmPath` | `string \| URL` | Path or `URL` of the `.wasm` file. A relative string resolves against the loader's own location. Append `@N` to pin to a major version. |
| `hostCallbacks` | `Record<string, Function>` | Host functions the WASM module calls into JS. Flat object, camelCase keys; one for every WIT `import`. |
| `options.timeoutMs` | `number` | Time limit for EACH http(s) fetch (the `.wit`, then the `.wasm`), from the request to the last byte. Default `30000`; `Infinity` disables it. |
| `options.signal` | `AbortSignal` | Aborts the load; it rejects with the signal's reason. |

```javascript
const ctl = new AbortController();
const m = await wasmImport("https://example.com/mod.wasm", {}, { timeoutMs: 5000, signal: ctl.signal });
```

### Where your modules live

Keep your `.wasm` modules (and their `.wit` files) in whatever folder suits your project, such as
`wasm_modules/`, and pass a `URL` built from **your** file's `import.meta.url`:

```javascript
const { greet } = await wasmImport(new URL("./wasm_modules/mod.wasm", import.meta.url));
const pinned = await wasmImport(new URL("./wasm_modules/mod.wasm@2", import.meta.url));
```

A plain relative string such as `"./mod.wasm"` resolves against the loader's own file. That is
right only when the module sits next to the loader; from an installed package, that location is
inside `node_modules`.

**Returns:** `Promise<Record<string, Function>>` — ABI-translated proxy keyed by camelCase WIT export names, or raw `WebAssembly.Exports` if no `.wit` file exists (see [How It Works](#how-it-works) for what throws).

### Type mapping

| WIT type | A typed call accepts | JS → WASM | WASM → JS |
| --- | --- | --- | --- |
| `s32` | an integer `number` in [-2³¹, 2³¹ − 1] | as-is | as-is |
| `s64` | a `bigint` in [-2⁶³, 2⁶³ − 1] | as-is | as-is |
| `f32`, `f64` | a `number` | as-is | as-is |
| `bool` | a `boolean` | `value ? 1 : 0` | `result !== 0` |
| `string` | a `string` | UTF-8 encode → `cabi_realloc` → write → pass `(ptr, len)` | export returns an i32 ptr to a callee-allocated `[ptr, len]` pair; read via `DataView`, then call `cabi_post_<name>` |

Nothing is coerced: `add("3", 4)`, `add(2.5, 1)` and `add(1)` each throw a `TypeError`. Raw
exports (no `.wit`) are plain `WebAssembly` functions and keep JavaScript's own conversions.

See [SPEC.md](./SPEC.md) for the full cross-language conformance specification.

### Library modules & I/O (SPEC §10)

The loader consumes **reactor/library** modules (e.g. `wasmtk modc` output). It calls the module's
`_initialize` export once after instantiation if present, and always supplies a minimal built-in
**WASI Preview 1 shim**, so a library that does I/O (e.g. `console.log` → `fd_write`) instantiates even
in the browser. `fd_write` routes stdout→`console.log` and stderr→`console.error`; a pure-compute
library imports nothing and is unaffected.

### `createSingleton(wasmPath, hostCallbacks?, options?)`

Returns an accessor function that loads the WASM instance on the first call and caches it for all subsequent calls.

```javascript
const getMod = createSingleton("./mod.wasm");
const { greet } = await getMod();   // loads on first call
const same = await getMod();        // returns cached instance
```

Appropriate for CLI tools and bounded-call scenarios.

### `InstancePool(wasmPath, hostCallbacks?, size?, options?)`

Pre-instantiates `size` (default: 4) independent WASM instances and manages acquire/release semantics for concurrent workloads. `options` applies to every instance.

```javascript
const pool = new InstancePool("./mod.wasm", {}, 4);
const result = await pool.run(mod => mod.compute(42));
```

| Method | Description |
| --- | --- |
| `acquire()` | Check out an instance. Waits if all are in use. |
| `release(instance)` | Return an instance to the pool. |
| `run(fn)` | Acquire, call `fn(instance)`, release — even on throw. |

Appropriate for servers and loop-intensive workloads.

## TypeScript

Full TypeScript support is included. No `@types` package needed.

```typescript
import { wasmImport } from "@jrmarcum/universal-wasm-loader";
import type { HostCallbacks } from "@jrmarcum/universal-wasm-loader";

const callbacks: HostCallbacks = { envMul: (a, b) => (a as number) * (b as number) };
const { scale } = await wasmImport("./mod.wasm", callbacks);
```

## Versioning

This package follows [Semantic Versioning 2.0.0](https://semver.org/). Every bump is gated: the
release tooling compares the public API (`api-surface.json`, generated from the `.d.ts` files and
the `SPEC.md` version) with the previous release, and refuses a bump lower than the change requires.
It also runs the previous release's tests against the new code.

### ⚠️ Breaking Changes

| Version | What changed | How to migrate |
| --- | --- | --- |
| 2.0.0 (SPEC 4.0.0) | A `.wit` that exists but fails to fetch (an HTTP status other than 404 / 410, a network error, a timeout) now **throws**; it used to load raw exports. | Serve the `.wit`, or remove it to load raw exports on purpose. |
| 2.0.0 | A `.wit` that does not parse, or uses a type other than `s32` / `s64` / `f32` / `f64` / `bool` / `string`, now **throws**; it used to load an empty proxy, drop a malformed parameter, or read the type as `s32`. | Fix the `.wit`; regenerate it with `wasmtk`. |
| 2.0.0 | A `.wit` export the module lacks now throws at load (it used to throw when called). | Regenerate the `.wit` from the module. |
| 2.0.0 | A WIT `import` with no host callback now **throws at load**; it used to load and return `0` when called. | Pass a callback for every import. |
| 2.0.0 | A host callback's return value is checked against the import's WIT result and throws a `TypeError` on a mismatch; it used to be coerced (`undefined` / `null` → 0, `2.9` → 2, `2 ** 31` wrapped, `true` → 1, an `async` callback's Promise → NaN or 0). A WIT import with a `string` result now throws at load. | Return the WIT result type, synchronously (`Math.trunc` for an `s32`, a `bigint` for `s64`). |
| 2.0.0 | Typed calls check arguments and throw a `TypeError` on a wrong count or kind; they used to coerce (`add("x", 1)` = 1, `add(2.7, 1)` = 3). | Pass values of the WIT type (`bigint` for `s64`, `boolean` for `bool`). |
| 2.0.0 | Every http(s) fetch has a 30 s limit by default; there was none. | Pass `{ timeoutMs: Infinity }` (or a larger value) as the third argument. |

## Publishing

Releases are made by GitHub Actions, never from a developer's machine, in this order: CI checks
the pushed commit, then CI creates the version tag, then the GitHub Release page from that tag,
then publishes to JSR and npm in parallel, with OIDC provenance on both (npm through trusted
publishing) — no stored token. The jobs that hold the publishing credential run only tools pinned
by version and sha256.

To release a new version: `bun run bump patch|minor|major` (the level is required; it checks the
API floor, raises `version` in `jsr.json` and commits `bump to vX.Y.Z`), then `bun run release`
(it checks, then pushes `main` — no tag; CI does the rest).

## Development

Bun is the development runtime; the code and tests also run on Node and Deno.

```sh
bun install          # dev dependencies (TypeScript, @types/node, Biome); the tests need none
bun run gate         # type check (incl. the shipped JS), Biome lint, manifest, API-surface
                     # snapshot, fixture stamp, browser check, tests on Bun
bun run compat       # API floor since the last release + that release's tests on this code
bun run release:selftest  # the release script (GitHub REST API) against a mock API
bun run test:node    # the same tests on Node   (node --test; needs Node on PATH, see below)
bun run test:deno    # the same tests on Deno   (deno test)
bun run lts          # the tests on every current Node LTS line, through fnm
```

When no `node` is on `PATH`, `bun run` substitutes Bun for `node`, so `bun run test:node` would
run Bun (it then fails with "Cannot use describe outside of the test runner"). Put a Node on
`PATH` first, e.g. `fnm exec --using=24 bun run test:node`.
