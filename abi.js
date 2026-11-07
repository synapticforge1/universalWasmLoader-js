// @ts-self-types="./abi.d.ts"
/** @import { WitFunc } from "./wit-parser.js" */

/**
 * A value crossing the WebAssembly boundary: `number` for i32 / f32 / f64, `bigint` for i64.
 * @typedef {number | bigint} WasmValue
 */

const _enc = new TextEncoder();
const _dec = new TextDecoder();

const S32_MIN = -(2 ** 31);
const S32_MAX = 2 ** 31 - 1;
const S64_MIN = -(2n ** 63n);
const S64_MAX = 2n ** 63n - 1n;

/**
 * What a typed-call argument of WIT type `type` must be, or `null` when `v` is one (SPEC 4.0.0
 * §4: arguments are checked, never coerced).
 * @param {WitFunc["params"][number]["type"]} type
 * @param {unknown} v
 * @returns {string | null}
 */
function argProblem(type, v) {
  switch (type) {
    case "s32":
      return typeof v === "number" && Number.isInteger(v) && v >= S32_MIN && v <= S32_MAX
        ? null
        : "an integer number in [-2147483648, 2147483647]";
    case "s64":
      return typeof v === "bigint" && v >= S64_MIN && v <= S64_MAX ? null : "a bigint in [-2^63, 2^63 - 1]";
    case "f32":
    case "f64":
      return typeof v === "number" ? null : "a number";
    case "bool":
      return typeof v === "boolean" ? null : "a boolean";
    case "string":
      return typeof v === "string" ? null : "a string";
  }
}

/** @param {unknown} v */
function showValue(v) {
  if (typeof v === "string") return JSON.stringify(v);
  if (typeof v === "bigint") return `${v}n`;
  if (typeof v === "symbol") return v.toString();
  return `${String(v)} (${v === null ? "null" : typeof v})`;
}

/** @param {WitFunc} fn */
function signature(fn) {
  return `${fn.tsName}(${fn.params.map((p) => `${p.name}: ${p.type}`).join(", ")})`;
}

/**
 * Check a host callback's return value against its WIT import's result and encode it for WASM
 * (SPEC 4.0.0 §4: the argument rules in reverse, nothing coerced). A void import ignores the
 * value; a Promise is refused for every import, since WASM cannot await it.
 * @param {WitFunc} fn
 * @param {unknown} ret
 * @returns {WasmValue | undefined}
 */
function encodeCallbackResult(fn, ret) {
  const label = () => `host callback ${fn.tsName} (WIT import "${fn.name}"${fn.result ? ` -> ${fn.result}` : ""})`;
  if (typeof (/** @type {{ then?: unknown }} */ (ret)?.then) === "function") {
    throw new TypeError(`wasmImport: ${label()} returned a Promise; host callbacks must be synchronous (WASM cannot await)`);
  }
  if (fn.result === null) return undefined;
  const expected = argProblem(fn.result, ret);
  if (expected !== null) throw new TypeError(`wasmImport: ${label()} returned ${showValue(ret)}; expected ${expected}`);
  if (fn.result === "bool") return ret ? 1 : 0;
  return /** @type {WasmValue} */ (ret);
}

/**
 * Build the WASM `env` import object for the Canonical ABI (wasmtime) profile.
 *
 * Returns `{ env, memRef }`. After WASM instantiation, set `memRef.current`
 * to `instance.exports.memory` so that string-param imports can decode
 * from linear memory.
 *
 * Every WIT import needs a callback: a missing one throws here, at load time, naming all of
 * them (SPEC 4.0.0 §4) — never a silent `0` when the module calls it. An import with a `string`
 * result is refused here too: returning a string to WASM is not implemented. A callback's
 * return value is checked against the WIT result when the module calls it.
 *
 * @param {WitFunc[]} importFuncs
 * @param {Record<string, (...args: unknown[]) => unknown> | undefined} userCallbacks - keyed by camelCase tsName
 * @returns {{ env: Record<string, (...args: WasmValue[]) => unknown>, memRef: { current: WebAssembly.Memory | null } }}
 */
