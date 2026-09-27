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
const KIT_INDEX_PKG = JSON.parse(readFileSync(join(root, "package.json"), "utf8")).version;
const KIT_INDEX_PKG_IS_NEWEST =
  JSON.parse(readFileSync(join(root, "upgrade/kit-index/index.json"), "utf8")).versions.at(-1)?.version === KIT_INDEX_PKG;

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
// both. One break per pinned fact, plus a second for the dispatcher half of the ceilings pin and
// a second for FACT 14's other banned concept. A pin nothing breaks is a pin nobody knows still
// fires.
breaks(
  "the 8 KB note cap the decisions file must be exempt from is rejected",
  "skills/xez-onboard-opinionated/kit/checks/leader-context.sh",
  (s) => s.replace("NOTE_TAIL_BYTES=65536", "NOTE_TAIL_BYTES=8000"),
  () => script("test-kit-facts.mjs"),
  "NOTE_TAIL_BYTES is 8000",
);

breaks(
  "a smoke test that sends agentProfile with inline steps is rejected",
  "skills/xez-onboard-opinionated/references/smoke-test.md",
  (s) => s.replace("Give each step only `runner` and `model`:", "Give each step `runner`, `model` and `agentProfile: \"<login>\"`:"),
  () => script("test-kit-facts.mjs"),
  "sends agentProfile, worktree or autonomous with inline steps",
);

breaks(
  "an ignore file that lets the engine's lock and backup files into git is rejected",
  "skills/xez-onboard-opinionated/kit/xezar.gitignore",
  (s) => s.replace("/workspace.json.*\n", ""),
  () => script("test-kit-facts.mjs"),
  "does not ignore /workspace.json.*",
);

breaks(
  "a bootstrap prompt that never drops the setup's own engine entry is rejected",
  "docs/bootstrap-prompt.md",
  (s) => s.replace("   run claude mcp remove --scope local xezar (the committed .mcp.json keeps the engine), then start the leader\n", "   then start the leader\n"),
  () => script("test-compat-pins.mjs"),
  "the prompt lost the rule \"run claude mcp remove --scope local xezar\"",
);

