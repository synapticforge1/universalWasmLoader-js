/**
 * Self-test of `scripts/release-record.ts` (letter H35, 2026-11-13; workspace best-practices 2.1:
 * a gate that has never failed has not been shown to gate anything). Pure checks on synthetic
 * `release.md` texts: each refusal for its own reason, and the accepted forms.
 *
 * ```sh
 * bun run reviews:selftest
 * ```
 */
import process from "node:process";
import { entryOf, reviewProblems } from "./release-record.ts";

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

console.log(`release-record self-test: ${passed} passed, ${failures.length} failed`);
if (failures.length > 0) {
  for (const f of failures) console.log(`  FAILED: ${f}`);
  process.exit(1);
}
