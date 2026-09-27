#!/usr/bin/env node
// plan.mjs – classify every installed kit file (plan §6.4) and write the upgrade plan.
//
//   node upgrade/tools/plan.mjs --project <dir> [--target <version>] [--blob-pack <f>]…
//        [--index-dir <dir>] [--kit <skill dir>] [--stdout] [--help]
//
// Writes <project>/.local/xezar/scratch/upgrade/plan.json and plan.md (a readable summary),
// unless --stdout, which prints plan.json instead of writing anything.
//
// plan.json (planVersion 1):
//   { planVersion, target, projectVersion, manifestVersion, startCommit,
//     counts: { <class>: n },
//     files: [ { path, class, action, base: { version, confidence, via }, mineSha256,
//                theirs: { kitSource, kitBlob, sha256, rewrite } | null, renamedFrom?,
//                renderKeys?, missingKeys?, register: [LP-n], registerConfirmed,
//                safety, stops: [reason], notes: [text] } ],
//     stops: [ { path, reason } ], unexplained: [path], perMachine: [path],
//     registerDrafts: { add: [ { files, reason } ], remove: [LP-n] },
//     upgradeEntries: [ { source, appliesTo, files, actions } ], actions: [action],
//     engine: null | { version, source, checks: [ { min, status: met|unmet|unknown } ] },
//     errors: [text] }
// `engine` evaluates the range's engine-min=<v> actions (null when there are none); the version
// is the project's pinned @qodeca/xezar package.json, else `xezar --version` on PATH.
// Names config and placeholder KEYS, never their values.
//
// Classes: unchanged-upstream, clean-update, local-only, already-upstream, both-changed,
//   base-unknown, moved-in-kit, routing-pre-3.0, unexplained-local-change, new-in-kit,
//   removed-from-kit, owner-shaped, per-machine, refused.
// Actions (what apply.mjs does): none, write-theirs, delete, stage-merge, stage-theirs,
//   keep, list, skip-optional. A file with any stop is never written by apply.mjs.
//
// Exit: 0 written; 2 cannot run.

import { mkdirSync, writeFileSync, readFileSync, existsSync, readdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { join, resolve } from "node:path";
import { sha256 } from "./lib/hash.mjs";
import { loadContext, parseArgs, printHelp, SCRATCH } from "./lib/context.mjs";
import { detect } from "./detect.mjs";
import { render, placeholdersIn } from "./lib/rewrites.mjs";
import {
  OWNER_SHAPED,
  isSafetyFile,
  isCheckLike,
  permissionGrants,
  removedSafetyLines,
} from "./lib/policy.mjs";
import { registerByPath } from "./lib/register.mjs";
import { parseBlocks, satisfies, parseVersion, compareVersions } from "./lib/machine-block.mjs";
import { resolveInside } from "./lib/paths.mjs";

export const CLASSES = [
  "unchanged-upstream",
  "clean-update",
  "local-only",
  "already-upstream",
  "both-changed",
  "base-unknown",
  "moved-in-kit",
  "routing-pre-3.0",
  "unexplained-local-change",
  "new-in-kit",
  "removed-from-kit",
  "owner-shaped",
  "per-machine",
  "refused",
];

/** Placeholder values recovered from every adapted file, for files that have none of their own. */
function globalInputs(detection) {
  const values = new Map();
  const conflicted = new Set();
  for (const f of detection.files) {
    const inputs = f.base?.inputs;
    if (!inputs) continue;
    for (const [k, v] of Object.entries(inputs)) {
      if (values.has(k) && values.get(k) !== v) conflicted.add(k);
      else values.set(k, v);
    }
  }
  for (const k of conflicted) values.delete(k);
  return Object.fromEntries(values);
}

/** Inputs for one file: its own (recovered or recorded) first, then the project-wide ones. */
export function inputsFor(ctx, f, global) {
  const own = f.base?.inputs ?? ctx.manifest.hints.get(f.path)?.renderInputs ?? null;
  return { ...global, ...(own ?? {}) };
}

/** The upgrade entries whose Applies-to covers the project's version. */
export function upgradeEntries(toolRoot, projectVersion) {
  const sources = [];
  const notes = join(toolRoot, "UPGRADE_NOTES.md");
  if (existsSync(notes)) sources.push(["UPGRADE_NOTES.md", readFileSync(notes, "utf8")]);
  const fragments = join(toolRoot, "docs/plans/3.1.0/notes");
  if (existsSync(fragments)) {
    for (const name of readdirSync(fragments).sort()) {
      if (name.endsWith(".md") && name !== "README.md") {
        sources.push([`docs/plans/3.1.0/notes/${name}`, readFileSync(join(fragments, name), "utf8")]);
      }
    }
  }
  const entries = [];
  const errors = [];
  for (const [source, text] of sources) {
    const parsed = parseBlocks(text, source);
    errors.push(...parsed.errors);
    for (const b of parsed.blocks) {
      if (!b.appliesTo) continue;
      try {
        if (!projectVersion || satisfies(b.appliesTo, projectVersion)) entries.push(b);
      } catch (e) {
        errors.push(`${source}: ${e.message}`);
      }
    }
  }
  return { entries, errors };
}

/**
 * The engine version, read the way the kit reads it (kit/checks/repo-gates.sh): the project's
 * own pinned build first, then `xezar --version` (or `xez`) on PATH, three numeric parts or
 * nothing. The pinned build is read from its package.json, never run: this tool executes
 * nothing in the project.
 */
export function engineVersion(ctx) {
  const pinned = ctx.readMine("node_modules/@qodeca/xezar/package.json");
  if (pinned.text != null) {
    try {
      const v = JSON.parse(pinned.text).version;
      if (parseVersion(v)) return { version: String(v).replace(/^v/, ""), source: "node_modules/@qodeca/xezar" };
    } catch {
      /* unreadable: fall through to PATH */
    }
  }
  for (const bin of ["xezar", "xez"]) {
    let out;
    try {
      out = execFileSync(bin, ["--version"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], timeout: 10000 }).trim();
    } catch {
      continue;
    }
    if (parseVersion(out)) return { version: out.replace(/^v/, ""), source: bin };
    return { version: null, source: bin };
  }
  return { version: null, source: null };
}