breaks(
  "a leader hook that never tells the leader it is the leader is rejected",
  "skills/xez-onboard-opinionated/kit/checks/leader-context.sh",
  (s) => s.replace(/^  printf '%s\\n\\n' 'This session was started with XEZAR_LEADER=1.*\n/m, ""),
  () => script("test-kit-facts.mjs"),
  "does not tell the leader session it is the leader",
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
  "a tidiness check that stops reading the engine's published names is rejected",
  "skills/xez-onboard-opinionated/kit/checks/local-tree.sh",
  (s) => s.replace("  if command -v xezar >/dev/null 2>&1 && command -v node", "  if false && command -v node"),
  () => script("test-kit-catalog.mjs"),
  "refused a name the installed engine publishes",
);

breaks(
  "a tidiness check that forgets one of the engine's 0.19.0 names is rejected",
  "skills/xez-onboard-opinionated/kit/checks/local-tree.sh",
  (s) => s.replace(" pi-leader.json ", " "),
  () => script("test-kit-catalog.mjs"),
  'does not know the engine\'s file "pi-leader.json"',
);

breaks(
  "a documented-output fixture that runs the leader loader outside a leader session is rejected",
  "skills/xez-onboard-opinionated/kit/checks/documented-output.mjs",
  (s) => s.replace("const env = { ...process.env, XEZAR_LEADER: '1' };", "const env = { ...process.env };"),
  () => script("test-kit-catalog.mjs"),
  "documented-output check fails on the kit",
);

breaks(
  "injecting a campaign file the contract says is read on demand is rejected",
  "skills/xez-onboard-opinionated/kit/checks/leader-context.sh",
  (s) => s.replace('note_tail "${campaign}parked.md"', 'note_tail "${campaign}merges.md"'),
  () => script("test-kit-facts.mjs"),
  "merges.md",
);

// The two below guard FACT 14. They are the only thing standing between a removed practice and
// a new project relearning it: lint.sh's reference gate matches only `references/...` tokens, so
// a `.xezar/docs/dogfooding.md` pointer never matched it -- which is how that dead pointer shipped
// in 46 kit files and passed every gate for four releases.
breaks(
  "a kit document that points at the removed dogfooding ledger is rejected",
  "skills/xez-onboard-opinionated/kit/docs/close-out.md",
  (s) => `${s}\nSee dogfooding.md for the observation loop.\n`,
  () => script("test-kit-facts.mjs"),
  "dogfood",
);

breaks(
  "a kit role that reads the removed known-flake record field is rejected",
  "skills/xez-onboard-opinionated/kit/skills/xezar-integration.md",
  (s) => `${s}\nWhen failedJobsAreKnownLoadFlakes is true, rerun the failed jobs once.\n`,
  () => script("test-kit-facts.mjs"),
  "failedJobsAreKnownLoadFlakes",
);

// The two below guard the same fact against the idea returning as ENGLISH. Both identifiers can
// be gone while the kit still teaches the practice in a sentence -- which is what happened: after
// the removal `xezar-deploy.md` still said "a failed job is never rerun as a known flake", the
// survivor of a three-way contrast whose premise had been deleted, so it now taught that the
// integration path excuses jobs by name. Every gate was green.
breaks(
  "a kit document that excuses a failed job as a known flake is rejected",
  "skills/xez-onboard-opinionated/kit/skills/xezar-deploy.md",
  (s) => `${s}\nA failed job is never rerun as a known flake here.\n`,
  () => script("test-kit-facts.mjs"),
  "as a known flake",
);

breaks(
  "a kit document that names the removed known-load-flake register is rejected",
  "skills/xez-onboard-opinionated/kit/workflows/integration.yaml",
  (s) => `${s}\n# The two known load flakes are excused by name.\n`,
  () => script("test-kit-facts.mjs"),
  "known load flake",
);

// FACT 15's three properties. Each breaks QUIETLY -- the gates still run and nothing goes red --
// which is exactly the kind of regression a mutation case exists to catch.
breaks(
  "a gate lease re-exec without its re-entry guard is rejected",
  "skills/xez-onboard-opinionated/kit/checks/repo-gates.sh",
  (s) => s.replace('if [ -z "${XEZ_GATE_LEASE:-}" ]; then', 'if true; then'),
  () => script("test-kit-facts.mjs"),
  "XEZ_GATE_LEASE",
);

breaks(
  "resolving the gate lease engine through npx is rejected",
  "skills/xez-onboard-opinionated/kit/checks/repo-gates.sh",
  (s) => s.replace('elif command -v xez >/dev/null 2>&1; then', 'elif command -v npx >/dev/null 2>&1; then'),
  () => script("test-kit-facts.mjs"),
  "npx",
);

// The break that looks like no break at all: reverting to the old matcher leaves a working probe.
// It fails only when the engine rewords a line no test of theirs asserts -- which is precisely the
// event this pin exists to survive, and precisely the one nobody would notice happening.
breaks(
  "a lease probe matching an unasserted engine string is rejected",
  "skills/xez-onboard-opinionated/kit/checks/repo-gates.sh",
  (s) => s.replace(
    "grep -qF 'nothing to run'",
    "grep -qE 'usage: xezar lease gates|^xezar lease:'",
  ),
  () => script("test-kit-facts.mjs"),
  "nothing to run",
);

breaks(
  "dropping the engine's published lease probe is rejected",
  "skills/xez-onboard-opinionated/kit/checks/repo-gates.sh",
  (s) => s.replace('"$lease_bin" lease gates --probe', '"$lease_bin" lease gates --status-file "$lease_probe.status"'),
  () => script("test-kit-facts.mjs"),
  "the probe no longer carries BOTH",
);

breaks(
  "a lease probe that takes exit 0 as proof, without reading the answer, is rejected",
  "skills/xez-onboard-opinionated/kit/checks/repo-gates.sh",
  (s) => s.replace("answer.lease.gates === true", "true"),
  () => script("test-kit-facts.mjs"),
  "the published probe's answer is no longer read",
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
  // The mutated version must differ from `compat.json`'s minimum, so this string moves with the
  // floor. It said "0.16.0 -> 0.17.0" until the floor was raised to 0.18.0 on 2026-09-22, at which
  // point the search text no longer existed and the case was breaking nothing; it moved again with
  // the 0.19.0 floor.
  (s) => s.replace("0.19.0 or later", "0.18.0 or later"),
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
  "a bootstrap prompt that stops warning about the engine's default-No question is rejected",
  "docs/bootstrap-prompt.md",
  (s) => s.replace("The default is No.", "Answer it."),
  () => script("test-compat-pins.mjs"),
  "the prompt lost the rule",
);

breaks(
  "a leader guide budget that makes the 200-line limit impossible is rejected",
  "skills/xez-onboard-opinionated/references/write.md",
  (s) => s.replace("how a login being out is recorded | ≤ 12 |", "how a login being out is recorded | ≤ 40 |"),
  () => script("test-kit-facts.mjs"),
  "no run can comply",
);

breaks(
  "rewording the guide heading xez-add-rule writes into is rejected",
  "skills/xez-onboard-opinionated/kit/leader-guide.template.md",
  (s) => s.replace("\n## Owner's rules\n", "\n## Owner rules\n"),
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

breaks(
  "a preview that stops disclosing the provider switch is rejected",
  "skills/xez-onboard-opinionated/references/preview.md",
  (s) => s.replace("OpenCode is switched off", "One provider is tuned"),
  () => script("test-kit-facts.mjs"),
  "does not disclose the switch before the one approval",
);

breaks(
  "a kit descriptor edited without its digest pin moving is rejected",
  "skills/xez-onboard-opinionated/references/descriptor-digests.json",
  (s) => s.replace(/("kit\/pipeline\/security\/osv-scanner\.md": ")[0-9a-f]{4}/, "$1ffff"),
  () => script("test-kit-facts.mjs"),
  "review the change, then update the pin",
);

breaks(
  "a kit descriptor with no digest pin at all is rejected",
  "skills/xez-onboard-opinionated/references/descriptor-digests.json",
  (s) => s.replace(/\n\s*"kit\/pipeline\/toolchains\/cargo\.md": "[0-9a-f]{64}",/, ""),
  () => script("test-kit-facts.mjs"),
  "has no SHA-256 digest for kit/pipeline/toolchains/cargo.md",
);

const ROUTING = "skills/xez-onboard-opinionated/kit/routing.json";
const ROUTE_MJS = "skills/xez-onboard-opinionated/kit/checks/route.mjs";
// Edits routing.json as data, so a case names the change and not the file's layout.
const routingEdit = (change) => (s) => {
  const file = JSON.parse(s);
  change(file, (id) => file.rows.find((row) => row.id === id));
  return `${JSON.stringify(file, null, 2)}\n`;
};

breaks(
  "the tool-limits prohibition softened in routing.json is rejected",
  ROUTING,
  routingEdit((f) => { f.globalBans.find((b) => b.id === "tool-limits").rule = "A lane that ignores tool limits is best avoided."; }),
  () => script("test-kit-facts.mjs"),
  "lost the global prohibition",
);

// `test-kit-catalog.mjs` runs the onboarding kit's own validator on the kit, and adds the three
// checks that validator cannot make from inside a project: the maintained-skill list is the
// directory, every workflow has a routing row, every prose count is the table's count. One break
// each, and one for the generated shared contract the role skills end with.
breaks(
  "a kit workflow naming a skill that does not exist is rejected",
  "skills/xez-onboard-opinionated/kit/workflows/qa.yaml",
  (s) => s.replace("skill: xezar-qa", "skill: xezar-quality-assurance"),
  () => script("test-kit-catalog.mjs"),
  "xezar-quality-assurance",
);

// A reading step is read-only because of its shell (FACT 16, catalog-check's reader rule). Each way
// a pull request could quietly give one back its writing shell is a break of its own.
const CR = "skills/xez-onboard-opinionated/kit/workflows/code-review.yaml";
breaks(
  "a reading step with no bashAllowlist is rejected",
  CR,
  (s) => s.replace(/^\s+bashAllowlist: \[.*\]\n/m, ""),
  () => script("test-kit-catalog.mjs"),
  "has no bashAllowlist",
);

breaks(
  "a reading step allowed `git push` is rejected",
  CR,
  (s) => s.replace('bashAllowlist: ["gh pr view",', 'bashAllowlist: ["git push", "gh pr view",'),
  () => script("test-kit-catalog.mjs"),
  '"git push" is not a reading prefix',
);

breaks(
  "a reading step allowed plain `git diff`, which can write with --output, is rejected",
  CR,
  (s) => s.replace('bashAllowlist: ["gh pr view",', 'bashAllowlist: ["git diff", "gh pr view",'),
  () => script("test-kit-catalog.mjs"),
  '"git diff" is not a reading prefix',
);

breaks(
  "a reading step allowed `gh api`, which can POST, is rejected",
  CR,
  (s) => s.replace('bashAllowlist: ["gh pr view",', 'bashAllowlist: ["gh api", "gh pr view",'),
  () => script("test-kit-catalog.mjs"),
  '"gh api" is not a reading prefix',
);

breaks(
  "a verdict workflow that stops declaring its verdictRole is rejected",
  CR,
  (s) => s.replace("    verdictRole: code-review\n", ""),
  () => script("test-kit-catalog.mjs"),
  "no agent step declares verdictRole: code-review",
);

breaks(
  "a reading workflow given the Write tool is rejected",
  CR,
  (s) => s.replace("allowedTools: [Read, Grep, Glob, Bash,", "allowedTools: [Read, Grep, Glob, Bash, Write,"),
  () => script("test-kit-catalog.mjs"),
  '"code-review" is a review workflow',
);

breaks(
  "git-read.sh that stops refusing --output is rejected",
  "skills/xez-onboard-opinionated/kit/checks/git-read.sh",
  (s) => s.replace('BLOCKED_LONG="output ', 'BLOCKED_LONG="'),
  () => script("test-kit-facts.mjs"),
  "refuses --output",
);

breaks(
  "a reading step allowed raw `gh pr comment`, which takes -R and -F <any file>, is rejected",
  CR,
  (s) => s.replace('bashAllowlist: ["gh pr view",', 'bashAllowlist: ["gh pr comment", "gh pr view",'),
  () => script("test-kit-catalog.mjs"),
  '"gh pr comment" is not a reading prefix',
);

breaks(
  "a reading step allowed security-scan.sh, whose --out writes anywhere, is rejected",
  CR,
  (s) => s.replace('bashAllowlist: ["gh pr view",', 'bashAllowlist: ["bash .xezar/checks/security-scan.sh", "gh pr view",'),
  () => script("test-kit-catalog.mjs"),
  '"bash .xezar/checks/security-scan.sh" is not a reading prefix',
);

breaks(
  "a reading step allowed a compound entry is rejected",
  CR,
  (s) => s.replace('bashAllowlist: ["gh pr view",', 'bashAllowlist: ["gh pr view; rm -rf .", "gh pr view",'),
  () => script("test-kit-catalog.mjs"),
  '"gh pr view; rm -rf ." is not a reading prefix',
);

breaks(
  "a reading workflow given a writing tool with another name is rejected",
  CR,
  (s) => s.replace("allowedTools: [Read, Grep, Glob, Bash,", "allowedTools: [Read, Grep, Glob, Bash, NotebookEdit,"),
  () => script("test-kit-catalog.mjs"),
  '"code-review" is a review workflow',
);

breaks(
  "gh-write.sh that lets a reviewer add qa-approved is rejected",
  "skills/xez-onboard-opinionated/kit/checks/gh-write.sh",
  (s) => s.replace('NEVER_ADD="qa-approved ', 'NEVER_ADD="'),
  () => script("test-kit-facts.mjs"),
  "no longer refuses an approval label",
);

breaks(
  "a role doc that pipes into a write script with arguments is rejected",
  "skills/xez-onboard-opinionated/kit/skills/xezar-code-review.md",
  (s) => s.replace("| bash .xezar/checks/verdict-write.sh`: one JSON request", "| bash .xezar/checks/verdict-write.sh packet`: one JSON request"),
  () => script("test-kit-catalog.mjs"),
  "the engine's lock refuses a pipe into a script with arguments",
);

breaks(
  "gh-write.sh that drops a JSON comment's body is rejected",
  "skills/xez-onboard-opinionated/kit/checks/gh-write.sh",
  (s) => s.replace('body="$json_body"', 'body="(empty)"'),
  () => script("test-kit-catalog.mjs"),
  "gh-write.sh does not post a JSON comment request",
);

breaks(
  "verdict-write.sh that files a JSON packet as BLOCKED is rejected",
  "skills/xez-onboard-opinionated/kit/checks/verdict-write.sh",
  (s) => s.replace('exec bash "$SCRIPT_DIR/verdict-write.sh" packet', 'exec bash "$SCRIPT_DIR/verdict-write.sh" blocked'),
  () => script("test-kit-catalog.mjs"),
  "verdict-write.sh does not write a JSON packet request",
);

breaks(
  "a Codex rule that allows a command is rejected",
  "skills/xez-onboard-opinionated/kit/checks/catalog-check.mjs",
  (s) => s.replace('if (decision !== "prompt" && decision !== "forbidden") {', 'if (decision !== "prompt" && decision !== "forbidden" && decision !== "allow" && decision !== undefined) {'),
  () => script("test-kit-catalog.mjs"),
  "catalog-check accepts a Codex prefix_rule",
);

breaks(
  "kit Claude settings that allow a broad Bash rule are rejected",
  "skills/xez-onboard-opinionated/kit/claude/settings.json",
  (s) => s.replace('{\n  "hooks"', '{\n  "permissions": { "allow": ["Bash(npm test:*)"] },\n  "hooks"'),
  () => script("test-kit-catalog.mjs"),
  "widens every reading step's shell",
);

breaks(
  "dropping .claude/settings.json from the trust boundaries is rejected",
  "skills/xez-onboard-opinionated/kit/checks/lib/security-scan.mjs",
  (s) => s.replace(/^  \{ pattern: \/\^\\\.claude.*\n/m, ""),
  () => script("test-kit-facts.mjs"),
  "TRUST_BOUNDARIES no longer names .claude/settings.json",
);

breaks(
  "dropping .codex/ from the trust boundaries is rejected",
  "skills/xez-onboard-opinionated/kit/checks/lib/security-scan.mjs",
  (s) => s.replace(/^  \{ pattern: \/\^\\\.codex.*\n/m, ""),
  () => script("test-kit-facts.mjs"),
  "TRUST_BOUNDARIES no longer names .codex/",
);

breaks(
  "dropping .xezar/workflows and .xezar/checks from the trust boundaries is rejected",
  "skills/xez-onboard-opinionated/kit/checks/lib/security-scan.mjs",
  (s) => s.replace(/^  \{ pattern: \/\^\\\.xezar\\\/\(workflows\|checks\)\\\/\/.*\n/m, ""),
  () => script("test-kit-facts.mjs"),
  "TRUST_BOUNDARIES no longer names",
);

breaks(
  "a kit workflow that no routing row names is rejected",
  ROUTING,
  routingEdit((f, row) => { row("root-sync").workflows = ["issue-triage.yaml"]; }),
  () => script("test-kit-catalog.mjs"),
  "installed, valid, and unreachable",
);

// The routing file is read by a script that applies every ban a file can decide (FACT 17). Each
// way a pull request could reroute work past a ban is a break of its own.
breaks(
  "a cheap lane in the security review is rejected",
  ROUTING,
  routingEdit((f, row) => { row("security-review").lanes.push("codex/gpt-6-luna"); }),
  () => script("test-kit-catalog.mjs"),
  '"codex/gpt-6-luna" is a cheap lane',
);

breaks(
  "a row that narrows a security row, with a cheap lane, is rejected",
  ROUTING,
  routingEdit((f, row) => { row("docs-writing").narrows = "security-review"; row("docs-writing").neverAuthor = true; }),
  () => script("test-kit-catalog.mjs"),
  '"pi/deepseek-api/deepseek-flash" is a cheap lane',
);

breaks(
  "a reserved lane in an ordinary row is rejected",
  ROUTING,
  routingEdit((f, row) => { row("docs-writing").lanes.unshift("codex/gpt-6-astra"); }),
  () => script("test-kit-catalog.mjs"),
  "is reserved and this row is not one of its rows",
);

breaks(
  "a login that is an email address is rejected",
  ROUTING,
  routingEdit((f) => { f.tools.claude.rotation = ["owner@example.com"]; }),
  () => script("test-kit-catalog.mjs"),
  "is not an engine account ID",
);

breaks(
  "a login that is this machine's own user name is rejected",
  ROUTING,
  routingEdit((f) => { f.tools.codex.rotation = [(process.env.USER || "runner").toLowerCase().replace(/\s+/g, "-")]; }),
  () => script("test-kit-catalog.mjs"),
  "is this machine's own user name",
);

breaks(
  "a row naming a lane that does not exist is rejected",
  ROUTING,
  routingEdit((f, row) => { row("refactor").lanes.push("claude/opus-9"); }),
  () => script("test-kit-catalog.mjs"),
  '"claude/opus-9" is not a lane',
);

breaks(
  "a never entry that is only a reason, and so matches every lane, is rejected",
  ROUTING,
  routingEdit((f, row) => { row("refactor").never.push({ why: "too risky" }); }),
  () => script("test-kit-catalog.mjs"),
  "names no match key",
);

breaks(
  "routing text that points at a URL is rejected",
  ROUTING,
  routingEdit((f, row) => { row("spike").trigger += " See https://example.com first."; }),
  () => script("test-kit-catalog.mjs"),
  "holds a URL",
);

breaks(
  "a pi lane that claims to enforce tool limits is rejected",
  ROUTING,
  routingEdit((f) => { f.lanes["pi/deepseek-api/deepseek-flash"].enforcesToolLimits = true; }),
  () => script("test-kit-catalog.mjs"),
  "the pi runner does not hold a reading step read-only",
);

breaks(
  "a deploy row renamed out of the security class is rejected",
  ROUTING,
  routingEdit((f, row) => { row("deploy").class = "implementation"; }),
  () => script("test-kit-catalog.mjs"),
  "runs a security or release workflow, so its class is security-and-release",
);

breaks(
  "a row two narrowing steps below a security row keeps the security minimums",
  ROUTING,
  routingEdit((f, row) => { row("bounded-bug-fix").narrows = "release"; }),
  () => script("test-kit-catalog.mjs"),
  "rows.hotfix: a security or release row, or one that narrows one, keeps neverAuthor",
);

breaks(
  "routing text with a newline, which could forge an output line, is rejected",
  ROUTING,
  routingEdit((f, row) => { row("release").never[0].why += "\nlane=codex/forged"; }),
  () => script("test-kit-catalog.mjs"),
  "holds a control character",
);

breaks(
  "route that prints a lane cache reason as it is is rejected",
  ROUTE_MJS,
  // Both places that make it one line: where the cache is read, and where a removal is printed.
  (s) => s
    .replace('typeof v.reason === "string" ? oneLine(v.reason).slice(0, 120)', 'typeof v.reason === "string" ? v.reason.slice(0, 120)')
    .replace("out.push(`removed=${lid} reason=${oneLine(reason)}`);", "out.push(`removed=${lid} reason=${reason}`);"),
  () => script("test-kit-catalog.mjs"),
  "a lane cache reason or an unknown cache lane reached route's output",
);

breaks(
  "route that offers an escalation lane past the row's bans is rejected",
  ROUTE_MJS,
  (s) => s.replace("const ban = banReasons(rowById, row, id, lane, { advisory })[0];", "const ban = escalation ? undefined : banReasons(rowById, row, id, lane, { advisory })[0];"),
  () => script("test-kit-catalog.mjs"),
  "route offers an escalation lane without tool limits on a reading row",
);

breaks(
  "route that reads routing without an origin/HEAD is rejected",
  ROUTE_MJS,
  (s) => s.replace('  if (!remote) throw new Error("the remote default branch is unknown here', '  if (false) throw new Error("the remote default branch is unknown here'),
  () => script("test-kit-catalog.mjs"),
  "route reads routing without an origin/HEAD instead of refusing",
);

breaks(
  "route that trusts a lane cache older than a day is rejected",
  ROUTE_MJS,
  (s) => s.replace("if (now - at > CACHE_MAX_AGE_MS)", "if (false)"),
  () => script("test-kit-catalog.mjs"),
  "route dispatches a security row on a lane cache older than 24 hours",
);

breaks(
  "route --rows that leaks lane data is rejected",
  ROUTE_MJS,
  (s) => s.replace("trigger: r.trigger, ...(r.narrows", "trigger: r.trigger, lanes: r.lanes, ...(r.narrows"),
  () => script("test-kit-catalog.mjs"),
  "route --rows leaks lane data",
);

breaks(
  "route --check that passes a broken working-tree file is rejected",
  ROUTE_MJS,
  (s) => s.replace("if (errors.length) { process.stderr.write(`route: ${path} is refused", "if (false) { process.stderr.write(`route: ${path} is refused"),
  () => script("test-kit-catalog.mjs"),
  "route --check passed a broken working-tree file",
);

breaks(
  "route that refuses the leader's login in every tool's rotation is rejected",
  ROUTE_MJS,
  (s) => s.replace("const own = has(tools, file.leader.tool) ? tools[file.leader.tool] : null;\n    if (Array.isArray(own?.rotation) && own.rotation.includes(file.leader.login))",
    "for (const own of Object.values(tools)) if (Array.isArray(own?.rotation) && own.rotation.includes(file.leader.login))"),
  () => script("test-kit-catalog.mjs"),
  "route check refuses codex rotation [\"default\"] with a claude leader",
);

breaks(
  "a kit script that does nothing when reached through a link is rejected",
  ROUTE_MJS,
  (s) => s.replace("if (isMain) main(process.argv.slice(2));", "if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) main(process.argv.slice(2));\nimport { pathToFileURL } from \"node:url\";"),
  () => script("test-kit-catalog.mjs"),
  "kit/checks/route.mjs run through a link did not run",
);

breaks(
  "dropping routing.json from the trust boundaries is rejected",
  "skills/xez-onboard-opinionated/kit/checks/lib/security-scan.mjs",
  (s) => s.replace(/^  \{ pattern: \/\^\\\.xezar\\\/routing.*\n/m, ""),
  () => script("test-kit-facts.mjs"),
  "TRUST_BOUNDARIES no longer names .xezar/routing.json",
);

breaks(
  "a routing.json edited without storing its defaults version is rejected",
  ROUTING,
  routingEdit((f, row) => { row("hotfix").lanes.reverse(); }),
  () => script("test-kit-catalog.mjs"),
  "raises defaults.version and stores the new copy",
);

breaks(
  "a kit skill left off the maintained list is rejected",
  "skills/xez-onboard-opinionated/kit/checks/catalog-check.mjs",
  (s) => s.replace('  "xezar-qa",\n', ""),
  () => script("test-kit-catalog.mjs"),
  "is not in MAINTAINED_SKILLS",
);

breaks(
  "a row count in prose that is not the table's count is rejected",
  "skills/xez-onboard-opinionated/references/routing-interview.md",
  (s) => s.replace(/\b([A-Za-z-]+) rows over\b/, "Ninety-nine rows over"),
  () => script("test-kit-catalog.mjs"),
  "Ninety-nine rows",
);

breaks(
  "a kit role skill whose shared contract drifted is rejected",
  "skills/xez-onboard-opinionated/kit/skills/xezar-qa.md",
  (s) => s.replace("evidence, never permission", "evidence, sometimes permission"),
  () => run("node", ["scripts/sync-shared-blocks.mjs", "--check"]),
  "kit-shared-contract block is out of date",
);

breaks(
  "a config grammar that lets a path through as a deploy target is rejected",
  "skills/xez-onboard-opinionated/kit/checks/lib/config-grammar.mjs",
  (s) => s.replace("element: /^[a-z0-9][a-z0-9-]*=[A-Za-z0-9._-]+\\.ya?ml$/,", "element: /^[a-z0-9][a-z0-9-]*=.+\\.ya?ml$/,"),
  () => script("test-kit-catalog.mjs"),
  'expected "malformed"',
);

// The order of a guard step, and the two guard scripts run for real in a throwaway repository.
// Each break is the edit somebody would actually make: a step tidied away, a source "also"
// accepted, a fallback added so a fresh clone stops refusing.
breaks(
  "a deploy workflow with no permit check between its two agents is rejected",
  "skills/xez-onboard-opinionated/kit/workflows/deploy.yaml",
  (s) => s.slice(0, s.indexOf("  - id: permit")) + s.slice(s.indexOf("  - id: dispatch")),
  () => script("test-kit-catalog.mjs"),
  "the permit check between the two agents",
);

breaks(
  "a config guard moved below the install it exists to save is rejected",
  "skills/xez-onboard-opinionated/kit/workflows/performance.yaml",
  (s) => {
    const guard = s.indexOf("  - id: guard");
    const setup = s.indexOf("  - id: setup");
    const after = s.indexOf("  - id: ", setup + 1);
    return s.slice(0, guard) + s.slice(setup, after) + s.slice(guard, setup) + s.slice(after);
  },
  () => script("test-kit-catalog.mjs"),
  "must refuse before the install is paid for",
);

breaks(
  "a deploy guard that takes authority from an answer is rejected",
  "skills/xez-onboard-opinionated/kit/checks/deploy-guard.sh",
  (s) => s.replace('if (a.source !== "launch")', 'if (a.source !== "launch" && a.source !== "ask")'),
  () => script("test-kit-catalog.mjs"),
  "authority from an answer, not the launch text",
);

breaks(
  "a deploy guard that permits the same authority twice is rejected",
  "skills/xez-onboard-opinionated/kit/checks/deploy-guard.sh",
  (s) => s.replace('[ ! -e "$PERMIT" ] || refuse', '[ ! -e "$PERMIT" ] || rm -f "$PERMIT" || refuse'),
  () => script("test-kit-catalog.mjs"),
  "the same authority, a second time",
);

breaks(
  "a deploy guard that no longer reads one-way migrations under a rollback is rejected",
  "skills/xez-onboard-opinionated/kit/checks/deploy-guard.sh",
  (s) => s.replace('if [ "$DIRECTION" = "rollback" ]; then\n  MIGRATIONS=', 'if [ "$DIRECTION" = "never" ]; then\n  MIGRATIONS='),
  () => script("test-kit-catalog.mjs"),
  "a rollback across a one-way migration",
);

breaks(
  "a config guard that falls back to the checkout's own base branch is rejected",
  "skills/xez-onboard-opinionated/kit/checks/config-guard.sh",
  (s) => s.replace('  if [ -z "$REMOTE_DEFAULT" ]; then\n', '  [ -n "$REMOTE_DEFAULT" ] || REMOTE_DEFAULT="$BASE_BRANCH"\n  if [ -z "$REMOTE_DEFAULT" ]; then\n'),
  () => script("test-kit-catalog.mjs"),
  "an unknown remote default branch is refused",
);

breaks(
  "a config guard that passes an unvalidated branch name to git is rejected",
  "skills/xez-onboard-opinionated/kit/checks/config-guard.sh",
  // A function, not a string: `$'` in a replacement string means "the text after the match".
  (s) => s.replace("grep -Eq '^[A-Za-z0-9][A-Za-z0-9._/-]{0,254}$'", () => "grep -Eq '^.{1,255}$'"),
  () => script("test-kit-catalog.mjs"),
  "would read as a git option",
);

breaks(
  "a browser workflow that allows chrome-devtools by wildcard is rejected",
  "skills/xez-onboard-opinionated/kit/workflows/qa.yaml",
  (s) => s.replace("mcp__chrome-devtools__navigate_page,", "mcp__chrome-devtools__*,"),
  () => script("test-kit-facts.mjs"),
  "lists a chrome-devtools wildcard",
);

breaks(
  "a browser workflow that allows upload_file is rejected",
  "skills/xez-onboard-opinionated/kit/workflows/qa.yaml",
  (s) => s.replace("mcp__chrome-devtools__navigate_page,", "mcp__chrome-devtools__navigate_page, mcp__chrome-devtools__upload_file,"),
  () => script("test-kit-facts.mjs"),
  "expected exactly",
);

breaks(
  "a chrome-devtools server on @latest is rejected",
  "skills/xez-onboard-opinionated/kit/mcp.json",
  (s) => s.replace("chrome-devtools-mcp@1.10.1", "chrome-devtools-mcp@latest"),
  () => script("test-kit-facts.mjs"),
  "never @latest",
);

breaks(
  "a kit with no Codex browser config is rejected",
  "skills/xez-onboard-opinionated/kit/codex/config.toml",
  () => "",
  () => script("test-kit-facts.mjs"),
  "Codex runs get no browser",
);

breaks(
  "a Codex browser config whose tools still need approval is rejected",
  "skills/xez-onboard-opinionated/kit/codex/config.toml",
  (s) => s.replace('default_tools_approval_mode = "approve"\n', ""),
  () => script("test-kit-facts.mjs"),
  "every browser call would fail",
);

breaks(
  "a config guard that no longer refuses a changed browser entry is rejected",
  "skills/xez-onboard-opinionated/kit/checks/config-guard.sh",
  (s) => s.replace('base === "" || base === entry(process.env.TREE_TEXT) ? "same" : "changed"', '"same"'),
  () => script("test-kit-catalog.mjs"),
  "the chrome-devtools entry in .mcp.json differs",
);

breaks(
  "a grammar that refuses an unknown neighbour beside a key that is set is rejected",
  "skills/xez-onboard-opinionated/kit/checks/lib/config-grammar.mjs",
  (s) => s.replace("  if (value === undefined) {\n", "  for (const sibling of Object.keys(node ?? {})) {\n    if (!GRAMMAR[`${group}.${sibling}`]) return { status: \"malformed\", detail: \"unknown sibling\", values: [] };\n  }\n  if (value === undefined) {\n"),
  () => script("test-kit-catalog.mjs"),
  'expected "ok"',
);

breaks(
  "a class count in prose that is not the table's count is rejected, however small",
  "skills/xez-onboard-opinionated/references/report-templates.md",
  (s) => s.replace(/\b\d+ classes\b/, "3 classes"),
  () => script("test-kit-catalog.mjs"),
  "3 classes",
);

// The kit bootstrap keeps a differing kit file only when it is the fork base's blob. Each half of
// that rule breaks on its own: keep nothing (a lagging primary refuses every task), keep anything
// (a branch-edited gate is snapshotted), or keep when the fork base cannot be found.
breaks(
  "a bootstrap that refuses a kit file equal to the fork base is rejected",
  "skills/xez-onboard-opinionated/kit/checks/lib/bootstrap.mjs",
  (s) => s.replace("if(fs.lstatSync(dest).isFile()&&atBase(f.rel,dest)){kept++;continue;}", ""),
  () => script("test-bootstrap.mjs"),
  "a kit file that equals the fork base is kept",
);

breaks(
  "a bootstrap that keeps a kit file the branch changed is rejected",
  "skills/xez-onboard-opinionated/kit/checks/lib/bootstrap.mjs",
  (s) => s.replace("isFile()&&atBase(f.rel,dest)", "isFile()"),
  () => script("test-bootstrap.mjs"),
  "a kit file the branch committed itself is refused",
);

breaks(
  "a bootstrap that keeps a differing kit file with no fork base is rejected",
  "skills/xez-onboard-opinionated/kit/checks/lib/bootstrap.mjs",
  (s) => s.replace("if(!forkBase)return false;", "if(!forkBase)return true;"),
  () => script("test-bootstrap.mjs"),
  "with no reachable fork base a differing kit file is refused",
);

// Dependency units (kit/checks/lib/deps.mjs): which folders install, from where, and what counts
// as installed. Each property breaks on its own, and the skip allowance with them.
breaks(
  "a unit whose folder is gone passing as resolved is rejected",
  "skills/xez-onboard-opinionated/kit/checks/lib/deps.mjs",
  (s) => s.replace("const unresolvable = (problems, u, why) => { problems.push(", "const unresolvable = (problems, u, why) => { void ("),
  () => script("test-deps-units.mjs"),
  "no-unit failure",
);

breaks(
  "a permitted skip named by the record instead of the caller is rejected",
  "skills/xez-onboard-opinionated/kit/checks/lib/gate-results.mjs",
  (s) => s.replace("permittedSkipNames(installGate).has(command.name)", "permittedSkipNames(command.name).has(command.name)"),
  () => script("test-deps-units.mjs"),
  "whatever the record says",
);

breaks(
  "a yarn literal exemption that is not the allowlisted one is rejected",
  "scripts/lint.sh",
  (s) => s.replace('yarn_allow=" skills/', 'yarn_allow=" skills/xez-fix/SKILL.md skills/'),
  () => script("check-allowlists.mjs"),
  "yarn_allow does not match",
);

breaks(
  "a symlinked unit folder that is followed is rejected",
  "skills/xez-onboard-opinionated/kit/checks/lib/deps.mjs",
  (s) => s.replace("if (lstat(cur)?.isSymbolicLink()) throw new Refusal(", "if (false) throw new Refusal("),
  () => script("test-deps-units.mjs"),
  "a symlinked unit folder is refused",
);

breaks(
  "units read from the working tree instead of the base branch are rejected",
  "skills/xez-onboard-opinionated/kit/checks/lib/deps.mjs",
  (s) => s.replace("text = git(root, [\"show\", `refs/remotes/origin/${remote}:${CONFIG}`]);", "text = readFileSync(join(root, CONFIG), \"utf8\");"),
  () => script("test-deps-units.mjs"),
  "a unit added in the working tree is not installed",
);

// verdict-write.sh stamps the packet ids; each property breaks separately.
breaks(
  "a verdict writer that no longer stamps taskId and stepId is rejected",
  "skills/xez-onboard-opinionated/kit/checks/verdict-write.sh",
  (s) => s.replace("JSON.stringify({ ...p, taskId, stepId })", "JSON.stringify(p)"),
  () => script("test-kit-catalog.mjs"),
  "stamped with the step's taskId and stepId",
);

breaks(
  "a verdict writer that writes a packet with XEZ_STEP_ID unset is rejected",
  "skills/xez-onboard-opinionated/kit/checks/verdict-write.sh",
  (s) => s.replace('[ -n "${XEZ_TASK_ID:-}" ] && [ -n "${XEZ_STEP_ID:-}" ] || refuse', () => '[ -n "${XEZ_TASK_ID:-}" ] || refuse'),
  () => script("test-kit-catalog.mjs"),
  "with XEZ_STEP_ID unset",
);

breaks(
  "a verdict writer that overwrites a packet naming another task is rejected",
  "skills/xez-onboard-opinionated/kit/checks/verdict-write.sh",
  (s) => s.replace("if (p[k] !== undefined && p[k] !== v)", "if (false)"),
  () => script("test-kit-catalog.mjs"),
  "names another task",
);

breaks(
  "a reviewer skill that asks for the task id from the environment again is rejected",
  "skills/xez-onboard-opinionated/kit/skills/xezar-qa.md",
  (s) => s.replace("Leave `taskId` and `stepId` out:", () => "Set `taskId` to `$XEZ_TASK_ID`. Leave `taskId` and `stepId` out:"),
  () => script("test-kit-facts.mjs"),
  "holds $XEZ_TASK_ID",
);

breaks(
  "leader settings that let gh pr merge --admin through are rejected",
  "skills/xez-onboard-opinionated/kit/scripts/xezar-leader-settings.json",
  (s) => s.replace('"Bash(gh pr merge *--admin*)", ', ""),
  () => script("test-kit-facts.mjs"),
  "permissions.deny lacks Bash(gh pr merge *--admin*)",
);

breaks(
  "a budget loop back on a self-paced 3600s wake-up is rejected",
  "skills/xez-onboard-opinionated/kit/loops.json",
  (s) => s.replace('"mechanism": "cron",\n      "schedule": "7 * * * *",', '"mechanism": "self-paced-wakeup",\n      "schedule": "3600s",'),
  () => script("test-kit-facts.mjs"),
  "L2 is self-paced-wakeup",
);

breaks(
  "conflict repair routed back to the merging integration workflow is rejected",
  "skills/xez-onboard-opinionated/kit/routing.json",
  (s) => s.replace('"id": "conflict-repair",\n      "title": "Conflict repair",\n      "workflows": [\n        "address-review-findings.yaml"', '"id": "conflict-repair",\n      "title": "Conflict repair",\n      "workflows": [\n        "integration.yaml"'),
  () => script("test-kit-facts.mjs"),
  "conflict-repair routes to integration.yaml",
);

// --- 3.1.0 stream anchors -------------------------------------------------------
// Each 3.1.0 stream adds its cases between its own start and end lines, never elsewhere,
// so parallel PRs do not touch the same lines. The release PR removes the markers.
// 3.1.0-stream-A:start
// #59: kit role skills name no package manager, root lockfile or workspace count.
const ROLE = "skills/xez-onboard-opinionated/kit/skills";
const NO_PM = "names a package manager, a root lockfile or a workspace count";

breaks(
  "a role skill body that runs tests through npm is rejected",
  `${ROLE}/xezar-testing.md`,
  (s) => s.replace("through the project's test command", "through npm test -- <filter>"),
  lint,
  `xezar-testing.md:8 ${NO_PM} in a kit role skill's body`,
);

breaks(
  "a role skill body that names the root package-lock.json is rejected",
  `${ROLE}/xezar-dependency-maintenance.md`,
  (s) => s.replace("use that unit's own lockfile", "use package-lock.json"),
  lint,
  `xezar-dependency-maintenance.md:8 ${NO_PM}`,
);

breaks(
  "a role skill body that counts the workspaces is rejected",
  `${ROLE}/xezar-dependency-maintenance.md`,
  (s) => s.replace("the unit that imports it.", "the four real workspaces."),
  lint,
  `xezar-dependency-maintenance.md:10 ${NO_PM}`,
);

breaks(
  "an allowlisted body does not excuse npm in the shared contract tail",
  `${ROLE}/xezar-release-publish.md`,
  (s) => s.replace(/^(Writing-stage ownership: .*?)the typecheck command [^,]*,/m, "$1`npm run typecheck`,"),
  lint,
  `${NO_PM} in a kit role skill's tail`,
);

breaks(
  "an npm literal exemption that is not the allowlisted one is rejected",
  "scripts/lint.sh",
  (s) => s.replace('npm_allow=" skills/', 'npm_allow=" skills/xez-onboard-opinionated/kit/skills/xezar-testing.md skills/'),
  () => script("check-allowlists.mjs"),
  "npm_allow does not match",
);
// 3.1.0-stream-A:end

// 3.1.0-stream-B:start
// #50: the author chain. Each way route.mjs or the routing file could let a dependent lane through,
// or change what the leader already parses, is a break of its own.
breaks(
  "route that ignores the author chain is rejected",
  ROUTE_MJS,
  (s) => s.replace("    if (!chain) return null;\n    const lane = file.lanes[id];", "    return null;\n    const lane = file.lanes[id];"),
  () => script("test-kit-catalog.mjs"),
  "still offers a Claude lane",
);

breaks(
  "route output without --author that changes by one word is rejected",
  ROUTE_MJS,
  (s) => s.replace('out.push(`${line("escalation", lid)} by=hand`)', 'out.push(`${line("escalation", lid)} by=leader`)'),
  () => script("test-kit-catalog.mjs"),
  "no longer prints byte-identical output",
);

breaks(
  "route that prints an author-chain line that is not NAME=value is rejected",
  ROUTE_MJS,
  (s) => s.replace("`escalation-eligible=${lid}`", "`escalation-eligible ${lid}`"),
  () => script("test-kit-catalog.mjs"),
  "does not parse as NAME=value",
);

breaks(
  "a vendor exclusion naming a vendor no lane has is rejected",
  ROUTING,
  routingEdit((f) => { f.vendorExclusions = [{ vendor: "nobody" }]; }),
  () => script("test-kit-catalog.mjs"),
  "is the vendor of no lane",
);

breaks(
  "the shipped Claude vendor exclusion dropped from routing.json is rejected",
  ROUTING,
  routingEdit((f) => { delete f.vendorExclusions; }),
  () => script("test-kit-catalog.mjs"),
  "still offers a Claude lane",
);

// #65: the leader guide's dispatch, quota and merge-queue rules (FACT B1).
breaks(
  "dispatch at once made a second dispatcher, not an L3 run, is rejected",
  "skills/xez-onboard-opinionated/kit/leader-guide.template.md",
  (s) => s.replace("that turn – never an L1 or L2 tick, which wakes L3 instead – counts as an L3 run", "any turn may dispatch"),
  () => script("test-kit-facts.mjs"),
  "does not say that dispatching at once is an L3 run",
);

breaks(
  "the read-quota item dropped from the checklist is rejected",
  "skills/xez-onboard-opinionated/kit/leader-guide.template.md",
  (s) => s.replace("- [ ] Quota read from `read_quota` before this dispatch; every login verified", "- [ ] Every login verified before dispatch"),
  () => script("test-kit-facts.mjs"),
  "checklist has no",
);

breaks(
  "an L1 prompt that lets its own tick dispatch at once is rejected",
  "skills/xez-onboard-opinionated/kit/loops.json",
  (s) => s.replace("counts as a pacing run, and this tick is never one.", "counts as a pacing run."),
  () => script("test-kit-facts.mjs"),
  "L1's prompt does not say",
);

breaks(
  "close-out that loses the merge-queue path is rejected",
  "skills/xez-onboard-opinionated/kit/docs/close-out.md",
  (s) => s.replace("`gh pr merge <number> --auto`", "update the branch and merge"),
  () => script("test-kit-facts.mjs"),
  "does not describe both merge paths",
);
// 3.1.0-stream-B:end

// 3.1.0-stream-C:start
// #64: the timeline is cut by entries, and a decisions.md the loader cannot read is announced.
breaks(
  "a leader loader that keeps 400 timeline entries instead of 40 is rejected",
  "skills/xez-onboard-opinionated/kit/checks/leader-context.sh",
  (s) => s.replace("TIMELINE_ENTRIES_DEFAULT=40", "TIMELINE_ENTRIES_DEFAULT=400"),
  () => script("test-kit-facts.mjs"),
  "the timeline is not cut to its newest 40 entries",
);

breaks(
  "a leader loader that drops the timeline pointer line is rejected",
  "skills/xez-onboard-opinionated/kit/checks/leader-context.sh",
  (s) => s.replace("printf '\\n[timeline cut: showing", "printf '\\n[timeline: showing"),
  () => script("test-kit-facts.mjs"),
  "no pointer line naming the full timeline file",
);

breaks(
  "a leader loader that skips a missing decisions.md in silence is rejected",
  "skills/xez-onboard-opinionated/kit/checks/leader-context.sh",
  (s) => s.replace('  if [ -n "$decisions_problem" ]; then\n    printf \'WARNING', '  if false; then\n    printf \'WARNING'),
  () => script("test-kit-facts.mjs"),
  "no WARNING with the nonce, before the guide, for a missing decisions.md",
);

breaks(
  "a settings check whose browser tool list drifts from the kit's grants is rejected",
  "skills/xez-onboard-opinionated/kit/checks/catalog-check.mjs",
  (s) => s.replace('"resize_page", "get_css_styles",\n]);', '"resize_page", "get_css_styles", "emulate",\n]);'),
  () => script("test-kit-facts.mjs"),
  "SETTINGS_BROWSER_TOOLS is",
);

// #69: the kit's own hook entry is still guarded, and the settings check keeps its teeth.
breaks(
  "a changed kit SessionStart hook entry still fails the quote check",
  "skills/xez-onboard-opinionated/kit/claude/settings.json",
  (s) => s.replace('"timeout": 15', '"timeout": 30'),
  () => script("test-kit-catalog.mjs"),
  "fenced quote differs from .claude/settings.json#entry:hooks.SessionStart",
);

breaks(
  "a widening Bash rule in committed .claude/settings.json that only warns is rejected",
  "skills/xez-onboard-opinionated/kit/checks/catalog-check.mjs",
  (s) => s.replace('const committed = name === "settings.json";', 'const committed = false;'),
  () => script("test-kit-catalog.mjs"),
  "catalog-check accepts a widening Bash rule in committed .claude/settings.json",
);

breaks(
  "a widening rule in the untracked settings.local.json that fails the repository check is rejected",
  "skills/xez-onboard-opinionated/kit/checks/catalog-check.mjs",
  (s) => s.replace('const committed = name === "settings.json";', 'const committed = true;'),
  () => script("test-kit-catalog.mjs"),
  "catalog-check fails the repository check on a widening rule in settings.local.json",
);

breaks(
  "a browser grant outside the kit's tool list is rejected",
  "skills/xez-onboard-opinionated/kit/checks/catalog-check.mjs",
  (s) => s.replace("if (!tool || !SETTINGS_BROWSER_TOOLS.has(tool)) {", "if (!tool) {"),
  () => script("test-kit-catalog.mjs"),
  "catalog-check accepts browser grant mcp__chrome-devtools__emulate",
);
// 3.1.0-stream-C:end

// 3.1.0-stream-D:start
// #52: the timeout rule, and the shipped timeouts it protects.
breaks(
  "a catalog check that no longer asks an agent step for a timeout is rejected",
  "skills/xez-onboard-opinionated/kit/checks/catalog-check.mjs",
  (s) => s.replace("      checkStepTimeout(at, step);\n", ""),
  () => script("test-kit-catalog.mjs"),
  "catalog-check accepts a handoff step with no timeout",
);

breaks(
  "a kit handoff step without a timeout is rejected",
  "skills/xez-onboard-opinionated/kit/workflows/bug-fix.yaml",
  (s) => s.replace("    skill: xezar-handoff-draft-pr\n    timeout: 15m\n", "    skill: xezar-handoff-draft-pr\n"),
  () => script("test-kit-catalog.mjs"),
  'step "handoff": an agent step has no timeout',
);

// D13: every review and QA step runs the change and holds every browser tool; nothing else gets
// the review-only tools; a review's verdict needs an unchanged tree.
breaks(
  "a catalog check that lets review-only browser tools into any workflow is rejected",
  "skills/xez-onboard-opinionated/kit/checks/catalog-check.mjs",
  (s) => s.replace("if (step.allowedTools.includes(tool)) err(at,", "if (false && step.allowedTools.includes(tool)) err(at,"),
  () => script("test-kit-catalog.mjs"),
  "catalog-check accepts evaluate_script in the design workflow",
);

breaks(
  "a catalog check that no longer asks a review step for review-run.sh is rejected",
  "skills/xez-onboard-opinionated/kit/checks/catalog-check.mjs",
  (s) => s.replace("if (!list.includes(REVIEW_RUN_PREFIX)) {", "if (false) {"),
  () => script("test-kit-catalog.mjs"),
  "catalog-check accepts a qa.yaml review step without review-run.sh",
);

breaks(
  "a review workflow without the full browser tool set is rejected",
  "skills/xez-onboard-opinionated/kit/workflows/code-review.yaml",
  (s) => s.replace(", mcp__chrome-devtools__lighthouse_audit", ""),
  () => script("test-kit-facts.mjs"),
  "FACT 23",
);

breaks(
  "a design-review preflight back on --allow-root is rejected",
  "skills/xez-onboard-opinionated/kit/workflows/design-review.yaml",
  (s) => s.replace('command: ".xezar/checks/worktree-preflight.sh"\n', 'command: ".xezar/checks/worktree-preflight.sh --allow-root"\n'),
  () => script("test-kit-catalog.mjs"),
  "runs worktree-preflight.sh with --allow-root",
);

breaks(
  "a verdict-write that no longer checks the reviewed tree is rejected",
  "skills/xez-onboard-opinionated/kit/checks/verdict-write.sh",
  (s) => s.replace('bash "$SCRIPT_DIR/review-run.sh" finish >&2 ||', 'true ||'),
  () => script("test-kit-catalog.mjs"),
  "no longer runs review-run.sh finish before a verdict packet",
);

breaks(
  "a gh-write.sh that takes a verdict's role from the request is rejected",
  "skills/xez-onboard-opinionated/kit/checks/gh-write.sh",
  (s) => s.replace('[ "$declared" = "$verdict_role" ] ||', "true ||"),
  () => script("test-kit-catalog.mjs"),
  "gh-write.sh lets a qa step claim a design-review verdict",
);

breaks(
  "a gh-write.sh that lifts a gate label without its approval label is rejected",
  "skills/xez-onboard-opinionated/kit/checks/gh-write.sh",
  (s) => s.replace('[ -z "$verdict_removed" ] || [ -n "$verdict_added" ] ||', "true ||"),
  () => script("test-kit-catalog.mjs"),
  "remove needs-qa without adding qa-approved",
);

breaks(
  "a review-run.sh that hands the operator's credentials to what it runs is rejected",
  "skills/xez-onboard-opinionated/kit/checks/review-run.sh",
  (s) => s.replace('    no_credentials\n    "$@"', '    "$@"'),
  () => script("test-kit-catalog.mjs"),
  "a child of review-run.sh run still sees the operator's git or gh credentials",
);

breaks(
  "a review-run.sh that trusts a rewritten head record is rejected",
  "skills/xez-onboard-opinionated/kit/checks/review-run.sh",
  (s) => s.replace(`if ! printf '%s\\n' "$known" | grep -Fqx -- "$recorded"; then`, "if false; then"),
  () => script("test-kit-catalog.mjs"),
  "whose head record was rewritten to match it",
);

breaks(
  "a review-run.sh checkout that stops probing whether its sandbox can write git is rejected",
  "skills/xez-onboard-opinionated/kit/checks/review-run.sh",
  (s) => s.replace('      if [ -z "$probe" ]; then\n        echo "review-run=confined"', '      if false; then\n        echo "review-run=confined"'),
  () => script("test-kit-catalog.mjs"),
  "does not exit 3 with review-run=confined",
);

breaks(
  "a browser descriptor that stops saying where the review tools are granted is rejected",
  "skills/xez-onboard-opinionated/kit/pipeline/browsers/chrome-devtools.md",
  (s) => s.replace("granted by their own tool lists only", "granted anywhere"),
  () => script("test-kit-catalog.mjs"),
  "no longer says the review and QA workflows hold every tool",
);
// 3.1.0-stream-D:end

// 3.1.0-stream-E:start
// #53 install freshness: the tree digest in deps.mjs and the fail-closed resume. Each property
// breaks on its own; the gate runs only the #53 block of test-deps-units.mjs to keep the suite short.
const depsOnly53 = () => run("env", ["XEZ_DEPS_TEST_ONLY=53", "node", "scripts/test-deps-units.mjs"]);
const DEPS_MJS = "skills/xez-onboard-opinionated/kit/checks/lib/deps.mjs";

breaks(
  "a fresh check that ignores the tree digest is rejected",
  DEPS_MJS,
  (s) => s.replace('if (digest.line === "unavailable" || stamp !== stampContent(root, u, fp, digest.line)) return 1;', 'if (digest.line === "unavailable") return 1;'),
  depsOnly53,
  "one package folder replaced inside node_modules",
);

breaks(
  "a build cache skipped while it holds a package, a .bin or a link is rejected",
  DEPS_MJS,
  (s) => s.replace('if (e.isSymbolicLink() || e.name === ".bin" || e.name === "package.json") return false;', "void e;"),
  depsOnly53,
  "a build cache that holds a package.json",
);

breaks(
  "a link into a skipped build cache that is accepted is rejected",
  DEPS_MJS,
  (s) => s.replace("if (hit) throw new Unavailable(", "if (false) throw new Unavailable("),
  depsOnly53,
  "a link into a build cache the digest leaves out",
);

breaks(
  "an unreadable folder skipped by the digest is rejected",
  DEPS_MJS,
  (s) => s.replace("try { names = readdirSync(dir); } catch (e) { throw new Unavailable(`${dir} cannot be read (${e.code})`); }", "try { names = readdirSync(dir); } catch { names = []; }"),
  depsOnly53,
  "a tree the digest cannot read is not fresh",
);

breaks(
  "a digest with no timeout is rejected",
  DEPS_MJS,
  (s) => s.replace("return raw !== undefined && /^\\d{1,9}$/.test(raw) ? Number(raw) : 60000;", "return 60000;"),
  depsOnly53,
  "a digest that times out is not fresh",
);

breaks(
  "a resume that reuses sealed evidence over stale dependencies is rejected",
  "skills/xez-onboard-opinionated/kit/checks/resume-complete.sh",
  (s) => s.replace('[ "$FORCE_GATES" -eq 0 ] && [ "$DEPS_FRESH" -eq 1 ]; then NEED_GATES=0; fi', '[ "$FORCE_GATES" -eq 0 ]; then NEED_GATES=0; fi'),
  depsOnly53,
  "eligible evidence with stale dependencies plans a gate re-run",
);
// 3.1.0-stream-E:end

// 3.1.0-stream-F:start
// #57: the changelog check and fold, broken one rule at a time; test-kit-catalog.mjs runs them
// on throwaway repositories whose base branch is `develop`.
breaks(
  "changelog --diff-base auto falls back to main instead of the configured base",
  "skills/xez-onboard-opinionated/kit/checks/changelog-check.sh",
  (s) => s.replace('branch_candidates="origin/$configured $configured"', 'branch_candidates="main"'),
  () => script("test-kit-catalog.mjs"),
  "a fragment-only branch is accepted against the configured base",
);

breaks(
  "changelog check no longer sees a Keep a Changelog Unreleased section",
  "skills/xez-onboard-opinionated/kit/checks/changelog-check.sh",
  (s) => s.replace("UNRELEASED_RE='^## \\[?Unreleased", "UNRELEASED_RE='^## \\[?Pending"),
  () => script("test-kit-catalog.mjs"),
  "a direct `## [Unreleased]` edit is refused",
);

breaks(
  "changelog verify step no longer checks the fragment lines",
  "skills/xez-onboard-opinionated/kit/checks/changelog-fragments.mjs",
  (s) => s.replace("if ((have.get(line) ?? 0) < files.length)", "if (false)"),
  () => script("test-kit-catalog.mjs"),
  "the verify step catches a lost fragment entry",
);

breaks(
  "changelog fold maps a house heading onto the wrong Keep a Changelog group",
  "skills/xez-onboard-opinionated/kit/checks/changelog-fragments.mjs",
  (s) => s.replace("'## ✨ Features': 'Added',", "'## ✨ Features': 'Changed',"),
  () => script("test-kit-catalog.mjs"),
  "the keep-a-changelog fold wrote an unexpected file",
);

breaks(
  "changelog format accepts an unknown changelog.format value",
  "skills/xez-onboard-opinionated/kit/checks/changelog-fragments.mjs",
  (s) => s.replace("if (!FORMATS.includes(value)) {", "if (false) {"),
  () => script("test-kit-catalog.mjs"),
  "an unknown changelog.format is refused",
);
// 3.1.0-stream-F:end

// 3.1.0-stream-G:start
// Project trust boundaries (#70). Each break is one rule of FACT G1 undone the way a well-meant
// edit would undo it; test-kit-facts.mjs drives the real scan and must name the lost rule.
const SCAN_LIB = "skills/xez-onboard-opinionated/kit/checks/lib/security-scan.mjs";
const GRAMMAR_LIB = "skills/xez-onboard-opinionated/kit/checks/lib/config-grammar.mjs";

breaks(
  "a project trust-boundary list read from the branch under review instead of the base tip is rejected",
  SCAN_LIB,
  (s) => s.replace("const ref = `refs/remotes/origin/${baseBranch}`;", 'const ref = "HEAD";'),
  () => script("test-kit-facts.mjs"),
  "a branch that drops its own path from security.trustBoundaries is no longer routed",
);

breaks(
  "an unresolvable base branch read as no project entries is rejected",
  SCAN_LIB,
  (s) => s.replace('return { status: "unreadable", detail: `${ref} does not resolve here', 'return { status: "absent", detail: `${ref} does not resolve here'),
  () => script("test-kit-facts.mjs"),
  "an unresolvable base branch ref did not route to review",
);

breaks(
  "a trust-boundary pattern grammar that lets braces and classes through is rejected",
  GRAMMAR_LIB,
  (s) => s.replace("const TRUST_PATTERN_REFUSED = /[!{}()[\\]^$|\\\\+]/;", "const TRUST_PATTERN_REFUSED = /[!]/;"),
  () => script("test-kit-facts.mjs"),
  "must be refused",
);

breaks(
  "a trust-boundary list with its caps lifted is rejected",
  GRAMMAR_LIB,
  (s) => s.replace("export const TRUST_BOUNDARY_LIMITS = { entries: 64, length: 256 };", "export const TRUST_BOUNDARY_LIMITS = { entries: 640, length: 2560 };"),
  () => script("test-kit-facts.mjs"),
  "with 65 entries was ok, expected malformed",
);

breaks(
  "a project trust-boundary entry with no why is rejected",
  GRAMMAR_LIB,
  (s) => s.replace('if (typeof why !== "string" || why.trim() === "" ||', 'if (typeof why === "number" ||'),
  () => script("test-kit-facts.mjs"),
  "with an entry with no why was",
);

breaks(
  "an invalid project list left out of the stage status is rejected",
  SCAN_LIB,
  (s) => s.replace('  else if (configUnknown) status = "unknown";\n', ""),
  () => script("test-kit-facts.mjs"),
  "did not make the stage status unknown",
);

breaks(
  "an invalid project list that does not require a reviewer is rejected",
  SCAN_LIB,
  (s) => s.replace("reviewerRequired: trustBoundaries.length > 0 || configUnknown,", "reviewerRequired: trustBoundaries.length > 0,"),
  () => script("test-kit-facts.mjs"),
  "did not make the stage status unknown with reviewerRequired",
);

breaks(
  "a project match that does not name its list is rejected",
  SCAN_LIB,
  (s) => s.replace('touched.push({ file, why: entry.why, list: "project" });', 'touched.push({ file, why: entry.why, list: "kit" });'),
  () => script("test-kit-facts.mjs"),
  "did not set reviewerRequired with its reason and list",
);

breaks(
  "the engine repository's own paths shipped in the kit's trust boundaries again is rejected",
  SCAN_LIB,
  (s) => s.replace("const TRUST_BOUNDARIES = [\n", 'const TRUST_BOUNDARIES = [\n  { pattern: /^packages\\/xezar\\/src\\/server\\//, why: "the HTTP surface" },\n'),
  () => script("test-kit-facts.mjs"),
  "still ships the engine repository's packages/xezar/src entries",
);

breaks(
  "a phase record that stops describing the project trust-boundary list is rejected",
  "skills/xez-onboard-opinionated/kit/docs/phase-record.md",
  (s) => s.replace(/^A project adds paths of its own in `security\.trustBoundaries`.*\n/m, ""),
  () => script("test-kit-facts.mjs"),
  "does not describe the project's security.trustBoundaries list",
);
// 3.1.0-stream-G:end

// 3.1.0-stream-H:start
// #54: every refusal rule of push-check.sh, broken one at a time. test-kit-facts.mjs FACT H1 runs
// the script against a stand-in gh and a local bare origin; test-kit-catalog.mjs pins the wiring.
{
  const PUSH_CHECK = "skills/xez-onboard-opinionated/kit/checks/push-check.sh";
  const facts = () => script("test-kit-facts.mjs");
  const pushBreak = (name, from, to, expect) => breaks(name, PUSH_CHECK, (s) => s.replace(from, to), facts, expect);

  pushBreak("push-check that ignores an ineligible seal is rejected",
    'if [ "$evidence_rc" -ne 0 ] || [ "$eligibility" != "ELIGIBLE" ]; then', "if false; then",
    "does not refuse an unsealed HEAD");
  pushBreak("push-check that pushes a HEAD other than the sealed commit is rejected",
    'if [ -z "$sealed_sha" ] || [ "$sealed_sha" != "$HEAD_SHA" ]; then', 'if [ -z "$sealed_sha" ]; then',
    "does not refuse a HEAD that changed after the seal");
  pushBreak("push-check that pushes to a closed PR is rejected",
    '[ "$pr_state" = "OPEN" ] || refuse', "true || refuse",
    "does not refuse a closed PR");
  pushBreak("push-check that pushes to a fork PR is rejected",
    "  refuse push.pr-same-repo \"PR #$PR's head is not in", "  : push.pr-same-repo \"PR #$PR's head is not in",
    "does not refuse a fork PR");
  pushBreak("push-check that pushes to a branch other than the PR head is rejected",
    '[ "$pr_head" = "$TARGET" ] || refuse', "true || refuse",
    "does not refuse a branch other than the PR head");
  pushBreak("push-check that lets main, master or release/* through is rejected",
    "HEAD | main | master | release/*) return 0 ;;", "HEAD) return 0 ;;",
    "does not refuse the protected branch master");
  pushBreak("push-check that lets the project's base branch through is rejected",
    '[ -n "${BASE_BRANCH:-}" ] && [ "$1" = "$BASE_BRANCH" ] && return 0', ":",
    "does not refuse the protected branch develop");
  pushBreak("push-check that lets the PR's own base branch through is rejected",
    'if [ -n "$pr_base" ] && [ "$TARGET" = "$pr_base" ]; then', "if false; then",
    "does not refuse the PR's own base branch");
  pushBreak("push-check that accepts a bare --force is rejected",
    "--force | -f | --force-with-lease | --force-if-includes", "--force-if-includes",
    "does not refuse the bare force push --force with [push.no-bare-force]");
  pushBreak("push-check that accepts a lease on a short ref is rejected",
    'if [ "$lease_ref" = "$LEASE" ] || [ "$lease_ref" != "refs/heads/$TARGET" ] ||', 'if [ "$lease_ref" = "$LEASE" ] ||',
    "does not refuse the bare force push --force-with-lease=feature/fix:");

  const catalog = () => script("test-kit-catalog.mjs");
  breaks("readiness that accepts a DELIVERED record again is rejected",
    "skills/xez-onboard-opinionated/kit/checks/worktree-preflight.sh",
    (s) => s.replace("That path is retired (#54): a repair", "Accepted: a repair"),
    catalog, "readiness no longer refuses a DELIVERED record");
  breaks("a repair handoff that pushes without push-check is rejected",
    "skills/xez-onboard-opinionated/kit/workflows/address-review-findings.yaml",
    (s) => s.replace("Push the sealed fix to the PR's own branch only through .xezar/checks/push-check.sh, then", "Push the fixes, then"),
    catalog, "the handoff step does not push through .xezar/checks/push-check.sh");
  breaks("a review-response skill that records DELIVERED again is rejected",
    "skills/xez-onboard-opinionated/kit/skills/xezar-review-response.md",
    (s) => s.replace("never write a `DELIVERED` record: readiness refuses it", "record the push as `DELIVERED`"),
    catalog, "still tells a repair to push early and record DELIVERED");
}
// 3.1.0-stream-H:end

// 3.1.0-stream-U:start
// U1 (#55): the manifest drift check and its place in the gate.
breaks(
  "a drift check that no longer compares digests is rejected",
  "skills/xez-onboard-opinionated/kit/checks/manifest-drift.mjs",
  (s) => s.replace("else if (seen.sha256 !== entry.sha256)", "else if (false)"),
  () => script("test-kit-catalog.mjs"),
  "manifest-drift: a silent edit exits 0, not 1",
);

breaks(
  "a drift check that accepts an unconfirmed register entry is rejected",
  "skills/xez-onboard-opinionated/kit/checks/manifest-drift.mjs",
  (s) => s.replace("} else if (!lp.confirmed) {", "} else if (false) {"),
  () => script("test-kit-catalog.mjs"),
  "manifest-drift: a patch with Confirmed: no exits 0, not 1",
);

breaks(
  "a drift check that ignores register entries with no manifest patch is rejected",
  "skills/xez-onboard-opinionated/kit/checks/manifest-drift.mjs",
  (s) => s.replace("if (!entry || entry.patch !== id)", "if (false)"),
  () => script("test-kit-catalog.mjs"),
  "manifest-drift: a register entry with no manifest patch exits 0, not 1",
);

// The verifier lets a register entry name an absent file only when it is a kit file the
// manifest can record as removed, never any absent path.
breaks(
  "a verifier that accepts a register entry naming any absent path is rejected",
  "upgrade/tools/verify.mjs",
  (s) => s.replace("ctx.readMine(f).text == null && !recordableRemoval(ctx, f)", "ctx.readMine(f).text == null && !ctx.readMine(f).missing"),
  () => script("test-upgrade.mjs"),
  "removed: a register entry naming a path the kit never shipped is accepted",
);

breaks(
  "a gate that no longer runs the drift check is rejected",
  "skills/xez-onboard-opinionated/kit/checks/repository-checks.sh",
  (s) => s.replace('node "$SCRIPT_DIR/manifest-drift.mjs" "$REPO_ROOT"\n', ""),
  () => script("test-kit-facts.mjs"),
  "no longer runs manifest-drift.mjs",
);

// scripts/test-upgrade.mjs (plan §7 break cases). U1's drift break cases above cover a silent
// one-byte edit; these cover the upgrade tool's own checks.
// A new installed path that no fragment's upgrade block lists. Aimed at the copy table rather
// than at one fragment, so it holds however many streams list the same file.
breaks(
  "a changed kit file no 3.1.0 upgrade block lists is rejected",
  "skills/xez-onboard-opinionated/references/write.md",
  (s) => s.replace(/^(\| `kit\/loops\.json` \| `\.xezar\/loops\.json` \|\n)/m, "$1| `kit/loops.json` | `.xezar/loops-copy.json` |\n"),
  () => script("test-upgrade.mjs"),
  ".xezar/loops-copy.json changed since",
);

// Truncating the index list at package.json's version makes that version the newest indexed
// one, so the release check compares it with the tree and must find it stale. Once the release
// PR indexes its own version last, this mutation changes nothing and must be re-aimed.
breaks(
  "a stale kit index for the package version is rejected",
  // Between releases the package version is not the newest entry, so the index is cut back
  // to it. On a release commit it already is, so one file is dropped from its own index.
  KIT_INDEX_PKG_IS_NEWEST ? `upgrade/kit-index/${KIT_INDEX_PKG}.json` : "upgrade/kit-index/index.json",
  (s) => {
    if (KIT_INDEX_PKG_IS_NEWEST) {
      const data = JSON.parse(s);
      const [first] = Object.keys(data.files);
      delete data.files[first];
      return `${JSON.stringify(data, null, 2)}\n`;
    }
    const list = JSON.parse(s);
    const at = list.versions.findIndex((v) => v.version === KIT_INDEX_PKG);
    return at < 0 ? s : `${JSON.stringify({ versions: list.versions.slice(0, at + 1) }, null, 2)}\n`;
  },
  () => script("test-upgrade.mjs"),
  "is stale: re-run scripts/build-kit-index.mjs",
);

breaks(
  "a customised upgrade fixture with a customisation removed is rejected",
  "scripts/fixtures/upgrade/customised/customisations.json",
  (s) => {
    const spec = JSON.parse(s);
    spec.customisations = spec.customisations.filter((c) => c.id !== "leader-rule");
    return `${JSON.stringify(spec, null, 2)}\n`;
  },
  () => script("test-upgrade.mjs"),
  "which customisations.json no longer makes",
);

breaks(
  "a manifest digest one byte off no longer gives a high-confidence base",
  "scripts/fixtures/upgrade/3.0.3/fixture.json",
  (s) => {
    const fx = JSON.parse(s);
    const p = ".xezar/docs/routing.md";
    const d = fx.manifest.files[p].sha256;
    fx.manifest.files[p].sha256 = `${d.slice(0, -1)}${d.endsWith("0") ? "1" : "0"}`;
    return `${JSON.stringify(fx, null, 2)}\n`;
  },
  () => script("test-upgrade.mjs"),
  "3.0.3: .xezar/docs/routing.md base confidence medium, expected high",
);

// U4: the upgrade prompt names a helper script that does not exist.
breaks(
  "an upgrade prompt that names a missing helper script is rejected",
  "upgrade/UPGRADE-PROMPT.md",
  (s) => s.replace("node <clone>/upgrade/tools/detect.mjs", "node <clone>/upgrade/tools/detect-files.mjs"),
  () => script("test-kit-facts.mjs"),
  "names upgrade/tools/detect-files.mjs, which does not exist",
);

// U4: an unreconciled command mark left in the upgrade prompt.
breaks(
  "an upgrade prompt with a verify-cli mark left in is rejected",
  "upgrade/UPGRADE-PROMPT.md",
  (s) => s.replace("## Step 2 – Detect\n", "## Step 2 – Detect\n\n<!-- verify-cli -->\n"),
  () => script("test-kit-facts.mjs"),
  "still carries a verify-cli mark",
);

// U-evals: an eval grader that passes every stop invariant would score a run that never stopped
// on a weakened safety check as a pass.
breaks(
  "an upgrade eval grader that accepts a run with no stop is rejected",
  "upgrade/evals/check.mjs",
  (s) => s.replace("return [Boolean(hit), `stop on", "return [true, `stop on"),
  () => script("test-kit-facts.mjs"),
  "accepts a run that did not stop on a weakened safety check",
);

// Run from the clone, repository-checks.sh without an argument checks the clone's skill folder.
breaks(
  "a verify that runs the repository check without the project root is rejected",
  "upgrade/tools/verify.mjs",
  (s) => s.replace('[join(kit, "repository-checks.sh"), ctx.project]', '[join(kit, "repository-checks.sh")]'),
  () => script("test-upgrade.mjs"),
  "verify: the repository check did not run in the project",
);

// The prompt eval findings (upgrade/evals/RESULTS.md F1–F7), one break per planner guard.
breaks(
  "an upgrade that offers the target's unreleased development commits as bases is rejected",
  "upgrade/tools/lib/context.mjs",
  (s) => s.replace("return before.slice(0, Math.max(lastRelease, installed) + 1);", "return before;"),
  () => script("test-upgrade.mjs"),
  "dev-line: a pre-release copy of a new file is",
);

breaks(
  "an upgrade that keeps a file on an inferred base equal to the target is rejected",
  "upgrade/tools/plan.mjs",
  (s) => s.replace('} else if (baseEqTheirs && f.base.confidence === "low") {', "} else if (false) {"),
  () => script("test-upgrade.mjs"),
  "low-base: a low-confidence base equal to the target gives",
);

breaks(
  "an upgrade line test that misses a dropped exit \"$rc\" is rejected",
  "upgrade/tools/lib/policy.mjs",
  (s) => s.replace('|\\bexit\\s+"?\\$(\\?|\\{?[A-Za-z_])', ""),
  () => script("test-upgrade.mjs"),
  "weaken-rc: a dropped exit",
);

breaks(
  "an upgrade that misses an added || true in a check is rejected",
  "upgrade/tools/plan.mjs",
  (s) => s.replace("const added = isCheckLike(p) && kept ? addedWeakeningLines(baseText, mine) : [];", "const added = [];"),
  () => script("test-upgrade.mjs"),
  "weaken-true: an added",
);

breaks(
  "an upgrade that does not flag a kept local change to a safety file is rejected",
  "upgrade/tools/plan.mjs",
  (s) => s.replace('if (item.safety && ["local-only", "unexplained-local-change"].includes(item.class)) review("safety-local-change");', ""),
  () => script("test-upgrade.mjs"),
  "weaken-rc: a kept local change to a safety file is not on the read-and-judge list",
);

breaks(
  "an upgrade that does not flag a both-changed safety file is rejected",
  "upgrade/tools/plan.mjs",
  (s) => s.replace('if (item.safety && item.class === "both-changed") review("safety-both-changed");', ""),
  () => script("test-upgrade.mjs"),
  "semantic: a both-changed safety file",
);

breaks(
  "an upgrade that does not stop on a routing field both sides changed is rejected",
  "upgrade/tools/plan.mjs",
  (s) => s.replace('if (c.both.length) stop("routing-clash");', ""),
  () => script("test-upgrade.mjs"),
  "routing-clash: both sides setting vendorExclusions",
);

breaks(
  "an upgrade that drafts a second register entry for a covered file is rejected",
  "upgrade/tools/plan.mjs",
  (s) => s.replace('.filter((i) => (i.class === "unexplained-local-change" || i.unexplained) && !i.register.length)', '.filter((i) => i.class === "unexplained-local-change" || i.unexplained)'),
  () => script("test-upgrade.mjs"),
  "draft-dup: a second register entry is drafted",
);

breaks(
  "an upgrade prompt that does not name a planner stop reason is rejected",
  "upgrade/UPGRADE-PROMPT.md",
  (s) => s.replace("(`routing-clash`; the plan", "(the plan"),
  () => script("test-kit-facts.mjs"),
  "does not name the planner's stop reason `routing-clash`",
);
// 3.1.0-stream-U:end

// 3.1.0-stream-R:start
// #89: three bans relax for the DeepSeek V4 Pro reviewer, and no further. Each way the relaxation
// could be widened – in the script, in the file, or in a ban's text – is a break of its own, and so
// is a V4 Pro lane in a screen row and softening a ban #89 keeps.
const V4 = "pi/deepseek-api/deepseek-v4-pro";
breaks(
  "a cheap lane marked fullShellReviews is rejected",
  ROUTING,
  routingEdit((f) => { f.lanes["pi/deepseek-api/deepseek-flash"].fullShellReviews = true; }),
  () => script("test-kit-catalog.mjs"),
  "a lane with tier: cheap never reviews with a full shell",
);

breaks(
  "the full-shell reviewer in a reading row that is not a review is rejected",
  ROUTING,
  routingEdit((f, row) => { row("business-analysis").lanes.push(V4); }),
  () => script("test-kit-catalog.mjs"),
  `"${V4}" does not enforce a step's tool limits, and this row only reads`,
);

breaks(
  "the full-shell reviewer in a security row that writes is rejected",
  ROUTING,
  routingEdit((f, row) => { row("release").lanes.push(V4); }),
  () => script("test-kit-catalog.mjs"),
  `"${V4}" does not enforce a step's tool limits, and this row is security and release`,
);

breaks(
  "route that lets a full-shell lane into every reading row is rejected",
  ROUTE_MJS,
  (s) => s.replace("!(lane.fullShellReviews === true && judgesOnly)", "!(lane.fullShellReviews === true)"),
  () => script("test-kit-catalog.mjs"),
  "route check accepts V4 Pro in a reading row that is not a review",
);

breaks(
  "route that lets a cheap lane review with a full shell is rejected",
  ROUTE_MJS,
  (s) => s.replace('const FULL_SHELL_FORBIDDEN = [["tier", "cheap"], ', "const FULL_SHELL_FORBIDDEN = ["),
  () => script("test-kit-catalog.mjs"),
  "route check accepts fullShellReviews on a cheap lane",
);

breaks(
  "V4 Pro, which has no vision, in a screen row is rejected",
  ROUTING,
  routingEdit((f, row) => { row("diagrams").lanes.splice(1, 0, V4); }),
  () => script("test-kit-catalog.mjs"),
  "screen row diagrams lists",
);

breaks(
  "pi-written work cleared by any lane is rejected",
  ROUTING,
  routingEdit((f) => { f.globalBans.find((b) => b.id === "pi-write-claude-review").rule = "What a pi lane wrote merges after a review on any other lane."; }),
  () => script("test-kit-facts.mjs"),
  "ban pi-write-claude-review is relaxed further",
);

breaks(
  "V4 Pro on risk-high work while Claude has budget is rejected",
  ROUTING,
  routingEdit((f) => { f.globalBans.find((b) => b.id === "high-risk-other-vendor").rule = "A risk-high change is reviewed by a different vendor from its author when a lane of one has budget, and never on the author's login. pi/deepseek-api/deepseek-v4-pro may always be that reviewer."; }),
  () => script("test-kit-facts.mjs"),
  "ban high-risk-other-vendor is relaxed further",
);

breaks(
  "the tool-limits exception widened to every reading row is rejected",
  ROUTING,
  routingEdit((f) => { f.globalBans.find((b) => b.id === "tool-limits").rule = "A lane with enforcesToolLimits: false is in no reading row (writes: false and not runsCode) and in no security-and-release row. One exception: a lane with fullShellReviews: true may be in any row."; }),
  () => script("test-kit-facts.mjs"),
  "ban tool-limits is relaxed further",
);

breaks(
  "no-self-review softened along with the three relaxed bans is rejected",
  ROUTING,
  routingEdit((f) => { f.globalBans.find((b) => b.id === "no-self-review").rule = "A review, re-check or QA prefers a different model from the one that wrote the work."; }),
  () => script("test-kit-facts.mjs"),
  "ban no-self-review is no longer word for word",
);

breaks(
  "a SECURITY.md accepted-risk entry that pre-accepts V4 Pro in a QA row it is not in is rejected",
  "SECURITY.md",
  (s) => s.replace("`verify-strong-claim`. It may also", "`verify-strong-claim`, `browser-qa`. It may also"),
  () => script("test-kit-facts.mjs"),
  "the accepted-risk entry lists the full-shell reviewer in reading rows",
);

breaks(
  "a SECURITY.md accepted-risk entry that says V4 Pro is absent from a row it is in is rejected",
  "SECURITY.md",
  (s) => s.replace("not in the `release`, `deploy` or", "not in the `security-review`, `release`, `deploy` or"),
  () => script("test-kit-facts.mjs"),
  "as one the full-shell reviewer is not in",
);
// 3.1.0-stream-R:end

// 3.1.0-stream-OC:start
// The owner's 3.1.0 confirmations. (1) A same-vendor reviewer on another model is allowed on every
// row, security and release included, unless vendorExclusions names the vendor. (2) A single npm
// root's stamp carries the #53 tree digest. (3) Onboarding never writes `version: "unknown"`.
breaks(
  "route that removes a same-vendor lane on a security row again is rejected",
  ROUTE_MJS,
  (s) => s.replace("if (file.lanes[cid].vendor === lane.vendor && excluded.has(lane.vendor))", "if (file.lanes[cid].vendor === lane.vendor && (isSecurityRow(rowById, row) || excluded.has(lane.vendor)))"),
  () => script("test-kit-catalog.mjs"),
  "a same-vendor lane on another model is allowed on a security row",
);

breaks(
  "the neverAuthor description that bans the author's vendor again is rejected",
  "skills/xez-onboard-opinionated/kit/routing.schema.json",
  (s) => s.replace("The lane, model and login that wrote or repaired the work are banned, on every row; its vendor is banned only where vendorExclusions names it. Checked at dispatch.", "The lane, login and vendor that wrote the work are banned; checked at dispatch."),
  () => script("test-kit-facts.mjs"),
  "neverAuthor does not say the author's model is banned",
);

breaks(
  "a single-root freshness check that ignores the tree digest is rejected",
  "skills/xez-onboard-opinionated/kit/checks/lib/common.sh",
  (s) => s.replace(`  [ "$(cat "$stamp" 2>/dev/null)" = "$(printf '%s\\ncontents=%s' "$fp" "$digest")" ] || return 1\n`, ""),
  depsOnly53,
  "single root stale: one package folder replaced inside node_modules",
);

breaks(
  "a single-root digest that counts its own stamp file is rejected",
  DEPS_MJS,
  (s) => s.replace("      if (!rel && name === skipTop) continue;\n", ""),
  depsOnly53,
  "single root digest: installed and stamped is fresh",
);

breaks(
  "onboarding that writes version unknown again is rejected",
  "skills/xez-onboard-opinionated/references/write.md",
  (s) => s.replace("for an install between releases – never `unknown`:", "for an install between releases, or `unknown` when the install names neither:"),
  () => script("test-kit-facts.mjs"),
  "still allows version",
);

breaks(
  "an onboarding version literal that differs from package.json is rejected",
  "skills/xez-onboard-opinionated/references/write.md",
  (s) => s.replace(/then `version` — the collection release the kit came from \(`[^`]+`/, "then `version` — the collection release the kit came from (`0.0.1`"),
  () => script("test-kit-facts.mjs"),
  "the manifest version literal an installer copy writes is \"0.0.1\"",
);
// 3.1.0-stream-OC:end

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
