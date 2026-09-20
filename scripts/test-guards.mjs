#!/usr/bin/env node
// Breaks every guard on purpose, and fails if the guard does not notice.
//
// Why this exists. A gate that has never failed is indistinguishable from a gate that
// cannot fail. Every check in this repository is green today, which tells you nothing
// about whether the regex still matches, whether a refactor left a `|| true` behind, or
// whether an early `continue` quietly skips the file the rule was written for. So this
// suite introduces one named, realistic defect at a time, runs the real gate, and asserts
// the real error message comes back.
//
// Method: mutate a real tracked file, run the gate, restore the file in a `finally`. The
// restore is unconditional; a crashed assertion still puts the tree back, and the last
// assertion checks that nothing was left modified.
//
// Run: node scripts/test-guards.mjs

import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

let failures = 0;
let asserts = 0;

function run(command, args) {
  try {
    return {
      code: 0,
      out: execFileSync(command, args, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }),
    };
  } catch (err) {
    return { code: err.status ?? -1, out: (err.stdout ?? "") + (err.stderr ?? "") };
  }
}

const lint = () => run("bash", ["scripts/lint.sh"]);
const script = (name) => run("node", [`scripts/${name}`]);

// Snapshot the working tree before anything is broken, so the final assertion compares
// like with like instead of demanding a clean checkout.
const statusBefore = run("git", ["status", "--porcelain"]).out;

/**
 * Break one file, run one gate, expect one message.
 * `expect` is the distinctive fragment of the error the guard is supposed to print --
 * not just "it failed", because a guard failing for an unrelated reason would otherwise
 * count as a pass.
 */
function breaks(name, file, mutate, gate, expect) {
  asserts += 1;
  const path = join(root, file);
  const original = readFileSync(path, "utf8");
  let result;
  try {
    const broken = mutate(original);
    if (broken === original) {
      failures += 1;
      console.error(`FAIL  ${name}\n      the mutation changed nothing -- this test is testing nothing`);
      return;
    }
    writeFileSync(path, broken);
    result = gate();
  } finally {
    writeFileSync(path, original);
  }
  if (result.code === 0) {
    failures += 1;
    console.error(`FAIL  ${name}\n      the gate PASSED with the defect in place`);
    return;
  }
  if (!result.out.includes(expect)) {
    failures += 1;
    console.error(
      `FAIL  ${name}\n      the gate failed, but not for this reason.\n` +
      `      expected to see: ${expect}\n      got: ${result.out.trim().split("\n").slice(0, 4).join("\n           ")}`,
    );
  }
}

// --- scripts/lint.sh ---------------------------------------------------------

breaks(
  "frontmatter name must match the directory",
  "skills/xez-fix/SKILL.md",
  (s) => s.replace(/^name: xez-fix$/m, "name: xez-repair"),
  lint,
  "does not match directory",
);

breaks(
  "a description over 500 chars is rejected",
  "skills/xez-fix/SKILL.md",
  (s) => s.replace(/^description: (.*)$/m, (_, d) => `description: ${d} ${"padding text ".repeat(50)}`),
  lint,
  "max 500",
);

breaks(
  "a brand token inside skills/ is rejected",
  "skills/xez-fix/SKILL.md",
  (s) => `${s}\n\nRun this in the Qodeca monorepo.\n`,
  lint,
  "forbidden pattern",
);

breaks(
  "a hard-coded base branch is rejected",
  "skills/xez-fix/SKILL.md",
  (s) => `${s}\n\nBranch from develop before you start.\n`,
  lint,
  "forbidden pattern",
);

breaks(
  "a reference to a skill this collection does not ship is rejected",
  "skills/xez-fix/SKILL.md",
  (s) => `${s}\n\nWhen the change is large, hand it to the xez-mega-refactor skill.\n`,
  lint,
  "which is not a skill in this collection",
);

breaks(
  "killing a process by pattern match is rejected",
  "skills/xez-fix/SKILL.md",
  (s) => `${s}\n\n\`\`\`bash\npkill -f "node server.js"\n\`\`\`\n`,
  lint,
  "process killed by pattern match",
);

