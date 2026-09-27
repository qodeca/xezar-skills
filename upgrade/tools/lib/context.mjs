// Everything a tool run needs, loaded once: the project, its manifest and register, the kit
// index history, the target kit tree ("theirs") and a blob source for old kit contents.
//
// The tool is always run FROM the verified xezar-skills clone, against a project given by
// --project. It reads the project; it never executes anything in it.

import { existsSync, readFileSync, lstatSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createBlobSource } from "./blobs.mjs";
import { indexFromTree, loadIndexes, diffIndexes, SKILL_DIR } from "./kit-index.mjs";
import { readManifest } from "./manifest.mjs";
import { parseRegister } from "./register.mjs";
import { gitState, resolveInside, PathRefused } from "./paths.mjs";
import { git } from "./hash.mjs";

export const TOOL_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
export const SCRATCH = ".local/xezar/scratch/upgrade";

/** `--help` or `-h`: print the calling tool's header comment (its usage) and return true. */
export function printHelp(argv, toolUrl) {
  if (!argv.includes("--help") && !argv.includes("-h")) return false;
  const lines = readFileSync(fileURLToPath(toolUrl), "utf8").split("\n");
  const out = [];
  for (const line of lines.slice(lines[0].startsWith("#!") ? 1 : 0)) {
    if (!line.startsWith("//")) break;
    out.push(line.replace(/^\/\/ ?/, ""));
  }
  console.log(out.join("\n"));
  return true;
}

export function parseArgs(argv, flags = []) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (!a.startsWith("--")) {
      out._.push(a);
      continue;
    }
    const key = a.slice(2);
    if (flags.includes(key)) out[key] = true;
    else {
      const v = argv[i + 1];
      if (v === undefined || v.startsWith("--")) throw new Error(`${a} needs a value`);
      if (key === "blob-pack") (out[key] ??= []).push(v);
      else out[key] = v;
      i += 1;
    }
  }
  return out;
}

/**
 * The target version when none is given: package.json's version, unless the committed index
 * for that version differs from the tree (a development checkout past the release), then a
 * pseudo-version `<version>+<sha12>` of the checkout's HEAD.
 */
function defaultTarget(toolRoot, history, treeIndex) {
  const version = JSON.parse(readFileSync(join(toolRoot, "package.json"), "utf8")).version;
  const committed = history.find((v) => v.version === version);
  if (!committed) return version;
  const d = diffIndexes(committed, treeIndex);
  if (!d.added.length && !d.removed.length && !d.changed.length) return version;
  const head = (git(["rev-parse", "HEAD"], toolRoot, { allowFail: true }) ?? "").trim();
  return `${version}+${/^[0-9a-f]{40}$/.test(head) ? head.slice(0, 12) : "000000000000"}`;
}

/**
 * @param {object} o
 * @param {string} o.project   project root
 * @param {string} [o.toolRoot] the xezar-skills checkout the tools run from
 * @param {string} [o.kitSkillDir] kit tree to upgrade to (default: <toolRoot>/skills/xez-onboard-opinionated)
 * @param {string} [o.indexDir] default <toolRoot>/upgrade/kit-index
 * @param {string} [o.target] target version label (default: package.json version of toolRoot)
 * @param {string|null} [o.blobRepo] git repo for old blobs (default: toolRoot)
 * @param {string[]} [o.blobPacks]
 * @param {object} [o.theirsIndex] inject a target index (tests)
 * @param {Array} [o.indexes] inject the history (tests)
 */
export function loadContext(o) {
  const project = resolve(o.project);
  const toolRoot = resolve(o.toolRoot ?? TOOL_ROOT);
  const kitSkillDir = resolve(o.kitSkillDir ?? join(toolRoot, SKILL_DIR));
  const indexDir = resolve(o.indexDir ?? join(toolRoot, "upgrade/kit-index"));
  const history = o.indexes ?? loadIndexes(indexDir);
  const built = indexFromTree(kitSkillDir, { version: o.target ?? "tree" });
  const target = o.target ?? defaultTarget(toolRoot, history, built.index);
  built.index.version = target;
  const theirs = o.theirsIndex ?? built.index;
  // A committed index for the target (release) carries renamedFrom from git history.
  const committedTarget = history.find((v) => v.version === target);
  if (committedTarget && !o.theirsIndex) {
    for (const [p, e] of Object.entries(committedTarget.files)) {
      if (e.renamedFrom && theirs.files[p]) theirs.files[p].renamedFrom = e.renamedFrom;
    }
  }
  const targetPos = history.findIndex((v) => v.version === target);
  const candidates = targetPos >= 0 ? history.slice(0, targetPos) : history;

  const manifestPath = join(project, ".xezar/onboarding.json");
  if (!existsSync(manifestPath)) throw new Error("no .xezar/onboarding.json: this project was not onboarded with the kit");
  const manifest = readManifest(readFileSync(manifestPath, "utf8"));
  const registerPath = join(project, ".xezar/LOCAL-PATCHES.md");
  const registerText = existsSync(registerPath) ? readFileSync(registerPath, "utf8") : null;
  const register = parseRegister(registerText);

  const blobs = createBlobSource({
    repo: o.blobRepo === undefined ? toolRoot : o.blobRepo,
    packs: o.blobPacks ?? [],
  });

  const theirsText = (p) => {
    const e = theirs.files[p];
    if (!e || !e.kitSource) return null;
    const buf = built.kitFiles.get(`kit/${e.kitSource}`);
    return buf ? buf.toString("utf8") : blobs.get(e.kitBlob);
  };
  const theirsMode = (p) => {
    const e = theirs.files[p];
    if (!e?.kitSource) return 0o644;
    try {
      return lstatSync(join(kitSkillDir, "kit", e.kitSource)).mode & 0o777;
    } catch {
      return 0o644;
    }
  };

  const gs = gitState(project);
  const startCommit = gs.isGit ? (git(["rev-parse", "HEAD"], project, { allowFail: true }) ?? "").trim() || null : null;

  /** Read a project file safely. Returns { text, sha? } | { missing } | { refused, reason }. */
  const readMine = (p) => {
    let full;
    try {
      full = resolveInside(project, p);
    } catch (e) {
      if (e instanceof PathRefused) return { refused: true, reason: e.reason };
      throw e;
    }
    if (!existsSync(full)) return { missing: true };
    const st = lstatSync(full);
    if (!st.isFile()) return { refused: true, reason: "not a regular file" };
    return { text: readFileSync(full, "utf8"), mode: st.mode & 0o777 };
  };

  return {
    project,
    toolRoot,
    kitSkillDir,
    target,
    history,
    candidates,
    theirs,
    theirsCopyMap: built.copyMap,
    theirsText,
    theirsMode,
    manifest,
    register,
    registerText,
    blobs,
    git: gs,
    startCommit,
    readMine,
  };
}
