/**
 * A private copy of a checkout's working tree and index, for tests that must not touch it (#123).
 * Users: test-guards.mjs.
 *
 * The copy is a detached git worktree of the checkout's HEAD whose index is loaded from the
 * checkout's own (staged changes included, one object store) and whose files are the index's,
 * overlaid with the checkout's unstaged edits, deletions and untracked files that are not ignored.
 * So `git status --porcelain` and `git ls-files -s` read the same in both, and a test that runs a
 * gate in the copy sees the user's work in progress. The checkout's working tree and index are
 * never written: only `.git/worktrees/<name>/` is, and the cleanup removes only this suite's own
 * entries – never a global `git worktree prune`, which would drop the admin entries of the user's
 * own worktrees whose folders are offline.
 *
 * node:* imports only.
 */
import { execFileSync } from "node:child_process";
import {
  chmodSync,
  copyFileSync,
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  readlinkSync,
  realpathSync,
  rmSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, isAbsolute, join, relative, resolve } from "node:path";

const NOT_A_CHECKOUT = "the guard suite needs a git checkout";

/** git in `cwd` with long paths on (a temp root plus deep kit paths can pass 260 characters on Windows). */
function git(cwd, args, input) {
  return execFileSync("git", ["-c", "core.longpaths=true", "--no-optional-locks", "-C", cwd, ...args], {
    input,
    maxBuffer: 1 << 28,
    stdio: ["pipe", "pipe", "pipe"],
  });
}

/** Throws NOT_A_CHECKOUT unless `source` is a git checkout with a commit. */
function requireCheckout(source) {
  try {
    git(source, ["rev-parse", "--verify", "--quiet", "HEAD"]);
  } catch {
    throw new Error(NOT_A_CHECKOUT);
  }
}

/** The NUL-separated paths a git command prints, as strings. */
function paths(output) {
  return output.toString("utf8").split("\0").filter(Boolean);
}

/** The deepest part of `path` that exists, resolved through links, with the rest appended. */
function realDeepest(path) {
  const rest = [];
  let head = resolve(path);
  for (;;) {
    try {
      lstatSync(head);
      break;
    } catch {
      const parent = dirname(head);
      if (parent === head) break;
      rest.unshift(basename(head));
      head = parent;
    }
  }
  return join(realpathSync.native(head), ...rest); // a dangling link throws here: never inside
}

/** Throws unless `path` resolves – links followed – to a place strictly inside `base`. */
export function assertInside(base, path) {
  let rel;
  try {
    rel = relative(realpathSync.native(resolve(base)), realDeepest(path));
  } catch (error) {
    throw new Error(`${path} is not inside ${base}: ${error.message}`);
  }
  if (rel === "" || rel.split(/[\\/]/)[0] === ".." || isAbsolute(rel)) throw new Error(`${path} is not inside ${base}`);
}

/** Writes `data` to `path` after assertInside(base, path): a path outside `base` is refused, unwritten. */
export function writeInside(base, path, data) {
  assertInside(base, path);
  writeFileSync(path, data);
}

/** Copies one working-tree path from `source` to `dest`: bytes and mode, or the link itself. */
function copyPath(source, dest, path) {
  const from = join(source, path);
  const to = join(dest, path);
  let stat;
  try {
    stat = lstatSync(from);
  } catch {
    return; // deleted in the checkout: handled by the removal pass
  }
  mkdirSync(dirname(to), { recursive: true });
  if (path.endsWith("/")) {
    // A nested repository: `ls-files -o` lists it as one entry ending in "/". It is copied
    // whole, its own .git included, so the copy's `git status` shows it as the checkout's does.
    cpSync(from, to, { recursive: true, verbatimSymlinks: true });
    return;
  }
  // A modified submodule is a folder too; it is not copied (its .git points into the checkout's).
  if (stat.isDirectory()) return;
  if (existsSync(to) || isLink(to)) unlinkSync(to);
  if (stat.isSymbolicLink()) symlinkSync(readlinkSync(from), to);
  else {
    copyFileSync(from, to);
    chmodSync(to, stat.mode & 0o777);
  }
}

function isLink(path) {
  try {
    return lstatSync(path).isSymbolicLink();
  } catch {
    return false;
  }
}

/**
 * Makes `dest` (a folder that does not exist yet) a private copy of the checkout at `source`:
 * the same index, tracked files and untracked files that are not ignored. Returns `dest`.
 */
