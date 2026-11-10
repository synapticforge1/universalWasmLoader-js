/**
 * The GitHub side of a release, through GitHub's REST API (no `gh` — workspace letter H30), in
 * the owner's order (2026-11-10, `release-process.md` § 5): CI checks the pushed `main` commit
 * first, then `tag` creates the tag, then `page` makes the GitHub Release page FROM the tag, then
 * the publish jobs upload to JSR and npm. Both commands run in `publish.yml` with `GITHUB_TOKEN`,
 * fetched alone at `GITHUB_SHA` (no checkout beside the write token — C30, H32).
 *
 *   tag   U6: the annotated tag `vX.Y.Z` on `GITHUB_SHA`. Already there at this commit = done, no
 *         write; at another commit = refused. Else POST /git/tags + /git/refs, then read back (it
 *         must peel to `GITHUB_SHA`). A tag made with `GITHUB_TOKEN` starts no workflow run, so
 *         the page and the publish run in the same run (`needs:`).
 *   page  U7, H32's order: the tag exists and peels to `GITHUB_SHA`; a page already there = done,
 *         no write; else POST with the JSR and npm links of the version about to be published on
 *         top of GitHub's generated notes, read it back (the tag, not a draft), peel again.
 *
 * No `release/<tag>` branch is made any more (ledger C45; owner 2026-11-10: "We should be
 * releasing on version tag and creating a release page at that time"). Every request has its own
 * time limit, request to last byte (workspace best-practices 7.21).
 *
 * ```sh
 * GITHUB_TOKEN=… GITHUB_REPOSITORY=owner/repo GITHUB_SHA=<sha> RELEASE_TAG=v2.0.3 \
 *   JSR_PACKAGE=@s/p NPM_PACKAGE=@n/p bun scripts/github-release.ts tag|page [--dry-run]
 * ```
 *
 * The package names come from `JSR_PACKAGE` / `NPM_PACKAGE` (CI, where only this file is
 * fetched), else from `jsr.json` and `scripts/npm/build.ts` (a checkout). Written on `node:`
 * builtins and `fetch` only, so it runs on Bun, Node and Deno alike.
 */
import { readFileSync } from "node:fs";
import process from "node:process";
import { fileURLToPath } from "node:url";

export type Command = "tag" | "page";

export interface ReleaseConfig {
  command: Command;
  repository: string;
  sha: string;
  tag: string;
  token: string | undefined;
  dryRun: boolean;
  jsrPackage: string;
  npmPackage: string;
  githubApi: string;
  requestMs: number;
  log: (line: string) => void;
}

type Json = Record<string, unknown>;

class ReleaseError extends Error {}

/** One request and its body under ONE time limit; a timeout is a `ReleaseError` naming the URL. */
async function timed(cfg: ReleaseConfig, url: string, init: RequestInit): Promise<{ status: number; text: string }> {
  const signal = AbortSignal.timeout(cfg.requestMs);
  try {
    const res = await fetch(url, { ...init, signal });
    return { status: res.status, text: await res.text() };
  } catch (e) {
    if (signal.aborted) throw new ReleaseError(`timed out after ${cfg.requestMs} ms: ${init.method ?? "GET"} ${url}`);
    throw new ReleaseError(`${init.method ?? "GET"} ${url}: ${(e as Error).message}`);
  }
}

async function call(cfg: ReleaseConfig, method: "GET" | "POST", path: string, body?: Json) {
  const headers: Record<string, string> = {
    accept: "application/vnd.github+json",
    "x-github-api-version": "2022-11-28",
    "user-agent": "universal-wasm-loader-release",
  };
  if (cfg.token) headers.authorization = `Bearer ${cfg.token}`;
  if (body) headers["content-type"] = "application/json";
  const init: RequestInit = { method, headers };
  if (body) init.body = JSON.stringify(body);
  const res = await timed(cfg, `${cfg.githubApi}/repos/${cfg.repository}${path}`, init);
  let json: Json = {};
  try {
    json = res.text ? (JSON.parse(res.text) as Json) : {};
  } catch {
    // A non-JSON body (a proxy error page) is reported by status below.
  }
  return { status: res.status, json };
}

