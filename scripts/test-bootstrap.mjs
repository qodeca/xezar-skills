#!/usr/bin/env node
// Behavioural test for the kit bootstrap (`kit/checks/lib/bootstrap.mjs`).
//
// The rule it protects: a task gets only kit files the base branch holds. The primary checkout
// lags after a kit PR merges, so a task forked from the newer base carries kit files that differ
// from the primary's copy. Those are kept, because they are the fork base's own blobs. A kit file
// the branch itself changed is refused, and so is every differing file when the fork base cannot
// be found – the bootstrap fails closed.
//
// Each case builds real repositories in a temp dir: a bare origin, a primary clone that lags, and
// a task worktree where the engine puts one.
//
// Run: node scripts/test-bootstrap.mjs

import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, copyFileSync, rmSync, realpathSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { bashPath } from "./lib/platform.mjs";
import { prepareTestPlatform, tempRoot } from "./lib/test-harness.mjs";

prepareTestPlatform();

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const KIT = join(root, "skills", "xez-onboard-opinionated", "kit");

let failures = 0;
let asserts = 0;
const expect = (name, ok, detail) => {
  asserts += 1;
  if (!ok) { failures += 1; console.error(`FAIL  ${name}\n      ${detail}`); }
};

const git = (cwd, ...args) =>
  execFileSync("git", ["-c", "user.name=t", "-c", "user.email=t@example.com", "-c", "init.defaultBranch=main", ...args], { cwd, encoding: "utf8", stdio: "pipe" }).trim();
const write = (file, text) => { mkdirSync(dirname(file), { recursive: true }); writeFileSync(file, text); };

const lab = realpathSync(mkdtempSync(join(tempRoot(), "kit-bootstrap-")));
try {
  // origin holds the kit at v1; the primary clones it, then origin moves on to v2 without it.
  git(lab, "init", "--quiet", "--bare", "origin.git");
  git(lab, "clone", "--quiet", "origin.git", "primary");
  const primary = join(lab, "primary");
  write(join(primary, ".xezar/config.json"), '{"baseBranch":"main"}\n');
  write(join(primary, ".xezar/checks/repo-gates.sh"), "echo v1\n");
  copyFileSync(join(KIT, "checks/bootstrap.sh"), join(primary, ".xezar/checks/bootstrap.sh"));
  mkdirSync(join(primary, ".xezar/checks/lib"));
  copyFileSync(join(KIT, "checks/lib/bootstrap.mjs"), join(primary, ".xezar/checks/lib/bootstrap.mjs"));
  write(join(primary, ".gitignore"), ".local/\n");
  git(primary, "add", "-A");
  git(primary, "commit", "--quiet", "-m", "kit v1");
  git(primary, "push", "--quiet", "origin", "HEAD:main");
  git(lab, "clone", "--quiet", "origin.git", "other");
  write(join(lab, "other/.xezar/checks/repo-gates.sh"), "echo v2\n");
  git(join(lab, "other"), "commit", "--quiet", "-am", "kit v2");
  git(join(lab, "other"), "push", "--quiet", "origin", "HEAD:main");
  git(primary, "fetch", "--quiet", "origin");

  const task = (run) => {
    const dir = join(primary, ".local/xezar/worktrees", run);
    git(primary, "worktree", "add", "--quiet", "-b", `xez/${run.slice(0, 8)}`, dir, "origin/main");
    return dir;
  };
  const bootstrap = (cwd) => {
    const env = { ...process.env };
    delete env.XEZ_TASK_ID;
    try {
      return { code: 0, out: execFileSync(bashPath(), [join(primary, ".xezar/checks/bootstrap.sh")], { cwd, env, encoding: "utf8", stdio: "pipe" }) };
    } catch (err) {
      return { code: err.status ?? -1, out: (err.stdout ?? "") + (err.stderr ?? "") };
    }
  };

  // 1. The primary lags: the task's v2 is the fork base's blob, so it is kept.
  const lagging = bootstrap(task("aaaaaaaa-lagging"));
  expect("a kit file that equals the fork base is kept while the primary lags", lagging.code === 0 && lagging.out.includes("(1 kept at the fork base)"),
    `exit ${lagging.code}: ${lagging.out.trim()}`);

  // 1b. The review's own scripts (D13): every kit step copies the PRIMARY's checks/ outside the
  // tracked tree, so a later checkout of a PR head cannot change what a review runs. A re-run (a
  // resumed task) writes them again, over whatever is there.
  const lagTask = join(primary, ".local/xezar/worktrees/aaaaaaaa-lagging");
  const reviewCopy = join(lagTask, ".local/xezar/cache/kit/checks/repo-gates.sh");
  const copied = () => { try { return readFileSync(reviewCopy, "utf8"); } catch { return "(missing)"; } };
  expect("the kit step copies the primary's checks/ for the review", lagging.out.includes("REVIEW TOOLS:") && copied() === "echo v1\n",
    `copy holds ${JSON.stringify(copied())}: ${lagging.out.trim()}`);
  write(reviewCopy, "echo tampered\n");
  const again = bootstrap(lagTask);
  expect("a re-run kit step writes the review's scripts again", again.code === 0 && again.out.includes("KIT REUSED") && copied() === "echo v1\n",
    `exit ${again.code}, copy holds ${JSON.stringify(copied())}: ${again.out.trim()}`);

  // 2. The branch changed a kit file itself: refused.
  const edited = task("bbbbbbbb-edited");
  write(join(edited, ".xezar/checks/repo-gates.sh"), "echo branch\n");
  git(edited, "commit", "--quiet", "-am", "branch edits the gate");
  const refused = bootstrap(edited);
  expect("a kit file the branch committed itself is refused", refused.code !== 0 && refused.out.includes("existing task asset differs: checks/repo-gates.sh"),
    `exit ${refused.code}: ${refused.out.trim()}`);

  // 3. No fork base (the configured base is not on origin): refused, never kept.
  write(join(primary, ".xezar/config.json"), '{"baseBranch":"trunk"}\n');
  const closed = bootstrap(task("cccccccc-nobase"));
  expect("with no reachable fork base a differing kit file is refused", closed.code !== 0 && closed.out.includes("existing task asset differs: checks/repo-gates.sh"),
    `exit ${closed.code}: ${closed.out.trim()}`);
} finally {
  rmSync(lab, { recursive: true, force: true });
}

if (failures) {
  console.error(`\nbootstrap: ${failures} of ${asserts} assertions failed`);
  process.exit(1);
}
console.log(`Kit bootstrap OK (${asserts} cases: a lagging primary is kept, the review's scripts are the primary's on every run, a branch edit and a missing fork base are refused).`);
