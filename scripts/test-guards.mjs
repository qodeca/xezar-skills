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
// Method: mutate a tracked file, run the gate, restore the file in a `finally`. The restore is
// unconditional; a crashed assertion still puts the tree back, and the last assertion checks
// that nothing was left modified.
//
// Private copies (#123). The suite never writes the checkout. It makes one private copy of the
// tree per worker (scripts/lib/tree-copy.mjs: the same index, tracked files and untracked files
// that are not ignored) in a folder of its own under the temp folder – `guards-<pid>-XXXXXX/`,
// made by mkdtemp, one copy `guards-<pid>-<k>` in it per worker – and forks one worker per copy. A
// worker takes its copy's path from argv only, refuses to start unless it was forked with a path
// inside the temp folder and apart from the checkout, and checks every write against its copy.
// Your work in progress at the start is copied, so it is tested too; a change to the checkout's
// `git status` while the suite runs fails the run. Two runs can share a checkout, and a run can go
// beside the gate: no file is shared, and there is no lock. The copies are removed at the end, on
// Ctrl+C (each worker stopped with every gate it started), and – for a crashed run – at the next
// start, which also removes a leftover folder.
//
// Workers: `--workers N` (1–32), else XEZ_GUARD_WORKERS, else the smaller of 4 and the CPU count.
// Cases run in case order on every worker. A case whose gate runs a section its script declares
// exclusive (facts W-scheduler, catalog 10: real processes, pid reuse, pipes and a socket) runs
// in a last phase, alone, with every other worker idle. Failures are printed after the run, in
// case order, whichever worker ran them; then the timing tables, the exclusive cases with their
// reasons, and the wall time.
//
// Cases are data (#123). Each `breaks(...)` call below registers one case; the runner at the end
// of this file runs them, timed, and every run ends with two tables: seconds per gate and the ten
// slowest cases. `--list` is a dry run: no copies, no writes, no gate started (it only reads each
// sectioned test's `--sections`) – each gate is called with a recorder in place of `run`, and one
// line per case is printed:
// `<index> <gate argv> <env keys the gate sets> <file> <name> <exclusive>`, tab-separated, where
// <exclusive> names the exclusive sections the gate runs, or is `-`.
// A case aimed at test-kit-facts.mjs, test-kit-catalog.mjs, test-upgrade.mjs or
// test-deps-units.mjs names the sections that own its message – `facts("H1")`,
// `catalog("D-review")`, `upgrade("12b")`, `deps("53-tree")` – so it re-runs seconds of work
// instead of the whole script; a wrong id fails the case ("not for this reason"), never quietly.
// Such a case starts the script as `scripts/<name>` (the helpers do): any other form – a ./ prefix,
// an absolute path, a shell line – fails `--list` and the run, since its exclusive sections would go
// unseen.
// To find the id for a new case, read the ids in that script's header, or run the whole script
// with the defect in place and XEZ_SECTIONS_TRACE=<file>: each failure is appended to the file as
// one JSON line naming its section. The variable is a mapping aid only and never changes a result
// (scripts/lib/sections.mjs).
//
// Run: node scripts/test-guards.mjs [--workers N]
//      node scripts/test-guards.mjs --list

import { execFileSync, fork } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, realpathSync, rmSync } from "node:fs";
import { availableParallelism } from "node:os";
import { fileURLToPath } from "node:url";
import { basename, dirname, isAbsolute, join } from "node:path";
import { performance } from "node:perf_hooks";
import { bashPath, requireGitBash, toLF } from "./lib/platform.mjs";
import { killTree, prepareTestPlatform, tempRoot, TREE_SPAWN } from "./lib/test-harness.mjs";
import { parseOnly } from "./lib/sections.mjs";
import { runPool } from "./lib/gate-runner.mjs";
import { assertInside, copyTree, removeStaleCopies, removeTree, writeInside } from "./lib/tree-copy.mjs";

const THIS_FILE = fileURLToPath(import.meta.url);
const checkout = join(dirname(THIS_FILE), "..");
const COUNT_RANGE = "a whole number from 1 to 32";
const validCount = (value) => /^\d+$/.test(value) && Number(value) >= 1 && Number(value) <= 32;
const usage = (message) => {
  console.error(`test-guards: ${message}`);
  process.exit(2);
};

const ARGS = process.argv.slice(2);
let LIST = false;
let workersFlag = null;
let workerRoot = null; // set in a worker only: the private copy it runs cases in
if (ARGS.length === 1 && ARGS[0] === "--list") LIST = true;
else if (ARGS.length === 2 && ARGS[0] === "--workers") {
  if (!validCount(ARGS[1])) usage(`--workers takes ${COUNT_RANGE}`);
  workersFlag = Number(ARGS[1]);
} else if (ARGS.length === 2 && ARGS[0] === "--worker") workerRoot = ARGS[1];
else if (ARGS.length) usage(`unknown arguments '${ARGS.join(" ")}'; the options are --list and --workers <n>`);

const isInside = (base, path) => {
  try {
    assertInside(base, path);
    return true;
  } catch {
    return false;
  }
};

/** A worker's copy, checked before anything reads it: forked, absolute, in the temp folder, apart from the checkout. */
function checkedWorkerRoot(given) {
  if (typeof process.send !== "function") usage("--worker is for the suite's own workers, which it forks; run node scripts/test-guards.mjs");
  if (!isAbsolute(given) || !existsSync(given)) usage(`--worker needs the absolute path of an existing copy, not '${given}'`);
  const real = (path) => realpathSync.native(path);
  if (!isInside(tempRoot(), given) || real(given) === real(checkout) || isInside(checkout, given) || isInside(given, checkout)) {
    usage(`--worker ${given} must be a folder inside ${tempRoot()} and apart from the checkout`);
  }
  return given;
}

const root = workerRoot === null ? checkout : checkedWorkerRoot(workerRoot);
if (workerRoot !== null) prepareTestPlatform();
else requireGitBash(); // the parent starts no gate, but its workers and --list's recorder need Git Bash

let recorder = null; // --list and the exclusive lookup: called instead of starting a command
let gateCommands = null; // the commands the current case's gate started, for the timing table

function run(command, args, options = {}) {
  const argv = [basename(command).replace(/\.exe$/i, ""), ...args].join(" ");
  if (recorder) return recorder({ argv, args, options });
  gateCommands?.push(argv);
  try {
    return {
      code: 0,
      out: execFileSync(command, args, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], ...options }),
    };
  } catch (err) {
    return { code: err.status ?? -1, out: (err.stdout ?? "") + (err.stderr ?? "") };
  }
}

const lint = () => run(bashPath(), ["scripts/lint.sh"]);
const script = (name, ...args) => run("node", [`scripts/${name}`, ...args]);
// The four sectioned scripts, run for the named sections only; no ids runs the whole script.
const SECTIONED = ["test-kit-facts.mjs", "test-kit-catalog.mjs", "test-upgrade.mjs", "test-deps-units.mjs"];
const only = (ids) => ids.flatMap((id) => ["--only", id]);
const facts = (...ids) => () => script("test-kit-facts.mjs", ...only(ids));
const catalog = (...ids) => () => script("test-kit-catalog.mjs", ...only(ids));
const upgrade = (...ids) => () => script("test-upgrade.mjs", ...only(ids));
const deps = (...ids) => () => script("test-deps-units.mjs", ...only(ids));

const KIT_INDEX_PKG = JSON.parse(readFileSync(join(root, "package.json"), "utf8")).version;
const KIT_INDEX_PKG_IS_NEWEST =
  JSON.parse(readFileSync(join(root, "upgrade/kit-index/index.json"), "utf8")).versions.at(-1)?.version === KIT_INDEX_PKG;

/**
 * Break one file, run one gate, expect one message. Registers the case; the runner at the end
 * of this file runs it.
 * `expect` is the distinctive fragment of the error the guard is supposed to print --
 * not just "it failed", because a guard failing for an unrelated reason would otherwise
 * count as a pass.
 */
const CASES = [];
function breaks(name, file, mutate, gate, expect) {
  CASES.push({ name, file, mutate, gate, expect });
}

/** Runs one case in this worker's copy. Returns null when the guard caught its defect, else why not. */
function runCase({ file, mutate, gate, expect }) {
  const path = join(root, file);
  const original = readFileSync(path, "utf8"); // the restore stays byte-exact
  // #122: every search string below is written with LF line endings, so a CRLF checkout is
  // mutated as LF and written back with CRLF. A file mixing both cannot be written back without
  // changing more than the mutation, so it is refused rather than broken for the wrong reason.
  const crlf = original.includes("\r\n");
  if (crlf && /(^|[^\r])\n/.test(original)) {
    return `${file} mixes CRLF and LF line endings; check it out with LF (.gitattributes) and run again`;
  }
  const lf = toLF(original);
  let result;
  try {
    const broken = mutate(lf);
    if (broken === lf) return "the mutation changed nothing -- this test is testing nothing";
    writeInside(root, path, crlf ? broken.replace(/\n/g, "\r\n") : broken); // refuses a path outside the copy
    result = gate();
  } finally {
    writeInside(root, path, original);
  }
  if (result.code === 0) return "the gate PASSED with the defect in place";
  if (!result.out.includes(expect)) {
    return "the gate failed, but not for this reason.\n" +
      `      expected to see: ${expect}\n      got: ${result.out.trim().split("\n").slice(0, 4).join("\n           ")}`;
  }
  return null;
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
  facts("2"),
  "NOTE_TAIL_BYTES is 8000",
);

breaks(
  "a smoke test that sends agentProfile with inline steps is rejected",
  "skills/xez-onboard-opinionated/references/smoke-test.md",
  (s) => s.replace("Give each step only `runner` and `model`:", "Give each step `runner`, `model` and `agentProfile: \"<login>\"`:"),
  facts("11"),
  "sends agentProfile, worktree or autonomous with inline steps",
);

breaks(
  "an ignore file that lets the engine's lock and backup files into git is rejected",
  "skills/xez-onboard-opinionated/kit/xezar.gitignore",
  (s) => s.replace("/workspace.json.*\n", ""),
  facts("18"),
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
  facts("7"),
  "does not tell the leader session it is the leader",
);

breaks(
  "calling a committed campaign file runtime is rejected",
  "skills/xez-onboard-opinionated/kit/docs/leader-context-loading.md",
  (s) => `${s}\n| \`.xezar/campaigns/x/README.md\` | live state | no — runtime |\n`,
  facts("1"),
  "no - runtime",
);

breaks(
  "a loop ceiling tuned in one place only is rejected",
  "skills/xez-onboard-opinionated/kit/loops.json",
  (s) => s.replace('"totalTasks": 10', '"totalTasks": 20'),
  facts("4"),
  "ceiling",
);

breaks(
  "a second loop allowed to dispatch is rejected",
  "skills/xez-onboard-opinionated/kit/loops.json",
  (s) => s.replace('"id": "L1",\n      "role": "unblock",\n      "mechanism": "cron",\n      "schedule": "*/10 * * * *",\n      "mayDispatch": false', '"id": "L1",\n      "role": "unblock",\n      "mechanism": "cron",\n      "schedule": "*/10 * * * *",\n      "mayDispatch": true'),
  facts("4"),
  "only L3 may",
);

breaks(
  "dropping a subfolder from the list the tidiness check enforces is rejected",
  "skills/xez-onboard-opinionated/kit/checks/local-tree.sh",
  (s) => s.replace('ALLOWED="runtime tasks worktrees scratch cache qa"', 'ALLOWED="runtime tasks worktrees scratch cache"'),
  facts("3"),
  "ALLOWED is",
);

breaks(
  "a tidiness check that stops reading the engine's published names is rejected",
  "skills/xez-onboard-opinionated/kit/checks/local-tree.sh",
  (s) => s.replace("  if command -v xezar >/dev/null 2>&1 && command -v node", "  if false && command -v node"),
  catalog("8"),
  "refused a name the installed engine publishes",
);

breaks(
  "a tidiness check that forgets one of the engine's 0.19.0 names is rejected",
  "skills/xez-onboard-opinionated/kit/checks/local-tree.sh",
  (s) => s.replace(" pi-leader.json ", " "),
  catalog("8"),
  'does not know the engine\'s file "pi-leader.json"',
);

breaks(
  "a documented-output fixture that runs the leader loader outside a leader session is rejected",
  "skills/xez-onboard-opinionated/kit/checks/documented-output.mjs",
  (s) => s.replace("const env = { ...process.env, XEZAR_LEADER: '1' };", "const env = { ...process.env };"),
  catalog("9"),
  "documented-output check fails on the kit",
);

breaks(
  "injecting a campaign file the contract says is read on demand is rejected",
  "skills/xez-onboard-opinionated/kit/checks/leader-context.sh",
  (s) => s.replace('note_tail "${campaign}parked.md"', 'note_tail "${campaign}merges.md"'),
  facts("5"),
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
  facts("14"),
  "dogfood",
);

breaks(
  "a kit role that reads the removed known-flake record field is rejected",
  "skills/xez-onboard-opinionated/kit/skills/xezar-integration.md",
  (s) => `${s}\nWhen failedJobsAreKnownLoadFlakes is true, rerun the failed jobs once.\n`,
  facts("14"),
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
  facts("14"),
  "as a known flake",
);

breaks(
  "a kit document that names the removed known-load-flake register is rejected",
  "skills/xez-onboard-opinionated/kit/workflows/integration.yaml",
  (s) => `${s}\n# The two known load flakes are excused by name.\n`,
  facts("14"),
  "known load flake",
);

// FACT 15's three properties. Each breaks QUIETLY -- the gates still run and nothing goes red --
// which is exactly the kind of regression a mutation case exists to catch.
breaks(
  "a gate lease re-exec without its re-entry guard is rejected",
  "skills/xez-onboard-opinionated/kit/checks/repo-gates.sh",
  (s) => s.replace('if [ -z "${XEZ_GATE_LEASE:-}" ]; then', 'if true; then'),
  facts("15"),
  "XEZ_GATE_LEASE",
);

breaks(
  "resolving the gate lease engine through npx is rejected",
  "skills/xez-onboard-opinionated/kit/checks/repo-gates.sh",
  (s) => s.replace('elif command -v xez >/dev/null 2>&1; then', 'elif command -v npx >/dev/null 2>&1; then'),
  facts("15"),
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
  facts("15"),
  "nothing to run",
);

breaks(
  "dropping the engine's published lease probe is rejected",
  "skills/xez-onboard-opinionated/kit/checks/repo-gates.sh",
  (s) => s.replace('"$lease_bin" lease gates --probe', '"$lease_bin" lease gates --status-file "$lease_probe.status"'),
  facts("15"),
  "the probe no longer carries BOTH",
);

breaks(
  "a lease probe that takes exit 0 as proof, without reading the answer, is rejected",
  "skills/xez-onboard-opinionated/kit/checks/repo-gates.sh",
  (s) => s.replace("answer.lease.gates === true", "true"),
  facts("15"),
  "the published probe's answer is no longer read",
);

breaks(
  "a launcher that stops marking its session as the leader is rejected",
  "skills/xez-onboard-opinionated/kit/scripts/xezar-leader.sh",
  (s) => s.replace("export XEZAR_LEADER=1", "export XEZAR_LEADER=0"),
  facts("7"),
  "does not export XEZAR_LEADER=1",
);

breaks(
  "a kit issue template that points at another project's repository is rejected",
  "skills/xez-onboard-opinionated/kit/github/ISSUE_TEMPLATE/config.yml",
  (s) => s.replace("github.com/{{REPO_SLUG}}/", "github.com/qodeca/xezar/"),
  facts("8"),
  "must point at the consumer's repository",
);

breaks(
  "a private tracker descriptor that drifts from the canonical one is rejected",
  "skills/xez-onboard-opinionated/references/trackers/github.md",
  (s) => s.replace("#### create-label", "#### make-label"),
  facts("9"),
  "copy the canonical file over it",
);

breaks(
  "a taxonomy that drops a label the kit's design gate reads is rejected",
  "skills/xez-onboard-opinionated/references/labels.json",
  (s) => s.replace('"skip-design"', '"skip-the-design"'),
  facts("10"),
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
  facts("11"),
  "run by hand exits 1",
);

