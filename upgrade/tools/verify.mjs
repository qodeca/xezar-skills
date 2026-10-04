#!/usr/bin/env node
// verify.mjs – the invariants every upgrade must hold before it is committed (plan §6.5 step 7),
// then the v2 manifest and the project's checks.
//
//   node upgrade/tools/verify.mjs --project <dir> [--plan <path>] [--target <version>]
//        [--checks drift,catalog,route,repository] [--no-manifest]
//        [--blob-pack <f>]… [--index-dir <dir>] [--kit <skill dir>] [--help]
//
// Invariants (any one fails the run):
//   conflict-marker     a merge marker left in a file the upgrade touched
//   unparseable         a touched JSON or TOML file that does not parse
//   config-key-missing  a config key that existed before is gone
//   config-value-changed an owner value in a config file changed
//   owner-rules-changed the leader guide's "## Owner's rules" section is not byte-equal to before
//   register-binding    a register entry naming a missing file, or a file naming a missing entry
//                       (a kit file the project removed on purpose is not missing: the entry
//                       records the removal, and the manifest keeps the file's entry with it),
//                       or a register entry naming a file the manifest does not track (an owner
//                       document, a per-machine file, one merged into without a kit block),
//                       which the drift check would fail as register-without-manifest
//   safety-line-missing a refusing line the target kit added to a resolved safety file is absent
//   unregistered-local-change a copied or adapted kit file the manifest will record differs from
//                       the kit copy it sits on and from the target's, and no register entry
//                       names it: the manifest would record the edit as the installed state, and
//                       the drift check could never see it again (CONTRACT §1.2); or a kit
//                       file this project had (the old manifest records it, or detection found
//                       its base) that is removed with no register entry: the manifest would
//                       leave it out, and the next upgrade would write it back as new in the kit
// "Before" is the commit the plan was made on (plan.json startCommit).
//
// Then, unless --no-manifest, it writes manifest v2 (upgrade/CONTRACT.md §1.2) and runs the
// target kit's own checks against the project, from THIS clone (never the project's copy):
//   drift       checks/manifest-drift.mjs (skipped, and said so, while the kit has none)
//   catalog     checks/catalog-check.mjs <project>
//   route       checks/route.mjs --check <project>/.xezar/routing.json (when the file exists)
//   repository  checks/repository-checks.sh <project>
// A red check is reported, never hidden, and fails the run.
//
// Output: problem=<invariant> path=<path> [detail=<text>], check=<name> status=<pass|fail|skipped>,
// and last verify-status=pass|fail. Exit: 0 pass; 1 fail; 2 cannot run.

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, resolve } from "node:path";
import { execFileSync } from "node:child_process";
import { git, sha256 } from "./lib/hash.mjs";
import { loadContext, parseArgs, printHelp, SCRATCH } from "./lib/context.mjs";
import { tomlError } from "./lib/toml.mjs";
import { parseRegister } from "./lib/register.mjs";
import { isRepoRelative, resolveInside } from "./lib/paths.mjs";
import { OWNER_CONFIG, OWNER_SHAPED, SAFETY_LINE, isCheckLike, isNeverTouched, isNotRecorded } from "./lib/policy.mjs";
import { detect } from "./detect.mjs";
import { extractInputs, normalisedMatch, render } from "./lib/rewrites.mjs";
import { lineDistance } from "./lib/diff.mjs";
import { SKILL_DIR } from "./lib/kit-index.mjs";

// On native Windows a bare `bash` is WSL's on a stock machine, and a bare `node` run in the project
// is looked for in the project first: the checks start Git Bash and this Node by full path. Git
// Bash is found by this clone's own kit copy of the finder (never scripts/lib), loaded on Windows
// only (#122).
const WINDOWS = process.platform === "win32"
  ? await import(new URL(`../../${SKILL_DIR}/kit/checks/lib/windows-programs.mjs`, import.meta.url).href)
  : null;

const CONFIG_FILES = [".xezar/pipeline/config.json", ".xezar/config.json"];
const LEADER_GUIDE = ".xezar/docs/leader-guide.md";
const MARKER = /^(<{7}|={7}|>{7}|\|{7})( |$)/m;

