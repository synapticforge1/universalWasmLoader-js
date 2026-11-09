/**
 * The GitHub side of a release, through GitHub's REST API (workspace letters H30 and H32: no
 * `gh`; every tagged release gets its page from CI). Run by `publish.yml`'s `release` job with
 * `GITHUB_TOKEN`, fetched alone at the tagged commit (no checkout beside the write token, C30):
 *
 * 1. waits until BOTH registries serve the version (JSR's version endpoint and npm's version
 *    document answer 200) — so the release follows the registries, not the jobs' exit codes
 *    (ledger C34: a job can fail AFTER its upload);
 * 2. requires the tag to exist on GitHub and peel (annotated tags followed) to `GITHUB_SHA`:
 *    `POST /releases` would otherwise CREATE a missing tag from the default branch;
 * 3. a Release already there means done: NO write of any kind (re-runs are safe);
 * 4. creates the `release/<tag>` branch at that commit, unless it already points there;
 * 5. creates the Release — the JSR and npm links on top of GitHub's generated notes — then reads
 *    it back (the tag, not a draft) and peels the tag AGAIN (it must not have moved).
 *
 * Every request has its own time limit, request to last byte (workspace best-practices 7.21).
 *
 * ```sh
 * GITHUB_TOKEN=… GITHUB_REPOSITORY=owner/repo GITHUB_SHA=<sha> RELEASE_TAG=v2.0.1 \
 *   bun scripts/github-release.ts [--dry-run]
 * ```
 *
 * The package names come from `JSR_PACKAGE` / `NPM_PACKAGE` (CI, where only this file is
 * fetched), else from `jsr.json` and `scripts/npm/build.ts` (a checkout). Written on `node:`
 * builtins and `fetch` only, so it runs on Bun, Node and Deno alike. The URLs of the three
 * services, the wait and the time limit can be overridden (for `check-github-release.ts`).
 */
import { readFileSync } from "node:fs";
import process from "node:process";
import { fileURLToPath } from "node:url";

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

/** Poll `url` until it answers 200; any other final answer is an error naming it. */
async function waitFor200(cfg: ReleaseConfig, what: string, url: string): Promise<void> {
  let last = "no answer";
  for (let i = 1; i <= cfg.waitAttempts; i++) {
    try {
      const res = await timed(cfg, url, { headers: { "cache-control": "no-cache" } });
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

/** The tag must exist and be this run's commit. */
async function requireTag(cfg: ReleaseConfig, when: string): Promise<void> {
  const tagSha = await peeledTag(cfg);
  if (tagSha === null) throw new ReleaseError(`tag ${cfg.tag} does not exist on GitHub ${when} (a release never creates its tag)`);
  if (tagSha !== cfg.sha) throw new ReleaseError(`tag ${cfg.tag} is ${tagSha} ${when}, not this run's commit ${cfg.sha}`);
  cfg.log(`tag ${cfg.tag} = ${tagSha} (${when})`);
}

/** The text on top of the generated notes: where the version is published. */
export function releaseBody(cfg: Pick<ReleaseConfig, "jsrPackage" | "npmPackage">, version: string): string {
  return [
    `Published as \`${cfg.jsrPackage}@${version}\` on [JSR](https://jsr.io/${cfg.jsrPackage}@${version}) and`,
    `\`${cfg.npmPackage}@${version}\` on [npm](https://www.npmjs.com/package/${cfg.npmPackage}/v/${version}), the same files, both with provenance.`,
  ].join("\n");
}

/** Run the release steps; resolves to the process exit code (0 or 1). */
export async function run(cfg: ReleaseConfig): Promise<number> {
  try {
    if (!cfg.dryRun && !cfg.token) throw new ReleaseError("GITHUB_TOKEN is not set (use --dry-run to only check)");
    if (!/^v\d+\.\d+\.\d+$/.test(cfg.tag)) throw new ReleaseError(`not a release tag: ${cfg.tag}`);
    if (!/^[0-9a-f]{40}$/.test(cfg.sha)) throw new ReleaseError(`not a commit id: ${cfg.sha}`);
    if (!/^@[\w.-]+\/[\w.-]+$/.test(cfg.jsrPackage) || !/^@[\w.-]+\/[\w.-]+$/.test(cfg.npmPackage)) {
      throw new ReleaseError(`not scoped package names: JSR "${cfg.jsrPackage}", npm "${cfg.npmPackage}"`);
    }
    const version = cfg.tag.slice(1);

    // 1. Both registries serve the version.
    const [scope, name] = cfg.jsrPackage.slice(1).split("/");
    await waitFor200(cfg, `JSR ${cfg.jsrPackage}@${version}`, `${cfg.jsrApi}/scopes/${scope}/packages/${name}/versions/${version}`);
    await waitFor200(cfg, `npm ${cfg.npmPackage}@${version}`, `${cfg.npmRegistry}/${cfg.npmPackage.replace("/", "%2F")}/${version}`);

    // 2. The tag exists on GitHub and is the commit this run was started for.
    await requireTag(cfg, "before any write");

    // 3. A Release already there: done, nothing written.
    const existing = await call(cfg, "GET", `/releases/tags/${encodeURIComponent(cfg.tag)}`);
    if (existing.status === 200) {
      cfg.log(`release ${cfg.tag}: exists (${existing.json.html_url ?? "no url"}), nothing written`);
      return 0;
    }
    if (existing.status !== 404) throw new ReleaseError(`reading release ${cfg.tag}: HTTP ${existing.status}`);

    // 4. The release/<tag> branch.
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

    // 5. The Release, read back, and the tag peeled again.
    if (cfg.dryRun) {
      cfg.log(`release ${cfg.tag}: would be created with the registry links and generated notes`);
      return 0;
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

/** The configuration from the environment (a GitHub Actions run). */
export async function configFromEnv(env: NodeJS.ProcessEnv, argv: string[]): Promise<ReleaseConfig> {
  const names = await packageNames(env);
  return {
    repository: env.GITHUB_REPOSITORY ?? "",
    sha: env.GITHUB_SHA ?? "",
    tag: env.RELEASE_TAG ?? env.GITHUB_REF_NAME ?? "",
    token: env.GITHUB_TOKEN || undefined,
    dryRun: argv.includes("--dry-run"),
    jsrPackage: names.jsr,
    npmPackage: names.npm,
    githubApi: env.GITHUB_API_URL ?? "https://api.github.com",
    jsrApi: env.JSR_API_URL ?? "https://api.jsr.io",
    npmRegistry: env.NPM_REGISTRY_URL ?? "https://registry.npmjs.org",
    waitAttempts: Number(env.RELEASE_WAIT_ATTEMPTS ?? 20),
    waitMs: Number(env.RELEASE_WAIT_MS ?? 15_000),
    requestMs: Number(env.RELEASE_REQUEST_MS ?? 30_000),
    log: (line) => console.log(line),
  };
}

const isMain = process.argv[1] !== undefined &&
  fileURLToPath(import.meta.url).replace(/\\/g, "/") === process.argv[1].replace(/\\/g, "/");
if (isMain) {
  process.exit(await run(await configFromEnv(process.env, process.argv.slice(2))));
}
