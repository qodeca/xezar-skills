#!/usr/bin/env node
// Proof tool for #123 L5 (never committed; CI copy: tmp-123/before-after.mjs). Times the heavy
// tests in two checkouts – before L5 and after it – and compares their output.
//
//   node before-after.mjs <before> <after> <log-dir> [--runs N] [--scripts a,b] [--groups]
//     --runs N      runs per checkout and script, alternating before/after (default 1)
//     --scripts     any of facts,catalog,upgrade,deps (default all four)
//     --groups      also every deps-units group alone and XEZ_DEPS_TEST_ONLY=53, in both checkouts
//     --groups-after  the same, but every group alone in the after checkout only
//
// Per run: exit code, wall seconds, when the last output arrived and the tail after it (a
// referenced timer keeps Node running after its last line). Outputs are compared after
// normalising durations and temp names; every deps-units run must name as many assertions as the
// first before-run (181 on Windows, 180 on Linux and macOS, #123 proof run 37245584471). Exit 0
// when every run passed and every after-output equals its before-output.
import { spawn } from "node:child_process";
import { availableParallelism, cpus } from "node:os";
import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { performance } from "node:perf_hooks";

const argv = process.argv.slice(2);
const opt = (name, fallback) => (argv.includes(name) ? argv[argv.indexOf(name) + 1] : fallback);
const [beforeArg, afterArg, logArg] = argv;
const checkouts = { before: resolve(beforeArg), after: resolve(afterArg) };
const logDir = resolve(logArg);
mkdirSync(logDir, { recursive: true });
const runs = Number(opt("--runs", "1"));
const SCRIPTS = { facts: "test-kit-facts.mjs", catalog: "test-kit-catalog.mjs", upgrade: "test-upgrade.mjs", deps: "test-deps-units.mjs" };
const chosen = opt("--scripts", "facts,catalog,upgrade,deps").split(",");
const GROUPS = ["53-tree", "53-single", "single-root", "units", "freshness", "base-branch", "refusals", "yarn2", "solution",
  "node-pin", "odd-folder", "skip", "gates-write", "real-tools"];
// The deps-units summary's assertion count, or null when the run printed none.
const assertionsIn = (stdout) => /OK \((\d+) assertions/.exec(stdout)?.[1] ?? null;
let depsCount = null; // the first before-run's count: the platform's own

function timed(label, cwd, args, env = {}) {
  return new Promise((done) => {
    const t0 = performance.now();
    let last = t0;
    let stdout = "";
    let stderr = "";
    const child = spawn(process.execPath, args, { cwd, env: { ...process.env, ...env }, stdio: ["ignore", "pipe", "pipe"] });
    child.stdout.on("data", (c) => { stdout += c; last = performance.now(); });
    child.stderr.on("data", (c) => { stderr += c; last = performance.now(); });
    child.on("close", (code) => {
      const end = performance.now();
      writeFileSync(join(logDir, `${label}.out`), `${stdout}\n--- stderr ---\n${stderr}`);
      done({ label, code, wall: (end - t0) / 1000, lastOutput: (last - t0) / 1000, tail: (end - last) / 1000, stdout, stderr });
    });
  });
}

// What legitimately differs between two runs: durations and temp names.
const normalise = (text) => text
  .replace(/\d+(\.\d+)?\s?(ms|s)\b/g, "N$2")
  .replace(/[A-Za-z0-9_.-]*-[A-Za-z0-9]{6}\b/g, "TMP")
  .replace(/\r\n/g, "\n");

const rows = [];
let bad = 0;
const note = (row, extra = "") => {
  rows.push(row);
  const line = `${row.label.padEnd(34)} exit ${row.code}  wall ${row.wall.toFixed(1).padStart(7)} s  last output ${row.lastOutput.toFixed(1).padStart(7)} s  tail ${row.tail.toFixed(1).padStart(6)} s${extra}`;
  console.log(line);
};
const compare = (a, b) => normalise(a.stdout) === normalise(b.stdout) && normalise(a.stderr) === normalise(b.stderr);

console.log(`before-after: CPUs ${availableParallelism()} (${cpus()[0]?.model ?? "?"}); Node ${process.version}; ${process.platform}`);
for (const key of chosen) {
  const script = join("scripts", SCRIPTS[key]);
  let reference = null;
  for (let k = 1; k <= runs; k += 1) {
    for (const side of ["before", "after"]) {
      const row = await timed(`${key}-${side}-${k}`, checkouts[side], [script]);
      let extra = "";
      if (row.code !== 0) { bad += 1; extra += "  FAILED"; }
      if (key === "deps") {
        const count = assertionsIn(row.stdout);
        if (side === "before") depsCount ??= count;
        if (count === null || count !== depsCount) { bad += 1; extra += `  ${count ?? "NO"} ASSERTIONS, NOT ${depsCount ?? "A COUNT"} AS BEFORE`; }
        else extra += `  ${count} assertions`;
      }
      if (side === "before") reference ??= row;
      else if (!compare(reference, row)) { bad += 1; extra += "  OUTPUT DIFFERS"; }
      note(row, extra);
    }
  }
}
if (argv.includes("--groups") || argv.includes("--groups-after")) {
  for (const side of argv.includes("--groups") ? ["before", "after"] : ["after"]) {
    let sum = 0;
    for (const id of GROUPS) {
      const row = await timed(`deps-${side}-only-${id}`, checkouts[side], [join("scripts", SCRIPTS.deps), "--only", id]);
      sum += row.wall;
      if (row.code !== 0) bad += 1;
      note(row, row.code !== 0 ? "  FAILED" : "");
    }
    console.log(`deps ${side}: the ${GROUPS.length} groups alone sum to ${sum.toFixed(1)} s`);
  }
  const pair = {};
  for (const side of ["before", "after"]) {
    pair[side] = await timed(`deps-${side}-53`, checkouts[side], [join("scripts", SCRIPTS.deps)], { XEZ_DEPS_TEST_ONLY: "53" });
    if (pair[side].code !== 0) bad += 1;
    note(pair[side], side === "after" && !compare(pair.before, pair.after) ? "  OUTPUT DIFFERS" : "");
  }
  if (!compare(pair.before, pair.after)) bad += 1;
}
writeFileSync(join(logDir, "rows.json"), JSON.stringify(rows.map(({ stdout, stderr, ...r }) => r), null, 2));
console.log(`before-after: ${bad ? `${bad} problem(s)` : "every run passed and every output equals its before-output"}`);
process.exit(bad ? 1 : 0);