function leaves(value, path = "", out = new Map()) {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    for (const [k, v] of Object.entries(value)) leaves(v, path ? `${path}.${k}` : k, out);
  } else out.set(path, JSON.stringify(value));
  return out;
}

export function ownerRules(text) {
  if (text == null) return null;
  const m = /^## Owner's rules[^\n]*\n[\s\S]*?(?=^## |(?![\s\S]))/m.exec(text);
  return m ? m[0] : null;
}

function before(ctx, rel) {
  if (!ctx.startCommit) return null;
  return git(["show", `${ctx.startCommit}:${rel}`], ctx.project, { allowFail: true });
}

function touchedFiles(ctx) {
  if (!ctx.git.isGit || !ctx.startCommit) return [];
  const changed = git(["diff", "--name-only", "-z", ctx.startCommit], ctx.project).split("\0");
  const untracked = git(["ls-files", "--others", "--exclude-standard", "-z"], ctx.project).split("\0");
  return [...new Set([...changed, ...untracked])].filter((p) => p && isRepoRelative(p) && !p.startsWith(".local/")).sort();
}

export function invariants(ctx, plan) {
  const problems = [];
  const problem = (kind, path, detail = "") => problems.push({ kind, path, detail });
  const read = (rel) => {
    const r = ctx.readMine(rel);
    return r.text ?? null;
  };

  for (const p of touchedFiles(ctx)) {
    const text = read(p);
    if (text == null) continue;
    if (MARKER.test(text)) problem("conflict-marker", p);
    if (p.endsWith(".json")) {
      try {
        JSON.parse(text);
      } catch (e) {
        problem("unparseable", p, e.message);
      }
    }
    if (p.endsWith(".toml")) {
      const err = tomlError(text);
      if (err) problem("unparseable", p, err);
    }
  }

  for (const rel of CONFIG_FILES) {
    const old = before(ctx, rel);
    if (old == null) continue;
    let oldJson;
    try {
      oldJson = JSON.parse(old);
    } catch {
      continue;
    }
    const now = read(rel);
    if (now == null) {
      problem("config-key-missing", rel, "the file is gone");
      continue;
    }
    let nowJson;
    try {
      nowJson = JSON.parse(now);
    } catch {
      continue; // reported as unparseable above when touched
    }
    const a = leaves(oldJson);
    const b = leaves(nowJson);
    for (const [k, v] of a) {
      if (!b.has(k)) problem("config-key-missing", rel, k);
      else if (b.get(k) !== v) problem("config-value-changed", rel, k);
    }
  }

  const oldRules = ownerRules(before(ctx, LEADER_GUIDE));
  if (oldRules !== null && ownerRules(read(LEADER_GUIDE)) !== oldRules) problem("owner-rules-changed", LEADER_GUIDE);

  const reg = parseRegister(read(".xezar/LOCAL-PATCHES.md"));
  for (const e of reg.errors) problem("register-binding", ".xezar/LOCAL-PATCHES.md", e);
  const ids = new Set(reg.entries.map((e) => e.id));
  for (const e of reg.entries) {
    for (const f of e.files) {
      if (!isRepoRelative(f)) problem("register-binding", f, `${e.id} names an unsafe path`);
      else if (ctx.readMine(f).text == null) {
        if (!recordableRemoval(ctx, f)) problem("register-binding", f, `${e.id} names a file that does not exist`);
      } else if (!OWNER_CONFIG.includes(f) && !tracked(ctx, f)) {
        // The drift check skips the owner's configuration, so an entry for it is let through.
        problem("register-binding", f, `${e.id} names a file the manifest does not track; a kept owner-side change goes in the report's merge decisions, not the register`);
      }
    }
  }
  const manifestFiles = ctx.manifest.raw.files;
  if (ctx.manifest.manifestVersion >= 2 && manifestFiles && typeof manifestFiles === "object") {
    for (const [p, v] of Object.entries(manifestFiles)) {
      if (v?.patch && !ids.has(v.patch)) problem("register-binding", p, `patch ${v.patch} has no register entry`);
    }
  }

  // Safety lines the target kit added to a file Claude resolved by hand.
  for (const item of plan?.files ?? []) {
    if (!["both-changed", "base-unknown", "moved-in-kit"].includes(item.class) || !isCheckLike(item.path)) continue;
    const theirs = ctx.theirsText(item.path);
    const now = read(item.path);
    if (theirs == null || now == null) continue;
    const baseEntry = ctx.history.find((v) => v.version === item.base?.version)?.files[item.renamedFrom ?? item.path];
    const baseText = baseEntry ? ctx.blobs.get(baseEntry.kitBlob) : null;
    const baseLines = new Set((baseText ?? "").split("\n").map((l) => l.trim()));
    const nowLines = new Set(now.split("\n").map((l) => l.trim()));
    for (const line of theirs.split("\n").map((l) => l.trim())) {
      if (!line || !SAFETY_LINE.test(line) || baseLines.has(line)) continue;
      // A placeholder line is compared after the project's own values are filled.
      if (/\{\{[A-Z_]+\}\}/.test(line)) continue;
      if (!nowLines.has(line)) problem("safety-line-missing", item.path, line);
    }
  }

  // A kept local change the register does not name. manifestV2 records sha256(mine) as the
  // installed state, so without an entry the edit becomes invisible to every later drift check.
  const registered = new Set(reg.entries.flatMap((e) => e.files));
  const detection = detect(ctx);
  const detectedByPath = new Map(detection.files.map((f) => [f.path, f]));
  for (const [p, e] of Object.entries(ctx.theirs.files)) {
    if (e.rewrite === "generated" || registered.has(p) || !recordable(ctx, p)) continue;
    const mine = read(p);
    if (mine == null) {
      // A removal is a local change too. The manifest records a removed file only with a register
      // entry, so without one the next upgrade finds no trace of it and writes the file back as
      // new in the kit. Only a file this project had counts: the old manifest records it, or
      // detection found the kit copy it sat on. An optional descriptor is the project's choice
      // (the plan skips one it did not install), never a removal.
      const had = ctx.manifest.hints.has(p) || Boolean(detectedByPath.get(p)?.base?.version);
      if (ctx.theirsCopyMap.get(p)?.optional) continue;
      if (ctx.readMine(p).missing && had) {
        problem("unregistered-local-change", p, "removed with no register entry – draft one (Confirmed: no) or restore the kit's file");
      }
      continue;
    }
    if (unchangedFromKit(ctx, p, e, mine, detectedByPath.get(p))) continue;
    // An owner-shaped file holds the owner's decisions (a project hook, a local permission):
    // restoring the kit's copy would drop them, so the only fix offered is the register entry.
    const fix = OWNER_SHAPED.has(p)
      ? "an owner-shaped file the manifest tracks still needs one: draft it (Confirmed: no); do not restore the kit's file, which would drop the owner's change"
      : "draft one (Confirmed: no) or restore the kit's file";
    problem("unregistered-local-change", p, `kept a local change with no .xezar/LOCAL-PATCHES.md entry; ${fix}`);
  }
  return problems;
}

