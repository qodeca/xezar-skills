#!/usr/bin/env node
// Behavioural test for skills/xez-approve-merge-pr/references/merge-gate.sh.
//
// This is Release 1.0.1's acceptance check. It exists because "unknown is never
// a pass" is satisfiable by an agent typing "pass": the rule only means anything
// when it is bound to a captured exit code. Every case below runs the real
// script and asserts the verdict AND the exit status.
//
// Run: node scripts/test-merge-gate.mjs

import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { existsSync } from "node:fs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const SCRIPT = join(root, "skills", "xez-approve-merge-pr", "references", "merge-gate.sh");

if (!existsSync(SCRIPT)) {
  console.error(`merge-gate.sh not found at ${SCRIPT}`);
  process.exit(1);
}

let failures = 0;
let asserts = 0;

/** Every gate green, every input present. Cases override only what they test. */
const CLEAN = {
  state: "OPEN",
  isDraft: false,
  mergeable: "MERGEABLE",
  headSha: "aaaa111",
  reviewDecision: "APPROVED",
  reviewEnforced: true,
  checks: [{ name: "ci", state: "SUCCESS" }],
  requiredChecks: ["ci"],
  protectionReadable: true,
  baseCheckNames: ["ci"],
  configReadable: true,
  configPresent: true,
  labelsEnabled: true,
  qaGate: true,
  labelsDefined: ["needs-qa", "qa-approved", "skip-qa", "qa-failed", "do-not-merge", "blocked"],
  labels: [],
};

function run(input) {
  const payload = typeof input === "string" ? input : JSON.stringify(input);
  try {
    const stdout = execFileSync("sh", [SCRIPT], { input: payload, encoding: "utf8" });
    return { code: 0, stdout };
  } catch (err) {
    return { code: err.status ?? -1, stdout: err.stdout ?? "" };
  }
}

function parse(stdout) {
  const gates = {};
  let verdict = null;
  for (const line of stdout.split("\n")) {
    const m = /^Gate: (.+)$/.exec(line);
    if (m) { verdict = m[1].trim(); continue; }
    const eq = line.indexOf("=");
    if (eq > 0) gates[line.slice(0, eq)] = line.slice(eq + 1).trim();
  }
  return { gates, verdict };
}

/**
 * @param name        what the case proves
 * @param overrides   merged over CLEAN, or a raw string for malformed input
 * @param expected    { verdict, code, gate?: [name, value] }
 */
function check(name, overrides, expected) {
  asserts += 1;
  const input = typeof overrides === "string" ? overrides : { ...CLEAN, ...overrides };
  const { code, stdout } = run(input);
  const { gates, verdict } = parse(stdout);
  const problems = [];

  if (verdict !== expected.verdict) {
    problems.push(`verdict ${JSON.stringify(verdict)}, expected ${JSON.stringify(expected.verdict)}`);
  }
  if (code !== expected.code) {
    problems.push(`exit ${code}, expected ${expected.code}`);
  }
  if (expected.gate) {
    const [gateName, gateValue] = expected.gate;
    if (gates[gateName] !== gateValue) {
      problems.push(`${gateName}=${JSON.stringify(gates[gateName])}, expected ${JSON.stringify(gateValue)}`);
    }
  }

  if (problems.length) {
    failures += 1;
    console.error(`FAIL  ${name}\n      ${problems.join("\n      ")}`);
  }
}

const PASS = { verdict: "pass", code: 0 };
const REFUSE_FINDINGS = (gate) => ({ verdict: "findings", code: 1, gate });
const REFUSE_UNKNOWN = (gate) => ({ verdict: "unknown", code: 1, gate });

// --- the happy path, so the rest of the suite means something ---------------
check("a fully green PR merges", {}, PASS);

// --- commit binding (defect 2.1, and the check-then-act race) ---------------
check("head moved between the check and the merge",
  { mergeHeadSha: "bbbb222" }, REFUSE_FINDINGS(["commit", "findings"]));
check("head unchanged at merge time",
  { mergeHeadSha: "aaaa111" }, PASS);
check("no head commit at all is unknown, not 'unchanged'",
  { headSha: null }, REFUSE_UNKNOWN(["commit", "unknown"]));

// --- review decision (defect 2.2, first half) -------------------------------
check("changes requested refuses",
  { reviewDecision: "CHANGES_REQUESTED" }, REFUSE_FINDINGS(["review", "findings"]));
check("no review decision is unknown",
  { reviewDecision: null }, REFUSE_UNKNOWN(["review", "unknown"]));
