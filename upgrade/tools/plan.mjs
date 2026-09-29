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
//                (a generated file written from a kit template, the leader guide, has that
//                template as its kitSource)
//                renderKeys?, missingKeys?, register: [LP-n], registerConfirmed,
//                safety, stops: [reason], reviews: [reason], notes: [text] } ],
//     stops: [ { path, reason } ], reviews: [ { path, reason } ], unexplained: [path],
//     perMachine: [path],
//     registerDrafts: { add: [ { files, reason } ], remove: [LP-n] },
//     upgradeEntries: [ { source, line, heading, appliesTo, files, actions } ], actions: [action],
//       (line and heading are the entry's heading in UPGRADE_NOTES.md, as for unblockedEntries)
//     unblockedEntries: [ { source, line, heading } ],
//     versionEvidence: null | { version, support, total }: for a manifest that names no kit
//       version, the version the files show (see versionEvidence), which picks the entry range,
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
//   own-file-kit-contract a role skill or workflow of the project's own, which no kit version
//                         ships and the target's catalog check still judges (ownFiles): bring
//                         it to the target's contract; a grant it needs is a permission change
//
// Exit: 0 written; 2 cannot run.

import { mkdirSync, writeFileSync, readFileSync, existsSync, readdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { join, resolve } from "node:path";
import { git, gitBlobSha, lfText, sha256 } from "./lib/hash.mjs";
import { SKILL_DIR } from "./lib/kit-index.mjs";
import { loadContext, parseArgs, printHelp, SCRATCH } from "./lib/context.mjs";
import { detect } from "./detect.mjs";
import { render, placeholdersIn } from "./lib/rewrites.mjs";
import {
  OWNER_SHAPED,
  isNeverTouched,
  isSafetyFile,
  isCheckLike,
  permissionGrants,
  removedSafetyLines,
  addedWeakeningLines,
} from "./lib/policy.mjs";
import { registerByPath } from "./lib/register.mjs";
import { parseBlocks, parseEntries, satisfies, parseVersion, compareVersions } from "./lib/machine-block.mjs";
import { resolveInside } from "./lib/paths.mjs";
import { recordable, unchangedFromKit } from "./verify.mjs";

/** The planner's stop reasons, each mapped to a rule in the prompt's stop-and-ask list. */
export const STOP_REASONS = ["unexplained-safety-file", "weakens-safety-check", "permission-change", "routing-clash"];
/** What the prompt must read and judge even when nothing stops (see the header). */
export const REVIEW_REASONS = ["safety-local-change", "safety-both-changed", "own-file-kit-contract"];

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

/**
 * Generated files the setup writes from a kit template. The index gives a generated file no kit
 * source, so without this the plan would point Claude at nothing to merge from.
 */
export const GENERATED_TEMPLATES = { ".xezar/docs/leader-guide.md": "leader-guide.template.md" };

/**
 * Did the template change between the project's kit version and the target? true, false, or
 * null when that cannot be told (no known version, or a clone without that commit's history).
 */
export function templateChanged(ctx, template) {
  const v = ctx.history.find((x) => x.version === ctx.manifest.version);
  let target;
  try {
    target = gitBlobSha(lfText(readFileSync(join(ctx.kitSkillDir, "kit", template))));
  } catch {
    return null;
  }
  if (!v?.commit) return null;
  const out = git(["rev-parse", "--verify", "-q", `${v.commit}:${SKILL_DIR}/kit/${template}`], ctx.toolRoot, { allowFail: true });
  const base = (out ?? "").trim();
  return /^[0-9a-f]{40}$/.test(base) ? base !== target : null;
}

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

/**
 * The upgrade entries whose Applies-to covers the project's version, each with the heading and
 * line of the UPGRADE_NOTES.md entry it ends (the nearest entry heading above its block).
 */
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
    const units = parseEntries(text, source);
    errors.push(...parsed.errors);
    for (const b of parsed.blocks) {
      if (!b.appliesTo) continue;
      const unit = units.filter((u) => u.line <= b.line).pop() ?? null;
      const entry = { source: b.source, line: unit ? unit.line : b.line, heading: unit ? unit.heading : null, appliesTo: b.appliesTo, files: b.files, actions: b.actions };
      try {
        if (!projectVersion || satisfies(b.appliesTo, projectVersion)) entries.push(entry);
      } catch (e) {
        errors.push(`${source}: ${e.message}`);
      }
    }
  }
  return { entries, errors };
}

