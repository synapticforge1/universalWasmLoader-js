/**
 * Reference test suite for @jrmarcum/universal-wasm-loader.
 *
 * Written on `node:test` + `node:assert` so ONE file runs under every supported runtime
 * (Bun migration, 2026-10-12): never `bun:test` or `Deno.test`. No dependency at all: `@std/assert`
 * was dropped 2026-10-21 (owner: no `@std` that may disappear with Deno); `strictEqual` from
 * `node:assert/strict` is the same `Object.is` comparison.
 *
 *   bun run test        # bun test ./tests/loader.test.js  (the daily runner)
 *   bun run test:node   # node --test tests/loader.test.js
 *   bun run test:deno   # deno test --allow-read --allow-env --allow-net=127.0.0.1 --allow-write=.test-tmp tests/loader.test.js
 *
 * The 26 assertions of the pre-migration `run_tests.js`, as 24 tests: the concurrent-pool pair
 * and the acquire/release pair each stay in one test, because each pair is one sequence.
 * Since 2026-10-26: 28 tests (34 assertions), the four added loading over http (the fetch path).
 * Since 2026-11-07 (SPEC 4.0.0): 73 tests — the refusals of §2 (absent vs failed `.wit`, strict
 * parsing), §4 (host callbacks and their return values, typed-call arguments) and §11 (time
 * limit, abort).
 */
import { describe, it } from "node:test";
import {
  deepStrictEqual as assertDeepEquals,
  rejects as assertRejects,
  strictEqual as assertStrictEquals,
  throws as assertThrows,
} from "node:assert/strict";
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { wasmImport, createSingleton, InstancePool } from "../universal-wasm-loader.js";
import { parseWit } from "../wit-parser.js";

/** @param {string} name */
const fixture = (name) => new URL(`./${name}`, import.meta.url);

/**
 * Serve `routes` on 127.0.0.1 for the length of `fn`, counting the requests per path: a body +
 * Content-Type answers 200, `{ status }` answers that status, `"stall"` never answers, any other
 * path is a 404. `http:` loads take the `fetch` path that a browser takes; `file:` loads never
 * reach it.
 * @param {Record<string, { type: string, body: Uint8Array | string } | { status: number } | "stall">} routes
 * @param {(base: string, hits: Map<string, number>) => Promise<void>} fn
 */
async function withServer(routes, fn) {
  /** @type {Map<string, number>} */
  const hits = new Map();
  const server = createServer((req, res) => {
    const path = req.url ?? "/";
    hits.set(path, (hits.get(path) ?? 0) + 1);
    const route = routes[path];
    if (route === "stall") return;
    if (!route) {
      res.writeHead(404).end();
      return;
    }
    if ("status" in route) {
      res.writeHead(route.status).end();
      return;
    }
    res.writeHead(200, { "content-type": route.type }).end(route.body);
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve(undefined)));
  const { port } = /** @type {import("node:net").AddressInfo} */ (server.address());
  try {
    await fn(`http://127.0.0.1:${port}`, hits);
  } finally {
    server.closeAllConnections?.();
    await new Promise((resolve) => server.close(() => resolve(undefined)));
  }
}

/** `math_50.wasm` served as application/wasm, with `wit` (if given) as its `.wit`. */
async function mathRoutes(/** @type {string} */ dir, /** @type {string | undefined} */ wit) {
  const body = await readFile(fixture("math_50.wasm"));
  /** @type {Record<string, { type: string, body: Uint8Array | string }>} */
  const routes = { [`/${dir}/math_50.wasm`]: { type: "application/wasm", body } };
  if (wit !== undefined) routes[`/${dir}/math_50.wit`] = { type: "text/plain", body: wit };
  return routes;
}

describe("math_50 — numeric round-trip", () => {
  it("add(3, 4) = 7", async () => {
    const { add } = await wasmImport(fixture("math_50.wasm"));
    assertStrictEquals(add(3, 4), 7);
  });
  it("multiply(2.5,4)=10", async () => {
    const { multiply } = await wasmImport(fixture("math_50.wasm"));
    assertStrictEquals(multiply(2.5, 4.0), 10.0);
  });
  it("square(5) = 25", async () => {
    const { square } = await wasmImport(fixture("math_50.wasm"));
    assertStrictEquals(square(5), 25);
  });
});

