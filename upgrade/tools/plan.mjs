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
//                safety, stops: [reason], reviews: [reason], notes: [text] } ],
//     stops: [ { path, reason } ], reviews: [ { path, reason } ], unexplained: [path],
//     perMachine: [path],
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
// Stops (stop and ask before the file is written): unsafe-path:<why>, unexplained-safety-file,
//   weakens-safety-check, permission-change, routing-clash.
// Reviews (the file must be read and judged against the stop list, even when its merge is
//   clean or it is kept as is; never a verdict by themselves):
//   safety-local-change   a local change kept in a safety file (the line test is a floor)
//   safety-both-changed   a safety file both sides changed: a clean text merge can still undo
//                         what the target change enforces
//
// Exit: 0 written; 2 cannot run.

import { mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
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
  addedWeakeningLines,
} from "./lib/policy.mjs";
import { registerByPath } from "./lib/register.mjs";
import { parseBlocks, satisfies, parseVersion, compareVersions } from "./lib/machine-block.mjs";
import { resolveInside } from "./lib/paths.mjs";

/** The planner's stop reasons, each mapped to a rule in the prompt's stop-and-ask list. */
export const STOP_REASONS = ["unexplained-safety-file", "weakens-safety-check", "permission-change", "routing-clash"];
/** What the prompt must read and judge even when nothing stops (see the header). */
export const REVIEW_REASONS = ["safety-local-change", "safety-both-changed"];

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
  // UPGRADE_NOTES.md only: a release folds its working notes into it, so the plan never
  // depends on which commit was tagged.
  const sources = [];
  const notes = join(toolRoot, "UPGRADE_NOTES.md");
  if (existsSync(notes)) sources.push(["UPGRADE_NOTES.md", readFileSync(notes, "utf8")]);
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

/** Arrays whose items all carry an `id` are compared item by item; anything else as a whole. */
function routingLeaves(value, path, out) {
  if (Array.isArray(value) && value.length && value.every((v) => v && typeof v === "object" && typeof v.id === "string")) {
    for (const v of value) out.set(`${path}[id=${v.id}]`, JSON.stringify(v));
  } else if (value && typeof value === "object" && !Array.isArray(value)) {
    for (const [k, v] of Object.entries(value)) routingLeaves(v, path ? `${path}.${k}` : k, out);
    if (!Object.keys(value).length) out.set(path, "{}");
  } else {
    out.set(path, JSON.stringify(value));
  }
  return out;
}

/**
 * The routing fields the owner and the target both changed, differently, against the defaults
 * the project's routing was built from (stop rule 6). `defaults` is ignored: the target moves
 * its version on purpose. Returns { both, mine, theirs }: lists of dotted field paths.
 */
export function routingClashes(baseDefaults, mine, theirs) {
  const b = routingLeaves(baseDefaults, "", new Map());
  const m = routingLeaves(mine, "", new Map());
  const t = routingLeaves(theirs, "", new Map());
  const out = { both: [], mine: [], theirs: [] };
  for (const k of [...new Set([...b.keys(), ...m.keys(), ...t.keys()])].sort()) {
    if (k === "defaults" || k.startsWith("defaults.")) continue;
    const mc = m.get(k) !== b.get(k);
    const tc = t.get(k) !== b.get(k);
    if (mc && tc && m.get(k) !== t.get(k)) out.both.push(k);
    else if (mc && !tc) out.mine.push(k);
    else if (tc && !mc) out.theirs.push(k);
  }
  return out;
}

