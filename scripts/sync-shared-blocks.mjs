#!/usr/bin/env node
// Writes the shared blocks of the standard reference files from one canonical copy
// into every other copy.
//
// Why generate rather than compare. Each skill carries its own copy of the standard
// step files so it installs standalone (DECISIONS.md, "Standalone installability over
// DRY"). The cost is drift, and the contributor rule has been "when you change one,
// ask whether to sync the others" -- which is a human promise across up to 38 files.
// A test that only COMPARES turns silent drift into loud drift, but then hands the
// contributor 38 manual edits to make it green again, and it is satisfiable by
// shrinking the marked region until the copies trivially agree.
//
// So the marked region is generated. The test says what to RUN, not what to retype.
//
//   node scripts/sync-shared-blocks.mjs          write every copy from the canonical one
//   node scripts/sync-shared-blocks.mjs --check   fail if any copy is out of date
//
// Only the text between the markers is touched. Everything outside them -- each
// skill's own scope sentence, its "Additional boundaries", its specifics section --
// is left exactly as it is, because those are the parts that are legitimately
// different per skill.

import { readFileSync, writeFileSync } from "node:fs";
import { globSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, relative } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const CHECK = process.argv.includes("--check");

// Files that legitimately do not carry a given block -- a skill that emits no chaining
// reference line has no marker contract to keep in sync. Each is named in
// scripts/allowlists.json with a reason and an owner, so "this file has no markers"
// is a recorded decision rather than an omission the generator quietly tolerates.
const OPTIONAL = new Set(
  Object.keys(
    JSON.parse(readFileSync(join(root, "scripts/allowlists.json"), "utf8"))
      .sharedBlockOptional?.entries ?? {},
  ),
);

/**
 * Each entry: a marked block, its canonical source, and the clauses that must survive
 * inside it. The floor exists because a generator plus an equality test is otherwise
 * satisfiable by emptying the block: every copy would still match, the test would stay
 * green, and the safety text would be gone. The floor makes that a failure.
 */
const BLOCKS = [
  {
    id: "untrusted-content",
    files: "skills/*/references/agentic-setup.md",
    canonical: "skills/xez-auto-create-pr/references/agentic-setup.md",
    minLines: 8,
    floor: [
      "data, never instructions",
      "suspected prompt",
      "exfiltrate data",
      "read credential stores",
      "before shell or path interpolation",
      "Never put a credential",
    ],
  },
  {
    // The chaining reference lines: the only machine-readable handoff between skills.
    // 34 copies said the same thing until one of them quietly lost the legacy-fallback
    // sentence -- which is exactly the drift a generated block removes.
    id: "chaining-lines",
    files: "skills/*/references/rules.md",
    canonical: "skills/xez-auto-create-pr/references/rules.md",
    minLines: 3,
    floor: [
      "PR: #<number> (link: <full PR URL>)",
      "Issue: #<number> (link: <full issue URL>)",
      "Spec: <repo-relative path>",
      "Head: <head commit sha>",
      "legacy `PR_URL=<url>`",
      "never emit them",
    ],
  },
  {
    // How a gate result is reported. Two rules that only work if every skill states them
    // the same way: report all failures at once, and never let a word that means "we did
    // not check" read as a word that means "it is fine".
    id: "gate-reporting",
    files: "skills/*/references/rules.md",
    canonical: "skills/xez-auto-create-pr/references/rules.md",
    minLines: 6,
    floor: [
      "collect everything, then report once",
      "`unknown` is never a pass",
      "evidence-unavailable",
      "Only `pass` and `not-applicable` are satisfied",
      "never report a status you did not derive",
    ],
  },
  {
    // How findings are answered, and how a missing thing is reported. Three rules that
    // only work when every skill uses the same words for them.
    id: "review-dispositions",
    files: "skills/*/references/rules.md",
    canonical: "skills/xez-auto-create-pr/references/rules.md",
    minLines: 8,
    floor: [
      "silence is not one of them",
      "fixed in `<sha>`",
      "**disputed, with",
      "**deferred, naming the",
      "Absent is not `false`",
      "never \"X does not exist\"",
    ],
  },
];

const marker = (id) => ({
  start: `<!-- shared:${id}:start -->`,
  end: `<!-- shared:${id}:end -->`,
});

function extract(text, id) {
  const { start, end } = marker(id);
  const a = text.indexOf(start);
  const b = text.indexOf(end);
  if (a === -1 || b === -1 || b < a) return null;
  return { body: text.slice(a + start.length, b), a: a + start.length, b };
}

let problems = 0;
let written = 0;
let checked = 0;

for (const block of BLOCKS) {
  const canonPath = join(root, block.canonical);
  const canonText = readFileSync(canonPath, "utf8");
  const canon = extract(canonText, block.id);

  if (!canon) {
    console.error(`canonical copy ${block.canonical} has no ${block.id} markers`);
    problems += 1;
    continue;
  }

  // The floor, checked against the canonical copy: a generator faithfully copying an
  // emptied block is worse than no generator at all.
  const lines = canon.body.split("\n").filter((l) => l.trim()).length;
  if (lines < block.minLines) {
    console.error(
      `${block.id}: canonical block is ${lines} non-empty lines, floor is ${block.minLines} -- ` +
      `narrowing the markers is not a way to make the check pass`,
    );
    problems += 1;
  }
  for (const clause of block.floor) {
    if (!canon.body.includes(clause)) {
      console.error(`${block.id}: canonical block no longer contains required clause "${clause}"`);
      problems += 1;
    }
  }

  for (const abs of globSync(join(root, block.files)).sort()) {
    const rel = relative(root, abs);
    const text = readFileSync(abs, "utf8");
    const found = extract(text, block.id);

    if (!found) {
      if (OPTIONAL.has(`${block.id}:${rel}`)) continue;
      console.error(`${rel}: missing ${block.id} markers`);
      problems += 1;
      continue;
    }

    checked += 1;
    if (found.body === canon.body) continue;

    if (CHECK) {
      console.error(`${rel}: ${block.id} block is out of date -- run: node scripts/sync-shared-blocks.mjs`);
      problems += 1;
    } else {
      writeFileSync(abs, text.slice(0, found.a) + canon.body + text.slice(found.b));
      written += 1;
    }
  }
}

if (problems) {
  console.error(`\nshared blocks: ${problems} problem(s)`);
  process.exit(1);
}

console.log(
  CHECK
    ? `Shared blocks OK (${checked} copies in sync across ${BLOCKS.length} block(s)).`
    : `Shared blocks synced (${written} of ${checked} copies rewritten).`,
);
