/**
 * The release's review record (workspace `review-process.md` §§ 0, 6, 7.3; letter H35, owner
 * 2026-11-12): before every release a security review AND a hardening review are required, each
 * run to its empty round, and recorded in that release's entry in `cmem/release.md` BEFORE the
 * bump. This reads the entry and refuses when either record is missing.
 *
 * The entry is the `### X.Y.Z …` heading under "Release History" and everything up to the next
 * heading. It must hold two paragraphs, one starting `**Security review` and one starting
 * `**Hardening review`; each must say "empty round" (the round that ended it) and must not say it
 * is still to do (pending / TODO / TBD / not yet / not run / not done). An "efficiency review" is
 * optional and never required (owner, 2026-11-13), so it is not looked for.
 *
 * It checks that the record EXISTS, not that the review was good: that is the reviewers' work.
 *
 * ```sh
 * bun scripts/release-record.ts            # the version in jsr.json
 * bun scripts/release-record.ts 2.0.4      # a named version (what `bump` is about to write)
 * ```
 *
 * Used by `scripts/bump.ts` (the version it is about to write), `scripts/release.ts` and
 * `publish.yml`'s `checks` (the version in jsr.json). Written on `node:` builtins only.
 */
import { readFileSync, realpathSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

export const REQUIRED_REVIEWS = ["Security review", "Hardening review"] as const;
const UNFINISHED = /\b(pending|todo|tbd|not yet|not run|not done)\b/i;

/** The text of `version`'s entry in a release.md, heading line excluded; `null` when there is none. */
export function entryOf(text: string, version: string): string | null {
  const lines = text.split(/\r?\n/);
  const start = lines.findIndex((l) => l.startsWith(`### ${version}`) && /^(\s|$)/.test(l.slice(4 + version.length)));
  if (start < 0) return null;
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((l) => /^#{1,3} /.test(l));
  return (end < 0 ? rest : rest.slice(0, end)).join("\n");
}

/** Why `version` is not ready for release, one line each; empty when both reviews are recorded. */
export function reviewProblems(text: string, version: string): string[] {
  if (!/^\d+\.\d+\.\d+$/.test(version)) return [`"${version}" is not an X.Y.Z version`];
  const entry = entryOf(text, version);
  if (entry === null) {
    return [`cmem/release.md has no "### ${version}" entry: the security and hardening reviews are recorded there BEFORE the bump`];
  }
  const paragraphs = entry.split(/\n\s*\n/).map((p) => p.trim());
  const problems: string[] = [];
  for (const name of REQUIRED_REVIEWS) {
    const found = paragraphs.filter((p) => p.startsWith(`**${name}`));
    if (found.length === 0) {
      problems.push(`the ${version} entry has no "**${name}" paragraph`);
    } else if (found.length > 1) {
      problems.push(`the ${version} entry has ${found.length} "**${name}" paragraphs: keep one`);
    } else {
      const p = found[0] as string;
      const unfinished = p.match(UNFINISHED);
      if (unfinished) problems.push(`the ${version} entry's "${name}" says "${unfinished[0]}": it is not finished`);
      else if (!/empty round/i.test(p)) problems.push(`the ${version} entry's "${name}" does not name the empty round that ended it`);
    }
  }
  return problems;
}

const here = fileURLToPath(new URL("..", import.meta.url));
const why = (e: unknown): string => (e as NodeJS.ErrnoException).code ?? (e as Error).message;

/**
 * `reviewProblems` for the `cmem/release.md` under the repository root `dir`. A file that cannot be
 * read is a problem by name, never a throw: the callers (`bump`, `release`, the CLI) print it.
 */
export function reviewProblemsAt(dir: string, version: string): string[] {
  let text: string;
  try {
    text = readFileSync(join(dir, "cmem", "release.md"), "utf8");
  } catch (e) {
    return [`cmem/release.md cannot be read (${why(e)}): the security and hardening reviews are recorded there`];
  }
  return reviewProblems(text, version);
}

/** `reviewProblems` for this repo's own `cmem/release.md`. */
export function reviewProblemsHere(version: string): string[] {
  return reviewProblemsAt(here, version);
}

/**
 * The command line, for the repository root `dir`: `args` holds the version, or nothing for the one
 * in `jsr.json`. Returns the exit code; every failure is a named line on stderr, never a stack trace.
 */
export function main(dir: string, args: readonly string[]): number {
  if (args.length > 1) {
    console.error(`❌ reviews: one version at most, got ${args.length} arguments — bun run reviews X.Y.Z`);
    return 1;
  }
  const arg = args[0];
  let version = arg;
  if (version !== undefined && !/^\d+\.\d+\.\d+$/.test(version)) {
    console.error(`❌ reviews: ${JSON.stringify(version)} is not an X.Y.Z version — bun run reviews X.Y.Z`);
    return 1;
  }
  if (version === undefined) {
    try {
      const parsed: unknown = JSON.parse(readFileSync(join(dir, "jsr.json"), "utf8"));
      const v = typeof parsed === "object" && parsed !== null ? (parsed as { version?: unknown }).version : undefined;
      if (typeof v !== "string") throw new Error('no "version" string');
      if (!/^\d+\.\d+\.\d+$/.test(v)) throw new Error(`its version "${v}" is not X.Y.Z`);
      version = v;
    } catch (e) {
      const reason = e instanceof SyntaxError ? "not valid JSON" : why(e);
      console.error(`❌ reviews: jsr.json's version cannot be read (${reason}); name the version: bun run reviews X.Y.Z`);
      return 1;
    }
  }
  const problems = reviewProblemsAt(dir, version);
  if (problems.length > 0) {
    const lines = [`❌ ${version} is not ready for release (workspace review-process.md § 0):`, ...problems.map((p) => `  ${p}`)];
    // Without an argument the version is jsr.json's — between releases that is the LAST release
    // (one made before the rule, up to 2.0.3, has no record). The line only says which version
    // was checked: whether it is released is not known here, so nothing is said about it.
    if (arg === undefined) {
      lines.push(`  (checked: ${version}, the version in jsr.json; to check another: bun run reviews X.Y.Z)`);
    }
    console.error(lines.join("\n"));
    return 1;
  }
  console.log(`✓ cmem/release.md records the security and hardening reviews of ${version}, each ended by an empty round`);
  return 0;
}

/**
 * Is this file the program being run (not an import)? The plain comparison first; then the real
 * paths, because Node resolves a symlink or junction in `import.meta.url` but leaves `argv[1]` as
 * typed — with the plain comparison alone, `node <link>/scripts/release-record.ts X.Y.Z` printed
 * nothing and exited 0 (review of 2026-11-13, class F retest 3). `self` is this file's path, `arg`
 * is `argv[1]`; `real` and `windows` are parameters so the self-test can see every branch on any
 * runtime and platform.
 */
export function sameProgram(
  self: string,
  arg: string | undefined,
  real: (p: string) => string = realpathSync,
  windows: boolean = process.platform === "win32",
): boolean {
  if (arg === undefined) return false;
  const norm = (p: string) => p.replace(/\\/g, "/");
  if (norm(self) === norm(arg)) return true;
  try {
    const [a, b] = [norm(real(self)), norm(real(arg))];
    return windows ? a.toLowerCase() === b.toLowerCase() : a === b;
  } catch {
    return false;
  }
}
if (sameProgram(fileURLToPath(import.meta.url), process.argv[1])) process.exit(main(here, process.argv.slice(2)));