describe("booleans_50 — bool normalization", () => {
  it("isPositive(1.0) = true", async () => {
    const { isPositive } = await wasmImport(fixture("booleans_50.wasm"));
    assertStrictEquals(isPositive(1.0), true);
  });
  it("isPositive(-1.0) = false", async () => {
    const { isPositive } = await wasmImport(fixture("booleans_50.wasm"));
    assertStrictEquals(isPositive(-1.0), false);
  });
  it("inRange(5,0,10) = true", async () => {
    const { inRange } = await wasmImport(fixture("booleans_50.wasm"));
    assertStrictEquals(inRange(5.0, 0.0, 10.0), true);
  });
  it("inRange(11,0,10) = false", async () => {
    const { inRange } = await wasmImport(fixture("booleans_50.wasm"));
    assertStrictEquals(inRange(11.0, 0.0, 10.0), false);
  });
  it("isEven(4) = true", async () => {
    const { isEven } = await wasmImport(fixture("booleans_50.wasm"));
    assertStrictEquals(isEven(4), true);
  });
  it("isEven(3) = false", async () => {
    const { isEven } = await wasmImport(fixture("booleans_50.wasm"));
    assertStrictEquals(isEven(3), false);
  });
});

describe("strings_50 — string params + returns", () => {
  it('greet("World") = "Hello, World!"', async () => {
    const { greet } = await wasmImport(fixture("strings_50.wasm"));
    assertStrictEquals(greet("World"), "Hello, World!");
  });
  it('shout("hi") = "hihi"', async () => {
    const { shout } = await wasmImport(fixture("strings_50.wasm"));
    assertStrictEquals(shout("hi"), "hihi");
  });
  it('strLen("hello") = 5', async () => {
    const { strLen } = await wasmImport(fixture("strings_50.wasm"));
    assertStrictEquals(strLen("hello"), 5);
  });
});

describe("imports_50 — host import callbacks", () => {
  const callbacks = {
    envMul: (/** @type {number} */ a, /** @type {number} */ b) => a * b,
    envAdd: (/** @type {number} */ a, /** @type {number} */ b) => a + b,
  };
  it("scale(3.0, 4.0) = 12.0", async () => {
    const { scale } = await wasmImport(fixture("imports_50.wasm"), callbacks);
    assertStrictEquals(scale(3.0, 4.0), 12.0);
  });
  it("combine(10, 7) = 17", async () => {
    const { combine } = await wasmImport(fixture("imports_50.wasm"), callbacks);
    assertStrictEquals(combine(10, 7), 17);
  });
});

describe("SPEC §10 — _initialize called after instantiation", () => {
  // init_check.wasm has no .wit (raw-exports path); its `_initialize` sets a global
  // to 99 that `getValue` reads — so 99 proves the loader invoked `_initialize`.
  it("getValue() = 99 (proves _initialize ran)", async () => {
    const m = await wasmImport(fixture("init_check.wasm"));
    assertStrictEquals(m.getValue(), 99);
  });
});

describe("SPEC §10 — WASI-P1 shim lets an I/O library instantiate", () => {
  // wasi_io_50 is a `modc` library that calls console.log → imports fd_write.
  // Without the loader's WASI-P1 shim it would fail to instantiate (missing import).
  it("logAndDouble(21) = 42 (instantiated via WASI shim)", async () => {
    const { logAndDouble } = await wasmImport(fixture("wasi_io_50.wasm"));
    assertStrictEquals(logAndDouble(21), 42);
  });
});

describe("createSingleton — identity across calls", () => {
  const getMod = createSingleton(fixture("math_50.wasm"));
  it("singleton returns same instance", async () => {
    assertStrictEquals(await getMod(), await getMod());
  });
  it("singleton result: add(1,2)=3", async () => {
    const a = await getMod();
    assertStrictEquals(a.add(1, 2), 3);
  });
});

describe("createSingleton — bool normalization", () => {
  const getMod = createSingleton(fixture("booleans_50.wasm"));
  it("singleton: isEven(6)=true", async () => {
    const { isEven } = await getMod();
    assertStrictEquals(isEven(6), true);
  });
  it("singleton: isEven(7)=false", async () => {
    const { isEven } = await getMod();
    assertStrictEquals(isEven(7), false);
  });
});