breaks(
  "moving a standalone gate attempt into an evidence root is rejected",
  "skills/xez-onboard-opinionated/kit/checks/lib/common.sh",
  (s) => s.replace(".local/xezar/scratch/standalone-gates", ".local/xezar/tasks/standalone-gates"),
  facts("11"),
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
  facts("13"),
  "no run can comply",
);

breaks(
  "rewording the guide heading xez-add-rule writes into is rejected",
  "skills/xez-onboard-opinionated/kit/leader-guide.template.md",
  (s) => s.replace("\n## Owner's rules\n", "\n## Owner rules\n"),
  facts("6"),
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
  facts("12"),
  "does not disclose the switch before the one approval",
);

breaks(
  "a kit descriptor edited without its digest pin moving is rejected",
  "skills/xez-onboard-opinionated/references/descriptor-digests.json",
  (s) => s.replace(/("kit\/pipeline\/security\/osv-scanner\.md": ")[0-9a-f]{4}/, "$1ffff"),
  facts("9"),
  "review the change, then update the pin",
);

breaks(
  "a kit descriptor with no digest pin at all is rejected",
  "skills/xez-onboard-opinionated/references/descriptor-digests.json",
  (s) => s.replace(/\n\s*"kit\/pipeline\/toolchains\/cargo\.md": "[0-9a-f]{64}",/, ""),
  facts("9"),
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
  facts("12"),
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
  catalog("1"),
  "xezar-quality-assurance",
);

// A reading step is read-only because of its shell (FACT 16, catalog-check's reader rule). Each way
// a pull request could quietly give one back its writing shell is a break of its own.
const CR = "skills/xez-onboard-opinionated/kit/workflows/code-review.yaml";
breaks(
  "a reading step with no bashAllowlist is rejected",
  CR,
  (s) => s.replace(/^\s+bashAllowlist: \[.*\]\n/m, ""),
  catalog("D-refusals"),
  "has no bashAllowlist",
);

breaks(
  "a reading step allowed `git push` is rejected",
  CR,
  (s) => s.replace('bashAllowlist: ["gh pr view",', 'bashAllowlist: ["git push", "gh pr view",'),
  catalog("1"),
  '"git push" is not a reading prefix',
);

breaks(
  "a reading step allowed plain `git diff`, which can write with --output, is rejected",
  CR,
  (s) => s.replace('bashAllowlist: ["gh pr view",', 'bashAllowlist: ["git diff", "gh pr view",'),
  catalog("1"),
  '"git diff" is not a reading prefix',
);

breaks(
  "a reading step allowed `gh api`, which can POST, is rejected",
  CR,
  (s) => s.replace('bashAllowlist: ["gh pr view",', 'bashAllowlist: ["gh api", "gh pr view",'),
  catalog("1"),
  '"gh api" is not a reading prefix',
);

breaks(
  "a verdict workflow that stops declaring its verdictRole is rejected",
  CR,
  (s) => s.replace("    verdictRole: code-review\n", ""),
  catalog("1"),
  "no agent step declares verdictRole: code-review",
);

breaks(
  "a reading workflow given the Write tool is rejected",
  CR,
  (s) => s.replace("allowedTools: [Read, Grep, Glob, Bash,", "allowedTools: [Read, Grep, Glob, Bash, Write,"),
  catalog("1"),
  '"code-review" is a review workflow',
);

breaks(
  "git-read.sh that stops refusing --output is rejected",
  "skills/xez-onboard-opinionated/kit/checks/git-read.sh",
  (s) => s.replace('BLOCKED_LONG="output ', 'BLOCKED_LONG="'),
  facts("16"),
  "refuses --output",
);

breaks(
  "a reading step allowed raw `gh pr comment`, which takes -R and -F <any file>, is rejected",
  CR,
  (s) => s.replace('bashAllowlist: ["gh pr view",', 'bashAllowlist: ["gh pr comment", "gh pr view",'),
  catalog("1"),
  '"gh pr comment" is not a reading prefix',
);

breaks(
  "a reading step allowed security-scan.sh, whose --out writes anywhere, is rejected",
  CR,
  (s) => s.replace('bashAllowlist: ["gh pr view",', 'bashAllowlist: ["bash .xezar/checks/security-scan.sh", "gh pr view",'),
  catalog("1"),
  '"bash .xezar/checks/security-scan.sh" is not a reading prefix',
);

breaks(
  "a reading step allowed a compound entry is rejected",
  CR,
  (s) => s.replace('bashAllowlist: ["gh pr view",', 'bashAllowlist: ["gh pr view; rm -rf .", "gh pr view",'),
  catalog("1"),
  '"gh pr view; rm -rf ." is not a reading prefix',
);

breaks(
  "a reading workflow given a writing tool with another name is rejected",
  CR,
  (s) => s.replace("allowedTools: [Read, Grep, Glob, Bash,", "allowedTools: [Read, Grep, Glob, Bash, NotebookEdit,"),
  catalog("1"),
  '"code-review" is a review workflow',
);

breaks(
  "gh-write.sh that lets a reviewer add qa-approved is rejected",
  "skills/xez-onboard-opinionated/kit/checks/gh-write.sh",
  (s) => s.replace('NEVER_ADD="qa-approved ', 'NEVER_ADD="'),
  facts("16"),
  "no longer refuses an approval label",
);

breaks(
  "a role doc that pipes into a write script with arguments is rejected",
  "skills/xez-onboard-opinionated/kit/skills/xezar-code-review.md",
  (s) => s.replace("| bash .local/xezar/cache/kit/checks/verdict-write.sh`: one JSON request", "| bash .local/xezar/cache/kit/checks/verdict-write.sh packet`: one JSON request"),
  catalog("1b"),
  "the engine's lock refuses a pipe into a script with arguments",
);

breaks(
  "gh-write.sh that drops a JSON comment's body is rejected",
  "skills/xez-onboard-opinionated/kit/checks/gh-write.sh",
  (s) => s.replace('body="$json_body"', 'body="(empty)"'),
  catalog("1b"),
  "gh-write.sh does not post a JSON comment request",
);

breaks(
  "verdict-write.sh that files a JSON packet as BLOCKED is rejected",
  "skills/xez-onboard-opinionated/kit/checks/verdict-write.sh",
  (s) => s.replace('exec bash "$SCRIPT_DIR/verdict-write.sh" packet', 'exec bash "$SCRIPT_DIR/verdict-write.sh" blocked'),
  catalog("1b"),
  "verdict-write.sh does not write a JSON packet request",
);

breaks(
  "a Codex rule that allows a command is rejected",
  "skills/xez-onboard-opinionated/kit/checks/catalog-check.mjs",
  (s) => s.replace('if (decision !== "prompt" && decision !== "forbidden") {', 'if (decision !== "prompt" && decision !== "forbidden" && decision !== "allow" && decision !== undefined) {'),
  catalog("1"),
  "catalog-check accepts a Codex prefix_rule",
);

breaks(
  "kit Claude settings that allow a broad Bash rule are rejected",
  "skills/xez-onboard-opinionated/kit/claude/settings.json",
  (s) => s.replace('{\n  "hooks"', '{\n  "permissions": { "allow": ["Bash(npm test:*)"] },\n  "hooks"'),
  catalog("C"),
  "widens every reading step's shell",
);

breaks(
  "dropping .claude/settings.json from the trust boundaries is rejected",
  "skills/xez-onboard-opinionated/kit/checks/lib/security-scan.mjs",
  (s) => s.replace(/^  \{ pattern: \/\^\\\.claude.*\n/m, ""),
  facts("16"),
  "TRUST_BOUNDARIES no longer names .claude/settings.json",
);

breaks(
  "dropping .codex/ from the trust boundaries is rejected",
  "skills/xez-onboard-opinionated/kit/checks/lib/security-scan.mjs",
  (s) => s.replace(/^  \{ pattern: \/\^\\\.codex.*\n/m, ""),
  facts("16"),
  "TRUST_BOUNDARIES no longer names .codex/",
);

breaks(
  "dropping .xezar/workflows and .xezar/checks from the trust boundaries is rejected",
  "skills/xez-onboard-opinionated/kit/checks/lib/security-scan.mjs",
  (s) => s.replace(/^  \{ pattern: \/\^\\\.xezar\\\/\(workflows\|checks\)\\\/\/.*\n/m, ""),
  facts("16"),
  "TRUST_BOUNDARIES no longer names",
);

breaks(
  "a kit workflow that no routing row names is rejected",
  ROUTING,
  routingEdit((f, row) => { row("root-sync").workflows = ["issue-triage.yaml"]; }),
  catalog("3"),
  "installed, valid, and unreachable",
);

// The routing file is read by a script that applies every ban a file can decide (FACT 17). Each
// way a pull request could reroute work past a ban is a break of its own.
breaks(
  "a cheap lane in the security review is rejected",
  ROUTING,
  routingEdit((f, row) => { row("security-review").lanes.push("codex/gpt-6-luna"); }),
  catalog("3b"),
  '"codex/gpt-6-luna" is a cheap lane',
);

breaks(
  "a row that narrows a security row, with a cheap lane, is rejected",
  ROUTING,
  routingEdit((f, row) => { row("docs-writing").narrows = "security-review"; row("docs-writing").neverAuthor = true; }),
  catalog("3b"),
  '"pi/deepseek-api/deepseek-flash" is a cheap lane',
);

breaks(
  "a reserved lane in an ordinary row is rejected",
  ROUTING,
  routingEdit((f, row) => { row("docs-writing").lanes.unshift("codex/gpt-6-astra"); }),
  catalog("R"),
  "is reserved and this row is not one of its rows",
);

breaks(
  "a login that is an email address is rejected",
  ROUTING,
  routingEdit((f) => { f.tools.claude.rotation = ["owner@example.com"]; }),
  catalog("3b"),
  "is not an engine account ID",
);

breaks(
  "a login that is this machine's own user name is rejected",
  ROUTING,
  routingEdit((f) => { f.tools.codex.rotation = [(process.env.USER || "runner").toLowerCase().replace(/\s+/g, "-")]; }),
  catalog("3b"),
  "is this machine's own user name",
);

breaks(
  "a row naming a lane that does not exist is rejected",
  ROUTING,
  routingEdit((f, row) => { row("refactor").lanes.push("claude/opus-9"); }),
  catalog("3b"),
  '"claude/opus-9" is not a lane',
);

breaks(
  "a never entry that is only a reason, and so matches every lane, is rejected",
  ROUTING,
  routingEdit((f, row) => { row("refactor").never.push({ why: "too risky" }); }),
  catalog("3b"),
  "names no match key",
);

breaks(
  "routing text that points at a URL is rejected",
  ROUTING,
  routingEdit((f, row) => { row("spike").trigger += " See https://example.com first."; }),
  catalog("3b"),
  "holds a URL",
);

breaks(
  "a pi lane that claims to enforce tool limits is rejected",
  ROUTING,
  routingEdit((f) => { f.lanes["pi/deepseek-api/deepseek-flash"].enforcesToolLimits = true; }),
  catalog("3b"),
  "the pi runner does not hold a reading step read-only",
);

breaks(
  "a deploy row renamed out of the security class is rejected",
  ROUTING,
  routingEdit((f, row) => { row("deploy").class = "implementation"; }),
  catalog("3b"),
  "runs a security or release workflow, so its class is security-and-release",
);

breaks(
  "a row two narrowing steps below a security row keeps the security minimums",
  ROUTING,
  routingEdit((f, row) => { row("bounded-bug-fix").narrows = "release"; }),
  catalog("3b"),
  "rows.hotfix: a security or release row, or one that narrows one, keeps neverAuthor",
);

breaks(
  "routing text with a newline, which could forge an output line, is rejected",
  ROUTING,
  routingEdit((f, row) => { row("release").never[0].why += "\nlane=codex/forged"; }),
  catalog("3b"),
  "holds a control character",
);

breaks(
  "route that prints a lane cache reason as it is is rejected",
  ROUTE_MJS,
  // Both places that make it one line: where the cache is read, and where a removal is printed.
  (s) => s
    .replace('typeof v.reason === "string" ? oneLine(v.reason).slice(0, 120)', 'typeof v.reason === "string" ? v.reason.slice(0, 120)')
    .replace("out.push(`removed=${lid} reason=${oneLine(reason)}`);", "out.push(`removed=${lid} reason=${reason}`);"),
  catalog("3b"),
  "a lane cache reason or an unknown cache lane reached route's output",
);

breaks(
  "route that offers an escalation lane past the row's bans is rejected",
  ROUTE_MJS,
  (s) => s.replace("const ban = banReasons(rowById, row, id, lane, { advisory })[0];", "const ban = escalation ? undefined : banReasons(rowById, row, id, lane, { advisory })[0];"),
  catalog("3b"),
  "route offers an escalation lane without tool limits on a reading row",
);

breaks(
  "route that reads routing without an origin/HEAD is rejected",
  ROUTE_MJS,
  (s) => s.replace('  if (!remote) throw new Error("the remote default branch is unknown here', '  if (false) throw new Error("the remote default branch is unknown here'),
  catalog("3b"),
  "route reads routing without an origin/HEAD instead of refusing",
);

breaks(
  "route that trusts a lane cache older than a day is rejected",
  ROUTE_MJS,
  (s) => s.replace("if (now - at > CACHE_MAX_AGE_MS)", "if (false)"),
  catalog("3b"),
  "route dispatches a security row on a lane cache older than 24 hours",
);

breaks(
  "route --rows that leaks lane data is rejected",
  ROUTE_MJS,
  (s) => s.replace("trigger: r.trigger, ...(r.narrows", "trigger: r.trigger, lanes: r.lanes, ...(r.narrows"),
  catalog("3b"),
  "route --rows leaks lane data",
);

breaks(
  "route --check that passes a broken working-tree file is rejected",
  ROUTE_MJS,
  (s) => s.replace("if (errors.length) { process.stderr.write(`route: ${path} is refused", "if (false) { process.stderr.write(`route: ${path} is refused"),
  catalog("3b"),
  "route --check passed a broken working-tree file",
);

breaks(
  "route that refuses the leader's login in every tool's rotation is rejected",
  ROUTE_MJS,
  (s) => s.replace("const own = has(tools, file.leader.tool) ? tools[file.leader.tool] : null;\n    if (Array.isArray(own?.rotation) && own.rotation.includes(file.leader.login))",
    "for (const own of Object.values(tools)) if (Array.isArray(own?.rotation) && own.rotation.includes(file.leader.login))"),
  catalog("3b"),
  "route check refuses codex rotation [\"default\"] with a claude leader",
);

breaks(
  "a kit script that does nothing when reached through a link is rejected",
  ROUTE_MJS,
  (s) => s.replace("if (isMain) main(process.argv.slice(2));", "if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) main(process.argv.slice(2));\nimport { pathToFileURL } from \"node:url\";"),
  catalog("3c"),
  "kit/checks/route.mjs run through a link did not run",
);

breaks(
  "dropping routing.json from the trust boundaries is rejected",
  "skills/xez-onboard-opinionated/kit/checks/lib/security-scan.mjs",
  (s) => s.replace(/^  \{ pattern: \/\^\\\.xezar\\\/routing.*\n/m, ""),
  facts("17"),
  "TRUST_BOUNDARIES no longer names .xezar/routing.json",
);

breaks(
  "a routing.json edited without storing its defaults version is rejected",
  ROUTING,
  routingEdit((f, row) => { row("hotfix").lanes.reverse(); }),
  catalog("3b"),
  "raises defaults.version and stores the new copy",
);

breaks(
  "a kit skill left off the maintained list is rejected",
  "skills/xez-onboard-opinionated/kit/checks/catalog-check.mjs",
  (s) => s.replace('  "xezar-qa",\n', ""),
  catalog("2"),
  "is not in MAINTAINED_SKILLS",
);

breaks(
  "a row count in prose that is not the table's count is rejected",
  "skills/xez-onboard-opinionated/references/routing-interview.md",
  (s) => s.replace(/\b([A-Za-z-]+) rows over\b/, "Ninety-nine rows over"),
  catalog("4"),
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
  catalog("5"),
  'expected "malformed"',
);

// The order of a guard step, and the two guard scripts run for real in a throwaway repository.
// Each break is the edit somebody would actually make: a step tidied away, a source "also"
// accepted, a fallback added so a fresh clone stops refusing.
breaks(
  "a deploy workflow with no permit check between its two agents is rejected",
  "skills/xez-onboard-opinionated/kit/workflows/deploy.yaml",
  (s) => s.slice(0, s.indexOf("  - id: permit")) + s.slice(s.indexOf("  - id: dispatch")),
  catalog("6"),
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
  catalog("6"),
  "must refuse before the install is paid for",
);

breaks(
  "a deploy guard that takes authority from an answer is rejected",
  "skills/xez-onboard-opinionated/kit/checks/deploy-guard.sh",
  (s) => s.replace('if (a.source !== "launch")', 'if (a.source !== "launch" && a.source !== "ask")'),
  catalog("7"),
  "authority from an answer, not the launch text",
);

breaks(
  "a deploy guard that permits the same authority twice is rejected",
  "skills/xez-onboard-opinionated/kit/checks/deploy-guard.sh",
  (s) => s.replace('[ ! -e "$PERMIT" ] || refuse', '[ ! -e "$PERMIT" ] || rm -f "$PERMIT" || refuse'),
  catalog("7"),
  "the same authority, a second time",
);

breaks(
  "a deploy guard that no longer reads one-way migrations under a rollback is rejected",
  "skills/xez-onboard-opinionated/kit/checks/deploy-guard.sh",
  (s) => s.replace('if [ "$DIRECTION" = "rollback" ]; then\n  MIGRATIONS=', 'if [ "$DIRECTION" = "never" ]; then\n  MIGRATIONS='),
  catalog("7"),
  "a rollback across a one-way migration",
);

breaks(
  "a config guard that falls back to the checkout's own base branch is rejected",
  "skills/xez-onboard-opinionated/kit/checks/config-guard.sh",
  (s) => s.replace('  if [ -z "$REMOTE_DEFAULT" ]; then\n', '  [ -n "$REMOTE_DEFAULT" ] || REMOTE_DEFAULT="$BASE_BRANCH"\n  if [ -z "$REMOTE_DEFAULT" ]; then\n'),
  catalog("7"),
  "an unknown remote default branch is refused",
);

breaks(
  "a config guard that passes an unvalidated branch name to git is rejected",
  "skills/xez-onboard-opinionated/kit/checks/config-guard.sh",
  // A function, not a string: `$'` in a replacement string means "the text after the match".
  (s) => s.replace("grep -Eq '^[A-Za-z0-9][A-Za-z0-9._/-]{0,254}$'", () => "grep -Eq '^.{1,255}$'"),
  catalog("7"),
  "would read as a git option",
);

breaks(
  "a browser workflow that allows chrome-devtools by wildcard is rejected",
  "skills/xez-onboard-opinionated/kit/workflows/qa.yaml",
  (s) => s.replace("mcp__chrome-devtools__navigate_page,", "mcp__chrome-devtools__*,"),
  facts("23"),
  "lists a chrome-devtools wildcard",
);

breaks(
  "a browser workflow that allows upload_file is rejected",
  "skills/xez-onboard-opinionated/kit/workflows/qa.yaml",
  (s) => s.replace("mcp__chrome-devtools__navigate_page,", "mcp__chrome-devtools__navigate_page, mcp__chrome-devtools__upload_file,"),
  facts("23"),
  "expected exactly",
);

breaks(
  "a chrome-devtools server on @latest is rejected",
  "skills/xez-onboard-opinionated/kit/mcp.json",
  (s) => s.replace("chrome-devtools-mcp@1.10.1", "chrome-devtools-mcp@latest"),
  facts("23"),
  "never @latest",
);

breaks(
  "a kit with no Codex browser config is rejected",
  "skills/xez-onboard-opinionated/kit/codex/config.toml",
  () => "",
  facts("23"),
  "Codex runs get no browser",
);

breaks(
  "a Codex browser config whose tools still need approval is rejected",
  "skills/xez-onboard-opinionated/kit/codex/config.toml",
  (s) => s.replace('default_tools_approval_mode = "approve"\n', ""),
  facts("23"),
  "every browser call would fail",
);

breaks(
  "a config guard that no longer refuses a changed browser entry is rejected",
  "skills/xez-onboard-opinionated/kit/checks/config-guard.sh",
  (s) => s.replace('base === "" || base === entry(process.env.TREE_TEXT) ? "same" : "changed"', '"same"'),
  catalog("7"),
  "the chrome-devtools entry in .mcp.json differs",
);

breaks(
  "a grammar that refuses an unknown neighbour beside a key that is set is rejected",
  "skills/xez-onboard-opinionated/kit/checks/lib/config-grammar.mjs",
  (s) => s.replace("  if (value === undefined) {\n", "  for (const sibling of Object.keys(node ?? {})) {\n    if (!GRAMMAR[`${group}.${sibling}`]) return { status: \"malformed\", detail: \"unknown sibling\", values: [] };\n  }\n  if (value === undefined) {\n"),
  catalog("5"),
  'expected "ok"',
);

breaks(
  "a class count in prose that is not the table's count is rejected, however small",
  "skills/xez-onboard-opinionated/references/report-templates.md",
  (s) => s.replace(/\b\d+ classes\b/, "3 classes"),
  catalog("4"),
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
  deps("freshness"),
  "no-unit failure",
);

breaks(
  "a permitted skip named by the record instead of the caller is rejected",
  "skills/xez-onboard-opinionated/kit/checks/lib/gate-results.mjs",
  (s) => s.replace("permittedSkipNames(installGate).has(command.name)", "permittedSkipNames(command.name).has(command.name)"),
  deps("skip"),
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
  deps("refusals"),
  "a symlinked unit folder is refused",
);

breaks(
  "units read from the working tree instead of the base branch are rejected",
  "skills/xez-onboard-opinionated/kit/checks/lib/deps.mjs",
  (s) => s.replace("text = git(root, [\"show\", `refs/remotes/origin/${remote}:${CONFIG}`]);", "text = readFileSync(join(root, CONFIG), \"utf8\");"),
  deps("base-branch"),
  "a unit added in the working tree is not installed",
);

// verdict-write.sh stamps the packet ids; each property breaks separately.
breaks(
  "a verdict writer that no longer stamps taskId and stepId is rejected",
  "skills/xez-onboard-opinionated/kit/checks/verdict-write.sh",
  (s) => s.replace("JSON.stringify({ ...p, taskId, stepId })", "JSON.stringify(p)"),
  catalog("1b"),
  "stamped with the step's taskId and stepId",
);

breaks(
  "a verdict writer that writes a packet with XEZ_STEP_ID unset is rejected",
  "skills/xez-onboard-opinionated/kit/checks/verdict-write.sh",
  (s) => s.replace('[ -n "${XEZ_TASK_ID:-}" ] && [ -n "${XEZ_STEP_ID:-}" ] || refuse', () => '[ -n "${XEZ_TASK_ID:-}" ] || refuse'),
  catalog("1b"),
  "with XEZ_STEP_ID unset",
);

breaks(
  "a verdict writer that overwrites a packet naming another task is rejected",
  "skills/xez-onboard-opinionated/kit/checks/verdict-write.sh",
  (s) => s.replace("if (p[k] !== undefined && p[k] !== v)", "if (false)"),
  catalog("1b"),
  "names another task",
);

breaks(
  "a reviewer skill that asks for the task id from the environment again is rejected",
  "skills/xez-onboard-opinionated/kit/skills/xezar-qa.md",
  (s) => s.replace("Leave `taskId` and `stepId` out:", () => "Set `taskId` to `$XEZ_TASK_ID`. Leave `taskId` and `stepId` out:"),
  facts("19"),
  "holds $XEZ_TASK_ID",
);

breaks(
  "leader settings that let gh pr merge --admin through are rejected",
  "skills/xez-onboard-opinionated/kit/scripts/xezar-leader-settings.json",
  (s) => s.replace('"Bash(gh pr merge *--admin*)", ', ""),
  facts("20"),
  "permissions.deny lacks Bash(gh pr merge *--admin*)",
);

breaks(
  "a budget loop back on a self-paced 3600s wake-up is rejected",
  "skills/xez-onboard-opinionated/kit/loops.json",
  (s) => s.replace('"mechanism": "cron",\n      "schedule": "7 * * * *",', '"mechanism": "self-paced-wakeup",\n      "schedule": "3600s",'),
  facts("21"),
  "L2 is self-paced-wakeup",
);

breaks(
  "conflict repair routed back to the merging integration workflow is rejected",
  "skills/xez-onboard-opinionated/kit/routing.json",
  (s) => s.replace('"id": "conflict-repair",\n      "title": "Conflict repair",\n      "workflows": [\n        "address-review-findings.yaml"', '"id": "conflict-repair",\n      "title": "Conflict repair",\n      "workflows": [\n        "integration.yaml"'),
  facts("22"),
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
  catalog("B"),
  "still offers a Claude lane",
);

breaks(
  "route output without --author that changes by one word is rejected",
  ROUTE_MJS,
  (s) => s.replace('out.push(`${line("escalation", lid)} by=hand`)', 'out.push(`${line("escalation", lid)} by=leader`)'),
  catalog("B"),
  "no longer prints byte-identical output",
);

breaks(
  "route that prints an author-chain line that is not NAME=value is rejected",
  ROUTE_MJS,
  (s) => s.replace("`escalation-eligible=${lid}`", "`escalation-eligible ${lid}`"),
  catalog("B"),
  "does not parse as NAME=value",
);

breaks(
  "a vendor exclusion naming a vendor no lane has is rejected",
  ROUTING,
  routingEdit((f) => { f.vendorExclusions = [{ vendor: "nobody" }]; }),
  catalog("B"),
  "is the vendor of no lane",
);

breaks(
  "the shipped Claude vendor exclusion dropped from routing.json is rejected",
  ROUTING,
  routingEdit((f) => { delete f.vendorExclusions; }),
  catalog("B"),
  "still offers a Claude lane",
);

// #65: the leader guide's dispatch, quota and merge-queue rules (FACT B1).
breaks(
  "dispatch at once made a second dispatcher, not an L3 run, is rejected",
  "skills/xez-onboard-opinionated/kit/leader-guide.template.md",
  (s) => s.replace("that turn – never an L1 or L2 tick, which wakes L3 instead – counts as an L3 run", "any turn may dispatch"),
  facts("B1"),
  "does not say that dispatching at once is an L3 run",
);

breaks(
  "the read-quota item dropped from the checklist is rejected",
  "skills/xez-onboard-opinionated/kit/leader-guide.template.md",
  (s) => s.replace("- [ ] Quota read from `read_quota` before this dispatch; every login verified", "- [ ] Every login verified before dispatch"),
  facts("B1"),
  "checklist has no",
);

breaks(
  "an L1 prompt that lets its own tick dispatch at once is rejected",
  "skills/xez-onboard-opinionated/kit/loops.json",
  (s) => s.replace("counts as a pacing run, and this tick is never one.", "counts as a pacing run."),
  facts("B1"),
  "L1's prompt does not say",
);

breaks(
  "close-out that loses the merge-queue path is rejected",
  "skills/xez-onboard-opinionated/kit/docs/close-out.md",
  (s) => s.replace("`gh pr merge <number> --auto`", "update the branch and merge"),
  facts("B1"),
  "does not describe both merge paths",
);
// 3.1.0-stream-B:end

// 3.1.0-stream-C:start
// #64: the timeline is cut by entries, and a decisions.md the loader cannot read is announced.
breaks(
  "a leader loader that keeps 400 timeline entries instead of 40 is rejected",
  "skills/xez-onboard-opinionated/kit/checks/leader-context.sh",
  (s) => s.replace("TIMELINE_ENTRIES_DEFAULT=40", "TIMELINE_ENTRIES_DEFAULT=400"),
  facts("C1"),
  "the timeline is not cut to its newest 40 entries",
);

breaks(
  "a leader loader that drops the timeline pointer line is rejected",
  "skills/xez-onboard-opinionated/kit/checks/leader-context.sh",
  (s) => s.replace("printf '\\n[timeline cut: showing", "printf '\\n[timeline: showing"),
  facts("C1"),
  "no pointer line naming the full timeline file",
);

breaks(
  "a leader loader that skips a missing decisions.md in silence is rejected",
  "skills/xez-onboard-opinionated/kit/checks/leader-context.sh",
  (s) => s.replace('  if [ -n "$decisions_problem" ]; then\n    printf \'WARNING', '  if false; then\n    printf \'WARNING'),
  facts("C1"),
  "no WARNING with the nonce, before the guide, for a missing decisions.md",
);

breaks(
  "a settings check whose browser tool list drifts from the kit's grants is rejected",
  "skills/xez-onboard-opinionated/kit/checks/catalog-check.mjs",
  (s) => s.replace('"resize_page", "get_css_styles",\n]);', '"resize_page", "get_css_styles", "emulate",\n]);'),
  facts("C2"),
  "SETTINGS_BROWSER_TOOLS is",
);

// #69: the kit's own hook entry is still guarded, and the settings check keeps its teeth.
breaks(
  "a changed kit SessionStart hook entry still fails the quote check",
  "skills/xez-onboard-opinionated/kit/claude/settings.json",
  (s) => s.replace('"timeout": 15', '"timeout": 30'),
  catalog("C"),
  "fenced quote differs from .claude/settings.json#entry:hooks.SessionStart",
);

breaks(
  "a widening Bash rule in committed .claude/settings.json that only warns is rejected",
  "skills/xez-onboard-opinionated/kit/checks/catalog-check.mjs",
  (s) => s.replace('const committed = name === "settings.json";', 'const committed = false;'),
  catalog("C"),
  "catalog-check accepts a widening Bash rule in committed .claude/settings.json",
);

breaks(
  "a widening rule in the untracked settings.local.json that fails the repository check is rejected",
  "skills/xez-onboard-opinionated/kit/checks/catalog-check.mjs",
  (s) => s.replace('const committed = name === "settings.json";', 'const committed = true;'),
  catalog("C"),
  "catalog-check fails the repository check on a widening rule in settings.local.json",
);

breaks(
  "a browser grant outside the kit's tool list is rejected",
  "skills/xez-onboard-opinionated/kit/checks/catalog-check.mjs",
  (s) => s.replace("if (!tool || !SETTINGS_BROWSER_TOOLS.has(tool)) {", "if (!tool) {"),
  catalog("C"),
  "catalog-check accepts browser grant mcp__chrome-devtools__emulate",
);
// 3.1.0-stream-C:end

// 3.1.0-stream-D:start
// #52: the timeout rule, and the shipped timeouts it protects.
breaks(
  "a catalog check that no longer asks an agent step for a timeout is rejected",
  "skills/xez-onboard-opinionated/kit/checks/catalog-check.mjs",
  (s) => s.replace("      checkStepTimeout(at, step);\n", ""),
  catalog("D-refusals"),
  "catalog-check accepts a handoff step with no timeout",
);

breaks(
  "a kit handoff step without a timeout is rejected",
  "skills/xez-onboard-opinionated/kit/workflows/bug-fix.yaml",
  (s) => s.replace("    skill: xezar-handoff-draft-pr\n    timeout: 15m\n", "    skill: xezar-handoff-draft-pr\n"),
  catalog("1"),
  'step "handoff": an agent step has no timeout',
);

// D13: every review and QA step runs the change and holds every browser tool; nothing else gets
// the review-only tools; a review's verdict needs an unchanged tree.
breaks(
  "a catalog check that lets review-only browser tools into any workflow is rejected",
  "skills/xez-onboard-opinionated/kit/checks/catalog-check.mjs",
  (s) => s.replace("if (step.allowedTools.includes(tool)) err(at,", "if (false && step.allowedTools.includes(tool)) err(at,"),
  catalog("D-refusals"),
  "catalog-check accepts evaluate_script in the design workflow",
);

breaks(
  "a catalog check that no longer asks a review step for review-run.sh is rejected",
  "skills/xez-onboard-opinionated/kit/checks/catalog-check.mjs",
  (s) => s.replace("if (!list.includes(REVIEW_RUN_PREFIX)) {", "if (false) {"),
  catalog("D-refusals"),
  "catalog-check accepts a qa.yaml review step without review-run.sh",
);

breaks(
  "a catalog check that no longer reads a review step's prompt for the tracked checks path is rejected",
  "skills/xez-onboard-opinionated/kit/checks/catalog-check.mjs",
  (s) => s.replace('if (typeof step.prompt === "string" && step.prompt.includes(".xezar/checks/")) {', "if (false) {"),
  catalog("D-refusals"),
  "catalog-check accepts a security-review prompt that names the tracked .xezar/checks/git-read.sh",
);

breaks(
  "a review workflow without the full browser tool set is rejected",
  "skills/xez-onboard-opinionated/kit/workflows/code-review.yaml",
  (s) => s.replace(", mcp__chrome-devtools__lighthouse_audit", ""),
  facts("23"),
  "FACT 23",
);

breaks(
  "a design-review preflight back on --allow-root is rejected",
  "skills/xez-onboard-opinionated/kit/workflows/design-review.yaml",
  (s) => s.replace('command: ".xezar/checks/worktree-preflight.sh"\n', 'command: ".xezar/checks/worktree-preflight.sh --allow-root"\n'),
  catalog("1"),
  "runs worktree-preflight.sh with --allow-root",
);

breaks(
  "a verdict-write that no longer checks the reviewed tree is rejected",
  "skills/xez-onboard-opinionated/kit/checks/verdict-write.sh",
  (s) => s.replace('bash "$SCRIPT_DIR/review-run.sh" finish >&2 ||', 'true ||'),
  catalog("D-data"),
  "no longer runs review-run.sh finish before a verdict packet",
);

breaks(
  "a gh-write.sh that takes a verdict's role from the request is rejected",
  "skills/xez-onboard-opinionated/kit/checks/gh-write.sh",
  (s) => s.replace('[ "$declared" = "$verdict_role" ] ||', "true ||"),
  catalog("D-review"),
  "gh-write.sh lets a qa step claim a design-review verdict",
);

// A Continue settles under `continue-N`, which no definition step names: the role comes from the
// step that owns its session, as the engine's takeStepVerdict resolves it.
breaks(
  "a gh-write.sh that reads no role for a Continue's continue-N step is rejected",
  "skills/xez-onboard-opinionated/kit/checks/gh-write.sh",
  (s) => s.replace("step = defSteps.find((s) => s.id === owner?.id) ?? [...defSteps].reverse().find((s) => !s.command);", "step = undefined;"),
  catalog("D-review"),
  "gh-write.sh refuses a qa verdict on a Continue (continue-1)",
);

breaks(
  "a gh-write.sh that lifts a gate label without its approval label is rejected",
  "skills/xez-onboard-opinionated/kit/checks/gh-write.sh",
  (s) => s.replace('[ -z "$verdict_removed" ] || [ -n "$verdict_added" ] ||', "true ||"),
  catalog("D-review"),
  "remove needs-qa without adding qa-approved",
);

breaks(
  "a review-run.sh that hands the operator's credentials to what it runs is rejected",
  "skills/xez-onboard-opinionated/kit/checks/review-run.sh",
  (s) => s.replace('    no_credentials\n    "$@"', '    "$@"'),
  catalog("D-review"),
  "a child of review-run.sh run still sees the operator's git or gh credentials",
);

breaks(
  "a review-run.sh that trusts a rewritten head record is rejected",
  "skills/xez-onboard-opinionated/kit/checks/review-run.sh",
  (s) => s.replace(`if ! printf '%s\\n' "$known" | grep -Fqx -- "$recorded"; then`, "if false; then"),
  catalog("D-review"),
  "whose head record was rewritten to match it",
);

breaks(
  "a review-run.sh checkout that stops probing whether its sandbox can write git is rejected",
  "skills/xez-onboard-opinionated/kit/checks/review-run.sh",
  (s) => s.replace('      if [ -z "$probe" ]; then\n        echo "review-run=confined"', '      if false; then\n        echo "review-run=confined"'),
  catalog("D-review"),
  "does not exit 3 with review-run=confined",
);

// A checkout replaces the tracked .xezar/checks/ with the PR head's own copies, so a review runs
// the kit step's copy outside the tracked tree. Each half breaks on its own: the kit step stops
// writing the copy, a review allowlist may name the tracked copy again, or a head that tracks a
// file where the copy lives is kept.
breaks(
  "a kit step that no longer copies the review's own scripts is rejected",
  "skills/xez-onboard-opinionated/kit/checks/lib/bootstrap.mjs",
  (s) => s.replace("fs.renameSync(stage,trusted);", "fs.rmSync(stage,{recursive:true,force:true});"),
  catalog("D-review"),
  "the kit step does not copy the primary's checks/",
);

breaks(
  "a catalog check that lets a review step run a kit script from the tracked tree is rejected",
  "skills/xez-onboard-opinionated/kit/checks/catalog-check.mjs",
  (s) => s.replace("if (review && /^bash \\.xezar\\/checks\\//.test(entry)", "if (false && /^bash \\.xezar\\/checks\\//.test(entry)"),
  catalog("D-refusals"),
  "running verdict-write.sh from the tracked tree",
);

breaks(
  "a review-run.sh checkout that keeps a head replacing the review's own scripts is rejected",
  "skills/xez-onboard-opinionated/kit/checks/review-run.sh",
  (s) => s.replace('if [ -n "$(git ls-files -- .local/xezar/cache/kit | head -1)" ]; then', "if false; then"),
  catalog("D-review"),
  "keeps a PR head that replaced the review's own scripts",
);

breaks(
  "a browser descriptor that stops saying where the review tools are granted is rejected",
  "skills/xez-onboard-opinionated/kit/pipeline/browsers/chrome-devtools.md",
  (s) => s.replace("granted by their own tool lists only", "granted anywhere"),
  catalog("D-data"),
  "no longer says the review and QA workflows hold every tool",
);
// 3.1.0-stream-D:end

// 3.1.0-stream-E:start
// #53 install freshness: the tree digest in deps.mjs and the fail-closed resume. Each property
// breaks on its own; the gate runs only the #53 group of test-deps-units.mjs that owns it.
// depsOnly53 is the same filter through XEZ_DEPS_TEST_ONLY (123-sections below).
const depsOnly53 = () => run("node", ["scripts/test-deps-units.mjs"], { env: { ...process.env, XEZ_DEPS_TEST_ONLY: "53" } });
const DEPS_MJS = "skills/xez-onboard-opinionated/kit/checks/lib/deps.mjs";

breaks(
  "a fresh check that ignores the tree digest is rejected",
  DEPS_MJS,
  (s) => s.replace('if (digest.line === "unavailable" || stamp !== stampContent(root, u, fp, digest.line)) return 1;', 'if (digest.line === "unavailable") return 1;'),
  deps("53-tree"),
  "one package folder replaced inside node_modules",
);

breaks(
  "a build cache skipped while it holds a package, a .bin or a link is rejected",
  DEPS_MJS,
  (s) => s.replace('if (e.isSymbolicLink() || e.name === ".bin" || e.name === "package.json") return false;', "void e;"),
  deps("53-tree"),
  "a build cache that holds a package.json",
);

breaks(
  "a link into a skipped build cache that is accepted is rejected",
  DEPS_MJS,
  (s) => s.replace("if (hit) throw new Unavailable(", "if (false) throw new Unavailable("),
  deps("53-tree"),
  "a link into a build cache the digest leaves out",
);

breaks(
  "an unreadable folder skipped by the digest is rejected",
  DEPS_MJS,
  (s) => s.replace("try { names = readdirSync(dir); } catch (e) { throw new Unavailable(`${dir} cannot be read (${e.code})`); }", "try { names = readdirSync(dir); } catch { names = []; }"),
  deps("53-tree"),
  "a tree the digest cannot read is not fresh",
);

breaks(
  "a digest with no timeout is rejected",
  DEPS_MJS,
  (s) => s.replace("return raw !== undefined && /^\\d{1,9}$/.test(raw) ? Number(raw) : 60000;", "return 60000;"),
  deps("53-tree"),
  "a digest that times out is not fresh",
);

breaks(
  "a resume that reuses sealed evidence over stale dependencies is rejected",
  "skills/xez-onboard-opinionated/kit/checks/resume-complete.sh",
  (s) => s.replace('[ "$FORCE_GATES" -eq 0 ] && [ "$DEPS_FRESH" -eq 1 ]; then NEED_GATES=0; fi', '[ "$FORCE_GATES" -eq 0 ]; then NEED_GATES=0; fi'),
  deps("53-tree"),
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
  catalog("F"),
  "a fragment-only branch is accepted against the configured base",
);

breaks(
  "changelog check no longer sees a Keep a Changelog Unreleased section",
  "skills/xez-onboard-opinionated/kit/checks/changelog-check.sh",
  (s) => s.replace("UNRELEASED_RE='^## \\[?Unreleased", "UNRELEASED_RE='^## \\[?Pending"),
  catalog("F"),
  "a direct `## [Unreleased]` edit is refused",
);

breaks(
  "changelog verify step no longer checks the fragment lines",
  "skills/xez-onboard-opinionated/kit/checks/changelog-fragments.mjs",
  (s) => s.replace("if ((have.get(line) ?? 0) < files.length)", "if (false)"),
  catalog("F"),
  "the verify step catches a lost fragment entry",
);

breaks(
  "changelog fold maps a house heading onto the wrong Keep a Changelog group",
  "skills/xez-onboard-opinionated/kit/checks/changelog-fragments.mjs",
  (s) => s.replace("'## ✨ Features': 'Added',", "'## ✨ Features': 'Changed',"),
  catalog("F"),
  "the keep-a-changelog fold wrote an unexpected file",
);

breaks(
  "changelog format accepts an unknown changelog.format value",
  "skills/xez-onboard-opinionated/kit/checks/changelog-fragments.mjs",
  (s) => s.replace("if (!FORMATS.includes(value)) {", "if (false) {"),
  catalog("F"),
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
  facts("G1"),
  "a branch that drops its own path from security.trustBoundaries is no longer routed",
);

breaks(
  "an unresolvable base branch read as no project entries is rejected",
  SCAN_LIB,
  (s) => s.replace('return { status: "unreadable", detail: `${ref} does not resolve here', 'return { status: "absent", detail: `${ref} does not resolve here'),
  facts("G1"),
  "an unresolvable base branch ref did not route to review",
);

breaks(
  "a trust-boundary pattern grammar that lets braces and classes through is rejected",
  GRAMMAR_LIB,
  (s) => s.replace("const TRUST_PATTERN_REFUSED = /[!{}()[\\]^$|\\\\+]/;", "const TRUST_PATTERN_REFUSED = /[!]/;"),
  facts("G1"),
  "must be refused",
);

breaks(
  "a trust-boundary list with its caps lifted is rejected",
  GRAMMAR_LIB,
  (s) => s.replace("export const TRUST_BOUNDARY_LIMITS = { entries: 64, length: 256 };", "export const TRUST_BOUNDARY_LIMITS = { entries: 640, length: 2560 };"),
  facts("G1"),
  "with 65 entries was ok, expected malformed",
);

breaks(
  "a project trust-boundary entry with no why is rejected",
  GRAMMAR_LIB,
  (s) => s.replace('if (typeof why !== "string" || why.trim() === "" ||', 'if (typeof why === "number" ||'),
  facts("G1"),
  "with an entry with no why was",
);

breaks(
  "an invalid project list left out of the stage status is rejected",
  SCAN_LIB,
  (s) => s.replace('  else if (configUnknown) status = "unknown";\n', ""),
  facts("G1"),
  "did not make the stage status unknown",
);

breaks(
  "an invalid project list that does not require a reviewer is rejected",
  SCAN_LIB,
  (s) => s.replace("reviewerRequired: trustBoundaries.length > 0 || configUnknown,", "reviewerRequired: trustBoundaries.length > 0,"),
  facts("G1"),
  "did not make the stage status unknown with reviewerRequired",
);

breaks(
  "a project match that does not name its list is rejected",
  SCAN_LIB,
  (s) => s.replace('touched.push({ file, why: entry.why, list: "project" });', 'touched.push({ file, why: entry.why, list: "kit" });'),
  facts("G1"),
  "did not set reviewerRequired with its reason and list",
);

breaks(
  "the engine repository's own paths shipped in the kit's trust boundaries again is rejected",
  SCAN_LIB,
  (s) => s.replace("const TRUST_BOUNDARIES = [\n", 'const TRUST_BOUNDARIES = [\n  { pattern: /^packages\\/xezar\\/src\\/server\\//, why: "the HTTP surface" },\n'),
  facts("G1"),
  "still ships the engine repository's packages/xezar/src entries",
);

breaks(
  "a phase record that stops describing the project trust-boundary list is rejected",
  "skills/xez-onboard-opinionated/kit/docs/phase-record.md",
  (s) => s.replace(/^A project adds paths of its own in `security\.trustBoundaries`.*\n/m, ""),
  facts("G1"),
  "does not describe the project's security.trustBoundaries list",
);
// 3.1.0-stream-G:end

// 3.1.0-stream-H:start
// #54: every refusal rule of push-check.sh, broken one at a time. test-kit-facts.mjs FACT H1 runs
// the script against a stand-in gh and a local bare origin; test-kit-catalog.mjs pins the wiring.
{
  const PUSH_CHECK = "skills/xez-onboard-opinionated/kit/checks/push-check.sh";
  const pushBreak = (name, from, to, expect) => breaks(name, PUSH_CHECK, (s) => s.replace(from, to), facts("H1"), expect);

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

  breaks("readiness that accepts a DELIVERED record again is rejected",
    "skills/xez-onboard-opinionated/kit/checks/worktree-preflight.sh",
    (s) => s.replace("That path is retired (#54): a repair", "Accepted: a repair"),
    catalog("H"), "readiness no longer refuses a DELIVERED record");
  breaks("a repair handoff that pushes without push-check is rejected",
    "skills/xez-onboard-opinionated/kit/workflows/address-review-findings.yaml",
    (s) => s.replace("Push the sealed fix to the PR's own branch only through .xezar/checks/push-check.sh, then", "Push the fixes, then"),
    catalog("H"), "the handoff step does not push through .xezar/checks/push-check.sh");
  breaks("a review-response skill that records DELIVERED again is rejected",
    "skills/xez-onboard-opinionated/kit/skills/xezar-review-response.md",
    (s) => s.replace("never write a `DELIVERED` record: readiness refuses it", "record the push as `DELIVERED`"),
    catalog("H"), "still tells a repair to push early and record DELIVERED");
}
// 3.1.0-stream-H:end

// 3.1.0-stream-U:start
// U1 (#55): the manifest drift check and its place in the gate.
breaks(
  "a drift check that no longer compares digests is rejected",
  "skills/xez-onboard-opinionated/kit/checks/manifest-drift.mjs",
  (s) => s.replace("else if (seen.sha256 !== entry.sha256)", "else if (false)"),
  catalog("U"),
  "manifest-drift: a silent edit exits 0, not 1",
);

// A project's own gate list is a filled-in value (lib/rewrites.mjs RENDERED_REGIONS); nothing else is.
breaks(
  "a drift check whose gate-list allowance accepts any edit to the gate runner is rejected",
  "skills/xez-onboard-opinionated/kit/checks/manifest-drift.mjs",
  (s) => s.replace('return restored ? createHash("sha256").update(text, "utf8").digest("hex") : null;', "return entry.sha256;"),
  upgrade("12b3"),
  "own-gates: the drift check accepts an edit outside the gate list",
);

breaks(
  "a drift check whose gate regions drift from the upgrade tool's is rejected",
  "skills/xez-onboard-opinionated/kit/checks/manifest-drift.mjs",
  (s) => s.replace('{ key: "GATE_APPLICATION_LANES", re: /^(GATE_APPLICATION_LANES=)(.*)()$/m }', '{ key: "GATE_LANES", re: /^(GATE_APPLICATION_LANES=)(.*)()$/m }'),
  upgrade("12b3"),
  "RENDERED_REGIONS disagree on GATE_APPLICATION_LANES",
);

breaks(
  "an upgrade tool that reads a project's own gate list as a local change is rejected",
  "upgrade/tools/lib/rewrites.mjs",
  (s) => s.replace("const hasRegions = (text) => /^GATE_NAMES=\\(/m.test(text)", "const hasRegions = (text) => false && /^GATE_NAMES=\\(/m.test(text)"),
  upgrade("12b3"),
  "own-gates: a project's own gate list makes .xezar/checks/repo-gates.sh",
);

// The project's own role skills and workflows reach the plan as own-file-kit-contract reviews.
breaks(
  "a planner that no longer lists the project's own role skills and workflows is rejected",
  "upgrade/tools/plan.mjs",
  (s) => s.replace("for (const own of ownFiles(ctx)) {", "for (const own of []) {"),
  upgrade("12b4"),
  "own-files: .xezar/skills/xezar-mobile-release.md is",
);

breaks(
  "an upgrade prompt that does not say what to do with an own-file-kit-contract review is rejected",
  "upgrade/UPGRADE-PROMPT.md",
  (s) => s.replace("   - `own-file-kit-contract` – a role skill", "   - own-file review – a role skill"),
  facts("U-plan-flags"),
  "review reason `own-file-kit-contract`",
);

breaks(
  "a drift check that accepts an unconfirmed register entry is rejected",
  "skills/xez-onboard-opinionated/kit/checks/manifest-drift.mjs",
  (s) => s.replace("} else if (!lp.confirmed) {", "} else if (false) {"),
  catalog("U"),
  "manifest-drift: a patch with Confirmed: no exits 0, not 1",
);

breaks(
  "a drift check that ignores register entries with no manifest patch is rejected",
  "skills/xez-onboard-opinionated/kit/checks/manifest-drift.mjs",
  (s) => s.replace("if (!entry || entry.patch !== id)", "if (false)"),
  catalog("U"),
  "manifest-drift: a register entry with no manifest patch exits 0, not 1",
);

// The verifier lets a register entry name an absent file only when it is a kit file the
// manifest can record as removed, never any absent path.
breaks(
  "a verifier that accepts a register entry naming any absent path is rejected",
  "upgrade/tools/verify.mjs",
  (s) => s.replace('if (!recordableRemoval(ctx, f)) problem("register-binding"', 'if (!ctx.readMine(f).missing) problem("register-binding"'),
  upgrade("12b"),
  "removed: a register entry naming a path the kit never shipped is accepted",
);

breaks(
  "a gate that no longer runs the drift check is rejected",
  "skills/xez-onboard-opinionated/kit/checks/repository-checks.sh",
  (s) => s.replace('node "$SCRIPT_DIR/manifest-drift.mjs" "$REPO_ROOT" || drift_rc=$?\n', ""),
  facts("U1"),
  "no longer runs manifest-drift.mjs",
);

breaks(
  "a gate that records a drift failure and then exits 0 is rejected",
  "skills/xez-onboard-opinionated/kit/checks/repository-checks.sh",
  (s) => s.replace('  exit "$drift_rc"\n', ""),
  upgrade("9"),
  "a drift failure alone does not fail the script at the end",
);

// A kept local change with no register entry must stop verify before the manifest records it.
breaks(
  "a verifier that lets a kept local change through without a register entry is rejected",
  "upgrade/tools/verify.mjs",
  (s) => s.replace("if (unchangedFromKit(ctx, p, e, mine, detectedByPath.get(p))) continue;", "continue;"),
  upgrade("12b2"),
  "unregistered: verify accepts a kept edit",
);

// A kit file the project had and removed with no register entry must stop verify too: the
// manifest leaves it out, and the next upgrade would write it back as new in the kit.
breaks(
  "a verifier that lets a kit file removed with no register entry through is rejected",
  "upgrade/tools/verify.mjs",
  (s) => s.replace("if (ctx.readMine(p).missing && had) {", "if (false) {"),
  upgrade("12b"),
  "removed: verify accepts a kit file removed with no register entry",
);

// The drift check runs in projects and keeps its own copy of lib/policy.mjs's NOT_RECORDED.
breaks(
  "a drift check whose not-recorded list drifts from the upgrade tool's is rejected",
  "skills/xez-onboard-opinionated/kit/checks/manifest-drift.mjs",
  (s) => s.replace('  "AGENTS.md",\n', ""),
  upgrade("11a"),
  "not-recorded: manifest-drift.mjs's NOT_RECORDED",
);

breaks(
  "a drift check that ignores an owner-file-appended kit block is rejected",
  "skills/xez-onboard-opinionated/kit/checks/manifest-drift.mjs",
  (s) => s.replace('  origin !== "owner-file-appended" &&\n', ""),
  upgrade("11a"),
  "not-recorded: an owner-file-appended CLAUDE.md whose kit block changed passes",
);

// The planner drafts the register entry the verifier will require for a tracked owner-shaped file.
breaks(
  "a planner that drafts no register entry for a kept change in .claude/settings.json is rejected",
  "upgrade/tools/plan.mjs",
  (s) => s.replace("          if (!item.registerConfirmed) item.unexplained = true;\n", ""),
  upgrade("14a"),
  "owner-hook: a tracked owner-shaped file with a kept local change is not listed as unexplained",
);

// A manifest with no version: the files' sure bases pick the entry range.
breaks(
  "a planner that lists every upgrade entry when the files show the project's version is rejected",
  "upgrade/tools/plan.mjs",
  (s) => s.replace("const evidence = projectVersion ? null : versionEvidence(ctx, detection);", "const evidence = null;"),
  upgrade("14b"),
  "range: a 3.0.3 install whose manifest names no version shows",
);

breaks(
  "a plan whose upgrade entries name no heading is rejected",
  "upgrade/tools/plan.mjs",
  (s) => s.replace("const unit = units.filter((u) => u.line <= b.line).pop() ?? null;", "const unit = null;"),
  upgrade("14c"),
  "entries: an upgrade entry's line",
);

// Every 3.1.0 entry that copies role skills needs entry 2 (the shared-contract tail).
breaks(
  "a 3.1.0 entry that copies role skills without needing entry 2 is rejected",
  "UPGRADE_NOTES.md",
  (s) => s.replace("- Entries 1, 5, 7 and 9 need entry 2:", "- Entries 1, 5 and 7 need entry 2:"),
  upgrade("6b"),
  "needs: 3.1.0 entry 9 copies role skills",
);

// Round-10 review: a gate list changed after a version-2 manifest is read from the file, and
// the tracker descriptor's recorded digest moves with it in xez-apply-upgrade-notes.
breaks(
  "an adapted file's recorded values taken over its own on the next upgrade is rejected",
  "upgrade/tools/detect.mjs",
  (s) => s.replace("return m?.match ? result(v, \"high\", via, { text: t, inputs: { ...(hint.renderInputs ?? {}), ...m.inputs } }) : result(v, \"high\", via);", "return result(v, \"high\", via);"),
  upgrade("12b3"),
  "own-gates next:",
);

breaks(
  "xez-apply-upgrade-notes that no longer moves the tracker descriptor's digest is rejected",
  "skills/xez-apply-upgrade-notes/SKILL.md",
  (s) => s.replace("then write the SHA-256 of the updated file into that entry's", "then leave the manifest entry's"),
  upgrade("7"),
  "no longer moves the tracker descriptor's recorded digest",
);

// scripts/test-upgrade.mjs (plan §7 break cases). U1's drift break cases above cover a silent
// one-byte edit; these cover the upgrade tool's own checks.
// A new installed path that no fragment's upgrade block lists. Aimed at the copy table rather
// than at one fragment, so it holds however many streams list the same file.
breaks(
  "a changed kit file no 3.1.0 upgrade block lists is rejected",
  "skills/xez-onboard-opinionated/references/write.md",
  (s) => s.replace(/^(\| `kit\/loops\.json` \| `\.xezar\/loops\.json` \|\n)/m, "$1| `kit/loops.json` | `.xezar/loops-copy.json` |\n"),
  upgrade("6"),
  ".xezar/loops-copy.json changed since",
);

// Truncating the index list at package.json's version makes that version the newest indexed
// one, so the release check compares it with the tree and must find it stale. Once the release
// PR indexes its own version last, this mutation changes nothing and must be re-aimed.
// A changed kit file dropped from the one 3.1.0 block that lists it. The base of this check is
// the last release OLDER than the target: once the release indexes the target itself, a base of
// "the newest tagged entry" diffs the target with itself and this case passes silently.
breaks(
  "a changed kit file dropped from its 3.1.0 upgrade block's Files: line is rejected",
  "UPGRADE_NOTES.md",
  (s) => s.replace(".xezar/checks/lib/gate-record.sh; .xezar/checks/review-run.sh =new;", ".xezar/checks/review-run.sh =new;"),
  upgrade("6"),
  ".xezar/checks/lib/gate-record.sh changed since 3.0.3 but no 3.1.0 upgrade block lists it",
);

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
  upgrade("2"),
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
  upgrade("4"),
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
  upgrade("3"),
  "3.0.3: .xezar/docs/routing.md base confidence medium, expected high",
);

// U4: the upgrade prompt names a helper script that does not exist.
breaks(
  "an upgrade prompt that names a missing helper script is rejected",
  "upgrade/UPGRADE-PROMPT.md",
  (s) => s.replace("node <clone>/upgrade/tools/detect.mjs", "node <clone>/upgrade/tools/detect-files.mjs"),
  facts("U4"),
  "names upgrade/tools/detect-files.mjs, which does not exist",
);

// U4: an unreconciled command mark left in the upgrade prompt.
breaks(
  "an upgrade prompt with a verify-cli mark left in is rejected",
  "upgrade/UPGRADE-PROMPT.md",
  (s) => s.replace("## Step 2 – Detect\n", "## Step 2 – Detect\n\n<!-- verify-cli -->\n"),
  facts("U4"),
  "still carries a verify-cli mark",
);

// U-evals: an eval grader that passes every stop invariant would score a run that never stopped
// on a weakened safety check as a pass.
breaks(
  "an upgrade eval grader that accepts a run with no stop is rejected",
  "upgrade/evals/check.mjs",
  (s) => s.replace("return [Boolean(hit), `stop on", "return [true, `stop on"),
  facts("U-evals"),
  "accepts a run that did not stop on a weakened safety check",
);

// Run from the clone, repository-checks.sh without an argument checks the clone's skill folder.
breaks(
  "a verify that runs the repository check without the project root is rejected",
  "upgrade/tools/verify.mjs",
  (s) => s.replace('[join(kit, "repository-checks.sh"), ctx.project]', '[join(kit, "repository-checks.sh")]'),
  upgrade("9"),
  "verify: the repository check did not run in the project",
);

// The prompt eval findings (upgrade/evals/RESULTS.md F1–F7), one break per planner guard.
breaks(
  "an upgrade that offers the target's unreleased development commits as bases is rejected",
  "upgrade/tools/lib/context.mjs",
  (s) => s.replace("return before.slice(0, Math.max(lastRelease, installed) + 1);", "return before;"),
  upgrade("5j"),
  "dev-line: a pre-release copy of a new file is",
);

breaks(
  "an upgrade that keeps a file on an inferred base equal to the target is rejected",
  "upgrade/tools/plan.mjs",
  (s) => s.replace('} else if (baseEqTheirs && f.base.confidence === "low") {', "} else if (false) {"),
  upgrade("5k"),
  "low-base: a low-confidence base equal to the target gives",
);

breaks(
  "an upgrade line test that misses a dropped exit \"$rc\" is rejected",
  "upgrade/tools/lib/policy.mjs",
  (s) => s.replace('|\\bexit\\s+"?\\$(\\?|\\{?[A-Za-z_])', ""),
  upgrade("5l"),
  "weaken-rc: a dropped exit",
);

breaks(
  "an upgrade that misses an added || true in a check is rejected",
  "upgrade/tools/plan.mjs",
  (s) => s.replace("const added = isCheckLike(p) && kept ? addedWeakeningLines(baseText, mine) : [];", "const added = [];"),
  upgrade("5l"),
  "weaken-true: an added",
);

breaks(
  "an upgrade that does not flag a kept local change to a safety file is rejected",
  "upgrade/tools/plan.mjs",
  (s) => s.replace('if (item.safety && ["local-only", "unexplained-local-change"].includes(item.class)) review("safety-local-change");', ""),
  upgrade("5l"),
  "weaken-rc: a kept local change to a safety file is not on the read-and-judge list",
);

breaks(
  "an upgrade that does not flag a both-changed safety file is rejected",
  "upgrade/tools/plan.mjs",
  (s) => s.replace('if (item.safety && item.class === "both-changed") review("safety-both-changed");', ""),
  upgrade("5m"),
  "semantic: a both-changed safety file",
);

breaks(
  "an upgrade that does not stop on a routing field both sides changed is rejected",
  "upgrade/tools/plan.mjs",
  (s) => s.replace('if (c.both.length) stop("routing-clash");', ""),
  upgrade("5n"),
  "routing-clash: both sides setting vendorExclusions",
);

breaks(
  "an upgrade that drafts a second register entry for a covered file is rejected",
  "upgrade/tools/plan.mjs",
  (s) => s.replace('.filter((i) => (i.class === "unexplained-local-change" || i.unexplained) && !i.register.length)', '.filter((i) => i.class === "unexplained-local-change" || i.unexplained)'),
  upgrade("5o"),
  "draft-dup: a second register entry is drafted",
);

breaks(
  "an upgrade prompt that does not name a planner stop reason is rejected",
  "upgrade/UPGRADE-PROMPT.md",
  (s) => s.replace("(`routing-clash`; the plan", "(the plan"),
  facts("U-plan-flags"),
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
  catalog("R"),
  "a lane with tier: cheap never reviews with a full shell",
);

breaks(
  "the full-shell reviewer in a reading row that is not a review is rejected",
  ROUTING,
  routingEdit((f, row) => { row("business-analysis").lanes.push(V4); }),
  catalog("R"),
  `"${V4}" does not enforce a step's tool limits, and this row only reads`,
);

breaks(
  "the full-shell reviewer in a security row that writes is rejected",
  ROUTING,
  routingEdit((f, row) => { row("release").lanes.push(V4); }),
  catalog("R"),
  `"${V4}" does not enforce a step's tool limits, and this row is security and release`,
);

breaks(
  "route that lets a full-shell lane into every reading row is rejected",
  ROUTE_MJS,
  (s) => s.replace("!(lane.fullShellReviews === true && judgesOnly)", "!(lane.fullShellReviews === true)"),
  catalog("R"),
  "route check accepts V4 Pro in a reading row that is not a review",
);

breaks(
  "route that lets a cheap lane review with a full shell is rejected",
  ROUTE_MJS,
  (s) => s.replace('const FULL_SHELL_FORBIDDEN = [["tier", "cheap"], ', "const FULL_SHELL_FORBIDDEN = ["),
  catalog("R"),
  "route check accepts fullShellReviews on a cheap lane",
);

breaks(
  "V4 Pro, which has no vision, in a screen row is rejected",
  ROUTING,
  routingEdit((f, row) => { row("diagrams").lanes.splice(1, 0, V4); }),
  catalog("R"),
  "screen row diagrams lists",
);

breaks(
  "pi-written work cleared by any lane is rejected",
  ROUTING,
  routingEdit((f) => { f.globalBans.find((b) => b.id === "pi-write-claude-review").rule = "What a pi lane wrote merges after a review on any other lane."; }),
  facts("R1"),
  "ban pi-write-claude-review is relaxed further",
);

breaks(
  "V4 Pro on risk-high work while Claude has budget is rejected",
  ROUTING,
  routingEdit((f) => { f.globalBans.find((b) => b.id === "high-risk-other-vendor").rule = "A risk-high change is reviewed by a different vendor from its author when a lane of one has budget, and never on the author's login. pi/deepseek-api/deepseek-v4-pro may always be that reviewer."; }),
  facts("R1"),
  "ban high-risk-other-vendor is relaxed further",
);

breaks(
  "the tool-limits exception widened to every reading row is rejected",
  ROUTING,
  routingEdit((f) => { f.globalBans.find((b) => b.id === "tool-limits").rule = "A lane with enforcesToolLimits: false is in no reading row (writes: false and not runsCode) and in no security-and-release row. One exception: a lane with fullShellReviews: true may be in any row."; }),
  facts("R1"),
  "ban tool-limits is relaxed further",
);

breaks(
  "no-self-review softened along with the three relaxed bans is rejected",
  ROUTING,
  routingEdit((f) => { f.globalBans.find((b) => b.id === "no-self-review").rule = "A review, re-check or QA prefers a different model from the one that wrote the work."; }),
  facts("R1"),
  "ban no-self-review is no longer word for word",
);

breaks(
  "a SECURITY.md accepted-risk entry that pre-accepts V4 Pro in a QA row it is not in is rejected",
  "SECURITY.md",
  (s) => s.replace("`verify-strong-claim`. It may also", "`verify-strong-claim`, `browser-qa`. It may also"),
  facts("R1"),
  "the accepted-risk entry lists the full-shell reviewer in reading rows",
);

breaks(
  "a SECURITY.md accepted-risk entry that says V4 Pro is absent from a row it is in is rejected",
  "SECURITY.md",
  (s) => s.replace("not in the `release`, `deploy` or", "not in the `security-review`, `release`, `deploy` or"),
  facts("R1"),
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
  catalog("B"),
  "a same-vendor lane on another model is allowed on a security row",
);

breaks(
  "the neverAuthor description that bans the author's vendor again is rejected",
  "skills/xez-onboard-opinionated/kit/routing.schema.json",
  (s) => s.replace("The lane, model and login that wrote or repaired the work are banned, on every row; its vendor is banned only where vendorExclusions names it. Checked at dispatch.", "The lane, login and vendor that wrote the work are banned; checked at dispatch."),
  facts("OC1"),
  "neverAuthor does not say the author's model is banned",
);

breaks(
  "a single-root freshness check that ignores the tree digest is rejected",
  "skills/xez-onboard-opinionated/kit/checks/lib/common.sh",
  (s) => s.replace(`  [ "$(cat "$stamp" 2>/dev/null)" = "$(printf '%s\\ncontents=%s' "$fp" "$digest")" ] || return 1\n`, ""),
  deps("53-single"),
  "single root stale: one package folder replaced inside node_modules",
);

breaks(
  "a single-root digest that counts its own stamp file is rejected",
  DEPS_MJS,
  (s) => s.replace("      if (!rel && name === skipTop) continue;\n", ""),
  deps("53-single"),
  "single root digest: installed and stamped is fresh",
);

breaks(
  "onboarding that writes version unknown again is rejected",
  "skills/xez-onboard-opinionated/references/write.md",
  (s) => s.replace("for an install between releases – never `unknown`:", "for an install between releases, or `unknown` when the install names neither:"),
  facts("OC1"),
  "still allows version",
);

breaks(
  "an onboarding version literal that differs from package.json is rejected",
  "skills/xez-onboard-opinionated/references/write.md",
  (s) => s.replace(/then `version` — the collection release the kit came from \(`[^`]+`/, "then `version` — the collection release the kit came from (`0.0.1`"),
  facts("OC1"),
  "the manifest version literal an installer copy writes is \"0.0.1\"",
);
// 3.1.0-stream-OC:end

// --- #122: the gate on native Windows -----------------------------------------
// Each guard below was written for Windows, and each break reproduces a defect that is not
// Windows-only, so it fires on the Linux nightly too.
// 122-windows:start
breaks(
  "a link check whose skills scan matches nothing is rejected",
  "scripts/check-links.mjs",
  (s) => s.replace('rel.startsWith("skills/")', 'rel.startsWith("skills\\\\")'),
  () => script("check-links.mjs"),
  "proved nothing",
);

breaks(
  "a review-run.sh that runs bash.exe or a Windows path to bash is rejected",
  "skills/xez-onboard-opinionated/kit/checks/review-run.sh",
  (s) => s.replace(
    "  base=\"$(printf '%s' \"$program\" | LC_ALL=C tr '\\134A-Z' '/a-z')\"\n  base=\"${base##*/}\"\n  case \"$base\" in *.exe | *.cmd | *.bat | *.com) base=\"${base%.*}\" ;; esac\n",
    "  base=\"${program##*/}\"\n",
  ),
  catalog("D-review"),
  'review-run.sh runs "bash.exe',
);

breaks(
  "a Git Bash resolver that takes bash.exe from PATH is rejected",
  "scripts/lib/platform.mjs",
  (s) => s.replace(
    "  const root = findGitRoot({ env, exists });\n",
    '  const fromPath = pathEntries(env).map((dir) => win.join(dir, "bash.exe")).find((file) => exists(file));\n  if (fromPath) return fromPath;\n  const root = findGitRoot({ env, exists });\n',
  ),
  () => script("test-platform.mjs"),
  "picked WSL's bash.exe",
);

breaks(
  "a lint that counts description bytes is rejected",
  "scripts/lint.sh",
  (s) => s.replace('desc_len=$(desc_chars "$fm_desc")', "desc_len=${#fm_desc}"),
  () => script("test-onboarding-content.mjs"),
  "a 500-character description in a multibyte script is rejected in the C locale",
);

// #123: lint finds in bulk – one stream of every file, each hit mapped back to its file by line
// counts – and reports per file. A join that hands a file's last line to the next file loses a
// hit on that line whenever the file has no final newline.
breaks(
  "a bulk pass that gives a file's last line to the next file is rejected",
  "scripts/lint.sh",
  (s) => s.replace("while (p <= n && !(ln <= last[p])) p++", "while (p <= n && !(ln < last[p])) p++"),
  () => script("test-onboarding-content.mjs"),
  "bulk pass lost the last line of",
);

// The frontmatter check reads a skill twice over: the bulk pass, and the per-skill reads it hands a
// skill with a CR to. Per-skill reads that drift – here, a body counted in lines – change the
// report of such a skill only, so only twin skills that differ by a CR can show it.
breaks(
  "per-skill frontmatter reads that drift from the bulk pass are rejected",
  "scripts/lint.sh",
  (s) => s.replace(
    `body_chars=$(awk 'f{print} /^---$/{c++; if(c==2) f=1}' "$file" | wc -c)`,
    `body_chars=$(awk 'f{print} /^---$/{c++; if(c==2) f=1}' "$file" | wc -l)`,
  ),
  () => script("test-onboarding-content.mjs"),
  "per-skill frontmatter reads disagree with the bulk pass",
);

// The role-skills bulk pass and role_part split a role skill at one marker. A bulk split that
// misses it never flags a tail, so a hit there goes unreported.
breaks(
  "a role-skills bulk pass that splits a role skill apart from role_part is rejected",
  "scripts/lint.sh",
  (s) => s.replace("if (line == marker) tail = 1", 'if (line == marker " ") tail = 1'),
  () => script("test-onboarding-content.mjs"),
  "role-skills bulk pass lost the tail hit",
);

// lint.sh's targeted mode (`--only`, `--files`) is what test-onboarding-content runs on. Each break
// puts a defect in a listed file and asks for the check that owns it, so a targeted run that skips
// the check, drops the file, or reads a typo as "run nothing" passes the defect and fails here.
const lintTargeted = (...args) => () => run(bashPath(), ["scripts/lint.sh", ...args]);

breaks(
  "a targeted lint that skips the per-file check it was asked for is rejected",
  "skills/xez-fix/SKILL.md",
  (s) => `${s}\n\nBranch from develop before you start.\n`,
  lintTargeted("--only", "portability", "--files", "skills/xez-fix/SKILL.md"),
  "forbidden pattern",
);

breaks(
  "a targeted lint that leaves out the skill owning a listed file is rejected",
  "skills/xez-fix/SKILL.md",
  (s) => s.replace(/^name: xez-fix$/m, "name: xez-repair"),
  lintTargeted("--only", "frontmatter", "--files", "skills/xez-fix/references/rules.md"),
  "does not match directory",
);

breaks(
  "a targeted lint that greps none of the listed files is rejected",
  "skills/xez-fix/SKILL.md",
  (s) => `${s}\n\nWhen the change is large, hand it to the xez-mega-refactor skill.\n`,
  lintTargeted("--only", "names", "--files", "skills/xez-fix/SKILL.md"),
  "which is not a skill in this collection",
);

breaks(
  "a targeted lint that reads an unknown check as nothing to run is rejected",
  "skills/xez-fix/SKILL.md",
  (s) => `${s}\n\nBranch from develop before you start.\n`,
  lintTargeted("--only", "portabilty", "--files", "skills/xez-fix/SKILL.md"),
  "unknown check 'portabilty'",
);

breaks(
  "a targeted lint that skips a listed file it cannot find is rejected",
  "skills/xez-fix/SKILL.md",
  (s) => `${s}\n\nBranch from develop before you start.\n`,
  lintTargeted("--only", "portability", "--files", "skills/xez-fix/SKIL.md"),
  "not a file in this repository",
);

breaks(
  "a catalog check that reads CRLF files as they are is rejected",
  "skills/xez-onboard-opinionated/kit/checks/catalog-check.mjs",
  (s) => s.replace('const readText = (path) => readFileSync(path, "utf8").replace(/\\r\\n/g, "\\n");', 'const readText = (path) => readFileSync(path, "utf8");'),
  catalog("1"),
  "checked out with CRLF line endings",
);

breaks(
  "a shared-block sync that reads CRLF files as they are is rejected",
  "scripts/sync-shared-blocks.mjs",
  (s) => s.replace('const readText = (path) => toLF(readFileSync(path, "utf8"));', 'const readText = (path) => readFileSync(path, "utf8");'),
  () => script("test-shared-blocks.mjs"),
  "a CRLF copy",
);

breaks(
  "a kit index that hashes CRLF bytes is rejected",
  "upgrade/tools/lib/hash.mjs",
  (s) => s.replace("  if (buf.subarray(0, 8000).includes(0) || !buf.includes(13)) return buf;\n", "  return buf;\n"),
  upgrade("2"),
  "a CRLF copy of an unchanged kit file",
);

breaks(
  "a drift check that hashes CRLF bytes is rejected",
  "skills/xez-onboard-opinionated/kit/checks/manifest-drift.mjs",
  (s) => s.replace('const lf = raw.subarray(0, 8000).includes(0) ? raw : Buffer.from(raw.toString("latin1").replaceAll("\\r\\n", "\\n"), "latin1");', "const lf = raw;"),
  catalog("U"),
  "a CRLF checkout of an unchanged file",
);

breaks(
  "a kit path check that reads a Git for Windows path as relative is rejected",
  "skills/xez-onboard-opinionated/kit/checks/lib/common.sh",
  (s) => s.replace('    msys* | cygwin*) case "$1" in [A-Za-z]:/*) return 0 ;; esac ;;\n', ""),
  facts("W-shell"),
  "reads a Git for Windows path",
);

breaks(
  "a kit path check that reads C:/ as absolute outside Git Bash is rejected",
  "skills/xez-onboard-opinionated/kit/checks/lib/common.sh",
  (s) => s.replace(
    '  case "${OSTYPE:-}" in\n    msys* | cygwin*) case "$1" in [A-Za-z]:/*) return 0 ;; esac ;;\n  esac\n',
    '  case "$1" in [A-Za-z]:/*) return 0 ;; esac\n',
  ),
  facts("W-shell"),
  "as absolute outside Git Bash",
);

breaks(
  "a kit that lets Git Bash rewrite a base-branch file argument is rejected",
  "skills/xez-onboard-opinionated/kit/checks/lib/common.sh",
  (s) => s.replace('      *) export MSYS2_ARG_CONV_EXCL="origin/;refs/${MSYS2_ARG_CONV_EXCL:+;$MSYS2_ARG_CONV_EXCL}" ;;\n', ""),
  facts("W-shell"),
  "lets Git Bash rewrite",
);

breaks(
  "a kit Git Bash resolver that takes bash.exe from PATH is rejected",
  "skills/xez-onboard-opinionated/kit/checks/lib/windows-process.mjs",
  (s) => s.replace(
    "return candidates.find(isGitBashRoot) ?? null;",
    "return pathEntries(env).find((dir) => exists(win.join(dir, 'bash.exe'))) ?? candidates.find(isGitBashRoot) ?? null;",
  ),
  () => script("test-platform.mjs"),
  "the kit's Git Bash resolver disagrees",
);

breaks(
  "a Windows tree stop that ignores start times is rejected",
  "skills/xez-onboard-opinionated/kit/checks/lib/windows-process.mjs",
  (s) => s.replace("row.startedAt !== undefined && row.startedAt >= root.spawnedAt - SPAWN_CLOCK_SLACK_MS && row.startedAt <= root.stoppedAt", "row.startedAt !== undefined"),
  facts("W-stop"),
  "reused the pid",
);

breaks(
  "a Windows tree stop that ignores the MSYS process group is rejected",
  "skills/xez-onboard-opinionated/kit/checks/lib/windows-process.mjs",
  (s) => s.replace("row.pgid === msysPid", "false"),
  facts("W-stop"),
  "whose parent already exited",
);

breaks(
  "a gate scheduler that never reaps a finished gate is rejected",
  "skills/xez-onboard-opinionated/kit/checks/lib/gate-parallel.mjs",
  (s) => s.replace("if (pid) { await reap(pid); groups.delete(pid); }", "if (pid) { groups.delete(pid); }"),
  facts("W-scheduler"),
  "left a finished gate's processes running",
);

breaks(
  "a gate scheduler that stops nothing on an interrupt is rejected",
  "skills/xez-onboard-opinionated/kit/checks/lib/gate-parallel.mjs",
  (s) => s.replace("function signal(pid, kind) {", "function signal(pid, kind) { return;"),
  facts("W-scheduler"),
  "did not stop its gates on an interrupt",
);

breaks(
  "a leader launcher that takes any pipe a marker names is rejected",
  "skills/xez-onboard-opinionated/kit/scripts/xezar-leader.sh",
  (s) => s.replace("    return PIPE_NAME.test(name) ? { file, name, mtime: stat.mtimeMs } : null;\n", "    return { file, name, mtime: stat.mtimeMs };\n"),
  catalog("10"),
  "accepts a marker that names another program's pipe",
);

breaks(
  "a leader launcher that takes a stale pipe marker for a running engine is rejected",
  "skills/xez-onboard-opinionated/kit/scripts/xezar-leader.sh",
  (s) => s.replace('    client.once("error", () => settle(false));\n', '    client.once("error", () => settle(true));\n'),
  catalog("10"),
  "accepts a stale pipe marker",
);

breaks(
  "a cross-platform CI job that no longer runs the whole gate is rejected",
  ".github/workflows/lint.yml",
  (s) => s.replace("        run: node scripts/run-gate.mjs\n", "        run: node scripts/test-kit-catalog.mjs\n"),
  () => script("test-browser-providers.mjs"),
  "the cross-platform job must run the whole gate",
);

breaks(
  "a required lint job moved off ubuntu is rejected",
  ".github/workflows/lint.yml",
  (s) => s.replace("  lint:\n    runs-on: ubuntu-latest\n", "  lint:\n    runs-on: windows-latest\n"),
  () => script("test-browser-providers.mjs"),
  "the `lint` job must run on ubuntu-latest",
);

breaks(
  "a Git tools env that leaves Git's Perl script folders (shasum) off PATH is rejected",
  "scripts/lib/platform.mjs",
  (s) => s.replace('  if (perlDirs.length) next = envSet(next, "PATH", [envGet(next, "PATH", platform), ...perlDirs].join(";"), platform);\n', ""),
  () => script("test-platform.mjs"),
  "withGitTools leaves Git's Perl script folders (shasum) off PATH",
);

breaks(
  "a review-run.sh that runs a Windows shell or launcher is rejected",
  "skills/xez-onboard-opinionated/kit/checks/review-run.sh",
  (s) => s.replace(' nice cmd powershell pwsh wsl winpty git-bash ', ' nice '),
  catalog("D-review"),
  'review-run.sh runs the Windows launcher "',
);

breaks(
  "a review-run.sh that runs start, mintty or git-cmd is rejected",
  "skills/xez-onboard-opinionated/kit/checks/review-run.sh",
  (s) => s.replace(' git-bash start mintty git-cmd"\n', ' git-bash"\n'),
  catalog("D-review"),
  'review-run.sh runs the Windows launcher "C:/no-such-dir/START"',
);

breaks(
  "a Windows reap that reads an empty ps as the end of a worker whose MSYS pid is unknown is rejected",
  "skills/xez-onboard-opinionated/kit/checks/lib/windows-process.mjs",
  (s) => s.replace("if (!killRoot && knowsGroup && psText !== null", "if (!killRoot && psText !== null"),
  facts("W-stop"),
  "a reap whose worker left no MSYS pid",
);

breaks(
  "a gate worker env that takes a bare program name from the working folder is rejected",
  "skills/xez-onboard-opinionated/kit/checks/lib/windows-process.mjs",
  (s) => s.replace("  next.NoDefaultCurrentDirectoryInExePath = '1';\n", ""),
  facts("W-stop"),
  "the gate workers' env lets a bare program name resolve from the working folder",
);

breaks(
  "a kit noglob env that drifts from scripts/lib/platform.mjs is rejected",
  "skills/xez-onboard-opinionated/kit/checks/lib/windows-process.mjs",
  (s) => s.replace("? `${msys} noglob` :", "? msys :"),
  () => script("test-platform.mjs"),
  "the kit's MSYS quoting, noglob env and Git Bash message agree",
);

breaks(
  "a leader launcher that reads pipe markers outside Git Bash is rejected",
  "skills/xez-onboard-opinionated/kit/scripts/xezar-leader.sh",
  (s) => s.replace("    msys* | cygwin*)\n", "    *)\n"),
  catalog("10"),
  "reads a pipe marker outside Windows",
);

breaks(
  "a Git Bash start that leaves its command line to libuv's quoting is rejected",
  "scripts/lib/platform.mjs",
  (s) => s.replace("  return [file, args.map(msysQuote), { ...options, env, windowsVerbatimArguments: true, argv0: msysQuote(file) }];\n", "  return [file, args, { ...options, env }];\n"),
  () => script("test-platform.mjs"),
  "msysSpawnArgs quotes every argument for MSYS on win32",
);

breaks(
  "a run-bash.mjs that loses the script's exit code is rejected",
  "scripts/run-bash.mjs",
  (s) => s.replace("process.exit(result.status ?? 1);", "process.exit(result.status === 0 ? 0 : 1);"),
  () => script("test-platform.mjs"),
  "run-bash.mjs passes a script's arguments and exit code through",
);

breaks(
  "a run-gate.mjs that stops at the first failing command is rejected",
  "scripts/lib/gate-runner.mjs",
  (s) => s.replace("      results[index] = await start(tasks[index], laneIndex);\n", "      results[index] = await start(tasks[index], laneIndex);\n      if (results[index].exit !== 0) next = shared.length;\n"),
  () => script("test-platform.mjs"),
  "run-gate.mjs runs every command, reports each exit code",
);

breaks(
  "an upgrade planner that reads UPGRADE_NOTES.md with CRLF line endings as it is is rejected",
  "upgrade/tools/plan.mjs",
  (s) => s.replace('sources.push(["UPGRADE_NOTES.md", lfText(readFileSync(notes)).toString("utf8")]);', 'sources.push(["UPGRADE_NOTES.md", readFileSync(notes, "utf8")]);'),
  upgrade("10f"),
  "a CRLF UPGRADE_NOTES.md gives",
);

breaks(
  "an upgrade planner that ignores a manifest digest of raw CRLF bytes is rejected",
  "upgrade/tools/detect.mjs",
  (s) => s.replace("  return recorded === sha256(mine.text) || recorded === mine.rawSha256;\n", "  return recorded === sha256(mine.text);\n"),
  upgrade("4b"),
  "a manifest that recorded the raw CRLF bytes of an unchanged file plans",
);

// #122 run 2: the kit runtime on native Windows. Each break below fires on Linux too: the Windows
// rules are pure functions, OSTYPE-injected shell, a CRLF jq emulator, or a fact about the text.
breaks(
  "a program finder that ignores PATHEXT is rejected",
  "skills/xez-onboard-opinionated/kit/checks/lib/windows-programs.mjs",
  (s) => s.replace("const file = win.join(dir, `${name}${ext}`);", "const file = win.join(dir, name);"),
  () => script("test-platform.mjs"),
  "claude.exe",
);

breaks(
  "a .cmd launch that lets a cmd.exe metacharacter through is rejected",
  "skills/xez-onboard-opinionated/kit/checks/lib/windows-programs.mjs",
  (s) => s.replace("  if (unsafeForCmd(file, args)) throw refusal(", "  if (false) throw refusal("),
  () => script("test-platform.mjs"),
  "a .cmd launch with a cmd.exe metacharacter",
);

breaks(
  "a .cmd launch that lets cmd.exe search the working folder is rejected",
  "skills/xez-onboard-opinionated/kit/checks/lib/windows-programs.mjs",
  (s) => s.replace("  next.NoDefaultCurrentDirectoryInExePath = '1';\n", ""),
  () => script("test-platform.mjs"),
  "searches the working folder",
);

breaks(
  "a router that looks for claude without its extension on Windows is rejected",
  "skills/xez-onboard-opinionated/kit/checks/route.mjs",
  (s) => s.replace("    if (windows) {\n      if (windows.findProgram(program, { env })) found.add(program);\n      continue;\n    }\n", ""),
  catalog("122-route"),
  "the claude program on Windows",
);

breaks(
  "a deps.mjs that starts a unit's tool by bare name is rejected",
  "skills/xez-onboard-opinionated/kit/checks/lib/deps.mjs",
  (s) => s.replace("    const r = start(plan.tool, plan.args, ", "    const r = spawnSync(plan.tool, plan.args, "),
  facts("W3"),
  "starts a unit's tool without start()",
);

breaks(
  "a node pin that ignores nvm-windows is rejected",
  "skills/xez-onboard-opinionated/kit/checks/lib/deps.mjs",
  (s) => s.replace('  ...(process.env.NVM_HOME && isAbsolute(process.env.NVM_HOME) ? [{ dir: process.env.NVM_HOME, bin: "" }] : []),\n', ""),
  deps("node-pin"),
  "nvm-windows",
);

breaks(
  "a documented-output that starts a bare bash on Windows is rejected",
  "skills/xez-onboard-opinionated/kit/checks/documented-output.mjs",
  (s) => s.replace("const BASH = WINDOWS ? WINDOWS.gitBash() : 'bash';", "const BASH = WINDOWS ? \"bash\" : 'bash';"),
  facts("W4"),
  "WSL's bash",
);

breaks(
  "a digest helper with no sha256sum fallback is rejected",
  "skills/xez-onboard-opinionated/kit/checks/lib/common.sh",
  (s) => s.replace('else sha256sum "$@"; fi; }', 'else shasum -a 256 "$@"; fi; }'),
  facts("W5"),
  "without shasum",
);

breaks(
  "a worktree check that compares /c/… with C:/… as text is rejected",
  "skills/xez-onboard-opinionated/kit/checks/lib/common.sh",
  (s) => s.replace(
    "      git -C \"$2\" worktree list --porcelain 2>/dev/null | sed -n 's/^worktree \\(.\\)/\\1/p' |\n        cygpath -m -f - 2>/dev/null | LC_ALL=C tr 'A-Z' 'a-z' | grep -xF -- \"$want\" >/dev/null\n",
    "      git -C \"$2\" worktree list --porcelain 2>/dev/null | grep -qxF \"worktree $1\"\n",
  ),
  facts("W6"),
  "/c/… and C:/…",
);

breaks(
  "a worktree check that lists a tree cygpath could not convert is rejected",
  "skills/xez-onboard-opinionated/kit/checks/lib/common.sh",
  (s) => s.replace("      want=\"$(cygpath -m -- \"$1\" 2>/dev/null)\" && [ -n \"$want\" ] || return 1\n", "      want=\"$(cygpath -m -- \"$1\" 2>/dev/null)\"\n"),
  facts("W6"),
  "cygpath failed",
);

breaks(
  "a gh-write.sh that keeps a CRLF jq's CR in a label is rejected",
  "skills/xez-onboard-opinionated/kit/checks/gh-write.sh",
  (s) => s.replace("done < <(jq -r '(.add // [])[]' <<<\"$request\" | drop_jq_cr)", "done < <(jq -r '(.add // [])[]' <<<\"$request\")"),
  catalog("1b"),
  "\"risk-low\" under a CRLF jq",
);

breaks(
  "a gh-write.sh body read that loses or adds a CR is rejected",
  "skills/xez-onboard-opinionated/kit/checks/gh-write.sh",
  (s) => s.replace("json_body=\"$(jq_string_bytes '.body' <<<\"$request\")\"", "json_body=\"$(jq -r '.body' <<<\"$request\")\""),
  catalog("1b"),
  "a comment body with a CR inside",
);

breaks(
  "a verdict-write.sh that writes jq's CRLF into evidence is rejected",
  "skills/xez-onboard-opinionated/kit/checks/verdict-write.sh",
  (s) => s.replace("evidence \"$(jq -r '.name' <<<\"$request\" | drop_jq_cr)\" < <(jq_string_bytes '.text' <<<\"$request\")", "evidence \"$(jq -r '.name' <<<\"$request\" | drop_jq_cr)\" < <(jq -j '.text' <<<\"$request\")"),
  catalog("1b"),
  "evidence text under a CRLF jq",
);

breaks(
  "a skill list read that keeps jq's CR is rejected",
  "skills/xez-maintain-deps/references/agentic-setup.md",
  (s) => s.replace("\"$CONFIG\" 2>/dev/null | tr -d '\\r')", "\"$CONFIG\" 2>/dev/null)"),
  () => script("test-platform.mjs"),
  "keeps jq's CR in a list read",
);

breaks(
  "a descriptor that writes a fixed /tmp file is rejected",
  "skills/xez-setup-agent-pipeline/references/trackers/github.md",
  (s) => s.replace("base64 < \"$img\" | tr -d '\\n' > \"$B64\"", "base64 < \"$img\" | tr -d '\\n' > /tmp/ev-content.b64"),
  () => script("test-platform.mjs"),
  "fixed /tmp",
);

breaks(
  "an onboarding that leaves a kit script non-executable is rejected",
  "skills/xez-onboard-opinionated/references/write.md",
  (s) => s.replace("  .xezar/checks/push-check.sh \\\n", ""),
  facts("W10"),
  "not marked executable",
);

breaks(
  "an applier that does not name executable files is rejected",
  "upgrade/tools/apply.mjs",
  (s) => s.replace("  for (const p of r.executable ?? []) console.log(`executable=${p}`);\n", ""),
  upgrade("4c"),
  "executable=",
);

breaks(
  "a Codex trust line with a basic-string Windows key is rejected",
  "skills/xez-onboard-opinionated/references/write.md",
  (s) => s.replace(/ \*\*On native Windows the\n {2}key is the project's Windows path[\s\S]*?\]`\.\*\*/, ""),
  facts("W11"),
  "literal-string key",
);

breaks(
  "a kit that still accepts Node 20 is rejected",
  "skills/xez-onboard-opinionated/kit/checks/worktree-setup.sh",
  (s) => s.replace("    if (major < 22) {\n", "    if (major < 20) {\n"),
  facts("W12"),
  "Node 22",
);

// QG-8 fix round (F1, F4, F5, F7, F8).
breaks(
  "a Windows start that runs a tool it could not find is rejected",
  "skills/xez-onboard-opinionated/kit/checks/lib/windows-programs.mjs",
  (s) => s.replace("  if (!found) return { error: Object.assign(new Error(`spawnSync ${tool} ENOENT`), { code: 'ENOENT' }) };", "  if (!found) return { file: tool, args: [...args], options: {} };"),
  () => script("test-platform.mjs"),
  "started by bare name",
);

breaks(
  "a cmd.exe path built from a SystemRoot with a metacharacter is rejected",
  "skills/xez-onboard-opinionated/kit/checks/lib/windows-programs.mjs",
  (s) => s.replace(" || CMD_UNSAFE_PATH.test(systemRoot) || systemRoot.includes('/')", ""),
  () => script("test-platform.mjs"),
  "SystemRoot",
);

breaks(
  "a jq CR step that also runs off Windows is rejected",
  "skills/xez-onboard-opinionated/kit/checks/lib/common.sh",
  (s) => s.replace("*) cat ;; esac; }", "*) tr -d '\\r' ;; esac; }"),
  facts("W7"),
  "off Windows",
);

breaks(
  "a worktree check that stops reading a long list early is rejected",
  "skills/xez-onboard-opinionated/kit/checks/lib/common.sh",
  (s) => s.replace("| grep -xF -- \"$want\" >/dev/null\n", "| grep -qxF -- \"$want\"\n"),
  facts("W6"),
  "long worktree list",
);

breaks(
  "an applier that writes a 0644 kit file as executable is rejected",
  "upgrade/tools/lib/context.mjs",
  (s) => s.replace("m[1] === \"100755\" ? 0o755 : 0o644", "m[1] === \"100755\" ? 0o755 : 0o755"),
  upgrade("4c"),
  "records .xezar/checks/lib/windows-programs.mjs as 100755",
);
// 122-windows:end

// 123-sections:start
// #123: the four sectioned scripts run one section at a time for these cases, so every rule that
// keeps a filter honest is broken here once (scripts/lib/sections.mjs).
const FACTS_MJS = "scripts/test-kit-facts.mjs";
const UPGRADE_MJS = "scripts/test-upgrade.mjs";
const DEPS_UNITS_MJS = "scripts/test-deps-units.mjs";

breaks(
  "an unknown section id is refused, not run as nothing",
  FACTS_MJS,
  (s) => s.replace('"W11", "W12",\n];', '"W11", "W12x",\n];').replace('if (S.section("W12")) {', 'if (S.section("W12x")) {'),
  facts("W12"),
  "unknown check 'W12'",
);

breaks(
  "a block gated by an undeclared id is refused",
  "scripts/test-kit-catalog.mjs",
  (s) => s.replace('if (S.section("4")) {', 'if (S.section("4x")) {'),
  catalog("3"),
  "section '4x' is not declared",
);

breaks(
  "a declared section that never runs is refused",
  UPGRADE_MJS,
  (s) => s.replace('if (S.section("13a")) {', "if (false) {"),
  upgrade(),
  "section 13a never ran",
);

breaks(
  "a filter that selects a section that runs nothing is refused",
  FACTS_MJS,
  (s) => s.replace('if (S.section("W11")) {', 'if (false && S.section("W11")) {'),
  facts("W11"),
  "which ran no check",
);

breaks(
  "a catalog filter that selects a section that runs nothing is refused",
  "scripts/test-kit-catalog.mjs",
  (s) => s.replace('if (S.section("4")) {', 'if (false && S.section("4")) {'),
  catalog("4"),
  "the filter selected 4, which ran no check",
);

breaks(
  "a deps-units filter that selects a group that runs nothing is refused",
  DEPS_UNITS_MJS,
  (s) => s.replace('if (S.section("skip")) {', 'if (false && S.section("skip")) {'),
  deps("skip"),
  "the filter selected skip, which ran no check",
);

breaks(
  "a selected section whose checks no longer run is refused, not passed as checked",
  UPGRADE_MJS,
  (s) => s.replace("  expect(f?.class === \"local-only\" && f.stops.includes(\"weakens-safety-check\"),", "  false && expect(f?.class === \"local-only\" && f.stops.includes(\"weakens-safety-check\"),"),
  upgrade("5h"),
  "the filter selected 5h, which made no check",
);

breaks(
  "an XEZ_DEPS_TEST_ONLY value it does not know is refused",
  DEPS_UNITS_MJS,
  (s) => s.replace('if (ONLY !== "" && ONLY !== "53") {', 'if (ONLY !== "" && ONLY !== "#53") {'),
  depsOnly53,
  "XEZ_DEPS_TEST_ONLY must be empty or",
);

// The skip group would catch this defect; asked for beside XEZ_DEPS_TEST_ONLY=53, it would never
// run (the #53 filter ends the run first), so the pair is refused instead of passing in silence.
breaks(
  "XEZ_DEPS_TEST_ONLY beside --only is refused, one filter at a time",
  "skills/xez-onboard-opinionated/kit/checks/lib/gate-results.mjs",
  (s) => s.replace("permittedSkipNames(installGate).has(command.name)", "permittedSkipNames(command.name).has(command.name)"),
  () => run("node", [DEPS_UNITS_MJS, "--only", "skip"], { env: { ...process.env, XEZ_DEPS_TEST_ONLY: "53" } }),
  "use one filter at a time",
);

breaks(
  "a section that reads §3's installs without needing §3 is refused",
  UPGRADE_MJS,
  (s) => s.replace('"12b": ["3"], ', ""),
  upgrade("12b"),
  "needs section '3', which did not run",
);

breaks(
  "a deps-units freshness group that runs without the units group is refused",
  DEPS_UNITS_MJS,
  (s) => s.replace('needs: { freshness: ["units"] },', "needs: {},"),
  deps("freshness"),
  "needs section 'units', which did not run",
);
// 123-sections:end

// 123-parallel:start
// #123: the gate runs its commands in parallel (scripts/lib/gate-runner.mjs), and this suite runs
// its cases in private copies of the tree (scripts/lib/tree-copy.mjs). One break per rule that
// keeps either honest; the run-gate case above breaks the shared scheduler for both job counts.
const GATE_RUNNER = "scripts/lib/gate-runner.mjs";
const TREE_COPY = "scripts/lib/tree-copy.mjs";

breaks(
  "a parallel gate that prints output as commands finish is rejected",
  GATE_RUNNER,
  (s) => s.replace("      slot.done = true;\n      flush();\n", "      slot.done = true;\n      printSlot(slot, grouped);\n"),
  () => script("test-platform.mjs"),
  "prints each command's output in config order",
);

breaks(
  "a pool that runs an exclusive task beside another is rejected",
  GATE_RUNNER,
  (s) => s.replace("(exclusive(task) ? alone : shared).push(index)", "shared.push(index)"),
  () => script("test-platform.mjs"),
  "an exclusive task overlapped",
);

breaks(
  "a gate that passes a narrowing variable to its commands is rejected",
  GATE_RUNNER,
  (s) => s.replace('const NARROWING = (key) => key === "XEZ_DEPS_TEST_ONLY" || key.startsWith("XEZ_SECTIONS_");', 'const NARROWING = (key) => key.startsWith("XEZ_SECTIONS_");'),
  () => script("test-platform.mjs"),
  "a narrowing variable reached a gate command",
);

breaks(
  "a tree copy that drops untracked files is rejected",
  TREE_COPY,
  (s) => s.replace('["ls-files", "-m", "-o", "--exclude-standard", "-z"]', '["ls-files", "-m", "--exclude-standard", "-z"]'),
  () => script("test-platform.mjs"),
  "the copy lacks an untracked file",
);

breaks(
  "a tree copy that keeps HEAD's index instead of the user's is rejected",
  TREE_COPY,
  (s) => s.replace('"--detach", "--no-checkout", dest', '"--detach", dest').replace('  if (entries.length) git(dest, ["update-index"', '  if (false) git(dest, ["update-index"'),
  () => script("test-platform.mjs"),
  "the copy's index differs",
);

breaks(
  "a containment check that lets a path out is rejected",
  TREE_COPY,
  (s) => s.replace("export function assertInside(base, path) {\n", "export function assertInside(base, path) {\n  return;\n"),
  () => script("test-platform.mjs"),
  "accepted a path outside",
);

breaks(
  "a shared-block test that edits the checkout is rejected",
  "scripts/test-shared-blocks.mjs",
  (s) => s.replace('const VICTIM = join(work, "skills"', 'const VICTIM = join(root, "skills"'),
  () => script("test-shared-blocks.mjs"),
  "would edit the checkout",
);

breaks(
  "a tree copy that writes outside its base is rejected",
  TREE_COPY,
  (s) => s.replace("  assertInside(base, path);\n  writeFileSync(path, data);\n", "  writeFileSync(path, data);\n"),
  () => script("test-platform.mjs"),
  "writeInside wrote outside",
);

breaks(
  "a tree removal that follows a link is rejected",
  TREE_COPY,
  (s) => s.replace("  if (isLink(dest)) throw new Error(", "  if (false) throw new Error("),
  () => script("test-platform.mjs"),
  "removeTree did not refuse the link",
);

breaks(
  "a stale-copy sweep that removes a live run's copies is rejected",
  TREE_COPY,
  (s) => s.replace("const isStale = (pid) => pid === process.pid || !isAlive(pid);", "const isStale = () => true;"),
  () => script("test-platform.mjs"),
  "removed a copy whose run is still alive",
);

breaks(
  "a guard worker that starts in the checkout is rejected",
  "scripts/test-guards.mjs",
  (s) => s.replace("real(given) === real(checkout) || isInside(checkout, given) || isInside(given, checkout)", "false"),
  () => script("test-platform.mjs"),
  "test-guards.mjs did not refuse --worker",
);

// A case must reach a sectioned script as scripts/<name>, or the lookup of its exclusive sections
// misses it and the case runs beside the others.
breaks(
  "a case that reaches a sectioned script another way is rejected",
  "scripts/test-guards.mjs",
  (s) => s.replace('const catalog = (...ids) => () => script("test-kit-catalog.mjs", ...only(ids));', 'const catalog = (...ids) => () => run("node", ["./scripts/test-kit-catalog.mjs", ...only(ids)]);'),
  () => script("test-guards.mjs", "--list"),
  "or its exclusive sections go unseen",
);

breaks(
  "a review-run.sh finish that stops nothing it started is rejected",
  "skills/xez-onboard-opinionated/kit/checks/review-run.sh",
  (s) => s.replace('    [ $# -eq 0 ] || usage\n    for pidfile in "$state"/*.pid; do [ -e "$pidfile" ] && stop_one "$pidfile"; done\n    verify_unchanged', '    [ $# -eq 0 ] || usage\n    verify_unchanged'),
  catalog("D-review"),
  "leaves a started command running",
);
// 123-parallel:end

// --- the runner ---------------------------------------------------------------
// A case's gate called with the recorder in place of `run`: nothing starts and nothing is written.
function recordGate(c) {
  const calls = [];
  recorder = (call) => {
    calls.push(call);
    return { code: 0, out: "" };
  };
  try {
    c.gate();
  } finally {
    recorder = null;
  }
  return calls;
}

/** Each sectioned script's declarations, from `node <script> --sections`, which runs no section. */
function readSections() {
  return Object.fromEntries(SECTIONED.map((name) => {
    const out = execFileSync("node", [join(checkout, "scripts", name), "--sections"], { cwd: checkout, encoding: "utf8" });
    return [`scripts/${name}`, JSON.parse(out)];
  }));
}

/**
 * The exclusive sections a case's recorded gate runs, as "<script> <id>: <reason>"; none → [].
 * Throws when the gate reaches a sectioned script in any form but `node scripts/<name>` (a
 * ./ prefix, an absolute path, a shell line): the lookup would miss its exclusive sections.
 */
function exclusiveOf(calls, declared) {
  const found = [];
  for (const { argv, args } of calls) {
    const words = [argv.split(" ")[0], ...args.map(String)];
    for (const name of SECTIONED) {
      const other = words.find((word, i) => word.includes(name) && !(i === 1 && words[0] === "node" && word === `scripts/${name}`));
      if (other !== undefined) {
        throw new Error(`its gate reaches ${name} as '${other}'; start it as scripts/${name} (script() or a section helper), or its exclusive sections go unseen`);
      }
    }
    const decl = declared[args[0]];
    if (!decl) continue;
    const { selected, error } = parseOnly(args.slice(1), decl.ids, decl.needs ?? {});
    if (error) continue; // the gate refuses it with exit 2: nothing of it runs
    for (const id of selected ?? decl.ids) {
      if (Object.hasOwn(decl.exclusive ?? {}, id)) found.push(`${decl.script} ${id}: ${decl.exclusive[id]}`);
    }
  }
  return found;
}

/** Each case's recorded gate calls and exclusive sections; exits 1 naming every case whose gate cannot be read. */
function readCases(declared) {
  const refused = [];
  const read = CASES.map((c, index) => {
    const calls = recordGate(c);
    try {
      return { calls, exclusive: exclusiveOf(calls, declared) };
    } catch (error) {
      refused.push(`test-guards: case #${index + 1} (${c.name}): ${error.message}`);
      return null;
    }
  });
  if (refused.length) {
    for (const line of refused) console.error(line);
    process.exit(1);
  }
  return read;
}

if (LIST) {
  const read = readCases(readSections());
  CASES.forEach((c, index) => {
    const { calls, exclusive: sections } = read[index];
    const envKeys = new Set();
    for (const { options } of calls) {
      for (const [key, value] of Object.entries(options.env ?? {})) if (process.env[key] !== value) envKeys.add(key);
    }
    const exclusive = sections.map((line) => line.split(":")[0]);
    const columns = [index + 1, calls.map((call) => call.argv).join(" && "), [...envKeys].sort().join(",") || "-", c.file, c.name];
    console.log([...columns, exclusive.join(", ") || "-"].join("\t"));
  });
  process.exit(0);
}

const gitStatus = (cwd) => execFileSync("git", ["--no-optional-locks", "-C", cwd, "status", "--porcelain"], { encoding: "utf8" });

// --- worker: runs the cases the parent sends, one at a time, in its own copy ---------------------
if (workerRoot !== null) {
  const statusAtStart = gitStatus(root);
  process.on("message", (message) => {
    if (message.done) {
      const status = gitStatus(root);
      process.send({ tree: status === statusAtStart, status }, () => process.disconnect());
      return;
    }
    gateCommands = [];
    const started = performance.now();
    let failure;
    try {
      failure = runCase(CASES[message.index]);
    } catch (error) {
      failure = `the case could not run: ${error.message}`;
    }
    const gate = gateCommands.join(" && ") || "(no command)";
    gateCommands = null;
    process.send({ index: message.index, failure, gate, seconds: (performance.now() - started) / 1000 });
  });
  process.send({ ready: true });
}

/**
 * Forks the worker for one copy. request(index) runs a case; finish() returns its tree report.
 * A worker is lost when its channel closes or the process ends without answering: both come only
 * after every message it sent has arrived, so a last answer is never mistaken for a death.
 */
function startWorker(copy, number) {
  const child = fork(THIS_FILE, ["--worker", copy], { stdio: ["ignore", "inherit", "inherit", "ipc"], ...TREE_SPAWN });
  let pending = null;
  let lost = null;
  let markReady;
  const ready = new Promise((resolve, reject) => { markReady = { resolve, reject }; });
  const exited = new Promise((resolve) => child.once("close", resolve));
  const fail = (error) => {
    lost ??= error;
    markReady.reject(error);
    const waiting = pending;
    pending = null;
    waiting?.reject(new Error(`${error.message} while running ${waiting.what}`));
  };
  child.on("message", (message) => {
    if (message.ready) return markReady.resolve();
    const waiting = pending;
    pending = null;
    waiting?.resolve(message);
  });
  child.on("error", fail);
  child.once("disconnect", () => fail(new Error(`worker ${number} closed its channel`)));
  child.once("close", (code, signal) => fail(new Error(`worker ${number} exited (${signal ?? `code ${code}`})`)));
  const ask = (message, what) => new Promise((resolve, reject) => {
    if (lost) return reject(new Error(`${lost.message} before running ${what}`));
    pending = { resolve, reject, what };
    child.send(message);
  });
  return { child, ready, exited, request: (index) => ask({ index }, `case #${index + 1}`), finish: () => ask({ done: true }, "its tree check") };
}

/** The worker count: `--workers N`, else XEZ_GUARD_WORKERS, else min(4, CPUs). */
function workerCount() {
  if (workersFlag !== null) return workersFlag;
  const fromEnv = process.env.XEZ_GUARD_WORKERS ?? "";
  if (fromEnv === "") return Math.min(4, availableParallelism());
  if (!validCount(fromEnv)) usage(`XEZ_GUARD_WORKERS takes ${COUNT_RANGE}`);
  return Number(fromEnv);
}

/** Runs every case on the workers; resolves { results, trees } – results in case order. */
async function runOnWorkers(pool, tasks) {
  await Promise.all(pool.map((worker) => worker.ready));
  const results = await runPool(tasks, {
    jobs: pool.length,
    start: (task, lane) => pool[lane].request(task.index),
    exclusive: (task) => task.exclusive.length > 0,
  });
  const trees = [];
  for (const worker of pool) trees.push(await worker.finish());
  await Promise.all(pool.map((worker) => worker.exited));
  return { results, trees };
}

/** The tree assertion: every copy as it started, and the checkout as it was. Returns the failures. */
function treeFailures(trees, statusBefore) {
  const failed = [];
  trees.forEach((tree, k) => {
    if (!tree.tree) failed.push(`FAIL  a mutation was not restored in the copy of worker ${k + 1}; its \`git status --porcelain\` ended as:\n${tree.status}`);
  });
  if (gitStatus(checkout) !== statusBefore) {
    failed.push(
      "FAIL  the checkout's `git status` changed during the run.\n" +
      "      The suite never writes there: either a gate wrote outside its copy, or the checkout was edited while the suite ran.",
    );
  }
  return failed;
}

/** Where the time went: per gate command (cases, total seconds), the ten slowest cases, the exclusive ones. */
function printTimings(results, tasks) {
  const perGate = new Map();
  for (const r of results) {
    const g = perGate.get(r.gate) ?? { cases: 0, seconds: 0 };
    perGate.set(r.gate, { cases: g.cases + 1, seconds: g.seconds + r.seconds });
  }
  const s = (seconds) => seconds.toFixed(1).padStart(8);
  console.log("Seconds per gate (total s, cases, gate):");
  for (const [gate, g] of [...perGate].sort((a, b) => b[1].seconds - a[1].seconds)) {
    console.log(`  ${s(g.seconds)}  ${String(g.cases).padStart(4)}  ${gate}`);
  }
  console.log("Slowest cases (s, index, name):");
  for (const r of [...results].sort((a, b) => b.seconds - a.seconds).slice(0, 10)) {
    console.log(`  ${s(r.seconds)}  #${String(r.index + 1).padEnd(4)} ${CASES[r.index].name}`);
  }
  const alone = tasks.filter((task) => task.exclusive.length);
  console.log(`Exclusive cases (${alone.length}; run last, one at a time, every other worker idle):`);
  for (const task of alone) console.log(`  #${String(task.index + 1).padEnd(4)} ${CASES[task.index].name} – ${task.exclusive.join("; ")}`);
}

/** The parent: copies, workers, the run, the report. */
async function runSuite() {
  const workers = workerCount();
  const declared = readSections();
  const tasks = readCases(declared).map(({ exclusive }, index) => ({ index, exclusive }));
  const statusBefore = gitStatus(checkout);
  let home = null; // this run's private folder: every copy is made inside it
  const copies = [];
  const pool = [];
  const cleanUp = () => {
    for (const worker of pool) killTree(worker.child); // with every gate it started; a no-op once it has exited
    for (const copy of copies) {
      try {
        removeTree(checkout, home, copy);
      } catch (error) {
        console.error(`test-guards: could not remove the copy ${copy} (${error.message}); the next run removes it`);
      }
    }
    copies.length = 0;
    if (!home) return;
    try {
      rmSync(home, { recursive: true, force: true, maxRetries: 3 });
    } catch (error) {
      console.error(`test-guards: could not remove ${home} (${error.message}); the next run removes it`);
    }
    home = null;
  };
  for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => { cleanUp(); process.exit(130); });
  const began = performance.now();
  let outcome;
  try {
    removeStaleCopies(checkout, tempRoot(), "guards-");
    home = mkdtempSync(join(tempRoot(), `guards-${process.pid}-`));
    for (let k = 0; k < workers; k += 1) {
      const copy = join(home, `guards-${process.pid}-${k}`);
      copies.push(copy); // before it exists: a copy that fails half-made is still removed
      copyTree(checkout, copy);
      pool.push(startWorker(copy, k + 1));
    }
    console.log(`test-guards: ${CASES.length} cases on ${workers} worker(s), each in a private copy; ${tasks.filter((t) => t.exclusive.length).length} exclusive cases run last, alone.`);
    outcome = await runOnWorkers(pool, tasks);
  } catch (error) {
    cleanUp();
    console.error(`test-guards: ${error.message} – the run stopped`);
    process.exit(1);
  }
  cleanUp();
  const wall = (performance.now() - began) / 1000;
  return { ...outcome, tasks, workers, wall, treeFailed: treeFailures(outcome.trees, statusBefore) };
}

if (workerRoot === null) {
  const { results, tasks, workers, wall, treeFailed } = await runSuite();
  const asserts = CASES.length + 1; // one per case, plus the tree assertion (copies and checkout)
  const caseFailures = results.filter((r) => r.failure);
  for (const r of caseFailures) console.error(`FAIL  ${CASES[r.index].name}\n      ${r.failure}`);
  for (const line of treeFailed) console.error(line);
  printTimings(results, tasks);
  console.log(`Ran ${CASES.length} cases on ${workers} worker(s); wall time ${wall.toFixed(0)} s.`);
  const failures = caseFailures.length + (treeFailed.length ? 1 : 0);
  if (failures) {
    console.error(`\nguards: ${failures} of ${asserts} guards did not catch their defect`);
    process.exitCode = 1;
  } else {
    console.log(`Guard suite OK (${asserts} deliberate defects, each caught by the guard that owns it).`);
  }
}
