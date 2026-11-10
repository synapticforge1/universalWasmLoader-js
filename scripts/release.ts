/**
 * The local half of a release (workspace `release-process.md` § 5, U4; owner 2026-11-10): after
 * `bun run bump <level>` has committed `bump to vX.Y.Z`, this checks everything that can be checked
 * here, then PUSHES `main` — and nothing else. It makes and pushes NO tag: CI checks the pushed
 * commit first, then creates the tag, then the GitHub Release page from it, then publishes to JSR
 * and npm (`publish.yml`, U5–U8). A published tag never moves; there is no `git tag -f` here.
 *
 * Guards, in order (any one refuses, nothing is pushed):
 *   1. the tree is clean, untracked files included;
 *   2. the branch is `main`, and HEAD is exactly one commit — `bump to v<jsr.json version>`, which
 *      changes `jsr.json` only — on top of `origin/main` (fetched first);
 *   3. the tag `v<version>` exists neither here nor on `origin`;
 *   4. neither registry has the version: JSR answers 404, and npm's package document has never had
 *      it (its `time` keeps removed numbers too — ledger C34);
 *   5. the gate, the compatibility gate in release mode and the JSR publish dry run pass.
 * Then `git push origin main`, read back with `git ls-remote` (HEAD on GitHub = this HEAD).
 *
 * ```sh
 * bun run release              # guards, then push main
 * bun run release --dry-run    # guards only
 * ```
 *
 * Written on `node:` builtins and `fetch` only, so it runs on Bun, Node and Deno alike. Every
 * network request has its own time limit (workspace best-practices 7.21).
 */
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { NPM_NAME } from "./npm/build.ts";

const root = fileURLToPath(new URL("..", import.meta.url));
const dryRun = process.argv.includes("--dry-run");
const remote = process.env.RELEASE_REMOTE ?? "origin";
const jsrApi = process.env.JSR_API_URL ?? "https://api.jsr.io";
const npmRegistry = process.env.NPM_REGISTRY_URL ?? "https://registry.npmjs.org";
const skipGate = process.env.RELEASE_SKIP_GATE === "1"; // the rehearsal's switch, never CI's

const run = (cmd: string, args: string[]) => spawnSync(cmd, args, { cwd: root, encoding: "utf8", shell: false });
const git = (...args: string[]) => run("git", args);
function refuse(why: string): never {
  console.error(`❌ release refused: ${why}\n   nothing was pushed.`);
  process.exit(1);
}
async function status(url: string): Promise<{ code: number; text: string }> {
  try {
    const res = await fetch(url, { headers: { "cache-control": "no-cache" }, signal: AbortSignal.timeout(30_000) });
    return { code: res.status, text: await res.text() };
  } catch (e) {
    refuse(`could not read ${url}: ${(e as Error).message}`);
  }
}

const manifest = JSON.parse(readFileSync(`${root}/jsr.json`, "utf8")) as { name: string; version: string };
const version = manifest.version;
const tag = `v${version}`;

// 1. A clean tree.
const dirty = git("status", "--porcelain", "--untracked-files=all");
if (dirty.status !== 0) refuse(`git status failed: ${dirty.stderr}`);
if (dirty.stdout.trim() !== "") refuse(`the tree is not clean:\n${dirty.stdout}`);

// 2. main = origin/main + the bump commit, and only that.
if (git("rev-parse", "--abbrev-ref", "HEAD").stdout.trim() !== "main") refuse("not on main");
const fetched = git("fetch", "-q", remote, "main");
if (fetched.status !== 0) refuse(`git fetch ${remote} main failed: ${fetched.stderr.trim()}`);
const head = git("rev-parse", "HEAD").stdout.trim();
const parent = git("rev-parse", "HEAD^").stdout.trim();
const upstream = git("rev-parse", `${remote}/main`).stdout.trim();
if (parent !== upstream) {
  refuse(`HEAD^ (${parent.slice(0, 9)}) is not ${remote}/main (${upstream.slice(0, 9)}): merge and push your work first, then bump`);
}
const subject = git("log", "-1", "--format=%s").stdout.trim();
if (subject !== `bump to ${tag}`) refuse(`HEAD is "${subject}", not the bump commit "bump to ${tag}" (run bun run bump <level>)`);
const changed = git("diff", "--name-only", "HEAD^", "HEAD").stdout.trim();
if (changed !== "jsr.json") refuse(`the bump commit changes more than jsr.json: ${changed.split("\n").join(", ")}`);

// 3. The tag is new, here and on GitHub.
if (git("rev-parse", "-q", "--verify", `refs/tags/${tag}`).status === 0) refuse(`tag ${tag} already exists locally`);
const remoteTag = git("ls-remote", remote, `refs/tags/${tag}`);
if (remoteTag.status !== 0) refuse(`git ls-remote ${remote} failed: ${remoteTag.stderr.trim()}`);
if (remoteTag.stdout.trim() !== "") refuse(`tag ${tag} already exists on ${remote}`);

// 4. Neither registry has ever had the version.
const [scope, pkg] = manifest.name.slice(1).split("/");
const jsr = await status(`${jsrApi}/scopes/${scope}/packages/${pkg}/versions/${version}`);
if (jsr.code !== 404) refuse(`JSR ${manifest.name}@${version}: HTTP ${jsr.code} (404 = free)`);
const doc = await status(`${npmRegistry}/${NPM_NAME.replace("/", "%2F")}`);
if (doc.code === 200) {
  const time = (JSON.parse(doc.text) as { time?: Record<string, string> }).time ?? {};
  if (version in time) refuse(`npm ${NPM_NAME} has had ${version} (npm never reuses a number)`);
} else if (doc.code !== 404) {
  refuse(`npm ${NPM_NAME}: HTTP ${doc.code}`);
}
console.log(`✓ clean; main = ${remote}/main + "bump to ${tag}"; ${tag} new; JSR and npm free`);

// 5. The gate, the release-mode compatibility gate, the JSR dry run.
if (!skipGate) {
  for (const [name, args] of [["gate", ["run", "gate"]], ["compat --release", ["run", "compat", "--release"]], ["publish:dry", ["run", "publish:dry"]]] as const) {
    const r = spawnSync("bun", [...args], { cwd: root, stdio: "inherit", shell: process.platform === "win32" });
    if (r.status !== 0) refuse(`${name} failed`);
  }
  console.log("✓ gate, compat --release, JSR dry run");
}

if (dryRun) {
  console.log(`--dry-run: would push main (${head.slice(0, 9)}) to ${remote}; CI then tags ${tag}`);
  process.exit(0);
}

const pushed = git("push", "-q", remote, "main");
if (pushed.status !== 0) refuse(`git push ${remote} main failed: ${pushed.stderr.trim()}`);
const back = git("ls-remote", remote, "refs/heads/main").stdout.trim().split(/\s+/)[0];
if (back !== head) {
  console.error(`❌ pushed, but ${remote} main reads ${back}, not ${head}`);
  process.exit(1);
}
console.log(`✅ pushed main = ${head.slice(0, 9)} (read back). CI now checks it, then tags ${tag}, makes the page, publishes.`);
