#!/usr/bin/env node
// Contract test for the toolchain and security descriptor families.
//
// What a descriptor test must NOT be. Checking that every provider has a heading per
// operation proves only that somebody typed the headings. Headings are a schema
// precondition here, never the pass criterion: the assertions below are about what each
// provider says will HAPPEN, and about the cells where two ecosystems genuinely differ.
//
// The parity matrix is the centre of the file. A contract with one implementation is a
// description of that implementation; the npm-shaped assumptions only become visible when
// a second ecosystem has to satisfy the same postconditions. Two of them do not survive
// the trip -- Cargo has no package lifecycle scripts, and ships no `outdated` -- and each
// of those cells must carry a RECORDED degradation rather than a silent gap.
//
// Run: node scripts/test-toolchain-providers.mjs

import { readFileSync, existsSync, globSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(join(root, p), "utf8");
const refs = "skills/xez-setup-agent-pipeline/references";

let failures = 0;
let asserts = 0;

function expect(name, condition, detail) {
  asserts += 1;
  if (!condition) {
    failures += 1;
    console.error(`FAIL  ${name}${detail ? `\n      ${detail}` : ""}`);
  }
}

const headings = (text) =>
  [...text.matchAll(/^### (.+)$/gm)].map((m) => m[1].trim()).sort();

// --- the operation surface ----------------------------------------------------
const TOOLCHAIN_OPS = [
  "build",
  "outdated",
  "restore-dependencies",
  "toolchain-check",
  "update-dependency",
];
const SECURITY_OPS = ["dependency-inventory", "security-check", "security-scan"];

const toolchainTemplate = read(`${refs}/toolchains/TEMPLATE.md`);
const securityTemplate = read(`${refs}/security/TEMPLATE.md`);

expect(
  "the toolchain template defines exactly the contracted operations",
  JSON.stringify(headings(toolchainTemplate)) === JSON.stringify(TOOLCHAIN_OPS),
  `got ${JSON.stringify(headings(toolchainTemplate))}`,
);
expect(
  "the security template defines exactly the contracted operations",
  JSON.stringify(headings(securityTemplate)) === JSON.stringify(SECURITY_OPS),
  `got ${JSON.stringify(headings(securityTemplate))}`,
);

const toolchains = globSync(`${refs}/toolchains/*.md`, { cwd: root })
  .filter((f) => !f.endsWith("TEMPLATE.md"))
  .sort();
const security = globSync(`${refs}/security/*.md`, { cwd: root })
  .filter((f) => !f.endsWith("TEMPLATE.md"))
  .sort();

// A contract with one implementation is a description of that implementation.
expect(
  "at least two toolchain providers ship, and not both from one ecosystem",
  toolchains.length >= 2,
  `got ${toolchains.length}: ${toolchains.join(", ")}`,
);

for (const [family, files, ops] of [
  ["toolchain", toolchains, TOOLCHAIN_OPS],
  ["security", security, SECURITY_OPS],
]) {
  for (const file of files) {
    const text = read(file);
    expect(
      `${file} implements every ${family} operation`,
      JSON.stringify(headings(text)) === JSON.stringify(ops),
      `got ${JSON.stringify(headings(text))}`,
    );
    // Untrusted output: a scanner's or a package manager's stdout is rendered into a
    // pull-request comment, and it carries text from an external database.
    expect(
      `${file} resolves its tool from PATH or an absolute path`,
      !/node_modules\/\.bin|vendor\/bin|\.\/tools\//.test(text),
      "a repository-local binary directory lets the change under review supply the tool that judges it",
    );
  }
}

// --- golden output fixtures: what each operation actually reports ------------
// Every operation must document the NAME=value lines it prints, and every documented
// status must be one of the five. A provider that prints a sixth word silently breaks
// every consumer's `case`.
const FIVE = ["pass", "findings", "unknown", "not-applicable", "evidence-unavailable"];

for (const file of [...toolchains, ...security, `${refs}/toolchains/TEMPLATE.md`, `${refs}/security/TEMPLATE.md`]) {
  const text = read(file);
  for (const m of text.matchAll(/^([A-Z][A-Z0-9_]*_STATUS)=(.+)$/gm)) {
    const values = m[2].split("|").map((v) => v.trim()).filter((v) => v && v !== "…");
    for (const value of values) {
      expect(
        `${file}: ${m[1]} value "${value}" is one of the five statuses`,
        FIVE.includes(value),
        `allowed: ${FIVE.join(", ")}`,
      );
    }
  }
  expect(
    `${file} documents NAME=value output`,
    /NAME=value|_STATUS=/.test(text),
    "an operation whose output shape is undocumented cannot be consumed",
  );
}

// --- exit codes are enumerated, and the traps are named ----------------------
// The two cases that make this family worth having. Both are real, both are documented
// by the tools, and both read as the opposite of what they mean.
expect(
  "npm documents that `outdated` exits 1 when something is out of date",
  /`1`\s*\|\s*`findings`/.test(read(`${refs}/toolchains/npm.md`)) &&
    /Not a failure/i.test(read(`${refs}/toolchains/npm.md`)),
  "exit 1 there is the normal result, not an error",
);
expect(
  "osv-scanner documents that exit 128 means nothing was scanned, and is unknown",
  /`128`[^\n]*`unknown`/.test(read(`${refs}/security/osv-scanner.md`)),
  "a scan that found no packages reads as clean and is not",
);
for (const file of [...toolchains, ...security]) {
  expect(
    `${file} says what an unenumerated exit code means`,
    /anything else[^\n]*unknown|`129`|Reserved for non-result/i.test(read(file)),
    "a code nobody enumerated is the case nobody thought about",
  );
}

// --- the tool-missing negative fixture ---------------------------------------
// A provider whose tool is not installed must report evidence-unavailable and say how to
// get it. Reporting a failure would blame the repository; reporting a pass would be a lie.
for (const file of [...toolchains, ...security]) {
  const text = read(file);
  expect(
    `${file} handles its tool being missing`,
    /evidence-unavailable/.test(text),
    "a missing tool is not the repository's fault and is not a pass",
  );
  expect(
    `${file} says how to install the missing tool`,
    /install|see https?:/i.test(text),
    "reporting a missing tool without saying how to get it leaves the reader stuck",
  );
}

// --- the parity matrix: capability x provider, with a recorded degradation ---
// One row per cell where two ecosystems differ. Each expects a SPECIFIC recorded answer,
// so "we forgot" cannot look like "not applicable here".
const MATRIX = [
  {
    capability: "suppresses package lifecycle scripts on restore",
    provider: `${refs}/toolchains/npm.md`,
    expect: /--ignore-scripts/,
    why: "npm runs preinstall/install/postinstall from every transitive package",
  },
  {
    capability: "suppresses package lifecycle scripts on restore",
    provider: `${refs}/toolchains/cargo.md`,
    expect: /RESTORE_SCRIPTS_SUPPRESSED=not-applicable/,
    why: "cargo has no package lifecycle scripts; this must be recorded, not left blank",
  },
  {
    capability: "restores without rewriting the lockfile",
    provider: `${refs}/toolchains/npm.md`,
    expect: /npm ci/,
    why: "`npm install` resolves afresh and rewrites the lockfile",
  },
  {
    capability: "restores without rewriting the lockfile",
    provider: `${refs}/toolchains/cargo.md`,
    expect: /cargo fetch --locked/,
    why: "--locked fails rather than updating Cargo.lock",
  },
  {
    capability: "ships `outdated` with the base tool",
    provider: `${refs}/toolchains/npm.md`,
    expect: /npm outdated/,
    why: "npm ships it",
  },
  {
    capability: "ships `outdated` with the base tool",
    provider: `${refs}/toolchains/cargo.md`,
    expect: /cargo-outdated is not installed/,
    why: "cargo does NOT ship it; the degradation has to be a status the caller can act on",
  },
  {
    capability: "has a build step at all",
    provider: `${refs}/toolchains/npm.md`,
    expect: /not-applicable/,
    why: "a package with no build script has nothing to build, which is not a pass",
  },
  {
    capability: "has a build step at all",
    provider: `${refs}/toolchains/cargo.md`,
    expect: /never `not-applicable`/,
    why: "a Cargo package always builds; saying so is part of the contract",
  },
  {
    capability: "pins an exact version on update",
    provider: `${refs}/toolchains/npm.md`,
    expect: /--save-exact/,
    why: "otherwise the manifest records a range that resolves to something else later",
  },
  {
    capability: "pins an exact version on update",
    provider: `${refs}/toolchains/cargo.md`,
    expect: /--precise/,
    why: "otherwise cargo takes the newest compatible version",
  },
  {
    capability: "reports how far an update spread",
    provider: `${refs}/toolchains/npm.md`,
    expect: /UPDATE_OTHERS_MOVED/,
    why: "npm resolves the whole tree, so one bump routinely moves transitive packages",
  },
  {
    capability: "produces a standard-format SBOM",
    provider: `${refs}/security/osv-scanner.md`,
    expect: /cyclonedx|spdx/i,
    why: "an SBOM in a private shape is worth nothing to a tool not written for this pipeline",
  },
];

for (const cell of MATRIX) {
  if (!existsSync(join(root, cell.provider))) {
    expect(`matrix: ${cell.provider} exists`, false, "the matrix names a provider that is not shipped");
    continue;
  }
  expect(
    `${cell.provider.split("/").pop()} — ${cell.capability}`,
    cell.expect.test(read(cell.provider)),
    `${cell.why}\n      (looked for ${cell.expect})`,
  );
}

// Every shipped toolchain provider must appear in the matrix, so adding a third provider
// forces a decision about each cell rather than inheriting npm's answers by silence.
for (const file of toolchains) {
  expect(
    `${file} is covered by the parity matrix`,
    MATRIX.some((c) => c.provider === file),
    "add its rows, including the cells where it differs — that is what the matrix is for",
  );
}

// --- default-off is the whole point of the security axis ---------------------
{
  const config = JSON.parse(read(".xezar/pipeline/config.json"));
  expect(
    "the security provider is unset by default",
    config.security?.provider === null || config.security?.provider === undefined,
    `got ${JSON.stringify(config.security)}`,
  );
  expect(
    "the toolchain provider list is a list",
    Array.isArray(config.toolchain?.providers),
    `got ${JSON.stringify(config.toolchain)}`,
  );
  expect(
    "an absent security provider means not-applicable, never unknown",
    /not-applicable/.test(securityTemplate) && /It is not `unknown`/.test(securityTemplate),
    "reporting unknown forever would look like a problem with every change",
  );
}

if (failures) {
  console.error(`\ntoolchain providers: ${failures} of ${asserts} assertions failed`);
  process.exit(1);
}
console.log(
  `Toolchain and security provider contract OK (${asserts} assertions: ` +
  `${toolchains.length} toolchain and ${security.length} security providers, ` +
  `${MATRIX.length} parity cells).`,
);
