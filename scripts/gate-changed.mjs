#!/usr/bin/env node
// The quick local check (T0, #123): runs what this branch's changes can affect, and everything
// when unsure. Never a gate result – `npm run gate` (T1) runs every command in full, and so does CI.
// The first and the last line say so, whatever happens in between – an error main() throws too.
//
// What runs: the commands scripts/gate-map.json lists as `always`, the commands its rules map from
// the changed paths, and lint on the changed files – the whole of lint after a deletion, for a name
// that is not a plain one, for more names than a command line holds, or when everything is
// selected. Everything runs when the changed files cannot be computed (no origin/<baseBranch> here,
// for example), when a path matches the map's `everything` list (scripts/lint.sh, scripts/lib/**,
// …), holds a control character or is mapped by no rule, or when the map cannot be used. The
// changed files are those since the merge-base of HEAD and origin/<baseBranch>: committed, staged,
// unstaged, and untracked files that are not ignored; a rename counts both of its paths.
// scripts/check-gate-map.mjs, a gate command, checks the map and the selection.
//
// The commands run as `npm run gate` runs them (scripts/lib/gate-runner.mjs): up to `--jobs N` at
// once (else XEZ_GATE_JOBS, else the smaller of 4 and the CPU count), output in list order, each
// one in full, the same table at the end. Exit 1 when a selected command failed, nothing could
// run or an error was thrown (printed on stderr), 2 on a usage error.
//
// Run: node scripts/gate-changed.mjs [--jobs N]     (npm run gate:changed)

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { bashPath, GIT_BASH_MISSING } from "./lib/platform.mjs";
import { jobCount, runGate } from "./lib/gate-runner.mjs";
import { changedFiles, FULL_LINT, isPlainFile, lintTask, readMap, selectSafely } from "./lib/gate-select.mjs";

const FIRST_LINE = "gate:changed (T0) – a quick check of what this branch changed. Never a gate result: run npm run gate before you push.";
const LAST_LINE = "Never a gate result – this ran only what the changes can affect; npm run gate is the gate.";

/** Runs T0; resolves with the exit code. */
async function main() {
  const { jobs, error: usageError } = jobCount(process.argv.slice(2), process.env);
  if (usageError) {
    console.error(`gate-changed: ${usageError}`);
    return 2;
  }
  const root = join(dirname(fileURLToPath(import.meta.url)), "..");
  let config;
  try {
    config = JSON.parse(readFileSync(join(root, ".xezar/pipeline/config.json"), "utf8"));
  } catch (error) {
    console.error(`gate-changed: .xezar/pipeline/config.json could not be read: ${error.message}`);
    return 1;
  }
  const commands = config.validation?.commands ?? [];
  if (!Array.isArray(commands) || commands.length === 0) {
    console.error("gate-changed: .xezar/pipeline/config.json has no validation.commands to run");
    return 1;
  }
  try {
    bashPath(); // Git Bash, before anything starts
  } catch (error) {
    if (error.code !== "GIT_BASH_MISSING") throw error;
    console.error(GIT_BASH_MISSING);
    return 1;
  }

  const { changes, error: changeError } = changedFiles(root, config.baseBranch);
  const selection = selectSafely(changes, () => readMap(root), commands, changeError);
  console.log(changes === null ? "Changed files: unknown." : `Changed files: ${changes.length}.`);
  for (const reason of selection.reasons) console.log(`  - ${reason}`);
  console.log(`Selected ${selection.commands.length} of ${commands.length} commands.`);

  const isFile = (path) => isPlainFile(root, path);
  const tasks = selection.commands.map((command) => (command === FULL_LINT ? lintTask(changes, isFile, selection) : command));
  const grouped = process.env.GITHUB_ACTIONS === "true";
  const { rows, wall } = await runGate(tasks, { root, jobs, env: process.env, grouped });

  const cell = (text) => String(text).replaceAll("|", "\\|");
  console.log("\n| # | command | exit | seconds |\n|---|---|---|---|");
  for (const row of rows) console.log(`| ${row.number} | \`${cell(row.command)}\` | ${row.exit} | ${row.seconds} |`);
  const failed = rows.filter((row) => row.exit !== 0);
  const total = rows.reduce((sum, row) => sum + row.seconds, 0);
  console.log(`\n${rows.length - failed.length} of ${rows.length} selected commands passed in ${total} s.`);
  if (jobs > 1) console.log(`Ran with ${jobs} jobs; wall time ${wall} s.`);
  return failed.length ? 1 : 0;
}

console.log(FIRST_LINE);
let code = 1;
try {
  code = await main();
} catch (error) {
  // Not a usage error: something failed that main() does not handle. Say what, then the last line.
  console.error(`gate-changed: ${error?.stack ?? error}`);
  code = 1;
} finally {
  console.log(LAST_LINE);
  // exitCode, not exit(): the commands' buffered output may still be on its way to a pipe.
  process.exitCode = code;
}