/**
 * The UPGRADE_NOTES.md entries in the project's range that end in no machine block. Their steps
 * reach neither `actions` nor the owner checklist on their own, so the plan lists them for the
 * agent to read (prompt step 6) rather than drop them. In range: under a heading "upgrading an
 * onboarded project to X", when the project is below X; otherwise when the entry is dated on or
 * after `projectDate` (the day the project's kit version was committed). With no version or no
 * date to compare, the entry is listed: a surplus line costs a read, a missing one a step.
 */
export function unblockedEntries(toolRoot, projectVersion, projectDate) {
  const notes = join(toolRoot, "UPGRADE_NOTES.md");
  if (!existsSync(notes)) return { entries: [], errors: [] };
  const errors = [];
  const entries = [];
  for (const u of parseEntries(readFileSync(notes, "utf8"), "UPGRADE_NOTES.md")) {
    if (u.hasBlock) continue;
    let inRange = true;
    try {
      if (projectVersion && u.before) inRange = satisfies(`<${u.before}`, projectVersion);
      else if (projectDate) inRange = u.date >= projectDate;
    } catch (e) {
      errors.push(`UPGRADE_NOTES.md:${u.line}: ${e.message}`);
    }
    if (inRange) entries.push({ source: u.source, line: u.line, heading: u.heading });
  }
  return { entries, errors };
}

/** The day (YYYY-MM-DD) a kit version (the project's by default) was committed, or null when the clone cannot tell. */
export function versionDate(ctx, version = ctx.manifest.version) {
  const v = ctx.history.find((x) => x.version === version);
  if (!v?.commit) return null;
  const out = git(["log", "-1", "--format=%cs", v.commit], ctx.toolRoot, { allowFail: true });
  const d = (out ?? "").trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : null;
}

/**
 * The project's kit version as its files show it, for a manifest that names none (a v1 manifest
 * with `version: 1`, or none at all). Only files whose base detection is sure of (confidence
 * high: the file and the manifest's own digest agree) count. Each earlier kit version scores the
 * files whose kit copy it shares; the version with the most, the oldest on a tie, is the answer
 * when more than half of those files agree with it. The oldest is the safe side: it lists an
 * entry too many rather than one too few. Null when there is no such evidence.
 */
