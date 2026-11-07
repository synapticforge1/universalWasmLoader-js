// @ts-self-types="./universal-wasm-loader.d.ts"
/**
 * A lightweight, zero-dependency WebAssembly loader.
 *
 * Loads a `.wasm` module like an ES import: it auto-detects the companion `.wit`
 * file and applies the Canonical ABI (wasmtime) so the caller receives a typed
 * proxy keyed by the module's export names. If no `.wit` exists (absent on disk, or
 * HTTP 404 / 410), raw {@linkcode WebAssembly.Exports} are returned; any other `.wit`
 * failure throws (SPEC 4.0.0 §2). Works in Node.js 22.18+, Bun, Deno,
 * and modern browsers without any configuration.
 *
 * @example Basic usage
 * ```ts
 * import { wasmImport } from "@jrmarcum/universal-wasm-loader";
 *
 * const { greet, isEven } = await wasmImport("./mod.wasm");
 * greet("World"); // "Hello, World!"
 * ```
 *
 * @module
 */
/** @import { HostCallbacks, LoadOptions, ModuleExports } from "./universal-wasm-loader.js" */
import { parseWit } from "./wit-parser.js";
import { buildComponentImportEnv, buildComponentExportProxy } from "./abi.js";
import { buildWasiShim } from "./wasi.js";

/**
 * Call the reactor `_initialize` export once, if present (SPEC §10). `wasmtk modc`
 * libraries (and other reactor-shaped modules) export `_initialize` for one-time
 * setup that must run before any other export is called. No-op for command-style
 * or pure-data modules that don't export it.
 * @param {WebAssembly.Exports} rawExports
 */
function callInitialize(rawExports) {
  const init = rawExports._initialize;
  if (typeof init === "function") init();
}

/**
 * Read a `file:` URL from disk where the host has a file system (Node, Bun, Deno).
 * Node's `fetch` rejects `file:` URLs, so they cannot go through `fetch` there.
 * `node:fs/promises` is imported only here, when a `file:` URL is actually read,
 * so the module still loads in a browser.
 *
 * Returns `undefined` when the URL is not a `file:` URL or the host has no
 * `process` (a browser), so the caller falls back to `fetch`. Returns `null`
 * when the file does not exist (the `fetch` 404 equivalent); any other read
 * error is thrown.
 * @param {URL} url
 * @returns {Promise<Uint8Array<ArrayBuffer> | null | undefined>}
 */
async function readFileUrl(url) {
  if (url.protocol !== "file:" || typeof globalThis.process === "undefined") return undefined;
  const { readFile } = await import("node:fs/promises");
  try {
    return new Uint8Array(await readFile(url));
  } catch (e) {
    if (/** @type {{ code?: string }} */ (e)?.code === "ENOENT") return null;
    throw e;
  }
}

/** The default per-fetch time limit (SPEC 4.0.0 §11). */
const DEFAULT_TIMEOUT_MS = 30_000;

/**
 * Validate the caller's options and fill in the defaults.
 * @param {LoadOptions | undefined} options
 * @returns {{ timeoutMs: number, signal: AbortSignal | undefined }}
 */
function resolveOptions(options) {
  const timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  if (typeof timeoutMs !== "number" || Number.isNaN(timeoutMs) || timeoutMs <= 0) {
    throw new TypeError(`wasmImport: options.timeoutMs must be a positive number or Infinity, got ${String(timeoutMs)}`);
  }
  const signal = options?.signal;
  if (signal !== undefined && (typeof signal !== "object" || signal === null || typeof signal.aborted !== "boolean")) {
    throw new TypeError("wasmImport: options.signal must be an AbortSignal");
  }
  return { timeoutMs, signal };
}

/**
 * The statusText is empty over HTTP/2.
 * @param {Response} res
 */
function httpStatus(res) {
  return res.statusText ? `${res.status} ${res.statusText}` : `${res.status}`;
}

/**
 * Fetch `url` once and hand the response to `use`, all under ONE time limit (request to the
 * last byte of the body) and the caller's signal. A timeout, an abort and a network error each
 * become an error naming the URL; an error thrown by `use` reaches the caller as it is.
 * @template T
 * @param {URL} url
 * @param {{ timeoutMs: number, signal: AbortSignal | undefined }} opts
 * @param {(res: Response) => Promise<T>} use
 * @returns {Promise<T>}
 */
