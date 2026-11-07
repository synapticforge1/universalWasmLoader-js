// @ts-self-types="./wit-parser.d.ts"
/** @import { ParsedWit, WitFunc, WitParam, WitType } from "./wit-parser.js" */

/**
 * Convert kebab-case WIT name to camelCase JS name.
 * @param {string} name
 * @returns {string}
 */
export function kebabToCamel(name) {
  return name.replace(/-([a-z0-9])/g, (_, /** @type {string} */ c) => c.toUpperCase());
}

/**
 * Convert kebab-case WIT import name to the underscore WASM import key.
 * @param {string} name
 * @returns {string}
 */
export function kebabToWasmImportKey(name) {
  return name.replace(/-/g, "_");
}

/** The WIT types this loader translates (SPEC §4); any other type is an error. */
const WIT_TYPES = new Set(["s32", "s64", "f32", "f64", "bool", "string"]);

/** A WIT identifier: kebab-case words of letters and digits. */
const IDENT = /^[A-Za-z][A-Za-z0-9]*(?:-[A-Za-z0-9]+)*$/;

/**
 * @param {string} raw
 * @param {string} where - e.g. `export add, parameter b`, for the error message
 * @returns {WitType}
 */
function parseWitType(raw, where) {
  const t = raw.trim();
  if (!WIT_TYPES.has(t)) {
    throw new Error(`unsupported WIT type "${t}" in ${where} (supported: ${[...WIT_TYPES].join(", ")})`);
  }
  return /** @type {WitType} */ (t);
}

/**
 * @param {string} raw - the text between the parentheses of `func(...)`
 * @param {string} fnLabel - e.g. `export add`
 * @returns {WitParam[]}
 */
function parseWitParams(raw, fnLabel) {
  // A trailing comma is valid WIT: `func(a: s32,)`.
  const parts = raw.split(",").map((p) => p.trim());
  if (parts.length > 0 && parts[parts.length - 1] === "") parts.pop();
  /** @type {WitParam[]} */
  const params = [];
  const seen = new Set();
  for (const part of parts) {
    const m = /^([^:\s]+)\s*:\s*(\S+)$/.exec(part);
    if (!m || !IDENT.test(/** @type {string} */ (m[1]))) {
      throw new Error(`malformed parameter "${part}" in ${fnLabel} (expected "name: type")`);
    }
    const rawName = /** @type {string} */ (m[1]);
    if (seen.has(rawName)) throw new Error(`duplicate parameter "${rawName}" in ${fnLabel}`);
    seen.add(rawName);
    const type = parseWitType(/** @type {string} */ (m[2]), `${fnLabel}, parameter ${rawName}`);
    params.push({ name: kebabToCamel(rawName), type });
  }
  return params;
}

/** One `import` / `export` statement of a world body, without its `;`. */
const FUNC_STMT = /^(import|export)\s+([^\s:]+)\s*:\s*func\s*\(([^()]*)\)\s*(?:->\s*(\S+))?$/;

/**
 * Parse a WIT source string in the subset wasmtk produces: an optional `package` line and one
 * `world` holding only `import` / `export` function statements, with `//` comments. Anything
 * else — a malformed statement or parameter, an unsupported type, a duplicate name, text outside
 * the world — throws an `Error` naming it (SPEC 4.0.0 §2): a `.wit` is never read loosely.
 *
 * @param {string} src
 * @returns {ParsedWit}
 */
export function parseWit(src) {
  const code = src.replace(/^﻿/, "").replace(/\/\/[^\n]*/g, "");

  let rest = code.trim();
  let packageName = "";
  const pkg = /^package\s+([^\s;]+)\s*;/.exec(rest);
  if (pkg) {
    packageName = /** @type {string} */ (pkg[1]);
    rest = rest.slice(pkg[0].length).trim();
  }

  const world = /^world\s+([^\s{]+)\s*\{([^{}]*)\}$/.exec(rest);
  if (!world) {
    const what = rest === "" ? "it is empty" : `expected one "world <name> { ... }" block, found: ${rest.slice(0, 60)}`;
    throw new Error(`not a WIT world: ${what}`);
  }
  const worldName = /** @type {string} */ (world[1]);
  if (!IDENT.test(worldName)) throw new Error(`malformed world name "${worldName}"`);

  /** @type {WitFunc[]} */
  const imports = [];
  /** @type {WitFunc[]} */
  const exports = [];
  const statements = /** @type {string} */ (world[2]).split(";").map((s) => s.trim());
  const last = statements.pop();
  if (last !== "") throw new Error(`unterminated WIT statement (missing ";"): ${last}`);
  for (const stmt of statements) {
    const m = FUNC_STMT.exec(stmt);
    if (!m) throw new Error(`unsupported or malformed WIT statement: ${stmt.replace(/\s+/g, " ")}`);
    const keyword = /** @type {"import" | "export"} */ (m[1]);
    const name = /** @type {string} */ (m[2]);
    const fnLabel = `${keyword} ${name}`;
    if (!IDENT.test(name)) throw new Error(`malformed function name in ${fnLabel}`);
    const list = keyword === "import" ? imports : exports;
    if (list.some((f) => f.name === name)) throw new Error(`duplicate ${fnLabel}`);
    const params = parseWitParams(/** @type {string} */ (m[3]), fnLabel);
    const result = m[4] ? parseWitType(m[4], `${fnLabel}, result`) : null;
    list.push({ name, tsName: kebabToCamel(name), params, result });
  }

  return { packageName, worldName, imports, exports };
}
