/**
 * Self-test of `scripts/release-record.ts` (letter H35, 2026-11-13; workspace best-practices 2.1:
 * a gate that has never failed has not been shown to gate anything). Pure checks on synthetic
 * `release.md` texts: each refusal for its own reason, and the accepted forms.
 *
 * ```sh
 * bun run reviews:selftest
 * ```
 */
import { spawnSync } from "node:child_process";
import { copyFileSync, cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { entryOf, main, reviewProblems, reviewProblemsAt, reviewProblemsHere, sameProgram } from "./release-record.ts";

let passed = 0;
const failures: string[] = [];
function check(name: string, ok: boolean): void {
  if (ok) passed++;
  else failures.push(name);
}

const SEC = "**Security review** (2026-11-13): two rounds, 3 findings fixed; round 2 was the empty round.";
const HARD = "**Hardening review** (2026-11-13): one round,\nthe empty round.";
function doc(...paragraphs: string[]): string {
  return [
    "# release.md",
    "",
    "## Release History",
    "",
    "### 2.0.4 — 2026-11-13 (SPEC 4.0.1)",
    "",
    ...paragraphs.flatMap((p) => [p, ""]),
    "### 2.0.3 — 2026-11-10 (SPEC 4.0.1)",
    "",
    "**What changed:** nothing.",
    "",
  ].join("\n");
}
/** Exactly one problem, and it matches. */
const refused = (text: string, version: string, why: RegExp): boolean => {
  const p = reviewProblems(text, version);
  return p.length === 1 && why.test(p[0] as string);
};

// Accepted.
check("both reviews, each with its empty round → ready", reviewProblems(doc("**What changed:** x.", SEC, HARD), "2.0.4").length === 0);
check("order does not matter", reviewProblems(doc(HARD, SEC), "2.0.4").length === 0);
check("CRLF line endings → ready", reviewProblems(doc(SEC, HARD).replace(/\n/g, "\r\n"), "2.0.4").length === 0);
check("an efficiency review is not required", reviewProblems(doc(SEC, HARD), "2.0.4").length === 0);
check("an efficiency review beside them changes nothing",
  reviewProblems(doc(SEC, HARD, "**Efficiency review**: not run."), "2.0.4").length === 0);

// Refused, each for its own reason.
check("no entry → refused", refused(doc(SEC, HARD), "2.0.5", /no "### 2\.0\.5" entry/));
check("an older entry without reviews → refused twice", reviewProblems(doc(SEC, HARD), "2.0.3").length === 2);
check("no security review → refused", refused(doc(HARD), "2.0.4", /no "\*\*Security review" paragraph/));
check("no hardening review → refused", refused(doc(SEC), "2.0.4", /no "\*\*Hardening review" paragraph/));
check("neither → two problems", reviewProblems(doc("**What changed:** x."), "2.0.4").length === 2);
check("a review with no empty round → refused",
  refused(doc("**Security review**: one round, 2 findings fixed.", HARD), "2.0.4", /"Security review" does not name the empty round/));
check("a pending review → refused",
  refused(doc(SEC, "**Hardening review**: pending — no empty round yet."), "2.0.4", /"Hardening review" says "pending"/));
check("a review 'not yet' at its empty round → refused",
  refused(doc("**Security review**: round 3 is not yet an empty round.", HARD), "2.0.4", /"Security review" says "not yet"/));
check("a TODO → refused", refused(doc(SEC, "**Hardening review**: TODO (empty round)."), "2.0.4", /says "TODO"/));
check("a mention inside another paragraph does not count",
  refused(doc("**What changed:** the **Security review** reached its empty round.", HARD), "2.0.4", /no "\*\*Security review" paragraph/));
check("two security paragraphs → refused",
  refused(doc(SEC, SEC, HARD), "2.0.4", /2 "\*\*Security review" paragraphs/));
check("another release's reviews do not count",
  reviewProblems(doc("**What changed:** x.").replace("**What changed:** nothing.", `${SEC}\n\n${HARD}`), "2.0.4").length === 2);
check("2.0.4 does not match a 2.0.40 heading", entryOf("### 2.0.40 — x\n\ntext\n", "2.0.4") === null);
check("2.0.4 does not match 12.0.4", entryOf("### 12.0.4 — x\n\ntext\n", "2.0.4") === null);
check("a heading with nothing after the version matches", entryOf("### 2.0.4\n\ntext\n", "2.0.4") === "\ntext\n");
check("the entry stops at the next heading", entryOf(doc(SEC, HARD), "2.0.4")?.includes("2.0.3") === false);
check("the entry stops at a level-2 heading", entryOf("### 2.0.4 — x\n\na\n\n## Other\n\nb\n", "2.0.4") === "\na\n");
check("a malformed version → refused", refused(doc(SEC, HARD), "2.0", /not an X\.Y\.Z/));

// The file readers and the command line (review of 2026-11-13, finding #14): every failure is a
// named line and an exit code, never a throw; on synthetic repository roots.
const dirs: string[] = [];
function repo(files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), "uwl-reviews-"));
  dirs.push(dir);
  mkdirSync(join(dir, "cmem"));
  for (const [name, text] of Object.entries(files)) writeFileSync(join(dir, name), text);
  return dir;
}
/** Runs the command line with the console captured. A throw is reported as `threw`. */
function cli(dir: string, arg: string | undefined): { code: number | "threw"; out: string; err: string } {
  const [log, error] = [console.log, console.error];
  const got = { out: "", err: "" };
  console.log = (...a: unknown[]) => {
    got.out += `${a.join(" ")}\n`;
  };
  console.error = (...a: unknown[]) => {
    got.err += `${a.join(" ")}\n`;
  };
  try {
    return { code: main(dir, arg === undefined ? [] : [arg]), ...got };
  } catch (e) {
    return { code: "threw", out: got.out, err: `${got.err}${(e as Error).message}` };
  } finally {
    [console.log, console.error] = [log, error];
  }
}
const JSR = (version: unknown) => JSON.stringify({ name: "@x/y", version });
try {
  const ready = repo({ "jsr.json": JSR("2.0.4"), "cmem/release.md": doc(SEC, HARD) });
  const released = repo({ "jsr.json": JSR("2.0.3"), "cmem/release.md": doc(SEC, HARD) });
  const noRecord = repo({ "jsr.json": JSR("2.0.4") });
  const noManifest = repo({ "cmem/release.md": doc(SEC, HARD) });

  check("reviewProblemsAt reads the root's cmem/release.md", reviewProblemsAt(ready, "2.0.4").length === 0);
  check("a missing cmem/release.md is ONE named problem, not a throw", (() => {
    const p = reviewProblemsAt(noRecord, "2.0.4");
    return p.length === 1 && /cmem\/release\.md cannot be read \(ENOENT\)/.test(p[0] as string);
  })());

  const ok = cli(ready, undefined);
  check("cli: jsr.json's version, recorded → exit 0, a ✓ line, nothing on stderr", ok.code === 0 && ok.out.includes("✓") && ok.out.includes("2.0.4") && ok.err === "");
  check("cli: a named version, recorded → exit 0", cli(noManifest, "2.0.4").code === 0);
  const unrecorded = cli(noRecord, "2.0.4");
  check("cli: no cmem/release.md → exit 1, the file named", unrecorded.code === 1 && unrecorded.err.includes("cmem/release.md cannot be read"));
  const missing = cli(noManifest, undefined);
  check("cli: no jsr.json and no argument → exit 1, jsr.json named", missing.code === 1 && /jsr\.json's version cannot be read \(ENOENT\)/.test(missing.err));
  const malformed = cli(repo({ "jsr.json": "{ not json" }), undefined);
  check("cli: malformed jsr.json → exit 1, jsr.json named", malformed.code === 1 && malformed.err.includes("jsr.json's version cannot be read"));
  const unversioned = cli(repo({ "jsr.json": JSR(7) }), undefined);
  check("cli: jsr.json without a version string → exit 1, named", unversioned.code === 1 && unversioned.err.includes('no "version" string'));
  const nulled = cli(repo({ "jsr.json": "null" }), undefined);
  check("cli: jsr.json holding null → exit 1, the same named reason", nulled.code === 1 && nulled.err.includes('no "version" string'));
  check("cli: malformed jsr.json is called 'not valid JSON', not the engine's text", malformed.err.includes("(not valid JSON)"));
  for (const bad of ["", " 2.0.4", "2.0.4-rc.1", "v2.0.4"]) {
    const r = cli(repo({ "jsr.json": JSR(bad) }), undefined);
    check(`cli: jsr.json version ${JSON.stringify(bad)} → exit 1, named, no "is not ready" line`,
      r.code === 1 && r.err.includes(`its version "${bad}" is not X.Y.Z`) && !r.err.includes("is not ready"));
  }
  const last = cli(released, undefined);
  check("cli: no argument, jsr.json's version unrecorded → exit 1 and the line naming what was checked",
    last.code === 1 && last.err.includes("2.0.3 is not ready") && last.err.includes("(checked: 2.0.3, the version in jsr.json;"));
  check("cli: that line never says the version is released or that there is nothing to do",
    !/released|nothing to do/i.test(last.err));
  const named = cli(released, "2.0.3");
  check("cli: the same version NAMED → exit 1 and no such line", named.code === 1 && !named.err.includes("(checked:"));
  // The wiring `bump` and `release` use: this repo's own record is the one read.
  check("reviewProblemsHere reads THIS repo's cmem/release.md (0.0.0 has no entry there)", (() => {
    const p = reviewProblemsHere("0.0.0");
    return p.length === 1 && /no "### 0\.0\.0" entry/.test(p[0] as string);
  })());

  // The process itself: the script's last line (`if (isEntry()) process.exit(main(...))`) is what
  // `bun run reviews` and publish.yml run, and calling main() above does not reach it. A copy of
  // the script in a synthetic root (it finds its root one folder up), run by this runtime.
  const runtime = (file: string, ...args: string[]) => {
    const pre = "deno" in process.versions ? ["run", "-A"] : [];
    return spawnSync(process.execPath, [...pre, file, ...args], { encoding: "utf8" });
  };
  const live = repo({ "jsr.json": JSR("2.0.4"), "cmem/release.md": doc(SEC, HARD) });
  mkdirSync(join(live, "scripts"));
  const script = join(live, "scripts", "release-record.ts");
  copyFileSync(fileURLToPath(new URL("./release-record.ts", import.meta.url)), script);
  const pass = runtime(script);
  check("process: jsr.json's version, recorded → exit 0 and the ✓ line on stdout",
    pass.status === 0 && pass.stdout.includes("✓") && pass.stdout.includes("2.0.4"));
  const refusedRun = runtime(script, "2.0.5");
  check("process: a NAMED version without an entry → exit 1, that version named on stderr, nothing on stdout",
    refusedRun.status === 1 && refusedRun.stderr.includes('no "### 2.0.5" entry') && refusedRun.stdout === "");
  const older = runtime(script, "2.0.3");
  check("process: the argument is the version checked, not jsr.json's", older.status === 1 && older.stderr.includes("2.0.3 is not ready"));
  rmSync(join(live, "cmem", "release.md"));
  const unreadable = runtime(script);
  check("process: no cmem/release.md → exit 1, the file named, no stack trace",
    unreadable.status === 1 && unreadable.stderr.includes("cmem/release.md cannot be read") && !/^\s+at /m.test(unreadable.stderr));
  for (const bad of ["v2.0.4", "", "2.0.4\n", "--help"]) {
    const r = cli(ready, bad);
    check(`cli: the argument ${JSON.stringify(bad)} → exit 1, ONE line naming it, no "is not ready" line`,
      r.code === 1 && r.err === `❌ reviews: ${JSON.stringify(bad)} is not an X.Y.Z version — bun run reviews X.Y.Z\n`);
  }

  // Two versions: refused, not the first one checked and the second ignored.
  writeFileSync(join(live, "cmem", "release.md"), doc(SEC, HARD));
  const two = runtime(script, "2.0.4", "2.0.5");
  check("process: two arguments → exit 1, 'one version at most', nothing checked",
    two.status === 1 && two.stderr.includes("one version at most, got 2") && two.stdout === "");

  // Reached through a link: Node resolves the link in import.meta.url and not in argv[1], so a
  // plain comparison of the two made the script do nothing and exit 0. (Bun and Deno never did;
  // on them this check cannot fail for that reason — it was inverted on Node 22, 2026-11-13.)
  const link = join(repo({}), "link");
  let linked = true;
  try {
    symlinkSync(live, link, "junction");
  } catch {
    linked = false; // a filesystem without links: nothing to reach it through
  }
  if (linked) {
    const through = runtime(join(link, "scripts", "release-record.ts"), "2.0.5");
    check("process: run through a link to its folder → still refuses (exit 1, the entry named)",
      through.status === 1 && through.stderr.includes('no "### 2.0.5" entry'));
    rmSync(link, { recursive: false, force: true });
  }

  // The same decision, branch by branch, on every runtime and platform (the process check above
  // can only fail on Node): the paths are made up, `real` stands in for the filesystem.
  const realOf = (map: Record<string, string>) => (p: string) => {
    const r = map[p];
    if (r === undefined) throw new Error(`ENOENT ${p}`);
    return r;
  };
  const fs1 = realOf({ "/real/s.ts": "/real/s.ts", "/link/s.ts": "/real/s.ts", "/other/t.ts": "/other/t.ts", "C:/Real/S.ts": "C:/Real/S.ts", "c:/link/s.ts": "c:/real/s.ts" });
  check("sameProgram: the same path → the program", sameProgram("/real/s.ts", "/real/s.ts", fs1, false));
  check("sameProgram: backslashes and slashes are one path", sameProgram("C:\\Real\\S.ts", "C:/Real/S.ts", fs1, true));
  check("sameProgram: reached through a link → the program", sameProgram("/real/s.ts", "/link/s.ts", fs1, false));
  check("sameProgram: another file → an import, not the program", !sameProgram("/real/s.ts", "/other/t.ts", fs1, false));
  check("sameProgram: no argv[1] → not the program", !sameProgram("/real/s.ts", undefined, fs1, false));
  check("sameProgram: a path that cannot be resolved → not the program, no throw", !sameProgram("/real/s.ts", "/gone/s.ts", fs1, false));
  check("sameProgram: real paths differing in case → the program on Windows", sameProgram("C:/Real/S.ts", "c:/link/s.ts", fs1, true));
  check("sameProgram: real paths differing in case → NOT the program elsewhere", !sameProgram("C:/Real/S.ts", "c:/link/s.ts", fs1, false));

  // The callers. `bump` and `release` each refuse an unrecorded version BEFORE their own gates,
  // so a scratch git repository holding a copy of scripts/ is enough to see the refusal — and to
  // see that it is THIS refusal (deleting the check in either leaves some other, later failure).
  const git = (cwd: string, ...args: string[]) =>
    // The identity and switches a developer's own git configuration could otherwise decide
    // (signing, hooks, line endings): a correct tree must not go red because of them.
    spawnSync("git", [
      "-c", "user.name=selftest", "-c", "user.email=selftest@example.invalid", "-c", "core.autocrlf=false",
      "-c", "commit.gpgsign=false", "-c", `core.hooksPath=${join(cwd, ".no-hooks")}`,
      ...args,
    ], { cwd, encoding: "utf8" });
  const work = repo({ "jsr.json": `${JSON.stringify({ name: "@x/y", version: "9.9.8" }, null, 2)}\n`, "cmem/release.md": doc(SEC, HARD) });
  cpSync(fileURLToPath(new URL(".", import.meta.url)), join(work, "scripts"), { recursive: true });
  const bare = join(repo({}), "origin.git");
  const setup = [
    git(work, "init", "-q", "-b", "main"),
    git(work, "add", "-A"),
    git(work, "commit", "-q", "-m", "base"),
    git(work, "init", "-q", "--bare", bare),
    git(work, "remote", "add", "origin", bare),
    git(work, "push", "-q", "origin", "main"),
  ];
  check("callers: the scratch repository is set up (git)", setup.every((r) => r.status === 0));
  const manifest = () => (JSON.parse(readFileSync(join(work, "jsr.json"), "utf8")) as { version: string }).version;

  const bumped = runtime(join(work, "scripts", "bump.ts"), "patch");
  check("bump: an unrecorded next version → exit 1, 'bump patch refused: 9.9.9 is not ready', the entry named",
    bumped.status === 1 && bumped.stderr.includes("bump patch refused: 9.9.9 is not ready for release") && bumped.stderr.includes('no "### 9.9.9" entry'));
  check("bump: the refusal comes before the compatibility report", !`${bumped.stdout}${bumped.stderr}`.includes("compatibility gate against"));
  for (const [level, next] of [["minor", "9.10.0"], ["major", "10.0.0"]] as const) {
    const r = runtime(join(work, "scripts", "bump.ts"), level);
    check(`bump ${level}: the version checked is the one it would write (${next})`,
      r.status === 1 && r.stderr.includes(`bump ${level} refused: ${next} is not ready for release`) && r.stderr.includes(`no "### ${next}" entry`));
  }
  check("bump: nothing was written (jsr.json 9.9.8, clean tree, no new commit)",
    manifest() === "9.9.8" && git(work, "status", "--porcelain", "--untracked-files=all").stdout === "" && git(work, "log", "-1", "--format=%s").stdout.trim() === "base");

  writeFileSync(join(work, "jsr.json"), `${JSON.stringify({ name: "@x/y", version: "9.9.9" }, null, 2)}\n`);
  check("callers: the bump commit is made by hand (git)", git(work, "commit", "-q", "-am", "bump to v9.9.9").status === 0);
  // Both ways `release` is run. The registries are pointed at a dead local port: were the check
  // ever lost, the run would stop there ("could not read"), never reach JSR, npm or a push.
  for (const mode of [["--dry-run"], []]) {
    const r = spawnSync(process.execPath, [...("deno" in process.versions ? ["run", "-A"] : []), join(work, "scripts", "release.ts"), ...mode], {
      cwd: work,
      encoding: "utf8",
      env: { ...process.env, RELEASE_REMOTE: "origin", RELEASE_SKIP_GATE: "1", JSR_API_URL: "http://127.0.0.1:9", NPM_REGISTRY_URL: "http://127.0.0.1:9" },
    });
    check(`release ${mode[0] ?? "(the real run)"}: an unrecorded version → exit 1, 'release refused: 9.9.9 is not ready', nothing pushed`,
      r.status === 1 && r.stderr.includes("release refused: 9.9.9 is not ready") && r.stderr.includes('no "### 9.9.9" entry') &&
        r.stderr.includes("nothing was pushed") && git(work, "ls-remote", "origin", "refs/heads/main").stdout.split(/\s+/)[0] === git(work, "rev-parse", "HEAD^").stdout.trim());
  }
} finally {
  for (const d of dirs) rmSync(d, { recursive: true, force: true });
}

console.log(`release-record self-test: ${passed} passed, ${failures.length} failed`);
if (failures.length > 0) {
  for (const f of failures) console.log(`  FAILED: ${f}`);
  process.exit(1);
}