export function buildComponentImportEnv(importFuncs, userCallbacks) {
  const missing = importFuncs.filter((fn) => typeof userCallbacks?.[fn.tsName] !== "function");
  if (missing.length > 0) {
    const names = missing.map((fn) => `${fn.tsName} (WIT "${fn.name}")`).join(", ");
    throw new Error(`wasmImport: no host callback for WIT import${missing.length > 1 ? "s" : ""}: ${names}`);
  }
  const stringResult = importFuncs.filter((fn) => fn.result === "string");
  if (stringResult.length > 0) {
    const names = stringResult.map((fn) => `${fn.tsName} (WIT "${fn.name}")`).join(", ");
    throw new Error(`wasmImport: a WIT import returning a string is not supported: ${names}`);
  }

  const memRef = { current: /** @type {WebAssembly.Memory|null} */ (null) };
  /** @type {Record<string, (...args: WasmValue[]) => unknown>} */
  const env = {};

  for (const fn of importFuncs) {
    const wasmKey = fn.name.replace(/-/g, "_");
    const cb = /** @type {(...args: unknown[]) => unknown} */ (userCallbacks?.[fn.tsName]);
    const params = fn.params;
    const hasStrParam = params.some(p => p.type === "string");

    if (hasStrParam) {
      env[wasmKey] = (...rawArgs) => {
        if (memRef.current === null) {
          throw new Error(
            `wasmImport: import "${fn.name}" received a string before the module's memory was ` +
              "available (the module exports no `memory`, or calls it from its start function)",
          );
        }
        const view = new Uint8Array(memRef.current.buffer);
        /** @type {unknown[]} */
        const jsArgs = [];
        let i = 0;
        for (const p of params) {
          if (p.type === "string") {
            // A string arrives as two i32s: (ptr, len).
            const ptr = /** @type {number} */ (rawArgs[i++]);
            const len = /** @type {number} */ (rawArgs[i++]);
            jsArgs.push(_dec.decode(view.subarray(ptr, ptr + len)));
          } else if (p.type === "bool") {
            jsArgs.push(rawArgs[i++] !== 0);
          } else {
            jsArgs.push(rawArgs[i++]);
          }
        }
        return encodeCallbackResult(fn, cb(...jsArgs));
      };
    } else {
      env[wasmKey] = (...rawArgs) => {
        const jsArgs = rawArgs.map((v, idx) => {
          const p = params[idx];
          if (!p) return v;
          return p.type === "bool" ? v !== 0 : v;
        });
        return encodeCallbackResult(fn, cb(...jsArgs));
      };
    }
  }

  return { env, memRef };
}

/**
 * Build a typed JS proxy over raw WASM exports using the Canonical ABI (wasmtime) profile.
 * Requires the WASM module to export `cabi_realloc`.
 *
 * A WIT export the module does not export throws here, at load time. Each typed call checks
 * its arguments against the WIT signature and throws a `TypeError` on a wrong count or kind
 * (SPEC 4.0.0 §4): nothing is coerced.
 *
 * @param {WitFunc[]} exportFuncs
 * @param {WebAssembly.Exports} rawExports
 * @returns {Record<string, (...args: unknown[]) => unknown>}
 */
export function buildComponentExportProxy(exportFuncs, rawExports) {
  const exp = /** @type {Record<string,unknown>} */ (rawExports);
  const mem = /** @type {WebAssembly.Memory} */ (exp.memory);
  const cabiRealloc = /** @type {(origPtr:number,origLen:number,align:number,newLen:number)=>number} */ (exp.cabi_realloc);

  const absent = exportFuncs.filter((fn) => typeof exp[fn.tsName] !== "function");
  if (absent.length > 0) {
    const names = absent.map((fn) => `${fn.tsName} (WIT "${fn.name}")`).join(", ");
    throw new Error(`wasmImport: the .wit declares export${absent.length > 1 ? "s" : ""} the module does not export: ${names}`);
  }

  /** @type {Record<string, (...args: unknown[]) => unknown>} */
  const proxy = {};
  for (const fn of exportFuncs) {
    const wasmFn = /** @type {(...a:unknown[])=>unknown} */ (exp[fn.tsName]);

    proxy[fn.tsName] = (...jsArgs) => {
      if (jsArgs.length !== fn.params.length) {
        throw new TypeError(
          `wasmImport: ${signature(fn)} expects ${fn.params.length} argument${fn.params.length === 1 ? "" : "s"}, got ${jsArgs.length}`,
        );
      }
      for (let i = 0; i < fn.params.length; i++) {
        const p = /** @type {WitFunc["params"][number]} */ (fn.params[i]);
        const expected = argProblem(p.type, jsArgs[i]);
        if (expected !== null) {
          throw new TypeError(
            `wasmImport: ${signature(fn)}: parameter ${p.name} (${p.type}) expects ${expected}, got ${showValue(jsArgs[i])}`,
          );
        }
      }
      /** @type {unknown[]} */
      const wasmArgs = [];
      for (let i = 0; i < fn.params.length; i++) {
        const p = /** @type {WitFunc["params"][number]} */ (fn.params[i]);
        const v = jsArgs[i];
        if (p.type === "string") {
          const bytes = _enc.encode(String(v));
          const ptr = cabiRealloc(0, 0, 1, bytes.length);
          new Uint8Array(mem.buffer).set(bytes, ptr);
          wasmArgs.push(ptr, bytes.length);
        } else if (p.type === "bool") {
          wasmArgs.push(v ? 1 : 0);
        } else {
          wasmArgs.push(v);
        }
      }

      if (fn.result === "string") {
        // Canonical ABI callee-allocated return: the export returns an i32 pointer to a
        // callee-allocated [ptr, len] pair. Read it, decode, then call the paired
        // `cabi_post_<name>` export to release the buffer (no-op under a bump allocator,
        // but part of the contract). Decoding copies the bytes, so the string survives post.
        const retArea = /** @type {number} */ (wasmFn(...wasmArgs));
        const dv = new DataView(mem.buffer);
        const retPtr = dv.getInt32(retArea, true);
        const retLen = dv.getInt32(retArea + 4, true);
        const str = _dec.decode(new Uint8Array(mem.buffer, retPtr, retLen));
        const post = /** @type {((p:number)=>void)|undefined} */ (exp[`cabi_post_${fn.tsName}`]);
        if (typeof post === "function") post(retArea);
        return str;
      }

      const raw = wasmFn(...wasmArgs);
      if (fn.result === null) return undefined;
      if (fn.result === "bool") return raw !== 0;
      return raw;
    };
  }

  return proxy;
}
