/**
 * The GitHub side of a release, through GitHub's REST API (workspace letter H30, owner
 * 2026-11-08: no `gh`, in CI too). Run by `publish.yml`'s `release` job with `GITHUB_TOKEN`:
 *
 * 1. waits until BOTH registries serve the version (JSR's version endpoint and npm's version
 *    document answer 200) — so the release follows the registries, not the jobs' exit codes
 *    (ledger C34: a job can fail AFTER its upload);
 * 2. requires the tag to exist on GitHub and peel (annotated tags followed) to `GITHUB_SHA`:
 *    `POST /releases` would otherwise CREATE a missing tag from the default branch;
 * 3. creates the `release/<tag>` branch at that commit, unless it already points there;
 * 4. creates the GitHub Release with generated notes, unless it exists, and reads it back.
 *
 * Re-running it is safe: every step that exists already is checked, not repeated.
 *
 * ```sh
 * GITHUB_TOKEN=… GITHUB_REPOSITORY=owner/repo GITHUB_SHA=<sha> RELEASE_TAG=v2.0.1 \
 *   bun scripts/github-release.ts [--dry-run]
 * ```
 *
 * Written on `node:` builtins and `fetch` only, so it runs on Bun, Node and Deno alike. The URLs
 * of the three services and the wait can be overridden (for `check-github-release.ts`).
 */
import { readFileSync } from "node:fs";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { NPM_NAME } from "./npm/build.ts";

export interface ReleaseConfig {
  repository: string;
  sha: string;
  tag: string;
  token: string | undefined;
  dryRun: boolean;
  jsrPackage: string;
  npmPackage: string;
  githubApi: string;
  jsrApi: string;
  npmRegistry: string;
  waitAttempts: number;
  waitMs: number;
  log: (line: string) => void;
}

type Json = Record<string, unknown>;

class ReleaseError extends Error {}

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
  const res = await fetch(`${cfg.githubApi}/repos/${cfg.repository}${path}`, init);
  const text = await res.text();
  let json: Json = {};
  try {
    json = text ? (JSON.parse(text) as Json) : {};
  } catch {
    // A non-JSON body (a proxy error page) is reported by status below.
  }
  return { status: res.status, json };
}