/**
 * Each `engine-min=<v>` action against the engine version: met, unmet, or unknown (no engine
 * found, or a version that is not three numeric parts). Nothing is read when no block asks.
 */
export function engineChecks(actions, engine) {
  const mins = actions.filter((a) => a.startsWith("engine-min=")).map((a) => a.slice("engine-min=".length));
  if (!mins.length) return null;
  const e = typeof engine === "function" ? engine() : engine;
  return {
    version: e.version,
    source: e.source,
    checks: mins.map((min) => ({
      min,
      status: e.version == null ? "unknown" : compareVersions(e.version, min) >= 0 ? "met" : "unmet",
    })),
  };
}

export function buildPlan(ctx, detection = detect(ctx)) {
  const global = globalInputs(detection);
  const byPath = registerByPath(ctx.register.entries);
  const out = [];
  const theirs = ctx.theirs.files;
  const movedTo = new Map(); // old path -> new path
  for (const [p, e] of Object.entries(theirs)) if (e.renamedFrom) movedTo.set(e.renamedFrom, p);
  const detByPath = new Map(detection.files.map((f) => [f.path, f]));
  const mineExists = (p) => detByPath.get(p)?.mine === "present";
  const hasModelRouting = mineExists(".xezar/docs/model-routing.md");

  for (const f of detection.files) {
    const p = f.path;
    const te = theirs[p] ?? null;
    const cm = ctx.theirsCopyMap.get(p);
    const reg = byPath.get(p) ?? [];
    const item = {
      path: p,
      class: null,
      action: "none",
      base: { version: f.base.version ?? null, confidence: f.base.confidence, via: f.base.via ?? null },
      mineSha256: f.mineText != null ? sha256(f.mineText) : null,
      theirs: te ? { kitSource: te.kitSource ?? null, kitBlob: te.kitBlob ?? null, sha256: te.sha256 ?? null, rewrite: te.rewrite } : null,
      register: reg.map((r) => r.id),
      registerConfirmed: reg.length > 0 && reg.every((r) => r.confirmed),
      safety: isSafetyFile(p),
      stops: [],
      notes: [],
    };
    const stop = (reason) => {
      if (!item.stops.includes(reason)) item.stops.push(reason);
    };
    const push = () => out.push(item);

    // --- refused and per-machine: never read further, never written ------------------
    if (f.mine === "refused") {
      item.class = "refused";
      item.action = "list";
      stop(`unsafe-path:${f.refusedReason}`);
      push();
      continue;
    }
    const exists = f.mine === "present";
    // Per-machine: the copy map says so, or git ignores the path. (An untracked file cannot
    // be here at plan time: the upgrade starts from a clean tree.)
    const perMachine = cm?.perMachine || (ctx.git.isGit && ctx.git.ignored(p));
    if (perMachine) {
      if (!exists && !te) continue;
      item.class = "per-machine";
      item.action = "list";
      if (te) {
        const t = ctx.theirsText(p);
        item.notes.push(exists && t != null && t === f.mineText ? "matches the kit" : "differs from the kit: an owner action on every machine");
      }
      push();
      continue;
    }

    // --- routing before 3.0 -------------------------------------------------------------
    if (p === ".xezar/docs/model-routing.md" && exists && !te) {
      item.class = "routing-pre-3.0";
      item.action = "list";
      item.notes.push("convert its lanes and rules into .xezar/routing.json, then remove it");
      push();
      continue;
    }
    if (p === ".xezar/routing.json" && !exists && hasModelRouting && te) {
      item.class = "routing-pre-3.0";
      item.action = "write-theirs";
      push();
      continue;
    }

    // --- owner-shaped: facts only ---------------------------------------------------------
    if (OWNER_SHAPED.has(p) || te?.rewrite === "generated" || (!te && ctx.candidates.some((v) => v.files[p]?.rewrite === "generated"))) {
      if (!exists && !te) continue;
      item.class = "owner-shaped";
      item.action = "list";
      if (te?.kitSource && exists) {
        const t = ctx.theirsText(p);
        const grants = permissionGrants(p, f.mineText, t);
        if (grants.length) {
          stop("permission-change");
          item.notes.push(...grants.map((g) => `grant: ${g}`));
        }
        if (f.base.entry && te.kitBlob === f.base.entry.kitBlob) item.notes.push("unchanged in the kit since its base");
        else item.notes.push("changed in the kit: merge by key");
      } else if (te?.kitSource && !exists) {
        item.notes.push("new in the kit: add it, merged with the owner's existing setup");
      }
      push();
      continue;
    }

    // --- moved in kit: handled at the new path ------------------------------------------
    if (!te && movedTo.has(p)) continue;
    if (te?.renamedFrom && !exists && mineExists(te.renamedFrom)) {
      const old = detByPath.get(te.renamedFrom);
      item.class = "moved-in-kit";
      item.action = "stage-merge";
      item.renamedFrom = te.renamedFrom;
      item.base = { version: old.base.version ?? null, confidence: old.base.confidence, via: old.base.via ?? null };
      item.mineSha256 = sha256(old.mineText);
      item.notes.push(`merge ${te.renamedFrom} into ${p}, then remove ${te.renamedFrom}`);
      push();
      continue;
    }

    // --- removed from kit -----------------------------------------------------------------
    if (!te) {
      if (!exists) continue;
      item.class = "removed-from-kit";
      const baseEntry = f.base.entry;
      const inBaseIndex = ctx.candidates.some((v) => v.files[p]);
      const mineIsBase = baseEntry && f.mineText != null && (sha256(f.mineText) === baseEntry.sha256 || (f.base.text != null && render(f.base.text, inputsFor(ctx, f, global)).text === f.mineText));
      if (inBaseIndex && mineIsBase && ["high", "medium"].includes(f.base.confidence)) {
        item.action = "delete";
      } else {
        item.action = "keep";
        item.notes.push("locally edited: kept, and flagged for the owner");
      }
      push();
      continue;
    }

    // --- new in kit -----------------------------------------------------------------------
    const theirsRaw = ctx.theirsText(p);
    if (!exists) {
      const installedAtBase = f.base.version !== null || ctx.manifest.hints.has(p);
      if (cm?.optional) {
        item.class = "new-in-kit";
        item.action = "skip-optional";
        item.notes.push("optional descriptor this project did not install");
        push();
        continue;
      }
      if (installedAtBase && f.base.confidence === "high") {
        // The manifest recorded it; the project removed it.
        item.class = "unexplained-local-change";
        item.action = "keep";
        item.notes.push("recorded in the manifest and missing from the tree");
        if (!item.registerConfirmed) {
          if (item.safety) stop("unexplained-safety-file");
        }
        push();
        continue;
      }
      item.class = "new-in-kit";
      const r = render(theirsRaw, global);
      item.renderKeys = placeholdersIn(theirsRaw);
      if (r.missing.length) {
        item.action = "stage-theirs";
        item.missingKeys = r.missing;
        item.notes.push("placeholder values unknown: fill before adding");
      } else {
        item.action = "write-theirs";
      }
      const grants = permissionGrants(p, null, r.text);
      if (grants.length) {
        stop("permission-change");
        item.notes.push(...grants.map((g) => `grant: ${g}`));
      }
      push();
      continue;
    }

    // --- present on both sides --------------------------------------------------------------
    const mine = f.mineText;
    const mineSha = sha256(mine);
    const inputs = inputsFor(ctx, f, global);
    const theirsR = render(theirsRaw, inputs);
    item.renderKeys = placeholdersIn(theirsRaw);
    const mineEqTheirs = theirsR.missing.length === 0 && theirsR.text === mine;
    const confirmed = item.registerConfirmed;

    if (f.base.confidence === "unknown" || f.base.confidence === "n/a" || !f.base.entry) {
      if (mineEqTheirs) {
        item.class = "already-upstream";
        item.action = "none";
        if (reg.length) item.notes.push("register entry now obsolete: draft its removal");
      } else {
        item.class = "base-unknown";
        item.action = "stage-theirs";
        if (!confirmed) {
          item.unexplained = true;
          if (item.safety) stop("unexplained-safety-file");
        }
      }
      push();
      continue;
    }

    const be = f.base.entry;
    const baseText = f.base.text ?? ctx.blobs.get(be.kitBlob);
    const baseR = baseText != null ? render(baseText, inputs) : null;
    const hint = ctx.manifest.hints.get(p);
    const mineEqBase =
      mineSha === be.sha256 ||
      (baseR !== null && baseR.missing.length === 0 && baseR.text === mine) ||
      (be.rewrite === "adapted" && f.base.via === "manifest-sha256-rendered" && hint?.sha256 === mineSha);
    const baseEqTheirs = be.kitBlob === te.kitBlob;
    const removed = isCheckLike(p) ? removedSafetyLines(baseText, mine) : [];

    // A file the project changed since install (the manifest says so, or the register lists
    // it) that now equals the target is "already upstream", even when its content also
    // matches the newest kit version: the local patch is what became obsolete.
    const changedSinceInstall = reg.length > 0 || (hint?.sha256 && hint.sha256 !== mineSha);
    if (baseEqTheirs && mineEqBase && !(mineEqTheirs && changedSinceInstall)) {
      item.class = "unchanged-upstream";
    } else if (mineEqTheirs) {
      item.class = "already-upstream";
      item.action = "none";
      if (reg.length) item.notes.push("register entry now obsolete: draft its removal");
    } else if (baseEqTheirs) {
      item.class = confirmed ? "local-only" : "unexplained-local-change";
      item.action = "keep";
      if (!confirmed && item.safety) stop("unexplained-safety-file");
    } else if (mineEqBase) {
      if (theirsR.missing.length) {
        item.class = "both-changed";
        item.action = "stage-theirs";
        item.missingKeys = theirsR.missing;
        item.notes.push("the new kit text has placeholders this install never filled: not a clean update");
      } else if (!["high", "medium"].includes(f.base.confidence)) {
        item.class = "both-changed";
        item.action = "stage-merge";
        item.notes.push("base inferred");
      } else {
        item.class = "clean-update";
        item.action = "write-theirs";
      }
    } else {
      item.class = "both-changed";
      item.action = theirsR.missing.length || baseR === null || baseR.missing.length ? "stage-theirs" : "stage-merge";
      if (theirsR.missing.length) item.missingKeys = theirsR.missing;
      if (!confirmed) {
        item.unexplained = true;
        if (item.safety) stop("unexplained-safety-file");
      }
    }
    if (f.base.confidence === "low") item.notes.push("base inferred");
    if (removed.length && item.class !== "unchanged-upstream" && item.class !== "already-upstream" && item.class !== "clean-update") {
      stop("weakens-safety-check");
      item.notes.push(...removed.map((l) => `removed safety line: ${l}`));
    }
    if (["clean-update", "both-changed"].includes(item.class)) {
      const grants = permissionGrants(p, mine, theirsR.text);
      if (grants.length) {
        stop("permission-change");
        item.notes.push(...grants.map((g) => `grant: ${g}`));
      }
    }
    push();
  }

  const counts = Object.fromEntries(CLASSES.map((c) => [c, 0]));
  for (const i of out) counts[i.class] += 1;
  const stops = out.flatMap((i) => i.stops.map((reason) => ({ path: i.path, reason })));
  for (const r of detection.refused) stops.push({ path: r.path, reason: `unsafe-path:${r.reason}` });

  const registerDrafts = {
    add: out
      .filter((i) => i.class === "unexplained-local-change" || i.unexplained)
      .map((i) => ({ files: [i.path], reason: "local change found by the upgrade with no confirmed register entry" })),
    remove: [...new Set(out.filter((i) => i.class === "already-upstream" && i.register.length).flatMap((i) => i.register))].sort(),
  };
  const { entries, errors } = upgradeEntries(ctx.toolRoot, parseVersion(ctx.manifest.version ?? "") ? ctx.manifest.version : null);
  errors.push(...ctx.register.errors.map((e) => `register: ${e}`));
  const actions = [...new Set(entries.flatMap((e) => e.actions))];
  const engine = engineChecks(actions, ctx.engine ?? (() => engineVersion(ctx)));

  return {
    planVersion: 1,
    target: ctx.target,
    projectVersion: ctx.manifest.version,
    manifestVersion: ctx.manifest.manifestVersion,
    startCommit: ctx.startCommit,
    counts,
    files: out,
    stops,
    unexplained: out.filter((i) => i.class === "unexplained-local-change" || i.unexplained).map((i) => i.path),
    perMachine: out.filter((i) => i.class === "per-machine").map((i) => i.path),
    registerDrafts,
    upgradeEntries: entries,
    actions,
    engine,
    errors,
  };
}