/** The commit `refs/tags/<tag>` names, annotated tags followed; `null` when the tag is absent. */
async function peeledTag(cfg: ReleaseConfig): Promise<string | null> {
  const ref = await call(cfg, "GET", `/git/ref/tags/${encodeURIComponent(cfg.tag)}`);
  if (ref.status === 404) return null;
  if (ref.status !== 200) throw new ReleaseError(`reading tag ${cfg.tag}: HTTP ${ref.status}`);
  let obj = ref.json.object as { type?: string; sha?: string } | undefined;
  for (let depth = 0; obj?.type === "tag" && depth < 5; depth++) {
    const tag = await call(cfg, "GET", `/git/tags/${obj.sha}`);
    if (tag.status !== 200) throw new ReleaseError(`reading annotated tag ${obj.sha}: HTTP ${tag.status}`);
    obj = tag.json.object as { type?: string; sha?: string } | undefined;
  }
  if (obj?.type !== "commit" || typeof obj.sha !== "string") {
    throw new ReleaseError(`tag ${cfg.tag} does not resolve to a commit`);
  }
  return obj.sha;
}

/** The tag must exist and be this run's commit. */
async function requireTag(cfg: ReleaseConfig, when: string): Promise<void> {
  const tagSha = await peeledTag(cfg);
  if (tagSha === null) throw new ReleaseError(`tag ${cfg.tag} does not exist on GitHub ${when}`);
  if (tagSha !== cfg.sha) throw new ReleaseError(`tag ${cfg.tag} is ${tagSha} ${when}, not this run's commit ${cfg.sha}`);
  cfg.log(`tag ${cfg.tag} = ${tagSha} (${when})`);
}

/** The text on top of the generated notes: where this version is being published. */
export function releaseBody(cfg: Pick<ReleaseConfig, "jsrPackage" | "npmPackage">, version: string): string {
  return [
    `Published as \`${cfg.jsrPackage}@${version}\` on [JSR](https://jsr.io/${cfg.jsrPackage}@${version}) and`,
    `\`${cfg.npmPackage}@${version}\` on [npm](https://www.npmjs.com/package/${cfg.npmPackage}/v/${version}), the same files, both with provenance`,
    "(the page is made from the tag before the upload; the publish follows in the same run).",
  ].join("\n");
}

/** U6: the annotated tag on this run's commit. */
async function makeTag(cfg: ReleaseConfig): Promise<void> {
  const at = await peeledTag(cfg);
  if (at === cfg.sha) {
    cfg.log(`tag ${cfg.tag}: exists at this commit, nothing written`);
    return;
  }
  if (at !== null) throw new ReleaseError(`tag ${cfg.tag} exists at ${at}, not this run's commit ${cfg.sha}: a published tag never moves`);
  if (cfg.dryRun) {
    cfg.log(`tag ${cfg.tag}: would be created at ${cfg.sha}`);
    return;
  }
  const obj = await call(cfg, "POST", "/git/tags", { tag: cfg.tag, message: cfg.tag, object: cfg.sha, type: "commit" });
  const objSha = obj.json.sha;
  if (obj.status !== 201 || typeof objSha !== "string") throw new ReleaseError(`creating the tag object ${cfg.tag}: HTTP ${obj.status}`);
  const ref = await call(cfg, "POST", "/git/refs", { ref: `refs/tags/${cfg.tag}`, sha: objSha });
  if (ref.status !== 201) throw new ReleaseError(`creating refs/tags/${cfg.tag}: HTTP ${ref.status} ${String(ref.json.message ?? "")}`);
  await requireTag(cfg, "after creating it");
  cfg.log(`tag ${cfg.tag}: created (annotated, object ${objSha})`);
}