/**
 * True when a present kit file carries no local change: it equals the target's copy, or the kit
 * copy it sits on (installedCopy), rendered with its own inputs for an adapted file. A kit copy
 * whose text is not known counts as unchanged: nothing can be compared, and the drift check
 * still starts from the digest recorded now.
 */
export function unchangedFromKit(ctx, p, target, mine, detected) {
  const same = (entry, text) => {
    if (sha256(mine) === entry.sha256) return true;
    if (text == null) return target.rewrite === "adapted";
    return target.rewrite === "adapted" ? normalisedMatch(text, mine).match : false;
  };
  const theirs = ctx.theirsText(p);
  if (same(target, theirs)) return true;
  const installed = installedCopy(ctx, p, target, mine, detected);
  if (installed.text == null && installed.entry === target) return true;
  return same(installed.entry, installed.text);
}

const ORIGINS = new Set(["copied", "adapted", "generated", "owner-file-appended"]);
const HEX64 = /^[0-9a-f]{64}$/;
const HEX40 = /^[0-9a-f]{40}$/;

/** A kit file manifest v2 would record, were it present: in the target, tracked, shared. */
export function recordable(ctx, p) {
  const e = ctx.theirs.files[p];
  if (!e || isNeverTouched(p) || isNotRecorded(p)) return false;
  if (ctx.git.isGit && ctx.git.ignored(p)) return false; // per-machine: never recorded
  return !(e.rewrite !== "generated" && ctx.theirsCopyMap.get(p)?.perMachine);
}