export function versionEvidence(ctx, detection) {
  const sure = detection.files.filter((f) => f.mine === "present" && f.base?.confidence === "high" && f.base.entry?.kitBlob);
  if (!sure.length) return null;
  let best = null;
  for (const v of ctx.candidates) {
    let support = 0;
    for (const f of sure) if (v.files[f.path]?.kitBlob === f.base.entry.kitBlob) support += 1;
    if (support > 0 && (!best || support > best.support)) best = { version: v.version, support };
  }
  if (!best || best.support * 2 <= sure.length) return null;
  return { version: best.version, support: best.support, total: sure.length };
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

/** The role skill whose `## Shared contract` tail is canonical (catalog-check requires one tail). */
const CANONICAL_TAIL_SKILL = ".xezar/skills/xezar-docs-maintenance.md";
const TAIL = "## Shared contract\n";

/**
 * The project's own role skills and workflows: a `.xezar/skills/xezar-*.md` with a
 * `## Shared contract` section, or a `.xezar/workflows/*.yaml`, that the target kit does not
 * ship. No kit version has them and the manifest does not record them, so detection never sees
 * them – yet the target's catalog check judges them with the kit's own: one tail for every role
 * skill that has one, a timeout on every agent step, and the review rules. Each becomes a
 * `local-only` item with the `own-file-kit-contract` review, which prompt step 5 resolves.
 * Returns [{ path, kind: "skill"|"workflow", text }].
 */
export function ownFiles(ctx) {
  const found = [];
  const dirs = [
    [".xezar/skills", "skill", (n, text) => /^xezar-[^/]+\.md$/.test(n) && text.includes(TAIL)],
    [".xezar/workflows", "workflow", (n) => /\.ya?ml$/.test(n)],
  ];
  for (const [dir, kind, wanted] of dirs) {
    let names = [];
    try {
      const abs = resolveInside(ctx.project, dir);
      if (existsSync(abs)) names = readdirSync(abs).sort();
    } catch {
      continue;
    }
    for (const n of names) {
      const p = `${dir}/${n}`;
      if (ctx.theirs.files[p] || isNeverTouched(p)) continue;
      if (ctx.git.isGit && ctx.git.ignored(p)) continue;
      const mine = ctx.readMine(p);
      if (mine.text == null || !wanted(n, mine.text)) continue;
      found.push({ path: p, kind, text: mine.text });
    }
  }
  return found;
}

/** What an own file must change for the target's catalog check, quoted from the upgrade entries. */
function ownFileNotes(ctx, own) {
  if (own.kind === "skill") {
    const canonical = ctx.theirsText(CANONICAL_TAIL_SKILL)?.split(TAIL)[1];
    const tail = own.text.split(TAIL)[1];
    return [
      canonical !== undefined && tail === canonical
        ? "a role skill of the project's own: its `## Shared contract` tail already equals the target's"
        : "a role skill of the project's own: replace everything from its `## Shared contract` heading to the end with the same part of the target kit's `skills/xezar-docs-maintenance.md`, keeping the text above the heading (the catalog check requires one tail in every role skill that has one)",
    ];
  }
  return [
    "a workflow of the project's own: give every agent step (prompt or skill) a `timeout` – `15m` for a handoff, `2h` for a main step – the catalog check refuses one without",
    "if it is a review or QA workflow: its review step runs kit scripts only from `.local/xezar/cache/kit/checks/` – never `bash .xezar/checks/`, in its bashAllowlist or its prompt – holds `bash .local/xezar/cache/kit/checks/review-run.sh`, and its preflight drops `--allow-root`",
    "a tool or allowlist grant this adds (the chrome-devtools tools the kit's `code-review.yaml` lists, `review-run.sh`) is a permission change: stop and ask before writing it",
  ];
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
      const template = te?.rewrite === "generated" ? GENERATED_TEMPLATES[p] : null;
      if (template && existsSync(join(ctx.kitSkillDir, "kit", template))) {
        item.theirs.kitSource = template;
        item.notes.push(`generated from the kit's ${template}: theirs is that template, so take what it adds outside the owner's own sections`);
        const changed = templateChanged(ctx, template);
        if (changed === true) item.notes.push("template changed in the kit since the project's version: merge its changes in");
        else if (changed === false) item.notes.push("template unchanged in the kit since the project's version");
        else item.notes.push("could not tell whether the template changed since the project's version: compare mine with it in full");
      }
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
        // An owner-shaped file the manifest tracks (`.claude/settings.json`: a project hook, a
        // local permission) that differs from the kit's copy on both sides keeps that change
        // through the merge, and the verifier then requires a register entry for it: draft one
        // now, like any other unexplained local change, so the plan and the verifier agree.
        if (te.rewrite !== "generated" && recordable(ctx, p) && !unchangedFromKit(ctx, p, te, f.mineText, f)) {
          item.notes.push("differs from the kit's copy at its base and at the target: a kept change needs a register entry (the manifest tracks this file)");
          if (!item.registerConfirmed) item.unexplained = true;
          if (item.safety) review("safety-local-change");
        }
      } else if (te?.kitSource && !exists) {
        item.notes.push("new in the kit: add it, merged with the owner's existing setup");
        const grants = permissionGrants(p, null, ctx.theirsText(p));
        if (grants.length) {
          stop("permission-change");
          item.notes.push(...grants.map((g) => `grant: ${g}`));
        }
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
      if (installedAtBase || reg.length) {
        // The manifest (or the register) records it; the project removed it. Any manifest
        // record counts, not only one that names a known base: an adapted file's v1 digest is
        // of the rendered text, and a file taken for new would be added back without a word.
        // A confirmed register entry keeps the removal; otherwise it is the owner's call.
        item.class = item.registerConfirmed ? "local-only" : "unexplained-local-change";
        item.action = "keep";
        item.notes.push(
          item.registerConfirmed
            ? "removed locally, and the register records the removal: kept removed"
            : "recorded in the manifest and missing from the tree: keep it removed (register entry) or restore it",
        );
        if (!item.registerConfirmed && item.safety) stop("unexplained-safety-file");
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

  // The project's own role skills and workflows: kept as they are, and read against the target's
  // contract (ownFiles). One the manifest or register already named is in `out` as local-only.
  const outByPath = new Map(out.map((i) => [i.path, i]));
  for (const own of ownFiles(ctx)) {
    let item = outByPath.get(own.path);
    if (!item) {
      const reg = byPath.get(own.path) ?? [];
      item = {
        path: own.path,
        class: "local-only",
        action: "keep",
        base: { version: null, confidence: "unknown", via: null },
        mineSha256: sha256(own.text),
        theirs: null,
        register: reg.map((r) => r.id),
        registerConfirmed: reg.length > 0 && reg.every((r) => r.confirmed),
        safety: isSafetyFile(own.path),
        stops: [],
        reviews: [],
        notes: ["no kit version ever shipped this file: the project's own, kept as it is"],
      };
      out.push(item);
    }
    if (!item.reviews.includes("own-file-kit-contract")) item.reviews.push("own-file-kit-contract");
    item.notes.push(...ownFileNotes(ctx, own));
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
  // The entry range starts at the manifest's version; with none, at the version the files show.
  const projectVersion = parseVersion(ctx.manifest.version ?? "") ? ctx.manifest.version : null;
  const evidence = projectVersion ? null : versionEvidence(ctx, detection);
  const rangeVersion = projectVersion ?? evidence?.version ?? null;
  const { entries, errors } = upgradeEntries(ctx.toolRoot, rangeVersion);
  const unblocked = unblockedEntries(ctx.toolRoot, rangeVersion, rangeVersion ? versionDate(ctx, rangeVersion) : null);
  errors.push(...unblocked.errors);
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
    unblockedEntries: unblocked.entries,
    versionEvidence: evidence,
    actions,
    engine,
    errors,
  };
}

export function summary(plan) {
  const lines = [`# Upgrade plan to ${plan.target}`, "", `Project version: ${plan.projectVersion ?? "unknown"} (manifest v${plan.manifestVersion})`, ""];
  const known = parseVersion(plan.projectVersion ?? "");
  if (!known && plan.versionEvidence) {
    const e = plan.versionEvidence;
    lines.push(
      `Upgrade entries are chosen as for ${e.version}: the manifest names no kit version, and ${e.support} of the ${e.total} files with a sure base match the kit at ${e.version}.`,
      "",
    );
  } else if (!known) {
    lines.push("The manifest names no kit version and the files show none: every upgrade entry is listed.", "");
  }
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
  const engine = plan.engine?.version ? `engine ${plan.engine.version} from ${plan.engine.source}` : "no engine version found";
  const action = (a) => {
    const c = plan.engine?.checks.find((x) => a === `engine-min=${x.min}`);
    return c ? `${a} (${c.status}: ${engine})` : a;
  };
  // Each action under the entry that asks for it, so the checklist can say why.
  const shown = new Set();
  for (const e of plan.upgradeEntries ?? []) {
    if (!e.actions?.length) continue;
    lines.push(`- ${e.source}:${e.line} ${e.heading ?? "(no entry heading)"}`);
    for (const a of e.actions) {
      lines.push(`  - ${action(a)}`);
      shown.add(a);
    }
  }
  for (const a of plan.actions) if (!shown.has(a)) lines.push(`- ${action(a)}`);
  lines.push("", "## Upgrade entries with no machine block", "");
  if (!plan.unblockedEntries?.length) lines.push("None.");
  for (const e of plan.unblockedEntries ?? []) lines.push(`- ${e.source}:${e.line} ${e.heading}`);
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

