#!/usr/bin/env node
// Builds upgrade/kit-index/ from git history: one file per kit version (upgrade/CONTRACT.md §3).
//
// Versions: every release tag from v1.2.0 on that is an ancestor of --ref, plus a
// pseudo-version `<last tag>+<sha12>` for every other commit after v1.2.0 that changed
// `skills/xez-onboard-opinionated/kit/`. Projects were installed from the default branch, not
// only from tags, so an install from an untagged commit must still find its base.
//
// Each version is mapped with the copy table of THAT version's `references/write.md`
// (upgrade/tools/lib/copy-map.mjs). `renamedFrom` comes from git's rename detection between
// consecutive versions.
//
// This needs full history and tags, so it is run by hand and its output committed; no gate
// reads tags (CI checks out shallow). The release PR re-runs it for the new tag.
//
// Run:   node scripts/build-kit-index.mjs [--ref HEAD] [--out upgrade/kit-index] [--check]
//        --check rebuilds into memory and fails if the committed files differ, or if a commit the
//        committed index records is not an ancestor of --ref (an index built on a branch that was
//        squash-merged points at commits no clone of the release has). No gate runs --check: it
//        needs full history and tags, and the index is rebuilt at release time (upgrade/README.md).

import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync, existsSync, readdirSync, rmSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { toLF } from "./lib/platform.mjs";
import { git, stableJson } from "../upgrade/tools/lib/hash.mjs";
import { buildVersionIndex, SKILL_DIR } from "../upgrade/tools/lib/kit-index.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : fallback;
};
const ref = opt("--ref", "HEAD");
const outDir = join(root, opt("--out", "upgrade/kit-index"));
const check = args.includes("--check");
const FIRST_TAG = "v1.2.0";
const KIT = `${SKILL_DIR}/kit`;

const g = (a) => git(a, root);

function versionsToIndex() {
  if (!g(["tag", "-l", FIRST_TAG]).trim()) {
    throw new Error(`tag ${FIRST_TAG} is not in this clone: run with full history and tags (git fetch --tags --unshallow)`);
  }
  const tags = g(["tag", "--merged", ref, "-l", "v*"]).trim().split("\n").filter(Boolean);
  const tagAt = new Map();
  for (const t of tags) {
    const sha = g(["rev-list", "-n1", t]).trim();
    if (!tagAt.has(sha) || t > tagAt.get(sha)) tagAt.set(sha, t);
  }
  const firstSha = g(["rev-list", "-n1", FIRST_TAG]).trim();
  // Every commit from v1.2.0 (inclusive) to ref, oldest first.
  const commits = [firstSha, ...g(["rev-list", "--reverse", "--topo-order", `${firstSha}..${ref}`]).trim().split("\n").filter(Boolean)];
  const kitTouch = new Set(g(["rev-list", `${firstSha}..${ref}`, "--", KIT]).trim().split("\n").filter(Boolean));
  const out = [];
  for (const sha of commits) {
    const tag = tagAt.get(sha) ?? null;
    if (tag) {
      out.push({ version: tag.replace(/^v/, ""), commit: sha, tag });
    } else if (kitTouch.has(sha)) {
      const last = g(["describe", "--tags", "--abbrev=0", "--match", "v*", sha]).trim();
      out.push({ version: `${last.replace(/^v/, "")}+${sha.slice(0, 12)}`, commit: sha, tag: null });
    }
  }
  return out;
}

function readBlobs(shas) {
  const unique = [...new Set(shas)];
  const buf = execFileSync("git", ["cat-file", "--batch"], {
    cwd: root,
    input: `${unique.join("\n")}\n`,
    maxBuffer: 512 * 1024 * 1024,
  });
  const map = new Map();
  let pos = 0;
  for (const sha of unique) {
    const nl = buf.indexOf(10, pos);
    const header = buf.subarray(pos, nl).toString("utf8");
    const [got, type, size] = header.split(" ");
    if (got !== sha || type !== "blob") throw new Error(`cat-file: unexpected header ${header}`);
    const len = Number(size);
    map.set(sha, buf.subarray(nl + 1, nl + 1 + len));
    pos = nl + 1 + len + 1;
  }
  return map;
}