/**
 * The manifest entry for a kit file the project removed on purpose, without its `patch`: what
 * was installed (the old v2 entry, else the manifest's hint, else the detected base, else the
 * target), so the next upgrade still knows the file and reads its absence as the local change
 * the register records. Null when no digest is known.
 */
export function removedEntry(ctx, p, detected = null) {
  const e = ctx.theirs.files[p];
  const old = ctx.manifest.manifestVersion >= 2 ? ctx.manifest.raw.files?.[p] ?? null : null;
  const hint = ctx.manifest.hints.get(p) ?? {};
  const base = detected?.base?.entry ?? null;
  const sha = [old?.sha256, hint.sha256, base?.sha256, e.sha256].find((x) => typeof x === "string" && HEX64.test(x));
  if (!sha) return null;
  const recorded = old?.origin ?? hint.origin;
  const entry = { sha256: sha, origin: ORIGINS.has(recorded) && recorded !== "owner-file-appended" ? recorded : e.rewrite };
  if (e.rewrite !== "generated") {
    const src = typeof old?.kitSource === "string" && HEX40.test(old?.kitBlob ?? "") ? old : base ?? e;
    entry.kitSource = src.kitSource;
    entry.kitBlob = src.kitBlob;
    const inputs = old?.renderInputs ?? hint.renderInputs;
    if (e.rewrite === "adapted" && inputs && Object.keys(inputs).length) entry.renderInputs = inputs;
  }
  return entry;
}

/**
 * A present file manifest v2 records, so a register entry can bind to it: a recordable kit file,
 * or an owner file with a recorded, still-present appended kit block (see manifestV2).
 */
function tracked(ctx, p) {
  if (recordable(ctx, p)) return true;
  if (isNeverTouched(p) || ctx.manifest.hints.get(p)?.origin !== "owner-file-appended") return false;
  const text = ctx.readMine(p).text;
  return text != null && appendedBlock(text) !== null;
}

/** A register path that is absent but can be recorded as a removal (see removedEntry). */
function recordableRemoval(ctx, p) {
  return Boolean(ctx.readMine(p).missing && recordable(ctx, p) && removedEntry(ctx, p));
}

/** The kit-owned block of an owner file, markers included (upgrade/CONTRACT.md §1.2). */
export function appendedBlock(text) {
  const start = text.indexOf("<!-- xezar:kit:start -->");
  const endMarker = "<!-- xezar:kit:end -->";
  const end = text.indexOf(endMarker, start);
  return start < 0 || end < 0 ? null : text.slice(start, end + endMarker.length);
}

/**
 * The kit copy a file now sits on, which is what its manifest entry records (kitSource, kitBlob,
 * and for a patched file sha256): the next upgrade merges from it. A file that matches the
 * target's copy sits on the target. One that does not – kept at its old version, or a both-changed
 * file resolved to the owner's side – sits on the base detection finds before the target, unless
 * it is strictly closer to the target's text (a merge that took the target's changes). A tie goes
 * to the older base: an upgrade that sees the target's changes as the owner's asks, while one
 * that takes a missing target change for an owner deletion drops it without a word.
 * Returns { entry, text } where entry is a kit index entry and text its raw kit content (or null).
 */
