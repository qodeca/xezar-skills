#!/usr/bin/env node
// Behavioural test for the gate-status decision script.
//
// The rule it protects is one sentence: **unknown is never a pass**. A sentence is
// satisfiable by writing the word "pass", so the rule only becomes real when it is bound
// to captured inputs. This suite runs the real script with real JSON and checks the word
// that comes back and the exit code that comes with it.
//
// The last assertion is the invariant, stated once and checked over every case: no input
// that is missing, unreachable or undocumented may ever come back as a pass.
//
// Run: node scripts/test-gate-status.mjs

import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const SCRIPT = join(root, "skills", "xez-approve-merge-pr", "references", "gate-status.sh");

let failures = 0;
let asserts = 0;

function decide(input) {
  const json = typeof input === "string" ? input : JSON.stringify(input);
  try {
    const out = execFileSync("sh", [SCRIPT], { input: json, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] });
    return { code: 0, ...parse(out) };
  } catch (err) {
    return { code: err.status ?? -1, ...parse(err.stdout ?? ""), stderr: err.stderr ?? "" };
  }
}

/** NAME=value lines, split on the FIRST `=` only -- a Reason may contain one. */
function parse(out) {
  const fields = {};
  for (const line of out.split("\n")) {
    const i = line.indexOf("=");
    if (i > 0) fields[line.slice(0, i)] = line.slice(i + 1);
  }
  return { fields };
}

function expect(name, condition, detail) {
  asserts += 1;
  if (!condition) {
    failures += 1;
    console.error(`FAIL  ${name}${detail ? `\n      ${detail}` : ""}`);
  }
}

function status(name, input, wantStatus, wantCode) {
  const r = decide(input);
  expect(
    `${name} -> ${wantStatus} (exit ${wantCode})`,
    r.fields.Status === wantStatus && r.code === wantCode,
    `got Status=${r.fields.Status ?? "(none)"} exit=${r.code}${r.stderr ? `\n      stderr: ${r.stderr.trim()}` : ""}`,
  );
  return r;
}

const MAP = { 0: "pass", 1: "findings" };

// --- the only two ways to pass ------------------------------------------------
status("a documented success code", { gate: "sca", exitCode: 0, exitCodeMap: MAP }, "pass", 0);
status("a gate that does not apply", { gate: "qa", applicable: false }, "not-applicable", 0);

// --- a real negative result ---------------------------------------------------
status("a documented failure code", { gate: "sca", exitCode: 1, exitCodeMap: MAP }, "findings", 1);

// --- every shape of missing input is unknown, and none of them pass -----------
status("no exit code at all", { gate: "sca", exitCodeMap: MAP }, "unknown", 1);
status("an explicit null exit code", { gate: "sca", exitCode: null, exitCodeMap: MAP }, "unknown", 1);
status("no exit-code meanings supplied", { gate: "sca", exitCode: 0 }, "unknown", 1);
status("an empty exit-code map", { gate: "sca", exitCode: 0, exitCodeMap: {} }, "unknown", 1);
status("an undocumented exit code", { gate: "sca", exitCode: 7, exitCodeMap: MAP }, "unknown", 1);

// 0 meaning something other than success is the reason step 6 exists: plenty of tools
// exit 0 after aborting. The map is the authority, not the number.
status(
  "exit 0 documented as something other than pass",
  { gate: "sca", exitCode: 0, exitCodeMap: { 0: "unknown", 2: "pass" } },
  "unknown",
  1,
);

// --- unreachable evidence does not pass, and is not the same as unknown -------
status("an unreachable evidence source", { gate: "api", evidenceAvailable: false }, "evidence-unavailable", 1);
{
  // It must not be silently upgraded by also supplying a passing exit code: the source
  // was unreachable, so whatever code is in hand did not come from it.
  status(
    "unreachable, even with a passing code alongside",
    { gate: "api", evidenceAvailable: false, exitCode: 0, exitCodeMap: MAP },
    "evidence-unavailable",
    1,
  );
}

// --- the findings count outranks a passing code -------------------------------
status(
  "exit 0 with findings reported",
  { gate: "sca", exitCode: 0, exitCodeMap: MAP, findings: 3 },
  "findings",
  1,
);
status(
  "exit 0 with zero findings stays a pass",
  { gate: "sca", exitCode: 0, exitCodeMap: MAP, findings: 0 },
  "pass",
  0,
);

