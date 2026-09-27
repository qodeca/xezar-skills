#!/usr/bin/env node
// build.mjs – materialise one upgrade eval case as a project the upgrade prompt can run in.
//
//   node upgrade/evals/build.mjs <case dir> <out dir>
//
// A case (upgrade/evals/cases/<name>/case.json) names a committed synthetic install
// (scripts/fixtures/upgrade/<base>/fixture.json) and the owner's edits on top of it. The install
// is written from the fixture and the committed blob pack exactly as scripts/test-upgrade.mjs
// writes it, so no kit file is copied by hand. The edits are then applied, and the tree is
// committed on the fixture's base branch and pushed to a local bare "origin", so the prompt's
// preflight (clean tree, up to date with origin/<baseBranch>) has something real to check.
//
// Output:
//   <out>/project     the project (a git repository on its base branch, clean)
//   <out>/origin.git  its bare remote
//
// Edit operations (each { "path": ..., <op> }):
//   create: "<text>"                   write the file
//   append: "<text>"                   append to the file
//   replace: { find, with }            replace one exact occurrence (fails when absent or repeated)
//   jsonSet: { key: [..], value }      set a key in a JSON file, written with 2-space indent
//   fromTarget: { drop?: "<text>", append?: "<text>" }
//                                      write the 3.1.0-candidate kit text of the path (rendered
//                                      with the fixture's placeholder values), minus one exact
//                                      passage, plus an appended one
// `register` (optional) is written to .xezar/LOCAL-PATCHES.md as is.
//
// Offline: reads only committed files and the working tree's kit. Exit 0 built; 1 on any error.

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { readPack } from "../tools/lib/blobs.mjs";
import { render } from "../tools/lib/rewrites.mjs";
import { indexFromTree, loadIndexes, SKILL_DIR } from "../tools/lib/kit-index.mjs";

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const FIX = join(ROOT, "scripts/fixtures/upgrade");

const git = (cwd, ...args) => execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
const write = (dir, rel, text) => {
  mkdirSync(dirname(join(dir, rel)), { recursive: true });
  writeFileSync(join(dir, rel), text);
};

let treeCache = null;
/** The 3.1.0-candidate kit text of an installed path, rendered with `inputs`. */
export function targetText(path, inputs) {
  treeCache ??= indexFromTree(join(ROOT, SKILL_DIR), { version: "3.1.0" });
  const e = treeCache.index.files[path];
  if (!e || !e.kitSource) return null;
  const raw = treeCache.kitFiles.get(`kit/${e.kitSource}`).toString("utf8");
  return e.rewrite === "adapted" ? render(raw, inputs).text : raw;
}

export function loadCase(caseDir) {
  return JSON.parse(readFileSync(join(caseDir, "case.json"), "utf8"));
}

export function loadFixture(version) {
  return JSON.parse(readFileSync(join(FIX, version, "fixture.json"), "utf8"));
}

function applyEdit(dir, e, fx) {
  const full = join(dir, e.path);
  const text = existsSync(full) ? readFileSync(full, "utf8") : null;
  if (e.create !== undefined) return write(dir, e.path, e.create);
  if (text === null && !e.fromTarget) throw new Error(`edit on ${e.path}: the file does not exist`);
  if (e.append !== undefined) return write(dir, e.path, text + e.append);
  if (e.replace) {
    const n = text.split(e.replace.find).length - 1;
    if (n !== 1) throw new Error(`edit on ${e.path}: the text to replace occurs ${n} times, not once`);
    return write(dir, e.path, text.replace(e.replace.find, () => e.replace.with));
  }
  if (e.jsonSet) {
    const j = JSON.parse(text);
    let o = j;
    const keys = e.jsonSet.key;
    for (const k of keys.slice(0, -1)) o = o[k] ??= {};
    o[keys[keys.length - 1]] = e.jsonSet.value;
    return write(dir, e.path, `${JSON.stringify(j, null, 2)}\n`);
  }
  if (e.fromTarget) {
    let t = targetText(e.path, fx.renderInputs);
    if (t === null) throw new Error(`edit on ${e.path}: the target kit has no such file`);
    if (e.fromTarget.drop) {
      if (!t.includes(e.fromTarget.drop)) throw new Error(`edit on ${e.path}: the passage to drop is not in the target text`);
      t = t.replace(e.fromTarget.drop, "");
    }
    return write(dir, e.path, t + (e.fromTarget.append ?? ""));
  }
  throw new Error(`edit on ${e.path}: no known operation`);
}

export function build(caseDir, outDir) {
  const spec = loadCase(caseDir);
  const fx = loadFixture(spec.base);
  const pack = readPack(join(FIX, "blobs.json.gz.hex"));
  const idx = loadIndexes(join(ROOT, "upgrade/kit-index")).find((v) => v.version === fx.version);
  const project = join(outDir, "project");
  const origin = join(outDir, "origin.git");
  if (existsSync(project) || existsSync(origin)) throw new Error(`${outDir} already holds a built case`);
  mkdirSync(project, { recursive: true });
  for (const [p, blob] of Object.entries(fx.files)) {
    const text = pack[blob];
    if (text === undefined) throw new Error(`fixture ${fx.version}: blob ${blob} missing from the pack`);
    write(project, p, idx.files[p].rewrite === "adapted" ? render(text, fx.renderInputs).text : text);
  }
  for (const [p, text] of Object.entries(fx.generated)) write(project, p, text);
  write(project, ".xezar/onboarding.json", `${JSON.stringify(fx.manifest, null, 2)}\n`);
  for (const e of spec.edits ?? []) applyEdit(project, e, fx);
  if (spec.register) write(project, ".xezar/LOCAL-PATCHES.md", spec.register);

  const base = JSON.parse(readFileSync(join(project, ".xezar/pipeline/config.json"), "utf8")).baseBranch ?? "main";
  git(project, "init", "-q", "-b", base);
  git(project, "add", "-A");
  git(project, "-c", "user.name=eval", "-c", "user.email=eval@example.invalid", "commit", "-qm", `eval case ${spec.name}`);
  git(outDir, "init", "-q", "--bare", "-b", base, origin);
  git(project, "remote", "add", "origin", origin);
  git(project, "push", "-q", "origin", base);
  git(project, "fetch", "-q", "origin");
  git(project, "remote", "set-head", "origin", base);
  return { project, origin, base };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [caseDir, outDir] = process.argv.slice(2);
  if (!caseDir || !outDir) {
    console.error("usage: node upgrade/evals/build.mjs <case dir> <out dir>");
    process.exit(1);
  }
  try {
    const r = build(resolve(caseDir), resolve(outDir));
    console.log(`project=${r.project}`);
    console.log(`origin=${r.origin}`);
    console.log(`base-branch=${r.base}`);
  } catch (e) {
    console.error(`build: ${e.message}`);
    process.exit(1);
  }
}
