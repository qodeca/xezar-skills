#!/usr/bin/env node
// Runs every validation command, one at a time, and prints one table of the results (#122).
//
// The list is read from `.xezar/pipeline/config.json` → validation.commands at run time, so this
// runner cannot drift from the gate: the cross-platform CI job runs it, and so can a contributor
// on any OS (`npm run gate` works from PowerShell and cmd.exe too). Each command runs in bash –
// on Windows Git Bash, never WSL's bash.exe – with Git's tools first on PATH. Every command runs
// even after one fails, so one run reports every failure (DECISIONS.md → "Report every gate
// failure at once"). Exit 1 when any command did not exit 0.
//
// Run: node scripts/run-gate.mjs

import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { requireGitBash, withGitTools } from "./lib/platform.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const config = JSON.parse(readFileSync(join(root, ".xezar/pipeline/config.json"), "utf8"));
const commands = config.validation?.commands ?? [];
if (!Array.isArray(commands) || commands.length === 0) {
  console.error("run-gate: .xezar/pipeline/config.json has no validation.commands to run");
  process.exit(1);
}

const bash = requireGitBash();
const env = withGitTools(process.env);
const grouped = process.env.GITHUB_ACTIONS === "true";
const rows = [];

for (const [index, command] of commands.entries()) {
  if (grouped) console.log(`::group::${command}`);
  const started = Date.now();
  const result = spawnSync(bash, ["-c", command], { cwd: root, stdio: "inherit", env });
  const seconds = Math.round((Date.now() - started) / 1000);
  if (result.error) console.error(`run-gate: ${command}: ${result.error.message}`);
  const exit = result.status ?? (result.signal ? result.signal : 1);
  if (grouped) console.log("::endgroup::");
  rows.push({ number: index + 1, command, exit, seconds });
}

const cell = (text) => String(text).replaceAll("|", "\\|");
console.log("\n| # | command | exit | seconds |\n|---|---|---|---|");
for (const row of rows) console.log(`| ${row.number} | \`${cell(row.command)}\` | ${row.exit} | ${row.seconds} |`);

const failed = rows.filter((row) => row.exit !== 0);
const total = rows.reduce((sum, row) => sum + row.seconds, 0);
console.log(`\n${rows.length - failed.length} of ${rows.length} gate commands passed in ${total} s.`);
process.exit(failed.length ? 1 : 0);