async function fetchOnce(url, opts, use) {
  const timer = Number.isFinite(opts.timeoutMs) ? AbortSignal.timeout(opts.timeoutMs) : undefined;
  const signal = timer && opts.signal ? AbortSignal.any([timer, opts.signal]) : (timer ?? opts.signal ?? null);
  /** @param {unknown} e */
  const why = (e) => {
    if (opts.signal?.aborted) return opts.signal.reason;
    if (timer?.aborted) return new Error(`wasmImport: timed out after ${opts.timeoutMs} ms fetching ${url.href}`, { cause: e });
    return undefined;
  };
  let res;
  try {
    res = await fetch(url, { signal });
  } catch (e) {
    throw why(e) ?? new Error(`wasmImport: could not fetch ${url.href}: ${/** @type {Error} */ (e)?.message ?? e}`, { cause: e });
  }
  try {
    return await use(res);
  } catch (e) {
    throw why(e) ?? e;
  }
}

/**
 * Instantiate a .wasm file from a URL, returning raw exports.
 * @param {URL} url
 * @param {WebAssembly.Imports} importObject
 * @param {{ timeoutMs: number, signal: AbortSignal | undefined }} opts
 * @returns {Promise<WebAssembly.Exports>}
 */
async function instantiateWasm(url, importObject, opts) {
  const fileBytes = await readFileUrl(url);
  if (fileBytes === null) throw new Error(`wasmImport: file not found: ${url.href}`);
  if (fileBytes !== undefined) {
    const { instance } = await WebAssembly.instantiate(fileBytes, importObject);
    return instance.exports;
  }
  // One fetch. An HTTP error is reported as one; a compile or link error reaches the
  // caller as it is (never swallowed and retried).
  return fetchOnce(url, opts, async (response) => {
    if (!response.ok) throw new Error(`wasmImport: HTTP ${httpStatus(response)} for ${url.href}`);
    // instantiateStreaming refuses any other Content-Type, so a server that sends
    // `.wasm` as e.g. application/octet-stream takes the arrayBuffer path instead.
    const mime = (response.headers.get("content-type") ?? "").replace(/;.*$/s, "").trim().toLowerCase();
    if (typeof WebAssembly.instantiateStreaming === "function" && mime === "application/wasm") {
      const { instance } = await WebAssembly.instantiateStreaming(response, importObject);
      return instance.exports;
    }
    const { instance } = await WebAssembly.instantiate(await response.arrayBuffer(), importObject);
    return instance.exports;
  });
}

/**
 * The companion `.wit` URL: the `.wasm` path's suffix replaced, query and fragment dropped.
 * `null` when the path does not end in `.wasm` (there is no companion name to look for).
 * @param {URL} wasmUrl
 * @returns {URL | null}
 */
function witUrlFor(wasmUrl) {
  if (!/\.wasm$/i.test(wasmUrl.pathname)) return null;
  const wit = new URL(wasmUrl.href);
  wit.pathname = wit.pathname.replace(/\.wasm$/i, ".wit");
  wit.search = "";
  wit.hash = "";
  return wit;
}

/**
 * Read the companion `.wit` (SPEC 4.0.0 §2). `null` ONLY when it is absent — no file on disk,
 * or HTTP 404 / 410 — which selects raw exports. Every other failure throws: another HTTP
 * status, a network error, a timeout, an unreadable file.
 * @param {URL | null} witUrl
 * @param {{ timeoutMs: number, signal: AbortSignal | undefined }} opts
 * @returns {Promise<string | null>}
 */
async function readWit(witUrl, opts) {
  if (witUrl === null) return null;
  const bytes = await readFileUrl(witUrl);
  if (bytes !== undefined) return bytes === null ? null : new TextDecoder().decode(bytes);
  return fetchOnce(witUrl, opts, async (res) => {
    if (res.status === 404 || res.status === 410) {
      await res.body?.cancel();
      return null;
    }
    if (!res.ok) throw new Error(`wasmImport: HTTP ${httpStatus(res)} for ${witUrl.href}`);
    return res.text();
  });
}

/**
 * Parse an optional `@N` version suffix from a wasm path string.
 * Returns the clean path and the requested version (or null if absent).
 * @param {string | URL} wasmPath
 * @returns {{ cleanPath: string, requestedVersion: number | null }}
 */
function parseVersionSuffix(wasmPath) {
  const raw = typeof wasmPath === "string" ? wasmPath : wasmPath.href;
  const atIdx = raw.lastIndexOf("@");
  if (atIdx !== -1) {
    const suffix = raw.slice(atIdx + 1);
    if (/^\d+$/.test(suffix)) {
      return { cleanPath: raw.slice(0, atIdx), requestedVersion: parseInt(suffix, 10) };
    }
  }
  return { cleanPath: raw, requestedVersion: null };
}

