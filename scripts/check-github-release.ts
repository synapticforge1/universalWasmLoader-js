/**
 * Self-test of `scripts/github-release.ts` (`tag` and `page`) against a mock GitHub REST API on a
 * local `node:http` server (workspace letters H30 / H32 / H33, 2026-11-10). Every refusal path is
 * checked to send NO write; each happy path to send exactly its writes, with the token; a re-run
 * to send none; a stalled API to time out, under a guard of the self-test's own.
 *
 * ```sh
 * bun run release:selftest
 * ```
 */
import { createServer, type IncomingMessage } from "node:http";
import type { AddressInfo } from "node:net";
import process from "node:process";
import { type Command, type ReleaseConfig, run } from "./github-release.ts";

const SHA = "1".repeat(40);
const OTHER = "2".repeat(40);
const TAG_OBJ = "3".repeat(40);
const NEW_OBJ = "4".repeat(40);
const REPO = "o/r";

interface World {
  tag: "light" | "annotated" | "absent" | "other";
  movesAfterWrite: boolean;
  release: "absent" | "exists";
  postTagObject: number;
  postRelease: number;
  stall: "" | "tag-read" | "release-read";
}
interface Write {
  path: string;
  body: unknown;
  auth: string | undefined;
}

function body(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve) => {
    let s = "";
    req.on("data", (c) => (s += c));
    req.on("end", () => resolve(s ? JSON.parse(s) : undefined));
  });
}

