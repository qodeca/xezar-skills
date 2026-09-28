#!/usr/bin/env node
// Runs a bash script with the right bash on every platform (#122), so `npm run lint` works from
// PowerShell and cmd.exe too. Windows: Git Bash (never WSL's bash.exe) with Git's tools first on
// PATH; a missing Git Bash is one line and exit 1. Linux and macOS: plain `bash <script>`.
//
// Run: node scripts/run-bash.mjs <script> [args...]

import { spawnSync } from "node:child_process";
import { requireGitBash, withGitTools } from "./lib/platform.mjs";

const argv = process.argv.slice(2);
if (argv.length === 0) {
  console.error("usage: node scripts/run-bash.mjs <script> [args...]");
  process.exit(2);
}

const result = spawnSync(requireGitBash(), argv, { stdio: "inherit", env: withGitTools(process.env) });
if (result.error) {
  console.error(`run-bash: ${result.error.message}`);
  process.exit(1);
}
process.exit(result.status ?? 1);