/**
 * Assert that a loaded module's exported `version` global matches the requested version.
 * @param {WebAssembly.Exports} rawExports
 * @param {number} requestedVersion
 * @param {string} wasmPath
 */
function assertVersion(rawExports, requestedVersion, wasmPath) {
  const versionExport = /** @type {WebAssembly.Global|undefined} */ (rawExports.version);
  if (!versionExport || typeof versionExport.value !== "number") {
    throw new Error(
      `wasmImport: version @${requestedVersion} requested for "${wasmPath}" but the module does not export a "version" global`,
    );
  }
  if (versionExport.value !== requestedVersion) {
    throw new Error(
      `wasmImport: version mismatch for "${wasmPath}" — requested @${requestedVersion}, module exports version ${versionExport.value}`,
    );
  }
}

/**
 * A universal WebAssembly loader that mimics ESM import behavior.
 * Works in Node.js 22.18+, Bun, Deno, and all modern browsers.
 *
 * Auto-detects the companion `.wit` file and applies the Canonical ABI.
 * If no `.wit` file exists (absent on disk, or HTTP 404 / 410), raw `WebAssembly.Exports`
 * are returned. Any other `.wit` failure throws, as do a `.wit` that does not parse, a WIT
 * import with no host callback, and a typed call with wrong arguments (SPEC 4.0.0).
 *
 * An optional `@N` version suffix on the path pins to a specific module
 * version, matching the C shared-library (SONAME) convention.
 *
 * ```js
 * // Destructure individual exports
 * const { greet, isEven } = await wasmImport("./mod.wasm");
 *
 * // Or use as a namespace
 * const m = await wasmImport("./mod.wasm");
 * m.greet("World");
 *
 * // Pin to a specific module version
 * const { greet } = await wasmImport("./mod.wasm@2");
 *
 * // With host import callbacks (flat, camelCase): one for every WIT import
 * const { scale } = await wasmImport("./mod.wasm", {
 *   envMul: (a, b) => a * b,
 *   envAdd: (a, b) => a + b,
 * });
 *
 * // A 5 s limit per fetch instead of the default 30 s
 * const m2 = await wasmImport("https://example.com/mod.wasm", {}, { timeoutMs: 5000 });
 * ```
 *
 * @param {string | URL} wasmPath - Path or URL to the .wasm file. Append `@N` to pin to a version.
 * @param {HostCallbacks} [hostCallbacks] - Host import callbacks keyed by camelCase WIT name.
 * @param {LoadOptions} [options] - Per-fetch time limit and an abort signal (SPEC §11).
 * @returns {Promise<WebAssembly.Exports | ModuleExports>}
 */
export async function wasmImport(wasmPath, hostCallbacks = {}, options = {}) {
  const opts = resolveOptions(options);
  opts.signal?.throwIfAborted();
  const { cleanPath, requestedVersion } = parseVersionSuffix(wasmPath);
  const wasmUrl = new URL(cleanPath, import.meta.url);

  // WIT auto-detection: absent → raw exports; any other failure throws (SPEC §2).
  const witUrl = witUrlFor(wasmUrl);
  const witSrc = await readWit(witUrl, opts);

  // SPEC §10: always provide a minimal WASI-P1 shim so an I/O-using library
  // module (e.g. a `modc` library that calls `console.log` → `fd_write`)
  // instantiates even in a host with no native WASI. Unused import namespaces are
  // ignored by `WebAssembly.instantiate`, so pure-compute modules are unaffected.
  const wasiMemRef = { current: /** @type {WebAssembly.Memory | null} */ (null) };
  const wasi = buildWasiShim(wasiMemRef);

  if (witSrc === null) {
    const rawExports = await instantiateWasm(wasmUrl, { wasi_snapshot_preview1: wasi }, opts);
    wasiMemRef.current = /** @type {WebAssembly.Memory} */ (rawExports.memory) ?? null;
    callInitialize(rawExports); // SPEC §10
    if (requestedVersion !== null) assertVersion(rawExports, requestedVersion, cleanPath);
    return rawExports;
  }

  let parsed;
  try {
    parsed = parseWit(witSrc);
  } catch (e) {
    throw new Error(`wasmImport: invalid .wit ${/** @type {URL} */ (witUrl).href}: ${/** @type {Error} */ (e).message}`, { cause: e });
  }
  const { env, memRef } = buildComponentImportEnv(parsed.imports, hostCallbacks);
  /** @type {WebAssembly.Imports} */
  const imports = { wasi_snapshot_preview1: wasi };
  if (parsed.imports.length) imports.env = env;
  const rawExports = await instantiateWasm(wasmUrl, imports, opts);
  const mem = /** @type {WebAssembly.Memory | null} */ (rawExports.memory) ?? null;
  memRef.current = mem; // for env string-param decoding
  wasiMemRef.current = mem; // for the WASI shim
  callInitialize(rawExports); // SPEC §10
  if (requestedVersion !== null) assertVersion(rawExports, requestedVersion, cleanPath);
  return buildComponentExportProxy(parsed.exports, rawExports);
}

