#!/usr/bin/env node
// Scratch proof tool for #123 L2 W2.9 (never committed). For one sectioned script in a checkout:
// one full run and one run per section id alone, each with XEZ_SECTIONS_TRACE. Compares each
// section's check count alone with its count in the full run (scripts that give `count`), checks
// that no check runs outside a section, and records exit code and seconds per run.
// Usage: node sections-alone.mjs <checkout> <script.mjs> <outdir> [--ids a,b] [--no-full]
import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, writeFileSync, appendFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { performance } from "node:perf_hooks";

const [checkoutArg, script, outArg, ...rest] = process.argv.slice(2);
const checkout = resolve(checkoutArg);
const out = resolve(outArg);
mkdirSync(out, { recursive: true });
const opt = (name) => { const i = rest.indexOf(name); return i === -1 ? null : rest[i + 1]; };
const decl = JSON.parse(spawnSync(process.execPath, [join("scripts", script), "--sections"], { cwd: checkout, encoding: "utf8" }).stdout);
const ids = opt("--ids") ? opt("--ids").split(",") : decl.ids;
const report = join(out, `${script}.tsv`);

function runOnce(label, args) {
  const trace = join(out, `${script}.${label}.trace`);
  rmSync(trace, { force: true });
  const t0 = performance.now();
  const r = spawnSync(process.execPath, [join("scripts", script), ...args], {
    cwd: checkout, encoding: "utf8", maxBuffer: 256 << 20, env: { ...process.env, XEZ_SECTIONS_TRACE: trace },
  });
  const seconds = (performance.now() - t0) / 1000;
  writeFileSync(join(out, `${script}.${label}.out`), (r.stdout ?? "") + "\n--- stderr ---\n" + (r.stderr ?? ""));
  let counts = null;
  try {
    for (const line of readFileSync(trace, "utf8").trim().split("\n")) {
      const j = JSON.parse(line);
      if (j.counts) counts = j.counts;
    }
  } catch {}
  return { code: r.status, seconds, counts, stdout: r.stdout ?? "" };
}

let full = null;
if (!rest.includes("--no-full")) {
  full = runOnce("full", []);
  writeFileSync(join(out, `${script}.full.json`), JSON.stringify(full.counts));
  appendFileSync(report, `full\t${full.code}\t${full.seconds.toFixed(1)}\t${JSON.stringify(full.counts)}\n`);
  console.log(`full: rc=${full.code} ${full.seconds.toFixed(1)} s outside=${full.counts?.["(outside)"] ?? "-"}`);
} else {
  try { full = { counts: JSON.parse(readFileSync(join(out, `${script}.full.json`), "utf8")) }; } catch {}
}
let mismatches = 0;
for (const id of ids) {
  const r = runOnce(`only-${id}`, ["--only", id]);
  const notes = [];
  if (r.code !== 0) notes.push(`rc=${r.code}`);
  if (!/OK for a targeted run/.test(r.stdout)) notes.push("no targeted line");
  if (r.counts) {
    if ((r.counts["(outside)"] ?? 0) !== 0) notes.push(`outside=${r.counts["(outside)"]}`);
    for (const [k, n] of Object.entries(r.counts)) {
      if (k === "(outside)") continue;
      const f = full?.counts?.[k];
      if (f !== undefined && f !== n) notes.push(`${k}: alone ${n} vs full ${f}`);
    }
  }
  if (notes.length) mismatches += 1;
  const line = `${id}\t${r.code}\t${r.seconds.toFixed(1)}\t${r.counts ? r.counts[id] : "-"}\t${full?.counts?.[id] ?? "-"}\t${notes.join("; ") || "ok"}`;
  appendFileSync(report, `${line}\n`);
  console.log(line);
}
console.log(`${script}: ${ids.length} ids alone, ${mismatches} with a difference`);
process.exit(mismatches || (full && full.code !== undefined && full.code !== 0) ? 1 : 0);