// --- the jq `//` trap ---------------------------------------------------------
// `.applicable // true` evaluates to `true` when applicable is `false`, because jq's
// alternative operator treats false as empty. That one character would have turned every
// "does not apply" into "applies" -- and the failure would have looked like a gate that
// mysteriously reported unknown forever.
{
  const r = decide({ gate: "qa", applicable: false });
  expect(
    "applicable:false is honoured, not coerced to true by jq's // operator",
    r.fields.Status === "not-applicable",
    `got ${r.fields.Status}`,
  );
  const r2 = decide({ gate: "api", evidenceAvailable: false });
  expect(
    "evidenceAvailable:false is honoured too",
    r2.fields.Status === "evidence-unavailable",
    `got ${r2.fields.Status}`,
  );
}

// --- ordering: not-applicable is decided before missing evidence --------------
// A repository with labels turned off has no evidence to fetch. If the order were
// reversed it would report unknown and block every merge in that repository forever.
status(
  "not-applicable wins over missing evidence",
  { gate: "qa", applicable: false, evidenceAvailable: false },
  "not-applicable",
  0,
);

// --- usage errors are exit 2: a caller bug, not a verdict ---------------------
{
  for (const [name, input] of [
    ["not JSON at all", "this is not json"],
    ["a JSON array", "[]"],
    ["a JSON string", '"pass"'],
    ["no gate name", {}],
    ["an empty gate name", { gate: "" }],
    ["a gate name with a space", { gate: "merge gate" }],
    ["an upper-case gate name", { gate: "Merge" }],
    ["a gate name starting with a digit", { gate: "2fa" }],
    ["applicable as a string", { gate: "qa", applicable: "false" }],
    ["findings as a string", { gate: "sca", exitCode: 0, exitCodeMap: MAP, findings: "3" }],
    ["a map value that is not a status", { gate: "sca", exitCode: 0, exitCodeMap: { 0: "green" } }],
  ]) {
    const r = decide(input);
    expect(`usage error: ${name} -> exit 2`, r.code === 2, `got exit ${r.code}`);
    expect(`usage error: ${name} prints no Status`, !r.fields.Status, `got Status=${r.fields.Status}`);
  }
}

// --- the output shape is parseable --------------------------------------------
{
  const r = decide({ gate: "sca", exitCode: 7, exitCodeMap: MAP });
  expect("the gate name is echoed back", r.fields.Gate === "sca", `got ${r.fields.Gate}`);
  expect("a reason is given", (r.fields.Reason ?? "").length > 10, `got ${r.fields.Reason}`);
  expect(
    "the reason names the codes that WERE documented",
    (r.fields.Reason ?? "").includes("0, 1"),
    `got ${r.fields.Reason}`,
  );
  expect(
    "the reason is one line, so NAME=value parsing cannot break",
    !(r.fields.Reason ?? "").includes("\n"),
  );
}

// --- the invariant, over every case above -------------------------------------
// Anything that is not a measured success or a documented non-applicability must not
// exit 0. This is the whole point of the file, asserted once more as a sweep.
{
  const mustNotPass = [
    { gate: "g" },
    { gate: "g", exitCode: null },
    { gate: "g", exitCode: 0 },
    { gate: "g", exitCode: 0, exitCodeMap: {} },
    { gate: "g", exitCode: 9, exitCodeMap: MAP },
    { gate: "g", evidenceAvailable: false },
    { gate: "g", evidenceAvailable: false, exitCode: 0, exitCodeMap: MAP },
    { gate: "g", exitCode: 1, exitCodeMap: MAP },
    { gate: "g", exitCode: 0, exitCodeMap: MAP, findings: 1 },
  ];
  for (const input of mustNotPass) {
    const r = decide(input);
    expect(
      `a gate with missing or negative evidence never exits 0: ${JSON.stringify(input)}`,
      r.code !== 0 && r.fields.Status !== "pass",
      `got Status=${r.fields.Status} exit=${r.code}`,
    );
  }
}

if (failures) {
  console.error(`\ngate-status: ${failures} of ${asserts} assertions failed`);
  process.exit(1);
}
console.log(`Gate status contract OK (${asserts} assertions: five statuses, only pass and not-applicable exit 0).`);
