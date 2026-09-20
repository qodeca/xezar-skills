#!/usr/bin/env node
// The chaining reference lines are the only machine-readable thing one skill hands the
// next. This test holds them to their own contract.
//
// The failure it prevents. A skill documents the line it emits as a literal template:
//   PR: #<number> (link: <full PR URL>)
// A consumer documents the regex it parses:
//   ^PR: #([0-9]+) \(link: (\S+)\)$
// Nothing connected the two. Someone tidies a template to "PR #<number>: <url>", every
// gate stays green, and the chain silently stops handing the PR number along -- which
// looks exactly like "there was no PR".
//
// So: every literal template line in skills/ is filled with realistic values and must
// parse under the canonical regex. Malformed lines must NOT parse, because a regex that
// accepts anything is not a contract. And every skill that documents the marker contract
// must document the legacy fallback with it, since dropping that half breaks reading
// output from an older installed skill.
//
// Run: node scripts/test-chaining-lines.mjs

import { readFileSync, globSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, relative } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

// --- the canonical grammar, in one place -------------------------------------
// These are the patterns a consumer is allowed to use. Every producer template must
// satisfy the one for its label.
const GRAMMAR = {
  PR: { re: /^PR: #([0-9]+) \(link: (\S+)\)$/, sample: "https://example.test/o/r/pull/123" },
  Issue: { re: /^Issue: #([0-9]+) \(link: (\S+)\)$/, sample: "https://example.test/o/r/issues/45" },
  Spec: { re: /^Spec: (\S.*)$/, sample: "docs/specs/thing.md" },
  Head: { re: /^Head: ([0-9a-f]{7,40})$/, sample: "3f9a1c04b7e25d8faa61b0c39e77d4125ab6e8f0" },
  Base: { re: /^Base: ([0-9a-f]{7,40})$/, sample: "b1d7e6c20fa34598cc1e0d7b92a4f6103de85a27" },
};

// The legacy forms a consumer must still accept, and no producer may emit.
const LEGACY = /^(PR_URL|PR_NUMBER|SPEC_PATH)=/;

let failures = 0;
let asserts = 0;

function expect(name, condition, detail) {
  asserts += 1;
  if (!condition) {
    failures += 1;
    console.error(`FAIL  ${name}${detail ? `\n      ${detail}` : ""}`);
  }
}

/**
 * Fill a documented template with realistic values.
 * `#<number>` / `#{number}` becomes `#123`; whatever placeholder is left is the label's
 * own sample value. A line with no placeholder is returned unchanged, so a template that
 * is already concrete is still checked.
 */
function fill(line, label) {
  return line
    .replace(/#(?:\{[^}]*\}|<[^>]*>)/g, "#123")
    .replace(/\{[^}]*\}|<[^>]*>/g, GRAMMAR[label].sample);
}

// --- 1: every documented template parses -------------------------------------
const files = globSync("skills/**/*.md", { cwd: root }).sort();
let templates = 0;

for (const rel of files) {
  const text = readFileSync(join(root, rel), "utf8");
  text.split("\n").forEach((raw, i) => {
    // An editorial annotation after the line ("   <- only on ramp 6") explains when the
    // line is emitted; it is not part of what gets printed. Anything else trailing is.
    const line = raw.replace(/\s+←.*$/, "").trimEnd();
    const label = /^(PR|Issue|Spec|Head|Base): /.exec(line)?.[1];
    if (!label) return;
    templates += 1;
    const filled = fill(line, label);
    expect(
      `${rel}:${i + 1} documents a ${label} line that parses`,
      GRAMMAR[label].re.test(filled),
      `template: ${line}\n      filled:   ${filled}\n      grammar:  ${GRAMMAR[label].re}`,
    );
  });
}

expect("templates were actually found", templates >= 5, `found ${templates}`);

// --- 1b: a near-miss inside a chaining block is a rename, not prose -----------
// Pass 1 only sees lines that already start `PR: `. So renaming the label to
// "PR #123: <url>" makes the line invisible and the test green -- the exact silent
// break this file exists to prevent. Inside a fenced block that already holds at least
// one valid chaining line, any line opening with a chaining label must be the exact form.
for (const rel of files) {
  const text = readFileSync(join(root, rel), "utf8");
  const lines = text.split("\n");
  let start = null;
  lines.forEach((line, i) => {
    if (!/^\s*```/.test(line)) return;
    if (start === null) { start = i; return; }
    const body = lines.slice(start + 1, i);
    const valid = body.some((l) => {
      const label = /^(PR|Issue|Spec|Head|Base): /.exec(l)?.[1];
      return label && GRAMMAR[label].re.test(fill(l.replace(/\s+←.*$/, "").trimEnd(), label));
    });
    if (valid) {
      body.forEach((l, j) => {
        // A lowercase word after the label means prose ("PR opened: <title>"), which is
        // legitimate inside the same block. A chaining line never has one.
        const near = /^(PR|Issue|Spec|Head|Base)(?![ ]+[a-z])\b/.exec(l);
        if (!near) return;
        expect(
          `${rel}:${start + 2 + j} uses the exact ${near[1]} label form`,
          l.startsWith(`${near[1]}: `),
          `found: ${l}\n      a renamed or re-punctuated label is invisible to every consumer`,
        );
      });
    }
    start = null;
  });
}

// --- 2: malformed lines must not parse ---------------------------------------
// A grammar that accepts these is not a contract. Each entry is a plausible tidy-up
// somebody might make while "improving readability".
const MALFORMED = [
  ["PR #123 (link: https://x.test/p/1)", "PR", "no colon after the label"],
  ["PR: 123 (link: https://x.test/p/1)", "PR", "no # before the number"],
  ["PR: #abc (link: https://x.test/p/1)", "PR", "non-numeric number"],
  ["PR: #123 https://x.test/p/1", "PR", "no (link: ...) wrapper"],
  ["PR: #123 (link: https://x.test/p/1) - merged", "PR", "decorated after the line"],
  ["pr: #123 (link: https://x.test/p/1)", "PR", "lower-cased label"],
  ["  PR: #123 (link: https://x.test/p/1)", "PR", "indented, so not line-anchored"],
  ["Issue: #123 (https://x.test/i/1)", "Issue", "missing the link: keyword"],
  ["Spec:", "Spec", "empty value"],
  ["Spec:   ", "Spec", "whitespace-only value"],
  ["Head: zzzz", "Head", "not a hex sha"],
  ["Head: 3f9a1c", "Head", "too short to identify a commit"],
  ["Base: 3f9a1c04b7e25d8faa61b0c39e77d4125ab6e8f0 (base)", "Base", "annotated"],
];

for (const [line, label, why] of MALFORMED) {
  expect(`rejected (${why}): ${line}`, !GRAMMAR[label].re.test(line));
}

// --- 3: a producer never emits the legacy form -------------------------------
for (const rel of files) {
  const text = readFileSync(join(root, rel), "utf8");
  for (const [i, line] of text.split("\n").entries()) {
    if (!LEGACY.test(line)) continue;
    // A shell assignment inside a tracker descriptor is a local variable that happens to
    // share the name -- `PR_URL=$(gh pr view ...)`. That is not an emitted report line.
    if (line.includes("$(") || rel.includes("/references/trackers/")) continue;
    // Documenting it as something to ACCEPT is the point; emitting it is the defect.
    // A bare line at the start of a line, outside a sentence, is an emission template.
    expect(
      `${rel}:${i + 1} does not emit a legacy chaining line`,
      false,
      `found: ${line.trim()}`,
    );
  }
}

// --- 4: the marker contract is documented whole ------------------------------
// The contract has two halves: what to emit, and what to still accept from an older
// installed skill. A copy carrying only the first half reads as complete and is not.
let contracts = 0;
for (const rel of globSync("skills/*/references/rules.md", { cwd: root }).sort()) {
  const text = readFileSync(join(root, rel), "utf8");
  if (!/\*\*Marker contract\.\*\* Chaining/.test(text)) continue;
  contracts += 1;
  expect(
    `${rel} documents the legacy fallback alongside the emitted shapes`,
    /legacy `PR_URL=<url>`/.test(text),
    "a consumer that drops this cannot read output from an older installed skill",
  );
  expect(
    `${rel} documents the Head line`,
    /`Head: <head commit sha>`/.test(text),
    "a verdict that names no commit certifies nothing",
  );
}
expect("marker contracts were found", contracts >= 30, `found ${contracts}`);

if (failures) {
  console.error(`\nchaining lines: ${failures} of ${asserts} assertions failed`);
  process.exit(1);
}
console.log(
  `Chaining line contract OK (${asserts} assertions: ${templates} documented templates, ` +
  `${MALFORMED.length} malformed rejections, ${contracts} marker contracts).`,
);
