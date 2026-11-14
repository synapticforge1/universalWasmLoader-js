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
import { readFileSync } from "node:fs";
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

const root = fileURLToPath(new URL("..", import.meta.url));

/** `reviewProblems` for this repo's own `cmem/release.md`. */
export function reviewProblemsHere(version: string): string[] {
  return reviewProblems(readFileSync(`${root}/cmem/release.md`, "utf8"), version);
}

const isMain = process.argv[1] !== undefined &&
  fileURLToPath(import.meta.url).replace(/\\/g, "/") === process.argv[1].replace(/\\/g, "/");
if (isMain) {
  const version = process.argv[2] ?? (JSON.parse(readFileSync(`${root}/jsr.json`, "utf8")) as { version: string }).version;
  const problems = reviewProblemsHere(version);
  if (problems.length > 0) {
    console.error([`❌ ${version} is not ready for release (workspace review-process.md § 0):`, ...problems.map((p) => `  ${p}`)].join("\n"));
    process.exit(1);
  }
  console.log(`✓ cmem/release.md records the security and hardening reviews of ${version}, each ended by an empty round`);
}
