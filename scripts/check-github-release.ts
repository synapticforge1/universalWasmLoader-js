/**
 * Self-test of `scripts/github-release.ts` against a mock GitHub REST API, JSR and npm on one
 * local `node:http` server (workspace letters H30 / H32, 2026-11-09). Every refusal path is checked
 * to send NO write; the happy path is checked to send exactly the two writes, with the token and
 * the registry links; an existing page is checked to need no write at all.
 *
 * ```sh
 * bun run release:selftest
 * ```
 */
import { createServer, type IncomingMessage } from "node:http";
import type { AddressInfo } from "node:net";
import process from "node:process";
import { type ReleaseConfig, run } from "./github-release.ts";

const SHA = "1".repeat(40);
const OTHER = "2".repeat(40);
const TAG_OBJ = "3".repeat(40);
const REPO = "o/r";

interface World {
  tag: "light" | "annotated" | "absent" | "other";
  tagAfterPost: "same" | "moved";
  branch: "absent" | "here" | "elsewhere";
  release: "absent" | "exists";
  jsr: number;
  npm: number;
  postRelease: number;
  stall: "" | "release-read";
}
interface Seen {
  writes: { path: string; body: unknown; auth: string | undefined }[];
}

function body(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve) => {
    let s = "";
    req.on("data", (c) => (s += c));
    req.on("end", () => resolve(s ? JSON.parse(s) : undefined));
  });
}