export function installedCopy(ctx, p, target, mineText, detected) {
  const theirs = ctx.theirsText(p);
  const onTarget = { entry: target, text: theirs };
  if (sha256(mineText) === target.sha256) return onTarget;
  if (target.rewrite === "adapted" && theirs != null && normalisedMatch(theirs, mineText).match) return onTarget;
  const b = detected?.base;
  if (!b?.entry?.kitBlob || b.entry.kitBlob === target.kitBlob) return onTarget;
  const baseText = b.text ?? ctx.blobs.get(b.entry.kitBlob);
  const onBase = { entry: b.entry, text: baseText ?? null };
  if (sha256(mineText) === b.entry.sha256) return onBase;
  if (baseText == null) return onBase; // the detected base is all that is known
  if (normalisedMatch(baseText, mineText).match) return onBase;
  if (theirs == null) return onBase;
  return lineDistance(theirs, mineText) < lineDistance(baseText, mineText) ? onTarget : onBase;
}

/** Build manifest v2 from the upgraded tree. */
export function manifestV2(ctx) {
  const reg = parseRegister(ctx.readMine(".xezar/LOCAL-PATCHES.md").text ?? null);
  const patchOf = new Map();
  for (const e of reg.entries) for (const f of e.files) if (!patchOf.has(f)) patchOf.set(f, e.id);
  const old = ctx.manifest.raw;
  const oldFiles = ctx.manifest.manifestVersion >= 2 ? old.files ?? {} : {};
  const files = {};
  const descriptors = {};
  const detection = detect(ctx);
  const detectedByPath = new Map(detection.files.map((f) => [f.path, f]));
  for (const [p, e] of Object.entries(ctx.theirs.files).sort(([a], [b]) => (a < b ? -1 : 1))) {
    if (!recordable(ctx, p)) continue;
    const mine = ctx.readMine(p);
    if (mine.text == null) {
      // Removed on purpose: a register entry covers the absence, and the entry keeps what was
      // installed. Removed with no register entry: not recorded (the drift check would fail it).
      const removed = mine.missing && patchOf.has(p) ? removedEntry(ctx, p, detectedByPath.get(p)) : null;
      if (removed) files[p] = { ...removed, patch: patchOf.get(p) };
      continue;
    }
    // `origin` is set at install time and never changes: keep a recorded one.
    const recorded = oldFiles[p]?.origin ?? ctx.manifest.hints.get(p)?.origin;
    const entry = { sha256: sha256(mine.text), origin: ORIGINS.has(recorded) && recorded !== "owner-file-appended" ? recorded : e.rewrite };
    if (e.rewrite !== "generated") {
      const installed = installedCopy(ctx, p, e, mine.text, detectedByPath.get(p));
      entry.kitSource = installed.entry.kitSource;
      entry.kitBlob = installed.entry.kitBlob;
      let inputs = null;
      if (e.rewrite === "adapted") {
        inputs = (installed.text && extractInputs(installed.text, mine.text)) ?? detectedByPath.get(p)?.base?.inputs ?? null;
        if (inputs && Object.keys(inputs).length) entry.renderInputs = inputs;
      }
      // A patched file keeps the digest of what was installed: the register is its record.
      if (patchOf.has(p)) {
        if (e.rewrite !== "adapted") entry.sha256 = installed.entry.sha256;
        else if (installed.text != null) {
          const r = render(installed.text, inputs ?? {});
          if (!r.missing.length) entry.sha256 = sha256(r.text);
        }
      }
    }
    if (patchOf.has(p)) entry.patch = patchOf.get(p);
    files[p] = entry;
    if (p.startsWith(".xezar/pipeline/") && /\/(toolchains|browsers|security|trackers)\/[^/]+\.md$/.test(p)) {
      descriptors[p] = entry.sha256;
    }
  }
  // Owner files with an appended kit block (AGENTS.md, CLAUDE.md) are in no kit index: carry
  // each recorded one over, hashing only the block between the markers.
  for (const [p, h] of ctx.manifest.hints) {
    if (h.origin !== "owner-file-appended" || files[p] || isNeverTouched(p)) continue;
    const text = ctx.readMine(p).text;
    const block = text == null ? null : appendedBlock(text);
    if (block !== null) files[p] = { sha256: sha256(block), origin: "owner-file-appended", ...(patchOf.has(p) ? { patch: patchOf.get(p) } : {}) };
  }
  const { manifestVersion: _v, files: _f, descriptors: _d, version: _ver, date: _date, ...rest } = old;
  return {
    manifestVersion: 2,
    version: ctx.target,
    date: new Date().toISOString().replace(/\.\d{3}Z$/, "Z"),
    ...rest,
    descriptors,
    files,
  };
}