check("approved-because-no-rule-applies is unknown, not approved",
  { reviewEnforced: false }, REFUSE_UNKNOWN(["review", "unknown"]));

// --- the normalized tri-state verdict (TEMPLATE contract) ------------------
check("reviewVerdict approved passes",
  { reviewVerdict: "approved" }, PASS);
check("reviewVerdict rejected refuses",
  { reviewVerdict: "rejected" }, REFUSE_FINDINGS(["review", "findings"]));
check("reviewVerdict pending is unknown",
  { reviewVerdict: "pending" }, REFUSE_UNKNOWN(["review", "unknown"]));
check("THE GITLAB SHAPE: not-enforced is unknown, never approved",
  { reviewVerdict: "not-enforced" }, REFUSE_UNKNOWN(["review", "unknown"]));
check("reviewVerdict unknown is unknown",
  { reviewVerdict: "unknown" }, REFUSE_UNKNOWN(["review", "unknown"]));
check("reviewVerdict wins over a disagreeing host field",
  { reviewVerdict: "not-enforced", reviewDecision: "APPROVED" },
  REFUSE_UNKNOWN(["review", "unknown"]));
check("an unrecognised verdict is unknown, never a pass",
  { reviewVerdict: "looks-fine-to-me" }, REFUSE_UNKNOWN(["review", "unknown"]));

// --- checks (defect 2.2, second half, plus the empty-set hole) --------------
check("a failing required check refuses",
  { checks: [{ name: "ci", state: "FAILURE" }] }, REFUSE_FINDINGS(["checks", "findings"]));
check("a pending required check refuses",
  { checks: [{ name: "ci", state: "PENDING" }] }, REFUSE_FINDINGS(["checks", "findings"]));
check("a required check with no run reported is unknown",
  { requiredChecks: ["ci", "e2e"] }, REFUSE_UNKNOWN(["checks", "unknown"]));
check("an EMPTY required set is not a pass",
  { requiredChecks: [], baseCheckNames: [] }, REFUSE_UNKNOWN(["checks", "unknown"]));
check("unreadable protection treats every reported check as required",
  { protectionReadable: false, requiredChecks: [], checks: [{ name: "ci", state: "FAILURE" }] },
  REFUSE_FINDINGS(["checks", "findings"]));
check("unreadable protection with no checks at all is unknown",
  { protectionReadable: false, requiredChecks: [], checks: [], baseCheckNames: [] },
  REFUSE_UNKNOWN(["checks", "unknown"]));
check("a PR that deleted a workflow (check set shrank) is unknown",
  { checks: [{ name: "ci", state: "SUCCESS" }], requiredChecks: ["ci"], baseCheckNames: ["ci", "e2e"] },
  REFUSE_UNKNOWN(["checks", "unknown"]));
check("no check data at all is unknown",
  { checks: null }, REFUSE_UNKNOWN(["checks", "unknown"]));

// --- base-branch config (a PR must not set the terms of its own merge) ------
check("unreadable base config is unknown, never the permissive default",
  { configReadable: false }, REFUSE_UNKNOWN(["config", "unknown"]));
check("a base branch with genuinely no config is not-applicable, not unknown",
  { configPresent: false, labelsEnabled: false, qaGate: false },
  { verdict: "pass", code: 0, gate: ["config", "not-applicable"] });

// --- the QA fail-open (defect 2.3) ------------------------------------------
check("needs-qa without qa-approved refuses",
  { labels: ["needs-qa"] }, REFUSE_FINDINGS(["qaGate", "findings"]));
check("needs-qa with qa-approved passes",
  { labels: ["needs-qa", "qa-approved"] }, PASS);
check("THE FAIL-OPEN: needs-qa was never created, so the gate is unknown",
  { labelsDefined: ["qa-approved", "skip-qa", "qa-failed", "do-not-merge", "blocked"] },
  REFUSE_UNKNOWN(["qaGate", "unknown"]));
check("needs-qa and skip-qa together refuse as inconsistent",
  { labels: ["needs-qa", "skip-qa"] }, REFUSE_FINDINGS(["qaGate", "findings"]));
check("qa gate off is not-applicable, not a pass claim",
  { qaGate: false }, { verdict: "pass", code: 0, gate: ["qaGate", "not-applicable"] });
check("labels disabled is not-applicable for both label gates",
  { labelsEnabled: false }, { verdict: "pass", code: 0, gate: ["labelBlocks", "not-applicable"] });
check("unknown label state (no labelsDefined) is unknown",
  { labelsDefined: null }, REFUSE_UNKNOWN(["qaGate", "unknown"]));

