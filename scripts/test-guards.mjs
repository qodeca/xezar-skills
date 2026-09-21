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
// Because it edits the checkout in place, only one run at a time may hold it. Two
// concurrent runs trample each other's mutations, and each then reports the other's
// defect as "the wrong guard fired" -- which reads exactly like a broken guard. A lock
// makes that impossible rather than confusing.
//
// Run: node scripts/test-guards.mjs

import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

// This suite mutates real tracked files. Two copies running at once trample each other's
// mutations and each one then "fails" on the other's defect -- which looks exactly like a
// broken guard and is not. `mkdir` is atomic, so it makes a usable lock with no dependency.
const LOCK = join(root, ".local", "test-guards.lock");
try {
  mkdirSync(join(root, ".local"), { recursive: true });
  mkdirSync(LOCK);
} catch {
  console.error(
    "test-guards: another run holds the lock at .local/test-guards.lock.\n" +
    "This suite edits tracked files in place, so two runs cannot share a checkout.\n" +
    "Wait for the other run, or remove the directory if no run is active.",
  );
  process.exit(1);
}
const releaseLock = () => { try { rmSync(LOCK, { recursive: true, force: true }); } catch {} };
process.on("exit", releaseLock);
for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => { releaseLock(); process.exit(130); });
}

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
  "a hard-coded package manager is rejected",
  "skills/xez-fix/SKILL.md",
  (s) => `${s}\n\nInstall the dependencies with yarn install first.\n`,
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

// The two gates above exclude `skills/<name>/kit/**` — vendored payload a skill copies
// into a consumer project. These two prove the exclusion is a path exclusion and nothing
// more: the same text in the skill's own body still fails, in the same skill that owns a
// kit. An exclusion nobody tests is an exclusion that quietly becomes a hole.
breaks(
  "direct tracker CLI use is still rejected in a skill that owns a kit",
  "skills/xez-onboard-opinionated/SKILL.md",
  (s) => `${s}\n\n\`\`\`bash\ngh pr create --title "setup"\n\`\`\`\n`,
  lint,
  "direct gh CLI usage",
);

breaks(
  "pattern-killing is still rejected in a skill that owns a kit",
  "skills/xez-onboard-opinionated/SKILL.md",
  (s) => `${s}\n\n\`\`\`bash\npkill -f "node server.js"\n\`\`\`\n`,
  lint,
  "process killed by pattern match",
);

// `test-kit-facts.mjs` pins a short list of facts across a skill's own prose and the vendored
// kit it ships. Those two halves are checked by different gates -- the kit is excluded from
// three of them by path -- so a contradiction between them passed everything until people read
// both. One break per pinned fact, plus a second for the dispatcher half of the ceilings pin --
// seven in all. A pin nothing breaks is a pin nobody knows still fires.
breaks(
  "the 8 KB note cap the decisions file must be exempt from is rejected",
  "skills/xez-onboard-opinionated/kit/checks/leader-context.sh",
  (s) => s.replace("NOTE_TAIL_BYTES=65536", "NOTE_TAIL_BYTES=8000"),
  () => script("test-kit-facts.mjs"),
  "NOTE_TAIL_BYTES is 8000",
);

breaks(
  "calling a committed campaign file runtime is rejected",
  "skills/xez-onboard-opinionated/kit/docs/leader-context-loading.md",
  (s) => `${s}\n| \`.xezar/campaigns/x/README.md\` | live state | no — runtime |\n`,
  () => script("test-kit-facts.mjs"),
  "no - runtime",
);

breaks(
  "a loop ceiling tuned in one place only is rejected",
  "skills/xez-onboard-opinionated/kit/loops.json",
  (s) => s.replace('"totalTasks": 10', '"totalTasks": 20'),
  () => script("test-kit-facts.mjs"),
  "ceiling",
);

breaks(
  "a second loop allowed to dispatch is rejected",
  "skills/xez-onboard-opinionated/kit/loops.json",
  (s) => s.replace('"id": "L1",\n      "role": "unblock",\n      "mechanism": "cron",\n      "schedule": "*/10 * * * *",\n      "mayDispatch": false', '"id": "L1",\n      "role": "unblock",\n      "mechanism": "cron",\n      "schedule": "*/10 * * * *",\n      "mayDispatch": true'),
  () => script("test-kit-facts.mjs"),
  "only L3 may",
);

breaks(
  "dropping a subfolder from the list the tidiness check enforces is rejected",
  "skills/xez-onboard-opinionated/kit/checks/local-tree.sh",
  (s) => s.replace('ALLOWED="runtime tasks worktrees scratch cache qa"', 'ALLOWED="runtime tasks worktrees scratch cache"'),
  () => script("test-kit-facts.mjs"),
  "ALLOWED is",
);

breaks(
  "injecting a campaign file the contract says is read on demand is rejected",
  "skills/xez-onboard-opinionated/kit/checks/leader-context.sh",
  (s) => s.replace('note_tail "${campaign}parked.md"', 'note_tail "${campaign}merges.md"'),
  () => script("test-kit-facts.mjs"),
  "merges.md",
);