/** Poll `url` until it answers 200; any other final answer is an error naming it. */
async function waitFor200(cfg: ReleaseConfig, what: string, url: string): Promise<void> {
  let last = "no answer";
  for (let i = 1; i <= cfg.waitAttempts; i++) {
    try {
      const res = await fetch(url, { headers: { "cache-control": "no-cache" } });
      await res.body?.cancel();
      if (res.status === 200) {
        cfg.log(`${what}: 200`);
        return;
      }
      last = `HTTP ${res.status}`;
    } catch (e) {
      last = (e as Error).message;
    }
    if (i < cfg.waitAttempts) await new Promise((r) => setTimeout(r, cfg.waitMs));
  }
  throw new ReleaseError(`${what} does not serve the version (${last} after ${cfg.waitAttempts} tries): ${url}`);
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

/** Run the release steps; resolves to the process exit code (0 or 1). */
export async function run(cfg: ReleaseConfig): Promise<number> {
  try {
    if (!cfg.dryRun && !cfg.token) throw new ReleaseError("GITHUB_TOKEN is not set (use --dry-run to only check)");
    if (!/^v\d+\.\d+\.\d+$/.test(cfg.tag)) throw new ReleaseError(`not a release tag: ${cfg.tag}`);
    if (!/^[0-9a-f]{40}$/.test(cfg.sha)) throw new ReleaseError(`not a commit id: ${cfg.sha}`);
    const version = cfg.tag.slice(1);

    // 1. Both registries serve the version.
    const [scope, name] = cfg.jsrPackage.replace(/^@/, "").split("/");
    await waitFor200(cfg, `JSR ${cfg.jsrPackage}@${version}`, `${cfg.jsrApi}/scopes/${scope}/packages/${name}/versions/${version}`);
    await waitFor200(cfg, `npm ${cfg.npmPackage}@${version}`, `${cfg.npmRegistry}/${cfg.npmPackage.replace("/", "%2F")}/${version}`);

    // 2. The tag exists on GitHub and is the commit this run was started for.
    const tagSha = await peeledTag(cfg);
    if (tagSha === null) throw new ReleaseError(`tag ${cfg.tag} does not exist on GitHub (a release never creates its tag)`);
    if (tagSha !== cfg.sha) throw new ReleaseError(`tag ${cfg.tag} is ${tagSha}, not this run's commit ${cfg.sha}`);
    cfg.log(`tag ${cfg.tag} = ${tagSha}`);

    // 3. The release/<tag> branch.
    const branch = `release/${cfg.tag}`;
    const head = await call(cfg, "GET", `/git/ref/heads/${branch}`);
    if (head.status === 200) {
      const at = (head.json.object as { sha?: string } | undefined)?.sha;
      if (at !== cfg.sha) throw new ReleaseError(`branch ${branch} exists at ${at}, not ${cfg.sha}`);
      cfg.log(`branch ${branch}: exists at the tag`);
    } else if (head.status === 404) {
      if (cfg.dryRun) {
        cfg.log(`branch ${branch}: would be created at ${cfg.sha}`);
      } else {
        const made = await call(cfg, "POST", "/git/refs", { ref: `refs/heads/${branch}`, sha: cfg.sha });
        if (made.status !== 201) throw new ReleaseError(`creating branch ${branch}: HTTP ${made.status}`);
        cfg.log(`branch ${branch}: created`);
      }
    } else {
      throw new ReleaseError(`reading branch ${branch}: HTTP ${head.status}`);
    }

    // 4. The GitHub Release.
    const existing = await call(cfg, "GET", `/releases/tags/${encodeURIComponent(cfg.tag)}`);
    if (existing.status === 200) {
      cfg.log(`release ${cfg.tag}: exists (${existing.json.html_url ?? "no url"})`);
      return 0;
    }
    if (existing.status !== 404) throw new ReleaseError(`reading release ${cfg.tag}: HTTP ${existing.status}`);
    if (cfg.dryRun) {
      cfg.log(`release ${cfg.tag}: would be created with generated notes`);
      return 0;
    }
    const created = await call(cfg, "POST", "/releases", {
      tag_name: cfg.tag,
      name: cfg.tag,
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
    cfg.log(`release ${cfg.tag}: created (${back.json.html_url ?? "no url"})`);
    return 0;
  } catch (e) {
    if (!(e instanceof ReleaseError)) throw e;
    cfg.log(`error: ${e.message}`);
    return 1;
  }
}

/** The configuration from the environment and the manifest (a GitHub Actions run). */
export function configFromEnv(env: NodeJS.ProcessEnv, argv: string[]): ReleaseConfig {
  const root = fileURLToPath(new URL("..", import.meta.url));
  const jsr = JSON.parse(readFileSync(`${root}/jsr.json`, "utf8")) as { name: string };
  return {
    repository: env.GITHUB_REPOSITORY ?? "",
    sha: env.GITHUB_SHA ?? "",
    tag: env.RELEASE_TAG ?? env.GITHUB_REF_NAME ?? "",
    token: env.GITHUB_TOKEN || undefined,
    dryRun: argv.includes("--dry-run"),
    jsrPackage: jsr.name,
    npmPackage: NPM_NAME,
    githubApi: env.GITHUB_API_URL ?? "https://api.github.com",
    jsrApi: env.JSR_API_URL ?? "https://api.jsr.io",
    npmRegistry: env.NPM_REGISTRY_URL ?? "https://registry.npmjs.org",
    waitAttempts: Number(env.RELEASE_WAIT_ATTEMPTS ?? 20),
    waitMs: Number(env.RELEASE_WAIT_MS ?? 15_000),
    log: (line) => console.log(line),
  };
}

const isMain = process.argv[1] !== undefined &&
  fileURLToPath(import.meta.url).replace(/\\/g, "/") === process.argv[1].replace(/\\/g, "/");
if (isMain) {
  process.exit(await run(configFromEnv(process.env, process.argv.slice(2))));
}
