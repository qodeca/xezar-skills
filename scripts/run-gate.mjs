#!/usr/bin/env node
// Runs every validation command and prints one table of the results (#122, #123).
//
// The list is read from `.xezar/pipeline/config.json` → validation.commands at run time, so this
// runner cannot drift from the gate: the cross-platform CI job runs it, and so can a contributor
// on any OS (`npm run gate` works from PowerShell and cmd.exe too). Each command runs in bash –
// on Windows Git Bash, never WSL's bash.exe – with Git's tools first on PATH. Every command runs
// even after one fails, so one run reports every failure (DECISIONS.md → "Report every gate
// failure at once"). The gate always runs every command in full: a variable that narrows a test
// (XEZ_DEPS_TEST_ONLY, XEZ_SECTIONS_*) is removed from the commands' environment. Exit 1 when any
// command did not exit 0.
//
// Commands run on up to `--jobs N` lanes at once (1–32; else XEZ_GATE_JOBS; else the smaller of 4
// and this machine's CPU count). With more than one, each command's output is held back until the
// commands before it have finished, then printed in config order, and a last line gives the jobs
// and the wall time. `--jobs 1` runs one command at a time, its output straight to the terminal.
//
// Run: node scripts/run-gate.mjs [--jobs N]

import { readFileSync } from "node:fs";
import { availableParallelism } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { requireGitBash } from "./lib/platform.mjs";
import { runGate } from "./lib/gate-runner.mjs";

const JOBS_RANGE = "a whole number from 1 to 32";

/** The job count: `--jobs N`, else XEZ_GATE_JOBS, else min(4, CPUs). A usage error exits 2. */
function jobCount(argv, env) {
  const usage = (message) => {
    console.error(`run-gate: ${message}`);
    process.exit(2);
  };
  const valid = (value) => /^\d+$/.test(value) && Number(value) >= 1 && Number(value) <= 32;
  let flag = null;
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] !== "--jobs") usage(`unknown option '${argv[i]}'`);
    flag = argv[(i += 1)] ?? "";
    if (!valid(flag)) usage(`--jobs takes ${JOBS_RANGE}`);
  }
  if (flag !== null) return Number(flag);
  const fromEnv = env.XEZ_GATE_JOBS ?? "";
  if (fromEnv === "") return Math.min(4, availableParallelism());
  if (!valid(fromEnv)) usage(`XEZ_GATE_JOBS takes ${JOBS_RANGE}`);
  return Number(fromEnv);
}

const jobs = jobCount(process.argv.slice(2), process.env);
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const config = JSON.parse(readFileSync(join(root, ".xezar/pipeline/config.json"), "utf8"));
const commands = config.validation?.commands ?? [];
if (!Array.isArray(commands) || commands.length === 0) {
  console.error("run-gate: .xezar/pipeline/config.json has no validation.commands to run");
  process.exit(1);
}

requireGitBash(); // a missing Git Bash: one stderr line and exit 1, before withGitTools needs it
const grouped = process.env.GITHUB_ACTIONS === "true";
const { rows, wall } = await runGate(commands, { root, jobs, env: process.env, grouped });

const cell = (text) => String(text).replaceAll("|", "\\|");
console.log("\n| # | command | exit | seconds |\n|---|---|---|---|");
for (const row of rows) console.log(`| ${row.number} | \`${cell(row.command)}\` | ${row.exit} | ${row.seconds} |`);

const failed = rows.filter((row) => row.exit !== 0);
const total = rows.reduce((sum, row) => sum + row.seconds, 0);
console.log(`\n${rows.length - failed.length} of ${rows.length} gate commands passed in ${total} s.`);
if (jobs > 1) console.log(`Ran with ${jobs} jobs; wall time ${wall} s.`);
// exitCode, not exit(): the commands' buffered output may still be on its way to a pipe.
process.exitCode = failed.length ? 1 : 0;
