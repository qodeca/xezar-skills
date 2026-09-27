#!/usr/bin/env node
// detect.mjs – per installed kit file: which kit version it came from, and how sure we are
// (plan §6.2 "Finding the base, per file").
//
//   0. the file is byte-equal to a version's copy                     -> newest such; high when
//      the manifest records the same, else medium (a partly applied later upgrade)
//   1. the manifest's recorded sha256 (or kitBlob) is in the index  -> that version, high
//   2. the file equals a version's copy, after masking placeholder regions and rewritten
//      absolute paths                                               -> newest such, medium
//   3. otherwise the version with the smallest line diff             -> low ("base inferred")
//   4. no candidate at all                                           -> unknown
//
// Candidates are the kit versions before the target, without the target's own unreleased
// development commits (lib/context.mjs, baseCandidates): a hand-copied pre-release file has
// no base, rather than a development commit's text that already equals the target.
//
// Run from the verified xezar-skills clone:
//   node upgrade/tools/detect.mjs --project <dir> [--target <version>] [--json]
//        [--blob-pack <file.json.gz>]… [--index-dir <dir>] [--kit <skill dir>] [--help]
// Output (default): NAME=value lines, parsed after the first `=`:
//   manifest-version=<1|2>
//   project-version=<version|unknown>
//   file=<path> base=<version|none> confidence=<high|medium|low|unknown|n/a> mine=<present|missing|refused>
//   refused=<path> reason=<why>
// Exit: 0 detected; 2 cannot run (no manifest, unreadable input).

import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { sha256 } from "./lib/hash.mjs";
import { loadContext, parseArgs, printHelp } from "./lib/context.mjs";
import { normalisedMatch, placeholdersIn } from "./lib/rewrites.mjs";
import { lineDistance } from "./lib/diff.mjs";
import { isNeverTouched } from "./lib/policy.mjs";
import { isRepoRelative } from "./lib/paths.mjs";

/** The universe of paths the upgrade looks at. */
export function universe(ctx) {
  const paths = new Set(Object.keys(ctx.theirs.files));
  for (const v of ctx.candidates) for (const p of Object.keys(v.files)) paths.add(p);
  for (const p of ctx.manifest.hints.keys()) paths.add(p);
  for (const p of ctx.register.entries.flatMap((e) => e.files)) if (isRepoRelative(p)) paths.add(p);
  return [...paths].filter((p) => !isNeverTouched(p)).sort();
}

/**
 * Find the base of one file. Returns { version, entry, confidence, via, inputs, text }.
 * `entry` is that version's index entry; `text` its raw kit content when available;
 * `inputs` the placeholder values recovered from the installed file (memory only).
 */