function treeAt(commit) {
  const out = g(["ls-tree", "-r", "-z", commit, "--", `${KIT}/`]);
  const files = [];
  for (const rec of out.split("\0").filter(Boolean)) {
    const m = /^(\d+) (\w+) ([0-9a-f]{40})\t(.+)$/.exec(rec);
    if (!m || m[2] !== "blob") continue;
    files.push({ path: m[4].slice(SKILL_DIR.length + 1), blob: m[3] });
  }
  return files;
}

function renamesBetween(prev, cur) {
  const out = g(["diff", "-M", "--name-status", "-z", prev, cur, "--", `${KIT}/`]);
  const parts = out.split("\0").filter((s) => s !== "");
  const renames = [];
  for (let i = 0; i < parts.length; ) {
    const status = parts[i];
    if (status.startsWith("R")) {
      renames.push({ from: parts[i + 1].slice(SKILL_DIR.length + 1), to: parts[i + 2].slice(SKILL_DIR.length + 1) });
      i += 3;
    } else if (status.startsWith("C")) i += 3;
    else i += 2;
  }
  return renames;
}

const versions = versionsToIndex();
const trees = versions.map((v) => treeAt(v.commit));
const blobs = readBlobs(trees.flat().map((f) => f.blob));
const built = [];
let previous = null;
for (let i = 0; i < versions.length; i += 1) {
  const v = versions[i];
  const kitFiles = new Map(trees[i].map((f) => [f.path, blobs.get(f.blob)]));
  const writeMd = g(["show", `${v.commit}:${SKILL_DIR}/references/write.md`]);
  const { index, unmapped, copyMap } = buildVersionIndex({ kitFiles, writeMd, ...v });
  if (previous) {
    const kitToInstalled = (map) => new Map([...map].filter(([, e]) => e.kitSource).map(([p, e]) => [`kit/${e.kitSource}`, p]));
    const prevMap = kitToInstalled(previous.copyMap);
    const curMap = kitToInstalled(copyMap);
    for (const r of renamesBetween(previous.index.commit, v.commit)) {
      const oldInstalled = prevMap.get(r.from);
      const newInstalled = curMap.get(r.to);
      if (oldInstalled && newInstalled && oldInstalled !== newInstalled && !(oldInstalled in index.files)) {
        index.files[newInstalled].renamedFrom = oldInstalled;
      }
    }
  }
  if (unmapped.length) {
    console.error(`${v.version}: kit files with no installed path: ${unmapped.join(", ")}`);
  }
  built.push(index);
  previous = { index, copyMap };
}

const listing = { versions: built.map(({ version, commit, tag }) => ({ version, commit, tag })) };
const outputs = new Map([["index.json", stableJson(listing)], ...built.map((ix) => [`${ix.version}.json`, stableJson(ix)])]);

/** True when `commit` exists here and is an ancestor of (or equal to) `ref`. */
function isAncestor(commit) {
  try {
    execFileSync("git", ["merge-base", "--is-ancestor", commit, ref], { cwd: root, stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

if (check) {
  let bad = 0;
  const committedListing = join(outDir, "index.json");
  if (existsSync(committedListing)) {
    for (const v of JSON.parse(readFileSync(committedListing, "utf8")).versions ?? []) {
      if (!isAncestor(v.commit)) {
        console.error(`kit index records ${v.version} at ${v.commit}, which is not an ancestor of ${ref}: rebuild the index on the release line`);
        bad += 1;
      }
    }
  }
  for (const [name, text] of outputs) {
    const path = join(outDir, name);
    // A CRLF checkout of the committed index is not stale (#122); blobs read from git stay raw.
    if (!existsSync(path) || toLF(readFileSync(path, "utf8")) !== text) {
      console.error(`kit index is stale: ${name}`);
      bad += 1;
    }
  }
  if (existsSync(outDir)) {
    for (const name of readdirSync(outDir)) {
      if (name.endsWith(".json") && !outputs.has(name)) {
        console.error(`kit index has a file no version produces: ${name}`);
        bad += 1;
      }
    }
  }
  if (bad) process.exit(1);
  console.log(`kit index OK (${built.length} versions).`);
} else {
  mkdirSync(outDir, { recursive: true });
  for (const name of readdirSync(outDir)) {
    if (name.endsWith(".json") && !outputs.has(name)) rmSync(join(outDir, name));
  }
  for (const [name, text] of outputs) writeFileSync(join(outDir, name), text);
  console.log(`kit index written: ${built.length} versions to ${outDir}`);
}
