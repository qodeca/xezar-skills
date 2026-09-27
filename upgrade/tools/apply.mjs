#!/usr/bin/env node
// apply.mjs – carry out the mechanical part of an upgrade plan (plan §6.5 step 4).
//
//   node upgrade/tools/apply.mjs --project <dir> [--plan <path>] [--target <version>]
//        [--blob-pack <f>]… [--index-dir <dir>] [--kit <skill dir>] [--help]
//
// Reads <project>/.local/xezar/scratch/upgrade/plan.json (from plan.mjs) and does only what
// it says; a file with a stop is only ever staged, never written – a write-theirs or delete
// held back by a stop stages mine and theirs, and prints held=<path> reason=<stop,…>:
//   write-theirs  write the target kit file, re-rendered with the file's placeholder values
//   delete        delete a file the kit removed, only when unchanged and in the base index
//   stage-merge   `git merge-file --zdiff3` of mine/base/theirs into the staging folder
//   stage-theirs  put the target kit file next to mine in the staging folder
// The staging folder is <project>/.local/xezar/scratch/upgrade/staged/<path>.{mine,base,theirs,merged};
// project files of those classes are left for Claude to resolve.
//
// Safety, checked for EVERY file before ANY write (so a refusal changes nothing):
//   - the path is repo-relative and normalised, not a symlink or under one, inside the project;
//   - it is in the copy map of the target (write) or of a base version (delete);
//   - it is not ignored by git (per-machine), and not an existing untracked file unless it
//     already holds the result;
//   - the file still has the content the plan saw, or already has the result (idempotent).
// Running apply twice changes nothing the second time.
//
// Output: NAME=value lines – applied=<path> op=<op>, done=<path>, staged=<path> merge=<exit>,
// held=<path> reason=<stop,…>, refused=<path> reason=<why>, and last apply-status=ok|refused.
// Exit: 0 ok; 3 refused (nothing written); 2 cannot run.

