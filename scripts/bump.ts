/**
 * Raises the `version` field in jsr.json, the package's one manifest (Bun migration, 2026-10-12;
 * deno.json before that), and commits it on its own as `bump to vX.Y.Z` (workspace
 * `release-process.md` § 5, U1–U3, owner 2026-11-10).
 *
 * Run via:  bun run bump patch      # 1.0.5 → 1.0.6
 *           bun run bump minor      # 1.0.5 → 1.1.0
 *           bun run bump major      # 1.0.5 → 2.0.0
 *
 * The level is the owner's and is REQUIRED: there is no default (U1).
 *
 * GATED, in this order: it refuses a tree with any change or untracked file (the bump is its own
 * commit, U2 / U3); it REFUSES when `cmem/release.md` has no entry for the new version recording
 * its security review and its hardening review, each ended by an empty round (`release-record.ts`;
 * workspace `review-process.md`, letter H35); then it runs `compat.ts` against the last release
 * tag (letter H6) and REFUSES when the bump is below the surface floor, when a patch/minor meets
 * red previous-tag tests, or when `api-surface.json` is stale. Nothing is written on a refusal. `bun run release` then pushes `main`; CI tags and publishes.
 *
 * Written on `node:` builtins only, so it runs on Bun, Node and Deno alike.
 */
import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { judge, lastTag } from "./compat.ts";
import { reviewProblemsHere } from "./release-record.ts";

const root = fileURLToPath(new URL("..", import.meta.url));
const manifestPath = fileURLToPath(new URL("../jsr.json", import.meta.url));

const git = (...args: string[]) => spawnSync("git", args, { cwd: root, encoding: "utf8" });

const kind = (process.argv[2] ?? "").toLowerCase();
if (kind !== "patch" && kind !== "minor" && kind !== "major") {
  console.error(`❌ bump: the level is required — bun run bump patch | minor | major${kind ? ` (got "${kind}")` : ""}`);
  process.exit(1);
}

const dirty = git("status", "--porcelain", "--untracked-files=all");
if (dirty.status !== 0 || dirty.stdout.trim() !== "") {
  console.error(`❌ bump: the tree is not clean (the bump is its own commit):\n${dirty.stdout || dirty.stderr}`);
  process.exit(1);
}

const text = readFileSync(manifestPath, "utf8");
const m = text.match(/("version"\s*:\s*)"(\d+)\.(\d+)\.(\d+)"/);
if (!m) {
  console.error('❌ bump: could not find a "version": "X.Y.Z" field in jsr.json');
  process.exit(1);
}

let [major, minor, patch] = [Number(m[2]), Number(m[3]), Number(m[4])];
const from = `${major}.${minor}.${patch}`;
if (kind === "major") {
  major += 1;
  minor = 0;
  patch = 0;
} else if (kind === "minor") {
  minor += 1;
  patch = 0;
} else {
  patch += 1;
}
const to = `${major}.${minor}.${patch}`;

// The two required reviews are recorded in the release's entry BEFORE the bump (letter H35).
// Checked before the compatibility gate: it is one file read, and its refusal should not come
// after a report that reads like a pass.
const unreviewed = reviewProblemsHere(to);
if (unreviewed.length > 0) {
  console.error([`❌ bump ${kind} refused: ${to} is not ready for release (workspace review-process.md § 0):`, ...unreviewed.map((p) => `  ${p}`)].join("\n"));
  process.exit(1);
}

const problems = judge(lastTag(), kind);
if (problems.length > 0) {
  console.error(["", `❌ bump ${kind} refused:`, ...problems.map((p) => `  ${p}`)].join("\n"));
  process.exit(1);
}

// Targeted replace so the rest of jsr.json's formatting is untouched.
const updated = text.replace(/("version"\s*:\s*)"\d+\.\d+\.\d+"/, `$1"${to}"`);
writeFileSync(manifestPath, updated);

const add = git("add", "jsr.json");
const commit = add.status === 0 ? git("commit", "-q", "-m", `bump to v${to}`) : add;
if (commit.status !== 0) {
  console.error(`❌ bump: jsr.json says ${to} but the commit failed:\n${commit.stderr || commit.stdout}`);
  process.exit(1);
}
console.log(`✅ jsr.json → ${to}  (${kind} bump from ${from}), committed as "bump to v${to}"`);
console.log("   next: bun run release   (pushes main; CI checks, tags, makes the page, publishes)");