export function findBase(ctx, path, mine) {
  const versions = ctx.candidates.filter((v) => v.files[path] && v.files[path].rewrite !== "generated");
  if (!versions.length) return { version: null, confidence: ctx.candidates.some((v) => v.files[path]) ? "n/a" : "unknown" };
  const hint = ctx.manifest.hints.get(path) ?? {};
  const newest = (pred) => {
    for (let i = versions.length - 1; i >= 0; i -= 1) if (pred(versions[i].files[path])) return versions[i];
    return null;
  };
  const result = (v, confidence, via, extra = {}) => ({
    version: v.version,
    entry: v.files[path],
    confidence,
    via,
    text: extra.text ?? null,
    inputs: extra.inputs ?? hint.renderInputs ?? null,
  });

  // Distinct kit texts for this path, newest first (content read lazily, may be unavailable).
  const distinct = [];
  const seenBlob = new Set();
  for (let i = versions.length - 1; i >= 0; i -= 1) {
    const e = versions[i].files[path];
    if (seenBlob.has(e.kitBlob)) continue;
    seenBlob.add(e.kitBlob);
    distinct.push({ v: versions[i], e });
  }
  const textOf = (e) => ctx.blobs.get(e.kitBlob);

  // 0. A file byte-equal to a kit version IS that version's copy, whatever the manifest says:
  //    a project that applied part of a later upgrade by hand has newer files than its
  //    manifest records. High when the manifest agrees, medium when it does not (step 2).
  if (mine?.text != null) {
    const mineSha = sha256(mine.text);
    const same = newest((e) => e.sha256 === mineSha);
    if (same) {
      const agrees = (hint.sha256 && hint.sha256 === mineSha) || (hint.kitBlob && hint.kitBlob === same.files[path].kitBlob);
      return result(same, agrees ? "high" : "medium", agrees ? "manifest-sha256" : "content");
    }
  }

  // 1. the manifest's own record
  if (hint.kitBlob) {
    const v = newest((e) => e.kitBlob === hint.kitBlob);
    if (v) return result(v, "high", "manifest-kitBlob");
  }
  if (hint.sha256) {
    const v = newest((e) => e.sha256 === hint.sha256);
    if (v) return result(v, "high", "manifest-sha256");
    // An adapted file records the sha of the RENDERED file: re-render each candidate.
    const adapted = versions[versions.length - 1].files[path].rewrite === "adapted";
    if (adapted && mine?.text != null) {
      for (const { v, e } of distinct) {
        const t = textOf(e);
        if (t == null) continue;
        const m = normalisedMatch(t, mine.text);
        if (m.match && m.exact && sha256(mine.text) === hint.sha256) return result(v, "high", "manifest-sha256-rendered", { text: t, inputs: m.inputs });
      }
    }
  }
  if (mine?.text == null) return { version: null, confidence: "unknown" };

  // 2. the file equals a version's copy after normalising (raw equality was step 0)
  for (const { v, e } of distinct) {
    const t = textOf(e);
    if (t == null) continue;
    const m = normalisedMatch(t, mine.text);
    if (m.match) {
      // Newest version sharing this blob.
      const nv = newest((x) => x.kitBlob === e.kitBlob);
      return result(nv, "medium", placeholdersIn(t).length ? "normalised-placeholders" : "normalised-paths", { text: t, inputs: m.inputs });
    }
  }

  // 3. smallest line diff
  let best = null;
  for (const { e } of distinct) {
    const t = textOf(e);
    if (t == null) continue;
    const d = lineDistance(t, mine.text, best ? best.d : Infinity);
    if (!best || d < best.d) best = { e, d, t };
  }
  if (best) {
    const nv = newest((x) => x.kitBlob === best.e.kitBlob);
    return result(nv, "low", `line-diff:${best.d}`, { text: best.t });
  }
  // 4. nothing to compare with
  return { version: null, confidence: "unknown" };
}

export function detect(ctx) {
  const files = [];
  const paths = universe(ctx);
  ctx.git.prime(paths);
  for (const path of paths) {
    const mine = ctx.readMine(path);
    const base = mine.refused ? { version: null, confidence: "unknown" } : findBase(ctx, path, mine);
    files.push({
      path,
      mine: mine.refused ? "refused" : mine.missing ? "missing" : "present",
      refusedReason: mine.reason ?? null,
      mineText: mine.text ?? null,
      mineMode: mine.mode ?? null,
      base,
    });
  }
  return {
    manifestVersion: ctx.manifest.manifestVersion,
    projectVersion: ctx.manifest.version,
    refused: ctx.manifest.refused.map((p) => ({ path: p, reason: "unsafe path in the manifest" })),
    files,
  };
}

function main() {
  if (printHelp(process.argv.slice(2), import.meta.url)) return;
  const args = parseArgs(process.argv.slice(2), ["json"]);
  const ctx = loadContext({
    project: args.project ?? process.cwd(),
    target: args.target,
    indexDir: args["index-dir"],
    kitSkillDir: args.kit,
    blobPacks: args["blob-pack"],
  });
  const d = detect(ctx);
  if (args.json) {
    const out = {
      ...d,
      files: d.files.map(({ path, mine, refusedReason, base }) => ({
        path,
        mine,
        refusedReason,
        base: { version: base.version, confidence: base.confidence, via: base.via ?? null },
      })),
    };
    process.stdout.write(`${JSON.stringify(out, null, 2)}\n`);
    return;
  }
  console.log(`manifest-version=${d.manifestVersion}`);
  console.log(`project-version=${d.projectVersion ?? "unknown"}`);
  for (const r of d.refused) console.log(`refused=${JSON.stringify(r.path)} reason=${r.reason}`);
  for (const f of d.files) {
    if (f.mine === "refused") console.log(`refused=${f.path} reason=${f.refusedReason}`);
    console.log(`file=${f.path} base=${f.base.version ?? "none"} confidence=${f.base.confidence} mine=${f.mine}`);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (e) {
    console.error(`detect: ${e.message}`);
    process.exit(2);
  }
}