// --- hard blocks ------------------------------------------------------------
for (const label of ["qa-failed", "do-not-merge", "blocked"]) {
  check(`${label} is a hard block`,
    { labels: [label] }, REFUSE_FINDINGS(["labelBlocks", "findings"]));
}
check("a hard-block label that was never created is unknown",
  { labelsDefined: ["needs-qa", "qa-approved", "skip-qa", "qa-failed", "do-not-merge"] },
  REFUSE_UNKNOWN(["labelBlocks", "unknown"]));

// --- PR state ---------------------------------------------------------------
check("a closed PR refuses", { state: "MERGED" }, REFUSE_FINDINGS(["state", "findings"]));
check("a draft refuses", { isDraft: true }, REFUSE_FINDINGS(["draft", "findings"]));
check("a conflicting PR refuses",
  { mergeable: "CONFLICTING" }, REFUSE_FINDINGS(["mergeable", "findings"]));
check("unknown mergeability is unknown",
  { mergeable: null }, REFUSE_UNKNOWN(["mergeable", "unknown"]));

// --- the verdict head: does the verdict name THIS commit? --------------------
// Absence is legacy permanently. A pull request opened before the `Head:` line existed
// and merged two releases later must not be refused -- the line is keyed to the
// artifact, not to a release. So with the switch off, absence is not-applicable.
check("an absent Head line is tolerated while the switch is off",
  { verdictHead: undefined },
  { verdict: "pass", code: 0, gate: ["verdictHead", "not-applicable"] });

check("an absent Head line refuses once the switch is on",
  { requireVerdictHead: true },
  { verdict: "unknown", code: 1, gate: ["verdictHead", "unknown"] });

check("a Head line naming this commit passes",
  { verdictHead: "aaaa111", requireVerdictHead: true },
  { verdict: "pass", code: 0, gate: ["verdictHead", "pass"] });

// The dangerous case: a verdict that exists but is about something else. It must refuse
// whether or not the switch is on -- the switch governs ABSENCE, never a mismatch.
check("a Head line naming a different commit refuses, switch off",
  { verdictHead: "bbbb222" },
  { verdict: "findings", code: 1, gate: ["verdictHead", "findings"] });
check("a Head line naming a different commit refuses, switch on",
  { verdictHead: "bbbb222", requireVerdictHead: true },
  { verdict: "findings", code: 1, gate: ["verdictHead", "findings"] });

// --- every failure is reported, not just the first ---------------------------
// Reporting one failure at a time teaches a caller to fix, re-run, and discover the
// next -- a full cycle per problem.
{
  asserts += 1;
  const { stdout } = run({
    ...CLEAN,
    isDraft: true,
    reviewDecision: "CHANGES_REQUESTED",
    labels: ["do-not-merge"],
  });
  const { gates } = parse(stdout);
  const blocking = (gates.Blocking ?? "").split(",");
  for (const expected of ["draft", "review", "labelBlocks"]) {
    if (!blocking.includes(expected)) {
      failures += 1;
      console.error(`FAIL  Blocking= must name every failing gate; missing ${expected} in "${gates.Blocking}"`);
    }
  }
}
{
  asserts += 1;
  const { gates } = parse(run(CLEAN).stdout);
  if (gates.Blocking !== "none") {
    failures += 1;
    console.error(`FAIL  a clean run must report Blocking=none, got "${gates.Blocking}"`);
  }
}

// --- malformed input must never pass ----------------------------------------
check("empty input cannot decide", "", { verdict: "unknown", code: 3 });
check("non-JSON input cannot decide", "not json at all", { verdict: "unknown", code: 3 });
check("a JSON array is not a facts object", "[1,2,3]", { verdict: "unknown", code: 3 });
check("wrong-typed fields degrade to unknown, never to pass",
  { reviewDecision: 42, headSha: [], checks: "green" },
  { verdict: "unknown", code: 1 });

// --- the invariant, stated as a test ----------------------------------------
{
  asserts += 1;
  const { code, stdout } = run({ ...CLEAN, labelsDefined: [] });
  const { verdict } = parse(stdout);
  if (verdict === "pass" || code === 0) {
    failures += 1;
    console.error("FAIL  a gate with missing inputs must never exit 0 with 'pass'");
  }
}

if (failures) {
  console.error(`\nmerge-gate: ${failures} of ${asserts} assertions failed`);
  process.exit(1);
}
console.log(`Merge-gate contract OK (${asserts} assertions: commit binding, review, checks, base-branch config, QA fail-open, malformed input).`);