/** The routing defaults a project's `.xezar/routing.json` names in `defaults.version`, or null. */
function routingDefaults(ctx, mine) {
  const n = mine?.defaults?.version;
  if (!Number.isInteger(n) || n < 1) return null;
  const file = join(ctx.kitSkillDir, "references/routing-defaults", `${n}.json`);
  if (!existsSync(file)) return null;
  return { version: n, data: JSON.parse(readFileSync(file, "utf8")) };
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
      reviews: [],
      notes: [],
    };
    const stop = (reason) => {
      if (!item.stops.includes(reason)) item.stops.push(reason);
    };
    const review = (reason) => {
      if (!item.reviews.includes(reason)) item.reviews.push(reason);
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
        if (p === ".xezar/routing.json") {
          let mineJson = null;
          let theirsJson = null;
          try {
            mineJson = JSON.parse(f.mineText);
            theirsJson = JSON.parse(t);
          } catch {
            item.notes.push("routing: mine or theirs does not parse, so no field-level comparison");
          }
          const defaults = mineJson && theirsJson ? routingDefaults(ctx, mineJson) : null;
          if (mineJson && theirsJson && !defaults) {
            item.notes.push("routing: no routing defaults for this file's defaults.version, so no field-level comparison: merge by hand against the target");
          } else if (defaults) {
            const c = routingClashes(defaults.data, mineJson, theirsJson);
            if (c.both.length) stop("routing-clash");
            for (const k of c.both) item.notes.push(`routing: both changed ${k} (against routing-defaults/${defaults.version}.json)`);
            const top = (list) => [...new Set(list.map((k) => k.split(/[.[]/)[0]))].join(", ");
            if (c.mine.length) item.notes.push(`routing: owner changed fields under ${top(c.mine)}`);
            if (c.theirs.length) item.notes.push(`routing: target changed fields under ${top(c.theirs)}`);
          }
        }
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

    // --- in no kit version at all: the project's own file, which the manifest or the
    // register names. Base and theirs are both absent, so it is local only and kept.
    if (!te && !ctx.history.some((v) => v.files[p])) {
      if (!exists) continue;
      item.class = "local-only";
      item.action = "keep";
      item.notes.push("no kit version ever shipped this file: the project's own, kept as it is");
      push();
      continue;
    }

    // --- removed from kit: installed, gone upstream, and in the base index ---------------
    if (!te) {
      if (!exists) continue;
      item.class = "removed-from-kit";
      const baseEntry = f.base.entry;
      const mineIsBase = baseEntry && f.mineText != null && (sha256(f.mineText) === baseEntry.sha256 || (f.base.text != null && render(f.base.text, inputsFor(ctx, f, global)).text === f.mineText));
      if (mineIsBase && ["high", "medium"].includes(f.base.confidence)) {
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
    } else if (baseEqTheirs && f.base.confidence === "low") {
      // An inferred base is not proven: when it equals the target, "local only" would keep a
      // copy that may simply predate the target's text (F1). Stage theirs and judge it.
      item.class = "both-changed";
      item.action = "stage-theirs";
      item.notes.push("the inferred base equals the target, so this copy may be older than the kit's text: compare mine with theirs, never keep it unread");
      if (!confirmed) {
        item.unexplained = true;
        if (item.safety) stop("unexplained-safety-file");
      }
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
    const kept = item.class !== "unchanged-upstream" && item.class !== "already-upstream" && item.class !== "clean-update";
    if (removed.length && kept) {
      stop("weakens-safety-check");
      item.notes.push(...removed.map((l) => `removed safety line: ${l}`));
    }
    const added = isCheckLike(p) && kept ? addedWeakeningLines(baseText, mine) : [];
    if (added.length) {
      stop("weakens-safety-check");
      item.notes.push(...added.map((l) => `added weakening line: ${l}`));
    }
    if (item.safety && ["local-only", "unexplained-local-change"].includes(item.class)) review("safety-local-change");
    if (item.safety && item.class === "both-changed") review("safety-both-changed");
    if (item.class === "both-changed" && /^\.xezar\/skills\/xezar-[^/]+\.md$/.test(p)) {
      item.notes.push("owner additions go above the generated `## Shared contract` tail, never after it");
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
  const reviews = out.flatMap((i) => i.reviews.map((reason) => ({ path: i.path, reason })));
  for (const r of detection.refused) stops.push({ path: r.path, reason: `unsafe-path:${r.reason}` });

  const registerDrafts = {
    add: out
      // A file an existing entry already lists (confirmed or not) gets no second entry (F7).
      .filter((i) => (i.class === "unexplained-local-change" || i.unexplained) && !i.register.length)
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
    reviews,
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
  lines.push("", "## Read and judge (not stops by themselves)", "");
  if (!plan.reviews.length) lines.push("None.");
  for (const r of plan.reviews) lines.push(`- ${r.path}: ${r.reason}`);
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
  lines.push("", "## Engine minimum", "");
  if (!plan.engine) lines.push("None: this range sets no engine minimum.");
  else {
    const found = plan.engine.version ? `engine ${plan.engine.version} from ${plan.engine.source}` : "no engine version found: compare with `xezar --version`";
    for (const c of plan.engine.checks) lines.push(`- ${c.min}: ${c.status} (${found})`);
  }
  lines.push("", "## Per-machine files", "");
  if (!plan.perMachine.length) lines.push("None.");
  for (const p of plan.perMachine) lines.push(`- ${p}`);
  lines.push("", "## Errors", "");
  if (!plan.errors.length) lines.push("None.");
  for (const e of plan.errors) lines.push(`- ${e}`);
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

