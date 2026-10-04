#!/usr/bin/env node
// Proof tool for #123 L3 (never committed; CI copy: tmp-123/gate-runs.mjs). Runs a checkout's gate
// (scripts/run-gate.mjs) several times and compares each run with a reference run.
//
//   node gate-runs.mjs <checkout> <log-dir> <reference-args> <runs> [run-args] [--env K=V]...
//     <reference-args>  run-gate options for the reference, e.g. "--jobs 1" ("" for the default)
//     <runs>            how many compared runs
//     [run-args]        run-gate options for each compared run ("" for the default)
//
// Every run's stdout and stderr go to <log-dir>/<label>.out and .err. A compared run passes when its
// exit code and its table's exit column equal the reference's, and – with --same-output – when its
// stdout and stderr, normalised (times, temp names, the table's seconds and the wall line), equal
// the reference's. Exit 0 when every run passes. Prints one line per run with its wall time.
import { spawnSync } from "node:child_process";
import { cpus, availableParallelism } from "node:os";
import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const argv = process.argv.slice(2);
const sameOutput = argv.includes("--same-output");
const envPairs = [];
const positional = [];
for (let i = 0; i < argv.length; i += 1) {
  if (argv[i] === "--env") envPairs.push(argv[(i += 1)]);
  else if (argv[i] !== "--same-output") positional.push(argv[i]);
}
const [checkoutArg, logDir, refArgs, runsArg, runArgs = ""] = positional;
const checkout = resolve(checkoutArg);
const runs = Number(runsArg);
mkdirSync(logDir, { recursive: true });
const extraEnv = Object.fromEntries(envPairs.map((pair) => [pair.slice(0, pair.indexOf("=")), pair.slice(pair.indexOf("=") + 1)]));
const split = (text) => text.split(" ").filter(Boolean);

function gate(label, args, env) {
  const started = Date.now();
  const r = spawnSync(process.execPath, ["scripts/run-gate.mjs", ...split(args)], {
    cwd: checkout, encoding: "utf8", maxBuffer: 1 << 30, env: { ...process.env, ...env },
  });
  const seconds = (Date.now() - started) / 1000;
  writeFileSync(join(logDir, `${label}.out`), r.stdout);
  writeFileSync(join(logDir, `${label}.err`), r.stderr);
  const exits = [...r.stdout.matchAll(/^\| (\d+) \| .* \| (\S+) \| (\d+) \|$/gm)].map((m) => m[2]);
  return { label, status: r.status, exits, seconds, stdout: r.stdout, stderr: r.stderr };
}

// Output that legitimately differs between two runs: durations, temp names, pids, the table's seconds.
const normalise = (text) => text
  .replace(/^\| (\d+) \| (.*) \| (\S+) \| \d+ \|$/gm, "| $1 | $2 | $3 | S |")
  .replace(/^\d+ of \d+ gate commands passed in \d+ s\.$/gm, (line) => line.replace(/in \d+ s/, "in S s"))
  .replace(/^Ran with \d+ jobs; wall time \d+ s\.\r?\n/gm, "")
  .replace(/\d+(\.\d+)?\s?(ms|s)\b/g, "N$2")
  .replace(/[A-Za-z0-9_.-]*-[A-Za-z0-9]{6}\b/g, "TMP")
  .replace(/\bpid[= ]\d+/gi, "pid=N");

console.log(`gate-runs: ${checkout}; CPUs ${availableParallelism()} (${cpus()[0]?.model ?? "?"}); env ${JSON.stringify(extraEnv)}`);
const reference = gate("reference", refArgs, {});
console.log(`reference (${refArgs || "default"}): exit ${reference.status}, exits [${reference.exits.join(" ")}], ${reference.seconds.toFixed(0)} s`);
let bad = 0;
for (let k = 1; k <= runs; k += 1) {
  const run = gate(`run-${k}`, runArgs, extraEnv);
  const sameExits = run.status === reference.status && run.exits.join(" ") === reference.exits.join(" ");
  const sameText = !sameOutput || (normalise(run.stdout) === normalise(reference.stdout) && normalise(run.stderr) === normalise(reference.stderr));
  if (!sameExits || !sameText) bad += 1;
  const wall = /^Ran with (\d+) jobs; wall time (\d+) s\.$/m.exec(run.stdout);
  console.log(`run ${k} (${runArgs || "default"}${wall ? `, ${wall[1]} jobs` : ""}): exit ${run.status}, exits [${run.exits.join(" ")}], ${run.seconds.toFixed(0)} s – ${sameExits ? "exit column equal" : "EXIT COLUMN DIFFERS"}${sameOutput ? (sameText ? ", output equal" : ", OUTPUT DIFFERS") : ""}`);
  if (sameOutput && !sameText) {
    for (const stream of ["stdout", "stderr"]) {
      const a = normalise(reference[stream]).split("\n");
      const b = normalise(run[stream]).split("\n");
      const at = a.findIndex((line, i) => line !== b[i]);
      if (at !== -1) console.log(`  first ${stream} difference at line ${at + 1}:\n    ref: ${a[at]}\n    run: ${b[at]}`);
    }
  }
}
console.log(`gate-runs: ${runs - bad} of ${runs} runs equal to the reference`);
process.exit(bad ? 1 : 0);
