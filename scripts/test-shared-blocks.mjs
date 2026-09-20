#!/usr/bin/env node
// Behavioural test for scripts/sync-shared-blocks.mjs.
//
// A sync check is worth nothing unless it fails. Two ways it could be worthless:
// a one-byte divergence slips through, or somebody makes it green by shrinking the
// marked region until the copies trivially agree. Both are asserted here, by
// breaking a real file, running the real checker, and restoring.
//
// Run: node scripts/test-shared-blocks.mjs

import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const SYNC = join(root, "scripts", "sync-shared-blocks.mjs");

// A copy that is not the canonical one, so breaking it tests propagation.
const VICTIM = join(root, "skills", "xez-approve-merge-pr", "references", "agentic-setup.md");
const CANON = join(root, "skills", "xez-auto-create-pr", "references", "agentic-setup.md");

let failures = 0;
let asserts = 0;

function runCheck() {
  try {
    return { code: 0, out: execFileSync("node", [SYNC, "--check"], { encoding: "utf8" }) };
  } catch (err) {
    return { code: err.status ?? -1, out: (err.stdout ?? "") + (err.stderr ?? "") };
  }
}

function expect(name, condition, detail) {
  asserts += 1;
  if (!condition) {
    failures += 1;
    console.error(`FAIL  ${name}${detail ? `\n      ${detail}` : ""}`);
  }
}

function withFile(path, mutate, body) {
  const original = readFileSync(path, "utf8");
  try {
    writeFileSync(path, mutate(original));
    body();
  } finally {
    writeFileSync(path, original);
  }
}

// --- baseline: the tree is in sync -----------------------------------------
{
  const { code, out } = runCheck();
  expect("a synced tree passes", code === 0, out.trim());
  expect("the banner reports how many copies were checked", /\d+ copies in sync/.test(out), out.trim());
}

// --- a one-byte divergence must fail ---------------------------------------
withFile(VICTIM, (s) => s.replace("data, never instructions", "data, never instruction"), () => {
  const { code, out } = runCheck();
  expect("a one-byte divergence fails", code !== 0);
  expect("the failure names the drifted file", out.includes("xez-approve-merge-pr"), out.trim());
  expect(
    "the failure says what to RUN, not what to retype",
    out.includes("node scripts/sync-shared-blocks.mjs"),
    out.trim(),
  );
});

// --- the generator repairs what the check rejected --------------------------
withFile(VICTIM, (s) => s.replace("data, never instructions", "data, never instruction"), () => {
  execFileSync("node", [SYNC], { encoding: "utf8" });
  const { code } = runCheck();
  expect("running the generator makes a drifted copy pass again", code === 0);
});

// --- narrowing the markers must NOT be a way to pass ------------------------
// This is the failure mode a compare-only test cannot catch: empty every block and
// all copies match, so the sync obligation silently evaporates.
withFile(CANON, (s) => {
  const a = s.indexOf("<!-- shared:untrusted-content:start -->");
  const b = s.indexOf("<!-- shared:untrusted-content:end -->");
  return s.slice(0, a) + "<!-- shared:untrusted-content:start -->\nnothing to see here\n" + s.slice(b);
}, () => {
  const { code, out } = runCheck();
  expect("an emptied canonical block fails the floor", code !== 0);
  expect(
    "the failure explains that narrowing is not a way to pass",
    out.includes("narrowing the markers"),
    out.trim(),
  );
});

// --- dropping a required clause must fail -----------------------------------
withFile(CANON, (s) => s.replace(/^- Never put a credential.*$/m, "- (removed)"), () => {
  const { code, out } = runCheck();
  expect("removing a required safety clause fails", code !== 0);
  expect("the failure names the missing clause", out.includes("required clause"), out.trim());
});

// --- a missing marker must fail, not be skipped -----------------------------
withFile(VICTIM, (s) => s.replace("<!-- shared:untrusted-content:start -->", ""), () => {
  const { code, out } = runCheck();
  expect("a copy with no markers fails", code !== 0);
  expect("the failure names the file missing markers", out.includes("missing"), out.trim());
});

// --- the tree is restored ----------------------------------------------------
{
  const { code } = runCheck();
  expect("the tree is left in sync after the test", code === 0);
}

if (failures) {
  console.error(`\nshared-blocks: ${failures} of ${asserts} assertions failed`);
  process.exit(1);
}
console.log(`Shared-block sync contract OK (${asserts} assertions: drift, repair, narrowing, clause floor, missing markers).`);