describe("InstancePool — run() completes correctly", () => {
  const pool = new InstancePool(fixture("math_50.wasm"), {}, 2);
  it("pool.run add(10,5)=15", async () => {
    assertStrictEquals(await pool.run((m) => m.add(10, 5)), 15);
  });
  it("pool.run square(4)=16", async () => {
    assertStrictEquals(await pool.run((m) => m.square(4)), 16);
  });
});

describe("InstancePool — concurrent run() calls", () => {
  it("concurrent pool: isEven(4)=true, isEven(3)=false", async () => {
    const pool = new InstancePool(fixture("booleans_50.wasm"), {}, 2);
    const [a, b] = await Promise.all([
      pool.run((m) => m.isEven(4)),
      pool.run((m) => m.isEven(3)),
    ]);
    assertStrictEquals(a, true);
    assertStrictEquals(b, false);
  });
});

describe("http(s) — the fetch path", () => {
  it("a 404 on the .wasm names the status and the URL", async () => {
    await withServer({}, async (base, hits) => {
      await assertRejects(wasmImport(`${base}/missing.wasm`), {
        message: `wasmImport: HTTP 404 Not Found for ${base}/missing.wasm`,
      });
      assertStrictEquals(hits.get("/missing.wasm"), 1);
    });
  });
  it("application/wasm: add(3,4)=7, one request", async () => {
    const body = await readFile(fixture("math_50.wasm"));
    const wit = await readFile(fixture("math_50.wit"));
    const routes = {
      "/math_50.wasm": { type: "application/wasm", body },
      "/math_50.wit": { type: "text/plain", body: wit },
    };
    await withServer(routes, async (base, hits) => {
      const { add } = await wasmImport(`${base}/math_50.wasm`);
      assertStrictEquals(add(3, 4), 7);
      assertStrictEquals(hits.get("/math_50.wasm"), 1);
    });
  });
  it("application/octet-stream: still loads, square(5)=25", async () => {
    const body = await readFile(fixture("math_50.wasm"));
    await withServer({ "/math_50.wasm": { type: "application/octet-stream", body } }, async (base, hits) => {
      const m = await wasmImport(`${base}/math_50.wasm`);
      assertStrictEquals(m.square(5), 25);
      assertStrictEquals(hits.get("/math_50.wasm"), 1);
    });
  });
  it("a module that does not compile is reported once, as a CompileError", async () => {
    const body = new Uint8Array([0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00, 0xff]);
    await withServer({ "/bad.wasm": { type: "application/wasm", body } }, async (base, hits) => {
      await assertRejects(wasmImport(`${base}/bad.wasm`), WebAssembly.CompileError);
      assertStrictEquals(hits.get("/bad.wasm"), 1);
    });
  });
});

