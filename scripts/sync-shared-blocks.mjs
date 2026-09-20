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