import { existsSync, mkdirSync, readFileSync, writeFileSync, rmSync, chmodSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import { execFileSync } from "node:child_process";
import { sha256 } from "./lib/hash.mjs";
import { loadContext, parseArgs, printHelp, SCRATCH } from "./lib/context.mjs";
import { detect } from "./detect.mjs";
import { inputsFor } from "./plan.mjs";
import { render } from "./lib/rewrites.mjs";
import { resolveInside, assertInCopyMap, PathRefused } from "./lib/paths.mjs";

const MECHANICAL = new Set(["write-theirs", "delete", "stage-merge", "stage-theirs"]);

function projectInputs(detection) {
  const values = new Map();
  const bad = new Set();
  for (const f of detection.files) {
    for (const [k, v] of Object.entries(f.base?.inputs ?? {})) {
      if (values.has(k) && values.get(k) !== v) bad.add(k);
      else values.set(k, v);
    }
  }
  for (const k of bad) values.delete(k);
  return Object.fromEntries(values);
}

function stageDir(ctx, path) {
  const rel = `${SCRATCH}/staged/${path}`;
  const full = resolveInside(ctx.project, rel);
  return { rel, full };
}

export function applyPlan(ctx, plan) {
  if (plan.planVersion !== 1) throw new Error(`plan version ${plan.planVersion} is not supported`);
  if (plan.target !== ctx.target) throw new Error(`plan is for ${plan.target}, this tool upgrades to ${ctx.target}`);
  const detection = detect(ctx);
  const det = new Map(detection.files.map((f) => [f.path, f]));
  const global = projectInputs(detection);
  const ops = [];
  const refused = [];
  const done = [];

  for (const item of plan.files) {
    // A stop holds back every write to the project: the file is staged instead (mine and
    // theirs), which is what Claude reads before it asks. Staging only fills the scratch folder.
    if (!MECHANICAL.has(item.action)) continue;
    const held = item.stops.length && !item.action.startsWith("stage-") ? item.stops.join(",") : null;
    const p = item.path;
    try {
      const full = resolveInside(ctx.project, p);
      if (item.action === "delete") assertInCopyMap(p, ...ctx.candidates);
      else assertInCopyMap(p, ctx.theirs);
      const exists = existsSync(full);
      if (ctx.git.isGit && ctx.git.ignored(p)) throw new PathRefused(p, "ignored by git: a per-machine file is never written");
      // An existing untracked file is somebody's uncommitted work, unless it already holds
      // exactly what this plan writes (a file an earlier, interrupted run added).
      const untracked = ctx.git.isGit && exists && !ctx.git.tracked(p);
      const f = det.get(p) ?? { path: p, base: {} };
      const current = exists ? sha256(readFileSync(full)) : null;
      const theirsRaw = ctx.theirsText(p);

      if (held === null && item.action === "write-theirs") {
        const r = render(theirsRaw, inputsFor(ctx, f, global));
        if (r.missing.length) throw new PathRefused(p, `placeholder values unknown: ${r.missing.join(", ")}`);
        const want = sha256(r.text);
        if (current === want) {
          done.push(p);
          continue;
        }
        if (untracked) throw new PathRefused(p, "untracked: never overwritten");
        if (current !== item.mineSha256) throw new PathRefused(p, "changed since the plan was made: re-run plan.mjs");
        ops.push({ op: "write", path: p, full, text: r.text, mode: exists ? null : ctx.theirsMode(p) });
      } else if (held === null && item.action === "delete") {
        if (current === null) {
          done.push(p);
          continue;
        }
        if (untracked) throw new PathRefused(p, "untracked: never deleted");
        if (current !== item.mineSha256) throw new PathRefused(p, "changed since the plan was made: re-run plan.mjs");
        ops.push({ op: "delete", path: p, full });
      } else {
        const source = item.renamedFrom ?? p;
        const mineFull = resolveInside(ctx.project, source);
        const mineText = existsSync(mineFull) ? readFileSync(mineFull, "utf8") : null;
        if (mineText === null && held === null) {
          done.push(p);
          continue;
        }
        if ((mineText === null ? null : sha256(mineText)) !== (item.mineSha256 ?? null)) {
          throw new PathRefused(p, "changed since the plan was made: re-run plan.mjs");
        }
        const sf = det.get(source) ?? f;
        const inputs = inputsFor(ctx, sf, global);
        const theirs = theirsRaw == null ? null : render(theirsRaw, inputs).text;
        let base = null;
        if (item.action === "stage-merge") {
          const baseRaw = sf.base?.text ?? (sf.base?.entry ? ctx.blobs.get(sf.base.entry.kitBlob) : null);
          if (baseRaw == null) throw new PathRefused(p, "base content unavailable: fetch the kit's full history");
          base = render(baseRaw, inputs).text;
        }
        ops.push({ op: held === null ? item.action : "stage-theirs", held, path: p, mineText, base, theirs, stage: stageDir(ctx, p) });
      }
    } catch (e) {
      if (!(e instanceof PathRefused)) throw e;
      refused.push({ path: p, reason: e.reason });
    }
  }

  if (refused.length) return { status: "refused", refused, ops: [], done };

  const results = [];
  for (const o of ops) {
    if (o.op === "write") {
      mkdirSync(dirname(o.full), { recursive: true });
      resolveInside(ctx.project, o.path); // re-check after creating folders
      writeFileSync(o.full, o.text);
      if (o.mode !== null) chmodSync(o.full, o.mode);
      results.push({ path: o.path, op: "write" });
    } else if (o.op === "delete") {
      rmSync(o.full);
      results.push({ path: o.path, op: "delete" });
    } else {
      const { full } = o.stage;
      mkdirSync(dirname(full), { recursive: true });
      if (o.mineText !== null) writeFileSync(`${full}.mine`, o.mineText);
      if (o.theirs !== null) writeFileSync(`${full}.theirs`, o.theirs);
      let merge = null;
      if (o.op === "stage-merge") {
        writeFileSync(`${full}.base`, o.base);
        let text;
        try {
          text = execFileSync(
            "git",
            ["merge-file", "-p", "--zdiff3", "-L", "mine", "-L", "base", "-L", "theirs", `${full}.mine`, `${full}.base`, `${full}.theirs`],
            { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
          );
          merge = 0;
        } catch (e) {
          if (typeof e.status !== "number" || e.status > 127 || e.stdout == null) throw new Error(`git merge-file failed for ${o.path}: ${e.stderr ?? e.message}`);
          text = e.stdout;
          merge = e.status; // number of conflicts
        }
        writeFileSync(`${full}.merged`, text);
      }
      results.push(o.held === null ? { path: o.path, op: o.op, merge } : { path: o.path, op: "held", reason: o.held });
    }
  }
  const record = { target: ctx.target, results, done };
  const recordPath = resolveInside(ctx.project, `${SCRATCH}/applied.json`);
  mkdirSync(dirname(recordPath), { recursive: true });
  writeFileSync(recordPath, `${JSON.stringify(record, null, 2)}\n`);
  return { status: "ok", refused: [], results, done };
}

function main() {
  if (printHelp(process.argv.slice(2), import.meta.url)) return;
  const args = parseArgs(process.argv.slice(2));
  const ctx = loadContext({
    project: args.project ?? process.cwd(),
    target: args.target,
    indexDir: args["index-dir"],
    kitSkillDir: args.kit,
    blobPacks: args["blob-pack"],
  });
  const planPath = args.plan ? resolve(args.plan) : join(ctx.project, SCRATCH, "plan.json");
  if (!existsSync(planPath)) throw new Error(`no plan at ${planPath}: run plan.mjs first`);
  const plan = JSON.parse(readFileSync(planPath, "utf8"));
  const r = applyPlan(ctx, plan);
  for (const x of r.refused) console.log(`refused=${x.path} reason=${x.reason}`);
  for (const x of r.results ?? []) {
    if (x.op === "write" || x.op === "delete") console.log(`applied=${x.path} op=${x.op}`);
    else if (x.op === "held") console.log(`held=${x.path} reason=${x.reason}`);
    else console.log(`staged=${x.path} op=${x.op}${x.merge === null ? "" : ` merge=${x.merge}`}`);
  }
  for (const p of r.done) console.log(`done=${p}`);
  console.log(`apply-status=${r.status}`);
  if (r.status !== "ok") process.exit(3);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (e) {
    console.error(`apply: ${e.message}`);
    process.exit(2);
  }
}