async function scenario(command: Command, world: World, over: Partial<ReleaseConfig> = {}) {
  const writes: Write[] = [];
  let wrote = false;
  const server = createServer(async (req, res) => {
    const p = (req.url ?? "").replace(`/gh/repos/${REPO}`, "");
    const send = (status: number, json?: unknown) => {
      res.writeHead(status, { "content-type": "application/json" }).end(json === undefined ? "" : JSON.stringify(json));
    };
    if (req.method === "POST") {
      writes.push({ path: p, body: await body(req), auth: req.headers.authorization });
      wrote = true;
      if (p === "/git/tags") return world.postTagObject === 201 ? send(201, { sha: NEW_OBJ }) : send(world.postTagObject, { message: "mock" });
      if (p === "/git/refs") {
        world.tag = "annotated";
        return send(201, {});
      }
      if (p === "/releases") {
        if (world.postRelease === 201) world.release = "exists";
        return send(world.postRelease, { message: "mock" });
      }
      return send(404);
    }
    if (p === "/git/ref/tags/v2.0.3") {
      if (world.stall === "tag-read") return;
      if (world.tag === "absent") return send(404);
      if (wrote && world.movesAfterWrite) return send(200, { object: { type: "commit", sha: OTHER } });
      if (world.tag === "annotated") return send(200, { object: { type: "tag", sha: TAG_OBJ } });
      return send(200, { object: { type: "commit", sha: world.tag === "other" ? OTHER : SHA } });
    }
    if (p === `/git/tags/${TAG_OBJ}`) return send(200, { object: { type: "commit", sha: SHA } });
    if (p === "/releases/tags/v2.0.3") {
      if (world.stall === "release-read") return;
      return world.release === "exists" ? send(200, { tag_name: "v2.0.3", draft: false, html_url: "u" }) : send(404);
    }
    return send(404);
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const lines: string[] = [];
  const cfg: ReleaseConfig = {
    command,
    repository: REPO,
    sha: SHA,
    tag: "v2.0.3",
    token: "tok",
    dryRun: false,
    jsrPackage: "@s/p",
    npmPackage: "@n/p",
    githubApi: `${base}/gh`,
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
    return { code, writes, lines, ms: Date.now() - started };
  } finally {
    server.closeAllConnections?.();
    server.close();
  }
}

const base: World = { tag: "absent", movesAfterWrite: false, release: "absent", postTagObject: 201, postRelease: 201, stall: "" };
let failed = 0;
function verdict(ok: boolean, name: string, detail: string) {
  if (!ok) failed++;
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${ok ? "" : `\n     ${detail}`}`);
}
async function check(command: Command, name: string, world: Partial<World>, want: { code: number; writes: string[]; line?: RegExp }, over?: Partial<ReleaseConfig>) {
  const r = await scenario(command, { ...base, ...world }, over);
  const writes = r.writes.map((w) => w.path);
  const good = r.code === want.code && JSON.stringify(writes) === JSON.stringify(want.writes) &&
    (!want.line || r.lines.some((l) => want.line?.test(l)));
  verdict(good, `${command}: ${name} → exit ${r.code}, writes [${writes.join(", ")}]`, r.lines.join("\n     "));
  return r;
}

// tag (U6)
const made = await check("tag", "no tag yet → annotated tag created and read back", {}, { code: 0, writes: ["/git/tags", "/git/refs"], line: /created \(annotated/ });
const tagBody = made.writes[0]?.body as { tag?: string; object?: string; type?: string } | undefined;
const refBody = made.writes[1]?.body as { ref?: string; sha?: string } | undefined;
verdict(made.writes.every((w) => w.auth === "Bearer tok") && tagBody?.tag === "v2.0.3" && tagBody.object === SHA && tagBody.type === "commit" &&
  refBody?.ref === "refs/tags/v2.0.3" && refBody.sha === NEW_OBJ, "tag: bodies — Bearer token; tag object on the commit; ref to the tag object", JSON.stringify(made.writes));
await check("tag", "re-run: tag already at this commit → no write", { tag: "annotated" }, { code: 0, writes: [], line: /exists at this commit, nothing written/ });
await check("tag", "tag at another commit → refused, no write", { tag: "other" }, { code: 1, writes: [], line: /a published tag never moves/ });
await check("tag", "tag reads another commit after the write → exit 1", { movesAfterWrite: true }, { code: 1, writes: ["/git/tags", "/git/refs"], line: /after creating it, not this run's commit/ });
await check("tag", "POST /git/tags refused (422) → exit 1, no ref", { postTagObject: 422 }, { code: 1, writes: ["/git/tags"], line: /HTTP 422/ });
await check("tag", "--dry-run → no write", {}, { code: 0, writes: [], line: /would be created/ }, { dryRun: true, token: undefined });
const stalledTag = await check("tag", "stalled API → timed out, no write", { stall: "tag-read" }, { code: 1, writes: [], line: /timed out after 300 ms/ }, { requestMs: 300 });
verdict(stalledTag.ms < 5000, "tag: the stall ends by its own limit", `${stalledTag.ms} ms`);

// page (U7)
const page = await check("page", "tag at this commit, no page → page created, read back, peeled again", { tag: "annotated" }, { code: 0, writes: ["/releases"], line: /release v2.0.3: created/ });
const relBody = page.writes[0]?.body as { tag_name?: string; generate_release_notes?: boolean; body?: string } | undefined;
verdict(page.writes[0]?.auth === "Bearer tok" && relBody?.tag_name === "v2.0.3" && relBody.generate_release_notes === true &&
  !!relBody.body?.includes("https://jsr.io/@s/p@2.0.3") && !!relBody.body?.includes("https://www.npmjs.com/package/@n/p/v/2.0.3") &&
  page.lines.some((l) => /after the release/.test(l)), "page: body — token, tag_name, generated notes, JSR + npm links; the tag peeled again", JSON.stringify(page.writes));
await check("page", "lightweight tag at this commit also works", { tag: "light" }, { code: 0, writes: ["/releases"] });
await check("page", "re-run: page exists → no write", { tag: "annotated", release: "exists" }, { code: 0, writes: [], line: /nothing written/ });
await check("page", "tag absent → refused, no write", { tag: "absent" }, { code: 1, writes: [], line: /does not exist on GitHub/ });
await check("page", "tag at another commit → refused, no write", { tag: "other" }, { code: 1, writes: [], line: /not this run's commit/ });
await check("page", "tag moved after the release → exit 1", { tag: "annotated", movesAfterWrite: true }, { code: 1, writes: ["/releases"], line: /after the release, not this run's commit/ });
await check("page", "POST /releases refused (422) → exit 1", { tag: "annotated", postRelease: 422 }, { code: 1, writes: ["/releases"], line: /HTTP 422/ });
const stalledPage = await check("page", "stalled API → timed out, no write", { tag: "annotated", stall: "release-read" }, { code: 1, writes: [], line: /timed out after 300 ms/ }, { requestMs: 300 });
verdict(stalledPage.ms < 5000, "page: the stall ends by its own limit", `${stalledPage.ms} ms`);
await check("page", "--dry-run → no write", { tag: "annotated" }, { code: 0, writes: [], line: /would be created/ }, { dryRun: true, token: undefined });

// both
await check("page", "no token and not a dry run → refused before any request", {}, { code: 1, writes: [], line: /GITHUB_TOKEN is not set/ }, { token: undefined });
await check("tag", "not a release tag → refused", {}, { code: 1, writes: [], line: /not a release tag/ }, { tag: "main" });
await check("tag", "unscoped package name → refused", {}, { code: 1, writes: [], line: /not scoped package names/ }, { npmPackage: "p" });
await check("tag", "unknown command → refused", {}, { code: 1, writes: [], line: /unknown command/ }, { command: "push" as Command });

console.log(failed === 0 ? "github-release self-test: all checks passed" : `github-release self-test: ${failed} FAILED`);
process.exit(failed === 0 ? 0 : 1);
