// Path containment for every path the upgrade tools read, write or delete in a project
// (plan §6.5 step 4). A path comes from the project's own manifest, register or tree, which
// are data: a `../` or an absolute path in them must never reach the file system.
//
// The rules, all enforced here and nowhere else:
//   - repo-relative, POSIX separators, already normalised, no `.` or `..` segment, not absolute;
//   - no component of the path, from the project root down, is a symbolic link;
//   - the real path stays inside the project's real root;
//   - a write or delete is allowed only for a path in the copy map of the version involved;
//   - a path git ignores, or an existing file git does not track, is never written (per-machine).

import { lstatSync, realpathSync, existsSync } from "node:fs";
import { join, sep } from "node:path";
import { posix } from "node:path";
import { git } from "./hash.mjs";

export class PathRefused extends Error {
  constructor(path, reason) {
    super(`path refused: ${JSON.stringify(path)} (${reason})`);
    this.path = path;
    this.reason = reason;
  }
}

/** Throws PathRefused unless `rel` is a clean repo-relative path. Returns it unchanged. */
export function assertRepoRelative(rel) {
  if (typeof rel !== "string" || rel.length === 0) throw new PathRefused(rel, "empty");
  if (rel.includes("\0")) throw new PathRefused(rel, "NUL byte");
  if (rel.includes("\\")) throw new PathRefused(rel, "backslash");
  if (rel.startsWith("/") || /^[A-Za-z]:/.test(rel)) throw new PathRefused(rel, "absolute");
  const segments = rel.split("/");
  if (segments.some((s) => s === ".." )) throw new PathRefused(rel, "parent segment");
  if (segments.some((s) => s === "." || s === "")) throw new PathRefused(rel, "not normalised");
  if (posix.normalize(rel) !== rel) throw new PathRefused(rel, "not normalised");
  return rel;
}

export function isRepoRelative(rel) {
  try {
    assertRepoRelative(rel);
    return true;
  } catch {
    return false;
  }
}

/**
 * Resolve `rel` inside `root` for reading or writing. Refuses a symlink anywhere on the way,
 * and a real path that leaves the root. The final component may be missing (a new file).
 */
export function resolveInside(root, rel) {
  assertRepoRelative(rel);
  const realRoot = realpathSync(root);
  let current = realRoot;
  const segments = rel.split("/");
  for (let i = 0; i < segments.length; i += 1) {
    current = join(current, segments[i]);
    let st;
    try {
      st = lstatSync(current);
    } catch {
      // Missing from here down: nothing below can be a link yet.
      break;
    }
    if (st.isSymbolicLink()) {
      throw new PathRefused(rel, i === segments.length - 1 ? "symbolic link" : "under a symlinked folder");
    }
  }
  const full = join(realRoot, ...segments);
  if (existsSync(full)) {
    const real = realpathSync(full);
    if (real !== realRoot && !real.startsWith(realRoot + sep)) throw new PathRefused(rel, "escapes the project");
  }
  if (full !== realRoot && !full.startsWith(realRoot + sep)) throw new PathRefused(rel, "escapes the project");
  return full;
}

/** A write or delete target must also be in the copy map (index) of the version involved. */
export function assertInCopyMap(rel, ...indexes) {
  if (!indexes.some((idx) => idx && Object.prototype.hasOwnProperty.call(idx.files ?? idx, rel))) {
    throw new PathRefused(rel, "not in the kit copy map");
  }
}

/**
 * Per-machine test: git ignores it, or it exists and git does not track it. Outside a git
 * work tree nothing is per-machine by this test (the copy map's own flag still applies).
 */
export function gitState(root) {
  const inside = git(["rev-parse", "--is-inside-work-tree"], root, { allowFail: true });
  if (!inside || inside.trim() !== "true") {
    return { isGit: false, tracked: () => true, ignored: () => false, prime: () => {} };
  }
  const tracked = new Set(git(["ls-files", "-z"], root).split("\0").filter(Boolean));
  const ignoredCache = new Map();
  // One `git check-ignore --stdin` for a whole batch: a process per path is slow.
  const prime = (paths) => {
    const todo = paths.filter((p) => !ignoredCache.has(p));
    if (!todo.length) return;
    const out = git(["check-ignore", "--no-index", "--stdin", "-z"], root, { input: `${todo.join("\0")}\0`, allowFail: true }) ?? "";
    const hit = new Set(out.split("\0").filter(Boolean));
    for (const p of todo) ignoredCache.set(p, hit.has(p));
  };
  const ignored = (rel) => {
    if (!ignoredCache.has(rel)) prime([rel]);
    return ignoredCache.get(rel);
  };
  return { isGit: true, tracked: (rel) => tracked.has(rel), ignored, prime };
}