export function summary(plan) {
  const lines = [`# Upgrade plan to ${plan.target}`, "", `Project version: ${plan.projectVersion ?? "unknown"} (manifest v${plan.manifestVersion})`, ""];
  lines.push("| Class | Files |", "|---|---|");
  for (const [c, n] of Object.entries(plan.counts)) if (n) lines.push(`| ${c} | ${n} |`);
  lines.push("", "## Stop and ask", "");
  if (!plan.stops.length) lines.push("None.");
  for (const s of plan.stops) lines.push(`- ${s.path}: ${s.reason}`);
  lines.push("", "## Unexplained local changes", "");
  if (!plan.unexplained.length) lines.push("None.");
  for (const p of plan.unexplained) lines.push(`- ${p}`);
  lines.push("", "## Machine-block actions for this range", "");
  if (!plan.actions.length) lines.push("None.");
  for (const a of plan.actions) {
    const c = plan.engine?.checks.find((x) => a === `engine-min=${x.min}`);
    const engine = plan.engine?.version ? `engine ${plan.engine.version} from ${plan.engine.source}` : "no engine version found";
    lines.push(c ? `- ${a} (${c.status}: ${engine})` : `- ${a}`);
  }
  if (plan.errors.length) {
    lines.push("", "## Errors", "");
    for (const e of plan.errors) lines.push(`- ${e}`);
  }
  return `${lines.join("\n")}\n`;
}

export function writePlan(ctx, plan) {
  const dir = resolveInside(ctx.project, SCRATCH);
  mkdirSync(dir, { recursive: true });
  resolveInside(ctx.project, `${SCRATCH}/plan.json`);
  writeFileSync(join(dir, "plan.json"), `${JSON.stringify(plan, null, 2)}\n`);
  writeFileSync(join(dir, "plan.md"), summary(plan));
  return join(dir, "plan.json");
}

function main() {
  if (printHelp(process.argv.slice(2), import.meta.url)) return;
  const args = parseArgs(process.argv.slice(2), ["stdout"]);
  const ctx = loadContext({
    project: args.project ?? process.cwd(),
    target: args.target,
    indexDir: args["index-dir"],
    kitSkillDir: args.kit,
    blobPacks: args["blob-pack"],
  });
  const plan = buildPlan(ctx);
  if (args.stdout) {
    process.stdout.write(`${JSON.stringify(plan, null, 2)}\n`);
    return;
  }
  const path = writePlan(ctx, plan);
  process.stdout.write(summary(plan));
  console.log(`plan=${path}`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (e) {
    console.error(`plan: ${e.message}`);
    process.exit(2);
  }
}