describe("SPEC 4.0.0 §2 — only an ABSENT .wit means raw exports", () => {
  it("a .wit answering 410 is absent: raw exports, add(3,4)=7", async () => {
    const routes = { ...(await mathRoutes("gone")), "/gone/math_50.wit": { status: 410 } };
    await withServer(routes, async (base) => {
      const m = await wasmImport(`${base}/gone/math_50.wasm`);
      assertStrictEquals(m.add(3, 4), 7);
      assertStrictEquals(m.memory instanceof WebAssembly.Memory, true);
    });
  });
  it("a .wit answering 500 throws naming it; the .wasm is never fetched", async () => {
    const routes = { ...(await mathRoutes("e500")), "/e500/math_50.wit": { status: 500 } };
    await withServer(routes, async (base, hits) => {
      await assertRejects(wasmImport(`${base}/e500/math_50.wasm`), {
        message: `wasmImport: HTTP 500 Internal Server Error for ${base}/e500/math_50.wit`,
      });
      assertStrictEquals(hits.get("/e500/math_50.wasm"), undefined);
    });
  });
  it("a malformed .wit over http throws naming it; the .wasm is never fetched", async () => {
    await withServer(await mathRoutes("bad", "this is not WIT {{{"), async (base, hits) => {
      await assertRejects(wasmImport(`${base}/bad/math_50.wasm`), (/** @type {Error} */ e) =>
        e.message.startsWith(`wasmImport: invalid .wit ${base}/bad/math_50.wit: not a WIT world`));
      assertStrictEquals(hits.get("/bad/math_50.wasm"), undefined);
    });
  });
  it("a malformed .wit on disk throws naming it", async () => {
    // A gitignored folder in the repo, so `deno test` needs write access to that folder only.
    const scratch = fileURLToPath(new URL("../.test-tmp/", import.meta.url));
    await mkdir(scratch, { recursive: true });
    const dir = await mkdtemp(join(scratch, "uwl-wit-"));
    try {
      await copyFile(fixture("math_50.wasm"), join(dir, "math_50.wasm"));
      await writeFile(join(dir, "math_50.wit"), "world w { export add: func(a: s32 b: s32) -> s32; }");
      await assertRejects(wasmImport(pathToFileURL(join(dir, "math_50.wasm"))), (/** @type {Error} */ e) =>
        e.message.includes("invalid .wit") && e.message.includes('malformed parameter "a: s32 b: s32" in export add'));
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
  it("a WIT export the module does not export throws at load", async () => {
    const wit = "world m { export add: func(a: s32, b: s32) -> s32; export nope: func() -> s32; }";
    await withServer(await mathRoutes("extra", wit), async (base) => {
      await assertRejects(wasmImport(`${base}/extra/math_50.wasm`), {
        message: 'wasmImport: the .wit declares export the module does not export: nope (WIT "nope")',
      });
    });
  });
});

describe("SPEC 4.0.0 §2 — the WIT parser is strict", () => {
  it("parses wasmtk's subset, comments and a trailing comma", () => {
    const w = parseWit("// gen\npackage local:x-1;\nworld x-1 {\n  import env-mul: func(p0: f64, p1: f64,) -> f64;\n  export is-even: func(n: s32) -> bool;\n  export noop: func();\n}\n");
    assertDeepEquals(w, {
      packageName: "local:x-1",
      worldName: "x-1",
      imports: [{ name: "env-mul", tsName: "envMul", params: [{ name: "p0", type: "f64" }, { name: "p1", type: "f64" }], result: "f64" }],
      exports: [
        { name: "is-even", tsName: "isEven", params: [{ name: "n", type: "s32" }], result: "bool" },
        { name: "noop", tsName: "noop", params: [], result: null },
      ],
    });
  });
  /** @type {[string, string][]} */
  const bad = [
    ["", "not a WIT world: it is empty"],
    ["this is not WIT {{{", "not a WIT world"],
    ["world w { export add: func(a: s32) -> s99; }", 'unsupported WIT type "s99" in export add, result'],
    ["world w { export add: func(a: u32) -> s32; }", 'unsupported WIT type "u32" in export add, parameter a'],
    ["world w { export add: func(a: s32 b: s32) -> s32; }", 'malformed parameter "a: s32 b: s32" in export add'],
    ["world w { export add: func(a, b) -> s32; }", 'malformed parameter "a" in export add'],
    ["world w { export add: func(a: s32, a: s32) -> s32; }", 'duplicate parameter "a" in export add'],
    ["world w { export f: func(); export f: func(); }", "duplicate export f"],
    ["world w { export add: func() -> s32 }", "unterminated WIT statement"],
    ["world w { record point { x: s32 } }", "not a WIT world"],
    ["world w { use foo; }", "unsupported or malformed WIT statement: use foo"],
    ["world w { } world v { }", "not a WIT world"],
  ];
  for (const [src, message] of bad) {
    it(`refuses ${JSON.stringify(src) || '""'}`, () => {
      assertThrows(() => parseWit(src), (/** @type {Error} */ e) => e.message.startsWith(message));
    });
  }
});

describe("SPEC 4.0.0 §11 — fetch time limit and abort", () => {
  it("a .wit that never answers times out (timeoutMs: 200)", async () => {
    const routes = { ...(await mathRoutes("slow")), "/slow/math_50.wit": /** @type {const} */ ("stall") };
    await withServer(routes, async (base) => {
      await assertRejects(wasmImport(`${base}/slow/math_50.wasm`, {}, { timeoutMs: 200 }), {
        message: `wasmImport: timed out after 200 ms fetching ${base}/slow/math_50.wit`,
      });
    });
  });
  it("a .wasm that never answers times out (timeoutMs: 200), one request", async () => {
    await withServer({ "/slow2/math_50.wasm": "stall" }, async (base, hits) => {
      await assertRejects(wasmImport(`${base}/slow2/math_50.wasm`, {}, { timeoutMs: 200 }), {
        message: `wasmImport: timed out after 200 ms fetching ${base}/slow2/math_50.wasm`,
      });
      assertStrictEquals(hits.get("/slow2/math_50.wasm"), 1);
    });
  });
  it("an aborted signal rejects with its reason", async () => {
    await withServer({ "/ab/math_50.wasm": "stall" }, async (base) => {
      const ctl = new AbortController();
      const reason = new Error("caller gave up");
      setTimeout(() => ctl.abort(reason), 50);
      await assertRejects(wasmImport(`${base}/ab/math_50.wasm`, {}, { signal: ctl.signal, timeoutMs: 5000 }), reason);
    });
  });
  it("a refused connection names the URL", async () => {
    let base = "";
    // Only to learn a port that is free again once withServer returns.
    await withServer({}, (b) => {
      base = b;
      return Promise.resolve();
    });
    await assertRejects(wasmImport(`${base}/math_50.wasm`), (/** @type {Error} */ e) =>
      e.message.startsWith(`wasmImport: could not fetch ${base}/math_50.wit: `));
  });
  it("timeoutMs must be a positive number", async () => {
    for (const timeoutMs of [0, -1, Number.NaN, /** @type {any} */ ("30")]) {
      await assertRejects(wasmImport(fixture("math_50.wasm"), {}, { timeoutMs }), TypeError);
    }
    const { add } = await wasmImport(fixture("math_50.wasm"), {}, { timeoutMs: Number.POSITIVE_INFINITY });
    assertStrictEquals(add(1, 1), 2);
  });
});

describe("SPEC 4.0.0 §4 — a WIT import needs a host callback", () => {
  it("no callbacks: refused at load, both named", async () => {
    await assertRejects(wasmImport(fixture("imports_50.wasm")), {
      message: 'wasmImport: no host callback for WIT imports: envMul (WIT "env-mul"), envAdd (WIT "env-add")',
    });
  });
  it("one missing: refused at load, that one named", async () => {
    await assertRejects(wasmImport(fixture("imports_50.wasm"), { envMul: (/** @type {number} */ a, /** @type {number} */ b) => a * b }), {
      message: 'wasmImport: no host callback for WIT import: envAdd (WIT "env-add")',
    });
  });
});

describe("SPEC 4.0.0 §4 — host callback return values are checked", () => {
  // imports_50: scale(x, f) calls env-mul (-> f64); combine(a, b) calls env-add (-> s32).
  const ok = { envMul: (/** @type {number} */ a, /** @type {number} */ b) => a * b, envAdd: (/** @type {number} */ a, /** @type {number} */ b) => a + b };
  /** @type {[string, "scale" | "combine", Record<string, (...a: any[]) => unknown>, string][]} */
  const cases = [
    ["undefined (f64)", "scale", { envMul: () => undefined }, 'host callback envMul (WIT import "env-mul" -> f64) returned undefined (undefined); expected a number'],
    ["null (s32)", "combine", { envAdd: () => null }, 'host callback envAdd (WIT import "env-add" -> s32) returned null (null); expected an integer number in [-2147483648, 2147483647]'],
    ['"12" (f64)', "scale", { envMul: () => "12" }, 'returned "12"; expected a number'],
    ["2.9 (s32)", "combine", { envAdd: () => 2.9 }, "returned 2.9 (number); expected an integer number in [-2147483648, 2147483647]"],
    ["2 ** 31 (s32)", "combine", { envAdd: () => 2 ** 31 }, "returned 2147483648 (number); expected an integer number in [-2147483648, 2147483647]"],
    ["true (s32)", "combine", { envAdd: () => true }, "returned true (boolean); expected an integer number in [-2147483648, 2147483647]"],
    ["17n (s32)", "combine", { envAdd: () => 17n }, "returned 17n; expected an integer number in [-2147483648, 2147483647]"],
    ["a Promise (async)", "scale", { envMul: async () => 12 }, 'host callback envMul (WIT import "env-mul" -> f64) returned a Promise; host callbacks must be synchronous (WASM cannot await)'],
  ];
  for (const [label, call, override, tail] of cases) {
    it(`${label} is refused when the module calls it`, async () => {
      const m = /** @type {Record<string, (...a: number[]) => unknown>} */ (await wasmImport(fixture("imports_50.wasm"), { ...ok, ...override }));
      const args = call === "scale" ? [3.0, 4.0] : [10, 7];
      assertThrows(() => m[call]?.(...args), (/** @type {Error} */ e) => e instanceof TypeError && e.message.endsWith(tail));
    });
  }
  it("correct returns still work: scale(3,4)=12, combine(-2147483648, 0) at the s32 edge", async () => {
    const m = /** @type {Record<string, (...a: number[]) => unknown>} */ (await wasmImport(fixture("imports_50.wasm"), ok));
    assertStrictEquals(m.scale?.(3.0, 4.0), 12.0);
    assertStrictEquals(m.combine?.(-2147483648, 0), -2147483648);
  });
});

describe("http(s) — SPEC 4.0.0 §4: a WIT import returning a string is refused at load", () => {
  it("names the import; the .wasm is never fetched", async () => {
    const wit = "world i { import env-mul: func(p0: f64, p1: f64) -> string; export scale: func(x: f64, factor: f64) -> f64; }";
    const routes = {
      "/sr/imports_50.wasm": { type: "application/wasm", body: await readFile(fixture("imports_50.wasm")) },
      "/sr/imports_50.wit": { type: "text/plain", body: wit },
    };
    await withServer(routes, async (base, hits) => {
      await assertRejects(wasmImport(`${base}/sr/imports_50.wasm`, { envMul: () => "x" }), {
        message: 'wasmImport: a WIT import returning a string is not supported: envMul (WIT "env-mul")',
      });
      assertStrictEquals(hits.get("/sr/imports_50.wasm"), undefined);
    });
  });
});

describe("SPEC 4.0.0 §4 — typed calls check their arguments", () => {
  /** @type {[string, string, unknown[], string][]} */
  const cases = [
    ["math_50.wasm", "add", ["x", 1], 'parameter a (s32) expects an integer number in [-2147483648, 2147483647], got "x"'],
    ["math_50.wasm", "add", [2.7, 1], "parameter a (s32) expects an integer number in [-2147483648, 2147483647], got 2.7 (number)"],
    ["math_50.wasm", "add", [1, 2 ** 31], "parameter b (s32) expects an integer number in [-2147483648, 2147483647], got 2147483648 (number)"],
    ["math_50.wasm", "add", [1], "expects 2 arguments, got 1"],
    ["math_50.wasm", "add", [1, 2, 3], "expects 2 arguments, got 3"],
    ["math_50.wasm", "multiply", [2.5, "4"], 'parameter b (f64) expects a number, got "4"'],
    ["strings_50.wasm", "greet", [42], "parameter name (string) expects a string, got 42 (number)"],
    ["strings_50.wasm", "strLen", [null], "parameter s (string) expects a string, got null (null)"],
    ["booleans_50.wasm", "isEven", ["4"], 'parameter n (s32) expects an integer number in [-2147483648, 2147483647], got "4"'],
  ];
  for (const [file, name, args, tail] of cases) {
    it(`${name}(${args.map((a) => JSON.stringify(a)).join(", ")}) throws a TypeError`, async () => {
      const m = /** @type {Record<string, (...a: unknown[]) => unknown>} */ (await wasmImport(fixture(file)));
      assertThrows(() => m[name]?.(...args), (/** @type {Error} */ e) => e instanceof TypeError && e.message.endsWith(tail));
    });
  }
  it("in-range values still work: add(-2147483648, 0), multiply(NaN, 1) is NaN", async () => {
    const m = /** @type {Record<string, (...a: unknown[]) => unknown>} */ (await wasmImport(fixture("math_50.wasm")));
    assertStrictEquals(m.add?.(-2147483648, 0), -2147483648);
    assertStrictEquals(Number.isNaN(m.multiply?.(Number.NaN, 1)), true);
  });
});

describe("InstancePool — acquire/release", () => {
  it("acquired instance: add(3,3)=6, then run after release: add(7,8)=15", async () => {
    const pool = new InstancePool(fixture("math_50.wasm"), {}, 1);
    const inst = await pool.acquire();
    assertStrictEquals(inst.add(3, 3), 6);
    pool.release(inst);
    assertStrictEquals(await pool.run((m) => m.add(7, 8)), 15);
  });
});