breaks(
  "a credential-shaped value in a committed file is rejected",
  "skills/xez-fix/SKILL.md",
  (s) => `${s}\n\n    token = "ghp_A1b2C3d4E5f6G7h8J9k0L1m2N3o4P5q6R7s8"\n`,
  lint,
  "credential-shaped value",
);

breaks(
  "a machine-specific absolute path in the committed config is rejected",
  ".xezar/pipeline/config.json",
  (s) => s.replace(/^\{/, '{\n  "cacheDir": "/Users/someone/Library/Caches/pipeline",'),
  lint,
  "machine-specific values",
);

breaks(
  "a body over the character budget is rejected",
  "skills/xez-fix/SKILL.md",
  (s) => `${s}\n${"Filler sentence that pushes this body past its budget. ".repeat(500)}\n`,
  lint,
  "budget 20000",
);

breaks(
  "a skill that drops its local-override preflight is rejected",
  "skills/xez-fix/SKILL.md",
  (s) => s.replace("**ALWAYS check first:**", "Optionally check:"),
  lint,
  "missing the mandatory local override preflight",
);

// --- the newer, single-purpose checkers --------------------------------------

breaks(
  "a link to a file that does not exist is rejected",
  "README.md",
  (s) => `${s}\n[the missing page](docs/this-page-was-never-written.md)\n`,
  () => script("check-links.mjs"),
  "link target does not exist",
);

breaks(
  "a skill pointing at a reference file it does not ship is rejected",
  "skills/xez-fix/SKILL.md",
  (s) => `${s}\n\nFor the detail, follow \`references/not-a-real-step.md\`.\n`,
  () => script("check-links.mjs"),
  "which this skill does not ship",
);

breaks(
  "SDLC.md drifting from the configured gate list is rejected",
  "SDLC.md",
  (s) => s.replace("- `node scripts/check-links.mjs`\n", ""),
  () => script("check-gate-list.mjs"),
  "does not match",
);

breaks(
  "a label named in the config with no taxonomy entry is rejected",
  ".xezar/pipeline/config.json",
  (s) => s.replace('"risk-low",', '"risk-low",\n      "risk-unknowable",'),
  () => script("check-label-taxonomy.mjs"),
  "no entry in labels.json",
);

breaks(
  "an expired allowlist entry is rejected",
  "scripts/allowlists.json",
  (s) => s.replace(/"expires": "20\d\d-\d\d-\d\d"/, '"expires": "2020-01-01"'),
  () => script("check-allowlists.mjs"),
  "expired on 2020-01-01",
);

breaks(
  "an allowlist entry with no owner is rejected",
  "scripts/allowlists.json",
  (s) => s.replace(/\n\s*"who": "collection maintainers",/, ""),
  () => script("check-allowlists.mjs"),
  '"who" must name an owner',
);

breaks(
  "lint.sh's name_allow drifting from the allowlist file is rejected",
  "scripts/lint.sh",
  (s) => s.replace(/^name_allow="[^"]*"/m, 'name_allow=" ${PREFIX}-skill ${PREFIX}-skills ${PREFIX}-anything "'),
  () => script("check-allowlists.mjs"),
  "does not match allowlists.json",
);

// --- the tree is left exactly as it was found --------------------------------
// Compared against a snapshot taken at the top of the run, not against a clean tree:
// a contributor runs this with their own work in progress, and their uncommitted edits
// are none of this suite's business. What must match is BEFORE and AFTER.
{
  asserts += 1;
  if (run("git", ["status", "--porcelain"]).out !== statusBefore) {
    failures += 1;
    console.error(
      "FAIL  the suite changed the working tree.\n" +
      "      Run `git status` and `git diff` -- a mutation was not restored.",
    );
  }
}

if (failures) {
  console.error(`\nguards: ${failures} of ${asserts} guards did not catch their defect`);
  process.exit(1);
}
console.log(`Guard suite OK (${asserts} deliberate defects, each caught by the guard that owns it).`);
