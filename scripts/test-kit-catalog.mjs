#!/usr/bin/env node
// Proves the onboarding kit's catalog loads, is routed, and is counted right.
//
// Why this exists. The kit ships its own validator, `kit/checks/catalog-check.mjs`, but that
// validator only ever runs inside a project that was onboarded. Nothing in THIS repository ran
// it against the kit, so a workflow naming a skill that does not exist, or a step key the engine
// silently drops, shipped to every project and failed there. And one fault is invisible even to
// that validator: a workflow that is installed and valid and named by no routing row. The leader
// picks work by a row's trigger sentence, so such a workflow can never be selected by anything.
//
// Four checks, each one a way the kit went wrong or could:
//
//   1. the kit's own validator passes on the kit, staged the way a project holds it;
//   2. the validator's list of maintained skills IS the set of skill files -- a name left off
//      that list is not held to the shared contract, and passes in silence;
//   3. every workflow has a routing row, and every workflow a row names exists;
//   4. every count of rows and classes written in prose equals the table it describes.
//
// Run: node scripts/test-kit-catalog.mjs

import { execFileSync } from "node:child_process";
import { cpSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const SKILL = "skills/xez-onboard-opinionated";
const KIT = join(root, SKILL, "kit");
const ROWS = `${SKILL}/references/routing-rows.md`;

let problems = 0;
const fail = (message) => {
  problems += 1;
  console.error(`FAIL  ${message}`);
};

// --- 1. The kit's own validator, on the kit ---------------------------------------------------
// Staged as `<tmp>/.xezar/{workflows,skills,checks}` because that is the only layout the
// validator reads. The config is the smallest one it accepts.
const stage = mkdtempSync(join(tmpdir(), "kit-catalog-"));
try {
  mkdirSync(join(stage, ".xezar"));
  for (const dir of ["workflows", "skills", "checks"]) {
    cpSync(join(KIT, dir), join(stage, ".xezar", dir), { recursive: true });
  }
  writeFileSync(join(stage, ".xezar/config.json"), '{"baseBranch":"main"}\n');
  try {
    execFileSync("node", [join(KIT, "checks/catalog-check.mjs"), stage], { encoding: "utf8", stdio: "pipe" });
  } catch (error) {
    fail(`the kit's catalog-check refuses the kit:\n${(error.stdout ?? "") + (error.stderr ?? "")}`);
  }
} finally {
  rmSync(stage, { recursive: true, force: true });
}

// --- 2. Maintained skills: the list is the directory --------------------------------------------
const checker = readFileSync(join(KIT, "checks/catalog-check.mjs"), "utf8");
const listed = /const MAINTAINED_SKILLS = new Set\(\[([\s\S]*?)\]\);/.exec(checker);
const skillFiles = readdirSync(join(KIT, "skills"))
  .filter((name) => /^xezar-.*\.md$/.test(name))
  .map((name) => name.replace(/\.md$/, ""))
  .sort();
if (!listed) {
  fail("catalog-check.mjs no longer declares MAINTAINED_SKILLS as a Set literal this test can read");
} else {
  const names = [...listed[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]).sort();
  for (const name of skillFiles) {
    if (!names.includes(name)) fail(`kit/skills/${name}.md is not in MAINTAINED_SKILLS, so its shared contract is never checked`);
  }
  for (const name of names) {
    if (!skillFiles.includes(name)) fail(`MAINTAINED_SKILLS names "${name}", and kit/skills/ has no such file`);
  }
}

// --- 3. Workflows and routing rows name each other ---------------------------------------------
// A row is a table line opening with its number. Columns: #, task kind, workflow, trigger,
// class, never. A workflow cell may name more than one file.
const rowsText = readFileSync(join(root, ROWS), "utf8");
const rows = rowsText
  .split("\n")
  .filter((line) => /^\| \d+ \|/.test(line))
  .map((line) => {
    const cells = line.split("|").map((cell) => cell.trim());
    return {
      number: Number(cells[1]),
      workflows: [...cells[3].matchAll(/`([a-z0-9-]+\.yaml)`/g)].map((m) => m[1]),
      cls: cells[5],
    };
  });
const workflowFiles = readdirSync(join(KIT, "workflows")).filter((name) => name.endsWith(".yaml")).sort();
const routed = new Set(rows.flatMap((row) => row.workflows));

if (rows.length === 0) fail(`${ROWS} has no table rows this test can read`);
rows.forEach((row, index) => {
  if (row.number !== index + 1) fail(`${ROWS}: row ${index + 1} is numbered ${row.number} -- the precedence rules cite rows by number`);
  if (row.workflows.length === 0) fail(`${ROWS}: row ${row.number} names no workflow`);
  if (!row.cls) fail(`${ROWS}: row ${row.number} has no class`);
});
for (const name of workflowFiles) {
  if (!routed.has(name)) fail(`kit/workflows/${name} is named by no routing row -- installed, valid, and unreachable`);
}
for (const name of routed) {
  if (!workflowFiles.includes(name)) fail(`${ROWS} routes to ${name}, and kit/workflows/ has no such file`);
}

// --- 4. Counts written in prose ------------------------------------------------------------------
// A number standing directly before "rows" or "classes" in these files is a claim about the
// table, and it has to be the table's number. Spelled or in digits; a placeholder is not a claim,
// and neither is a number under five -- "when two rows are equally specific" talks about two
// rows, not about the table.
const classes = [...new Set(rows.map((row) => row.cls))];
const UNITS = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten",
  "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen"];
const TENS = { twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90 };
const toNumber = (text) => {
  const word = text.toLowerCase();
  if (/^\d+$/.test(word)) return Number(word);
  if (UNITS.includes(word)) return UNITS.indexOf(word);
  const [tens, unit] = word.split("-");
  if (!(tens in TENS)) return null;
  return TENS[tens] + (unit ? UNITS.indexOf(unit) : 0);
};
const NUMBER = `(\\d+|(?:${Object.keys(TENS).join("|")})(?:-[a-z]+)?|${UNITS.join("|")})`;
const COUNT_SITES = [
  `${SKILL}/references/routing-rows.md`,
  `${SKILL}/references/routing-interview.md`,
  `${SKILL}/references/interview.md`,
  `${SKILL}/references/report-templates.md`,
  `${SKILL}/SKILL.md`,
  `docs/skills/xez-onboard-opinionated.md`,
];
const EXPECTED = { rows: rows.length, classes: classes.length };
for (const site of COUNT_SITES) {
  const lines = readFileSync(join(root, site), "utf8").split("\n");
  lines.forEach((line, index) => {
    for (const match of line.matchAll(new RegExp(`\\b${NUMBER} (?:routing |task )?(rows|classes)\\b`, "gi"))) {
      const found = toNumber(match[1]);
      const unit = match[2].toLowerCase();
      if (found !== null && found >= 5 && found !== EXPECTED[unit]) {
        fail(`${site}:${index + 1} says "${match[0]}", and the routing table has ${EXPECTED[unit]} ${unit}`);
      }
    }
  });
}

if (problems) {
  console.error(`\nkit catalog: ${problems} problem(s)`);
  process.exit(1);
}
console.log(
  `Kit catalog OK (${workflowFiles.length} workflows, ${skillFiles.length} skills, ` +
  `${rows.length} rows over ${classes.length} classes; every workflow routed, every count in step).`,
);