/**
 * Create a singleton accessor that loads the WASM instance on the first call and
 * caches it. Subsequent calls return the same instance immediately.
 *
 * Appropriate for CLI tools and bounded-call scenarios where memory growth under
 * a bump allocator is not a concern.
 *
 * ```js
 * const getMod = createSingleton("./mod.wasm@2");
 * const { greet } = await getMod();   // loads on first call, version verified
 * const same = await getMod();        // returns cached instance
 * ```
 *
 * @param {string | URL} wasmPath
 * @param {HostCallbacks} [hostCallbacks]
 * @param {LoadOptions} [options]
 * @returns {() => Promise<WebAssembly.Exports | ModuleExports>}
 */
export function createSingleton(wasmPath, hostCallbacks = {}, options = {}) {
  /** @type {Promise<WebAssembly.Exports | ModuleExports> | null} */
  let _promise = null;
  return () => {
    if (!_promise) _promise = wasmImport(wasmPath, hostCallbacks, options);
    return _promise;
  };
}

/**
 * A pool of pre-instantiated WASM instances for concurrent or high-throughput scenarios.
 *
 * Manages acquire/release semantics so no two concurrent callers share the same instance.
 * Use `run()` for an atomic checkout-call-release pattern.
 *
 * Appropriate for servers and loop-intensive workloads where distributing memory pressure
 * across multiple independent linear memories improves longevity under bump allocators.
 *
 * ```js
 * const pool = new InstancePool("./mod.wasm@2", {}, 4);
 * const result = await pool.run(mod => mod.compute(42));
 * ```
 */
export class InstancePool {
  /**
   * @param {string | URL} wasmPath
   * @param {HostCallbacks} [hostCallbacks]
   * @param {number} [size] - Number of instances to maintain. Default: 4.
   * @param {LoadOptions} [options] - Load options applied to every instance.
   */
  constructor(wasmPath, hostCallbacks = {}, size = 4, options = {}) {
    this._wasmPath = wasmPath;
    this._hostCallbacks = hostCallbacks;
    this._size = size;
    this._options = options;
    /** @type {Promise<void>|null} */
    this._initPromise = null;
    /** @type {Array<WebAssembly.Exports | ModuleExports>} */
    this._available = [];
    /** @type {Array<(inst: WebAssembly.Exports | ModuleExports) => void>} */
    this._waiters = [];
  }

  /** @returns {Promise<void>} */
  _ensureInit() {
    if (!this._initPromise) {
      this._initPromise = Promise.all(
        Array.from({ length: this._size }, () => wasmImport(this._wasmPath, this._hostCallbacks, this._options)),
      ).then(instances => { this._available = [...instances]; });
    }
    return this._initPromise;
  }

  /**
   * Acquire an available instance. Resolves immediately if one is free; otherwise
   * waits until a concurrent caller releases one.
   * @returns {Promise<WebAssembly.Exports | ModuleExports>}
   */
  async acquire() {
    await this._ensureInit();
    const free = this._available.pop();
    if (free !== undefined) return free;
    return new Promise(resolve => this._waiters.push(resolve));
  }

  /**
   * Release an instance back to the pool.
   * @param {WebAssembly.Exports | ModuleExports} instance
   */
  release(instance) {
    const waiter = this._waiters.shift();
    if (waiter !== undefined) {
      waiter(instance);
    } else {
      this._available.push(instance);
    }
  }

  /**
   * Atomically acquire an instance, call `fn` with it, then release it.
   * The instance is released even if `fn` throws.
   * @template T
   * @param {(instance: WebAssembly.Exports | ModuleExports) => T | Promise<T>} fn
   * @returns {Promise<T>}
   */
  async run(fn) {
    const instance = await this.acquire();
    try {
      return await fn(instance);
    } finally {
      this.release(instance);
    }
  }
}