function runCheck(name, cmd, args, cwd) {
  try {
    const out = execFileSync(cmd, args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: 300000 });
    return { name, status: "pass", out };
  } catch (e) {
    return { name, status: "fail", out: `${e.stdout ?? ""}${e.stderr ?? ""}`.trim() };
  }
}

export function projectChecks(ctx, which) {
  const kit = join(ctx.kitSkillDir, "kit/checks");
  const results = [];
  if (which.includes("drift")) {
    const drift = join(kit, "manifest-drift.mjs");
    if (existsSync(drift)) results.push(runCheck("drift", process.execPath, [drift, ctx.project], ctx.project));
    else results.push({ name: "drift", status: "skipped", out: "the target kit has no manifest-drift.mjs" });
  }
  if (which.includes("catalog")) results.push(runCheck("catalog", process.execPath, [join(kit, "catalog-check.mjs"), ctx.project], ctx.project));
  if (which.includes("route")) {
    if (existsSync(join(ctx.project, ".xezar/routing.json"))) {
      results.push(runCheck("route", process.execPath, [join(kit, "route.mjs"), "--check", join(ctx.project, ".xezar/routing.json")], ctx.project));
    } else results.push({ name: "route", status: "skipped", out: "no .xezar/routing.json" });
  }
  // The project root is passed: left to itself the script takes two folders up from its own
  // location, which here is this clone's skill folder, not the project.
  if (which.includes("repository")) {
    const bash = WINDOWS ? WINDOWS.gitBash() : "bash";
    if (bash === null) results.push({ name: "repository", status: "fail", out: WINDOWS.GIT_BASH_MISSING });
    else results.push(runCheck("repository", bash, [join(kit, "repository-checks.sh"), ctx.project], ctx.project));
  }
  return results;
}

export function verify(ctx, plan, { writeManifest = true, checks = ["drift", "catalog", "route", "repository"] } = {}) {
  const problems = invariants(ctx, plan);
  let manifest = null;
  let results = [];
  if (!problems.length && writeManifest) {
    manifest = manifestV2(ctx);
    const path = resolveInside(ctx.project, ".xezar/onboarding.json");
    writeFileSync(path, `${JSON.stringify(manifest, null, 2)}\n`);
    results = projectChecks(ctx, checks);
  }
  const failed = problems.length > 0 || results.some((r) => r.status === "fail");
  return { status: failed ? "fail" : "pass", problems, checks: results, manifest };
}

function main() {
  if (printHelp(process.argv.slice(2), import.meta.url)) return;
  const args = parseArgs(process.argv.slice(2), ["no-manifest"]);
  const ctx = loadContext({
    project: args.project ?? process.cwd(),
    target: args.target,
    indexDir: args["index-dir"],
    kitSkillDir: args.kit,
    blobPacks: args["blob-pack"],
  });
  const planPath = args.plan ? resolve(args.plan) : join(ctx.project, SCRATCH, "plan.json");
  const plan = existsSync(planPath) ? JSON.parse(readFileSync(planPath, "utf8")) : null;
  if (plan?.startCommit) ctx.startCommit = plan.startCommit;
  const checks = (args.checks ?? "drift,catalog,route,repository").split(",").map((s) => s.trim()).filter(Boolean);
  const r = verify(ctx, plan, { writeManifest: !args["no-manifest"], checks });
  for (const p of r.problems) console.log(`problem=${p.kind} path=${p.path}${p.detail ? ` detail=${p.detail}` : ""}`);
  for (const c of r.checks) {
    console.log(`check=${c.name} status=${c.status}`);
    if (c.status !== "pass" && c.out) console.log(c.out.split("\n").map((l) => `  ${l}`).join("\n"));
  }
  console.log(`verify-status=${r.status}`);
  if (r.status !== "pass") process.exit(1);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (e) {
    console.error(`verify: ${e.message}`);
    process.exit(2);
  }
}