async function scenario(world: World, over: Partial<ReleaseConfig> = {}) {
  const seen: Seen = { writes: [] };
  let posted = false;
  const server = createServer(async (req, res) => {
    const url = req.url ?? "";
    const send = (status: number, json?: unknown) => {
      res.writeHead(status, { "content-type": "application/json" }).end(json === undefined ? "" : JSON.stringify(json));
    };
    if (url.startsWith("/jsr/")) return send(world.jsr, {});
    if (url.startsWith("/npm/")) return send(world.npm, {});
    const p = url.replace(`/gh/repos/${REPO}`, "");
    if (req.method === "POST") {
      seen.writes.push({ path: p, body: await body(req), auth: req.headers.authorization });
      if (p === "/git/refs") {
        world.branch = "here";
        return send(201, {});
      }
      if (p === "/releases") {
        posted = true;
        if (world.postRelease === 201) world.release = "exists";
        return send(world.postRelease, { message: "mock" });
      }
      return send(404);
    }
    if (p === "/git/ref/tags/v2.0.1") {
      if (world.tag === "absent") return send(404);
      const moved = posted && world.tagAfterPost === "moved";
      if (world.tag === "annotated" && !moved) return send(200, { object: { type: "tag", sha: TAG_OBJ } });
      return send(200, { object: { type: "commit", sha: world.tag === "other" || moved ? OTHER : SHA } });
    }
    if (p === `/git/tags/${TAG_OBJ}`) return send(200, { object: { type: "commit", sha: SHA } });
    if (p === "/git/ref/heads/release/v2.0.1") {
      if (world.branch === "absent") return send(404);
      return send(200, { object: { sha: world.branch === "here" ? SHA : OTHER } });
    }
    if (p === "/releases/tags/v2.0.1") {
      if (world.stall === "release-read") return; // never answers
      return world.release === "exists" ? send(200, { tag_name: "v2.0.1", draft: false, html_url: "u" }) : send(404);
    }
    return send(404);
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const lines: string[] = [];
  const cfg: ReleaseConfig = {
    repository: REPO,
    sha: SHA,
    tag: "v2.0.1",
    token: "tok",
    dryRun: false,
    jsrPackage: "@s/p",
    npmPackage: "@n/p",
    githubApi: `${base}/gh`,
    jsrApi: `${base}/jsr`,
    npmRegistry: `${base}/npm`,
    waitAttempts: 2,
    waitMs: 1,
    requestMs: 2000,
    log: (l) => lines.push(l),
    ...over,
  };
  const started = Date.now();
  try {
    // A guard of its own, so a script that lost its time limit FAILS here instead of hanging.
    const code = await Promise.race([
      run(cfg),
      new Promise<number>((r) => setTimeout(() => {
        lines.push("hung: no answer within the self-test's 8 s guard");
        r(-1);
      }, 8000)),
    ]);
    return { code, seen, lines, ms: Date.now() - started };
  } finally {
    server.closeAllConnections?.();
    server.close();
  }
}

const ok: World = { tag: "light", tagAfterPost: "same", branch: "absent", release: "absent", jsr: 200, npm: 200, postRelease: 201, stall: "" };
let failed = 0;
async function check(name: string, world: World, want: { code: number; writes: string[]; line?: RegExp }, over?: Partial<ReleaseConfig>) {
  const r = await scenario({ ...world }, over);
  const writes = r.seen.writes.map((w) => w.path);
  const good = r.code === want.code && JSON.stringify(writes) === JSON.stringify(want.writes) &&
    (!want.line || r.lines.some((l) => want.line?.test(l)));
  if (!good) failed++;
  console.log(`${good ? "ok  " : "FAIL"} ${name}: exit ${r.code}, writes [${writes.join(", ")}]${good ? "" : `\n     ${r.lines.join("\n     ")}`}`);
  return r;
}

const happy = await check("lightweight tag, nothing yet → branch + release created", ok, { code: 0, writes: ["/git/refs", "/releases"], line: /release v2.0.1: created/ });
const auths = happy.seen.writes.map((w) => w.auth);
const refBody = happy.seen.writes[0]?.body as { ref?: string; sha?: string } | undefined;
const relBody = happy.seen.writes[1]?.body as { tag_name?: string; generate_release_notes?: boolean; body?: string } | undefined;
if (auths.some((a) => a !== "Bearer tok") || refBody?.ref !== "refs/heads/release/v2.0.1" || refBody.sha !== SHA ||
  relBody?.tag_name !== "v2.0.1" || relBody.generate_release_notes !== true ||
  !relBody.body?.includes("https://jsr.io/@s/p@2.0.1") || !relBody.body.includes("https://www.npmjs.com/package/@n/p/v/2.0.1")) {
  failed++;
  console.log(`FAIL write bodies / token: ${JSON.stringify(happy.seen.writes)}`);
} else {
  console.log("ok   write bodies: Bearer token; ref = refs/heads/release/v2.0.1 at the commit; tag_name, generated notes, JSR + npm links");
}
if (!happy.lines.some((l) => /after the release/.test(l))) {
  failed++;
  console.log("FAIL the tag was not peeled again after the release");
} else {
  console.log("ok   the tag is peeled again after the release");
}
await check("annotated tag is peeled to the commit", { ...ok, tag: "annotated" }, { code: 0, writes: ["/git/refs", "/releases"] });
await check("re-run: branch and release exist → no write", { ...ok, branch: "here", release: "exists" }, { code: 0, writes: [], line: /nothing written/ });
await check("page exists, branch missing → done, NO write", { ...ok, branch: "absent", release: "exists" }, { code: 0, writes: [], line: /nothing written/ });
await check("tag absent → refused, no write", { ...ok, tag: "absent" }, { code: 1, writes: [], line: /does not exist on GitHub/ });
await check("tag at another commit → refused, no write", { ...ok, tag: "other" }, { code: 1, writes: [], line: /not this run's commit/ });
await check("tag moved after the release → exit 1", { ...ok, tagAfterPost: "moved" }, { code: 1, writes: ["/git/refs", "/releases"], line: /after the release, not this run's commit/ });
await check("branch exists elsewhere → refused, no release", { ...ok, branch: "elsewhere" }, { code: 1, writes: [], line: /exists at 2{40}/ });
await check("JSR lacks the version → refused, no write", { ...ok, jsr: 404 }, { code: 1, writes: [], line: /JSR @s\/p@2.0.1 does not serve/ });
await check("npm lacks the version → refused, no write", { ...ok, npm: 404 }, { code: 1, writes: [], line: /npm @n\/p@2.0.1 does not serve/ });
await check("POST /releases refused (422) → exit 1", { ...ok, postRelease: 422 }, { code: 1, writes: ["/git/refs", "/releases"], line: /HTTP 422/ });
const stalled = await check("stalled API → timed out, no write", { ...ok, stall: "release-read" }, { code: 1, writes: [], line: /timed out after 300 ms/ }, { requestMs: 300 });
if (stalled.ms > 5000) {
  failed++;
  console.log(`FAIL the stall took ${stalled.ms} ms`);
}
await check("--dry-run → checks only, no write", ok, { code: 0, writes: [], line: /would be created/ }, { dryRun: true, token: undefined });
await check("no token and not a dry run → refused before any request", ok, { code: 1, writes: [], line: /GITHUB_TOKEN is not set/ }, { token: undefined });
await check("not a release tag → refused", ok, { code: 1, writes: [], line: /not a release tag/ }, { tag: "main" });
await check("unscoped package name → refused", ok, { code: 1, writes: [], line: /not scoped package names/ }, { npmPackage: "p" });

console.log(failed === 0 ? "github-release self-test: all checks passed" : `github-release self-test: ${failed} FAILED`);
process.exit(failed === 0 ? 0 : 1);