/** U7: the Release page from the tag, before the publish. */
async function makePage(cfg: ReleaseConfig, version: string): Promise<void> {
  await requireTag(cfg, "before any write");
  const existing = await call(cfg, "GET", `/releases/tags/${encodeURIComponent(cfg.tag)}`);
  if (existing.status === 200) {
    cfg.log(`release ${cfg.tag}: exists (${existing.json.html_url ?? "no url"}), nothing written`);
    return;
  }
  if (existing.status !== 404) throw new ReleaseError(`reading release ${cfg.tag}: HTTP ${existing.status}`);
  if (cfg.dryRun) {
    cfg.log(`release ${cfg.tag}: would be created with the registry links and generated notes`);
    return;
  }
  const created = await call(cfg, "POST", "/releases", {
    tag_name: cfg.tag,
    name: cfg.tag,
    body: releaseBody(cfg, version),
    generate_release_notes: true,
    draft: false,
    prerelease: false,
  });
  if (created.status !== 201) {
    throw new ReleaseError(`creating release ${cfg.tag}: HTTP ${created.status} ${String(created.json.message ?? "")}`);
  }
  const back = await call(cfg, "GET", `/releases/tags/${encodeURIComponent(cfg.tag)}`);
  if (back.status !== 200 || back.json.tag_name !== cfg.tag || back.json.draft !== false) {
    throw new ReleaseError(`release ${cfg.tag} was created but does not read back as a published release (HTTP ${back.status})`);
  }
  await requireTag(cfg, "after the release");
  cfg.log(`release ${cfg.tag}: created (${back.json.html_url ?? "no url"})`);
}

/** Run one command; resolves to the process exit code (0 or 1). */
export async function run(cfg: ReleaseConfig): Promise<number> {
  try {
    if (cfg.command !== "tag" && cfg.command !== "page") throw new ReleaseError(`unknown command "${cfg.command}" (tag | page)`);
    if (!cfg.dryRun && !cfg.token) throw new ReleaseError("GITHUB_TOKEN is not set (use --dry-run to only check)");
    if (!/^v\d+\.\d+\.\d+$/.test(cfg.tag)) throw new ReleaseError(`not a release tag: ${cfg.tag}`);
    if (!/^[0-9a-f]{40}$/.test(cfg.sha)) throw new ReleaseError(`not a commit id: ${cfg.sha}`);
    if (!/^@[\w.-]+\/[\w.-]+$/.test(cfg.jsrPackage) || !/^@[\w.-]+\/[\w.-]+$/.test(cfg.npmPackage)) {
      throw new ReleaseError(`not scoped package names: JSR "${cfg.jsrPackage}", npm "${cfg.npmPackage}"`);
    }
    if (cfg.command === "tag") await makeTag(cfg);
    else await makePage(cfg, cfg.tag.slice(1));
    return 0;
  } catch (e) {
    if (!(e instanceof ReleaseError)) throw e;
    cfg.log(`error: ${e.message}`);
    return 1;
  }
}

/** The package names: from the environment (CI), else from the checkout's manifests. */
async function packageNames(env: NodeJS.ProcessEnv): Promise<{ jsr: string; npm: string }> {
  if (env.JSR_PACKAGE && env.NPM_PACKAGE) return { jsr: env.JSR_PACKAGE, npm: env.NPM_PACKAGE };
  const root = fileURLToPath(new URL("..", import.meta.url));
  const jsr = (JSON.parse(readFileSync(`${root}/jsr.json`, "utf8")) as { name: string }).name;
  const { NPM_NAME } = await import("./npm/build.ts");
  return { jsr: env.JSR_PACKAGE ?? jsr, npm: env.NPM_PACKAGE ?? NPM_NAME };
}

/** The configuration from the environment and the arguments (a GitHub Actions run). */
export async function configFromEnv(env: NodeJS.ProcessEnv, argv: string[]): Promise<ReleaseConfig> {
  const names = await packageNames(env);
  return {
    command: (argv.find((a) => !a.startsWith("--")) ?? "") as Command,
    repository: env.GITHUB_REPOSITORY ?? "",
    sha: env.GITHUB_SHA ?? "",
    tag: env.RELEASE_TAG ?? "",
    token: env.GITHUB_TOKEN || undefined,
    dryRun: argv.includes("--dry-run"),
    jsrPackage: names.jsr,
    npmPackage: names.npm,
    githubApi: env.GITHUB_API_URL ?? "https://api.github.com",
    requestMs: Number(env.RELEASE_REQUEST_MS ?? 30_000),
    log: (line) => console.log(line),
  };
}

const isMain = process.argv[1] !== undefined &&
  fileURLToPath(import.meta.url).replace(/\\/g, "/") === process.argv[1].replace(/\\/g, "/");
if (isMain) {
  process.exit(await run(await configFromEnv(process.env, process.argv.slice(2))));
}