export function copyTree(source, dest) {
  requireCheckout(source);
  git(source, ["worktree", "add", "--detach", "--no-checkout", dest, "HEAD"]);
  // Intent-to-add entries (`git add -N`) are re-marked after the overlay: loaded through
  // --index-info they would become staged empty files.
  const intentToAdd = paths(git(source, ["diff", "--name-only", "--no-renames", "--diff-filter=A", "-z"]));
  const skip = new Set(intentToAdd);
  const entries = paths(git(source, ["ls-files", "-s", "-z"])).filter((entry) => !skip.has(entry.slice(entry.indexOf("\t") + 1)));
  if (entries.length) git(dest, ["update-index", "-z", "--index-info"], Buffer.from(`${entries.join("\0")}\0`, "utf8"));
  git(dest, ["checkout-index", "-a", "-f"]);
  const changed = new Set([...paths(git(source, ["ls-files", "-m", "-o", "--exclude-standard", "-z"])), ...intentToAdd]);
  for (const path of changed) copyPath(source, dest, path);
  for (const path of paths(git(source, ["ls-files", "-d", "-z"]))) rmSync(join(dest, path), { force: true });
  if (intentToAdd.length) git(dest, ["add", "-N", "--", ...intentToAdd]);
  git(dest, ["update-index", "-q", "--refresh"]);
  return dest;
}

/**
 * The admin folder `git worktree add` made for `dest`, when it is still there. Found by its
 * gitdir, not its name: git adds a number to the name when another worktree already has it.
 */
function adminDir(source, dest) {
  const worktrees = join(resolve(source, git(source, ["rev-parse", "--git-common-dir"]).toString("utf8").trim()), "worktrees");
  let names;
  try {
    names = readdirSync(worktrees);
  } catch {
    return null;
  }
  const target = realDeepest(dest);
  for (const name of names) {
    try {
      const gitdir = readFileSync(join(worktrees, name, "gitdir"), "utf8").trim();
      if (realDeepest(dirname(resolve(gitdir))) === target) return join(worktrees, name);
    } catch {
      // not a worktree's admin folder, or one being written: not this copy's
    }
  }
  return null;
}

/**
 * Removes the copy at `dest` and its admin entry in `source`'s git folder; nothing else. Refuses
 * a `dest` that is a link, or that does not resolve to a place inside `base`, before git or
 * the file system is asked to remove anything.
 */
export function removeTree(source, base, dest) {
  if (isLink(dest)) throw new Error(`${dest} is a link, not a copy; it is not removed`);
  assertInside(base, dest);
  try {
    git(source, ["worktree", "remove", "--force", dest]);
  } catch {
    // The folder may be gone already, or a file in it still open: drop only this copy's entry.
  }
  const admin = adminDir(source, dest);
  if (admin) rmSync(admin, { recursive: true, force: true });
  rmSync(dest, { recursive: true, force: true });
}

function isAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error.code === "EPERM";
  }
}

// A run is over when its process is gone – or is this one, which has made no copy yet.
const isStale = (pid) => pid === process.pid || !isAlive(pid);

/** Whether `a` and `b` name the same folder, links resolved. */
function sameFolder(a, b) {
  try {
    return realDeepest(a) === realDeepest(b);
  } catch {
    return false;
  }
}

/**
 * Removes what a crashed run left behind. A run keeps its copies in one private folder
 * `<base>/<prefix><pid>-XXXXXX` (mkdtemp), each copy named `<prefix><pid>-<k>`. Removed, when that
 * pid's process is stale: every worktree of `source` at such a place, with its admin entry; then
 * every such private folder itself – also one whose worktree entry is gone, or belongs to
 * another checkout (a failed removal's leftovers). The user's own worktrees never match. Returns
 * the paths removed.
 */
export function removeStaleCopies(source, base, prefix) {
  requireCheckout(source);
  const folder = new RegExp(`^${prefix}(\\d+)-[A-Za-z0-9]{6}$`);
  const removed = [];
  for (const line of git(source, ["worktree", "list", "--porcelain"]).toString("utf8").split("\n")) {
    if (!line.startsWith("worktree ")) continue;
    const path = resolve(line.slice("worktree ".length));
    const parent = dirname(path);
    const match = folder.exec(basename(parent));
    if (!match || !new RegExp(`^${prefix}${match[1]}-\\d+$`).test(basename(path))) continue;
    if (!sameFolder(dirname(parent), base) || !isStale(Number(match[1]))) continue;
    try {
      removeTree(source, base, path); // base, not parent: the parent may be gone already
      removed.push(path);
    } catch {
      // a link, or a file in it still held open: a later run tries again
    }
  }
  for (const entry of readdirSync(base, { withFileTypes: true })) {
    const match = folder.exec(entry.name);
    if (!match || !entry.isDirectory() || !isStale(Number(match[1]))) continue;
    try {
      rmSync(join(base, entry.name), { recursive: true, force: true });
      removed.push(join(base, entry.name));
    } catch {
      // still held open, or another user's: a later run tries again
    }
  }
  return removed;
}