breaks(
  "a launcher that stops marking its session as the leader is rejected",
  "skills/xez-onboard-opinionated/kit/scripts/xezar-leader.sh",
  (s) => s.replace("export XEZAR_LEADER=1", "export XEZAR_LEADER=0"),
  () => script("test-kit-facts.mjs"),
  "does not export XEZAR_LEADER=1",
);

breaks(
  "a kit issue template that points at another project's repository is rejected",
  "skills/xez-onboard-opinionated/kit/github/ISSUE_TEMPLATE/config.yml",
  (s) => s.replace("github.com/{{REPO_SLUG}}/", "github.com/qodeca/xezar/"),
  () => script("test-kit-facts.mjs"),
  "must point at the consumer's repository",
);

breaks(
  "a private tracker descriptor that drifts from the canonical one is rejected",
  "skills/xez-onboard-opinionated/references/trackers/github.md",
  (s) => s.replace("#### create-label", "#### make-label"),
  () => script("test-kit-facts.mjs"),
  "copy the canonical file over it",
);

breaks(
  "a taxonomy that drops a label the kit's design gate reads is rejected",
  "skills/xez-onboard-opinionated/references/labels.json",
  (s) => s.replace('"skip-design"', '"skip-the-design"'),
  () => script("test-kit-facts.mjs"),
  'has no "skip-design" label',
);

breaks(
  "a module path from the engine's own repository in the vendored kit is rejected",
  "skills/xez-onboard-opinionated/kit/checks/lib/common.sh",
  (s) => s.replace("the engine's `RunManager.agentEnv`", "`packages/xezar/src/workflows/run.ts`"),
  lint,
  "packages/(web|xezar)",
);

breaks(
  "restoring the refusal that made a hand gate run impossible is rejected",
  "skills/xez-onboard-opinionated/kit/checks/lib/gate-record.sh",
  (s) =>
    s.replace(
      '  if [ -n "${TASK_ID:-}" ]; then',
      "  [ -n \"${TASK_ID:-}\" ] || { printf 'gate-record: no run id — cannot locate the evidence directory\\n' >&2; return 1; }\n  if [ -n \"${TASK_ID:-}\" ]; then",
    ),
  () => script("test-kit-facts.mjs"),
  "run by hand exits 1",
);

breaks(
  "moving a standalone gate attempt into an evidence root is rejected",
  "skills/xez-onboard-opinionated/kit/checks/lib/common.sh",
  (s) => s.replace(".local/xezar/scratch/standalone-gates", ".local/xezar/tasks/standalone-gates"),
  () => script("test-kit-facts.mjs"),
  "could land in an evidence root",
);

breaks(
  "a preflight that demands a different engine version than the prompt installs is rejected",
  "skills/xez-onboard-opinionated/references/preflight.md",
  (s) => s.replace("0.16.0 or later", "0.17.0 or later"),
  () => script("test-compat-pins.mjs"),
  "compat.json says",
);

breaks(
  "a bootstrap prompt that loses its no-sudo rule is rejected",
  "docs/bootstrap-prompt.md",
  (s) => s.replace("Never use sudo. ", ""),
  () => script("test-compat-pins.mjs"),
  "the prompt lost the rule",
);

breaks(
  "rewording a guide heading xez-add-rule routes into is rejected",
  "skills/xez-onboard-opinionated/kit/leader-guide.template.md",
  (s) => s.replace("## Review discipline", "## Reviewing"),
  () => script("test-kit-facts.mjs"),
  "lands nowhere",
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
  "a chaining line tidied into a different shape is rejected",
  "skills/xez-approve-merge-pr/references/report-templates.md",
  (s) => s.replace("PR: #<number> (link: <full PR URL>)", "PR #<number>: <full PR URL>"),
  () => script("test-chaining-lines.mjs"),
  "uses the exact PR label form",
);

breaks(
  "dropping the Head line from a verdict skill is rejected",
  "skills/xez-auto-create-pr/references/rules.md",
  (s) => s.replace("`Head: <head commit sha>`", "`Head: the head commit`"),
  () => script("test-chaining-lines.mjs"),
  "documents the Head line",
);

breaks(
  "a gate status that lets missing evidence pass is rejected",
  "skills/xez-approve-merge-pr/references/gate-status.sh",
  (s) => s.replace(
    '"unknown|No exit code was observed, so there is nothing to interpret."',
    '"pass|No exit code was observed, so assume it went fine."',
  ),
  () => script("test-gate-status.mjs"),
  "never exits 0",
);

breaks(
  "a provider that reads an exit code as a pass when nothing was scanned is rejected",
  "skills/xez-setup-agent-pipeline/references/security/osv-scanner.md",
  (s) => s.replace(/\| `128` \| \*\*`unknown`\*\* \|/, "| `128` | `pass` |"),
  () => script("test-toolchain-providers.mjs"),
  "exit 128 means nothing was scanned",
);

breaks(
  "dropping lifecycle-script suppression from a restore is rejected",
  "skills/xez-setup-agent-pipeline/references/toolchains/npm.md",
  (s) => s.replace(/--ignore-scripts/g, ""),
  () => script("test-toolchain-providers.mjs"),
  "suppresses package lifecycle scripts",
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
