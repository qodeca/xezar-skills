// Platform helpers for this repository's maintainer scripts and tests (#122).
//
// Windows needs three things the POSIX code never had to say out loud: which bash to start
// (Git Bash, never WSL's bash.exe, which a stock Windows puts first on PATH), how to read text
// that a CRLF checkout wrote, and how to write a repo-relative path with "/". Every helper is a
// no-op or an identity off win32, so Linux and macOS behave exactly as before.
//
// node:* imports only. Never imported by upgrade/tools or by a kit file: both install and run
// standalone, without this folder beside them. Test fixtures live in ./test-harness.mjs.

import { existsSync } from "node:fs";
import path from "node:path";

export const GIT_BASH_MISSING =
  "Git Bash was not found. Install Git for Windows (it includes Git Bash) and make sure git.exe is on PATH; WSL's bash.exe is never used.";

const win = path.win32;

// Where git.exe sits in a Git for Windows install. <root>\cmd and <root>\bin are one level
// below the root; <root>\<toolchain>\bin is two. Any other folder that holds a git.exe (a
// scoop or npm shim) is not Git's layout and says nothing about where Git Bash is.
const TOOLCHAINS = ["mingw64", "clangarm64", "mingw32"];
const DRIVE_PATH = /^[A-Za-z]:\\/;
const ABSOLUTE_ENTRY = /^(?:[A-Za-z]:[\\/]|[\\/]{2}[^\\/])/;

/**
 * Reads an environment variable the way Windows does: the name is case-insensitive, and when an
 * object holds several spellings the lexicographically first key wins (Node's own rule when it
 * builds a child's environment). POSIX: the exact key. Shared with test-harness.mjs.
 */
export function envGet(env, name, platform = process.platform) {
  if (platform !== "win32") return env[name];
  const upper = name.toUpperCase();
  const key = Object.keys(env).sort().find((k) => k.toUpperCase() === upper);
  return key === undefined ? undefined : env[key];
}

/** A copy of env with `name` set once; on win32 every other spelling of the name is removed. */
function envSet(env, name, value, platform) {
  const next = { ...env };
  if (platform === "win32") {
    const upper = name.toUpperCase();
    for (const key of Object.keys(next)) if (key.toUpperCase() === upper) delete next[key];
  }
  next[name] = value;
  return next;
}

function pathEntries(env) {
  return String(envGet(env, "PATH", "win32") ?? "")
    .split(";")
    .map((entry) => entry.trim().replace(/^"(.*)"$/, "$1").trim())
    .filter((entry) => ABSOLUTE_ENTRY.test(entry))
    .map((entry) => win.normalize(entry));
}

/** The Git root a PATH folder holding git.exe implies, or null when the folder is not Git's layout. */
function rootFromGitDir(dir) {
  const name = win.basename(dir).toLowerCase();
  const parent = win.dirname(dir);
  if (name === "bin" && TOOLCHAINS.includes(win.basename(parent).toLowerCase())) return win.dirname(parent);
  if (name === "cmd" || name === "bin") return parent;
  return null;
}

/** The usual install folders, each only when its variable holds a drive path. */
function installRoots(env) {
  const drive = (name) => {
    const value = envGet(env, name, "win32");
    return typeof value === "string" && DRIVE_PATH.test(value) ? value : null;
  };
  return [
    ...["ProgramW6432", "ProgramFiles", "ProgramFiles(x86)"].map((name) => drive(name) && win.join(drive(name), "Git")),
    drive("LOCALAPPDATA") && win.join(drive("LOCALAPPDATA"), "Programs", "Git"),
  ];
}

/** The first Git for Windows root with both bash.exe files, or null. win32 logic only. */
function findGitRoot({ env = process.env, exists = existsSync } = {}) {
  const gitRootsOnPath = pathEntries(env)
    .filter((dir) => exists(win.join(dir, "git.exe")))
    .map(rootFromGitDir);
  const candidates = [...gitRootsOnPath, ...installRoots(env)].filter(Boolean);
  const isGitBashRoot = (root) =>
    exists(win.join(root, "bin", "bash.exe")) && exists(win.join(root, "usr", "bin", "bash.exe"));
  return candidates.find(isGitBashRoot) ?? null;
}

/**
 * Pure. POSIX: "bash". win32: <root>\bin\bash.exe of the first Git for Windows root found –
 * first from each PATH folder that holds git.exe and has Git's layout, then from the usual
 * install folders (ProgramW6432, ProgramFiles, ProgramFiles(x86), LOCALAPPDATA\Programs). A root
 * counts only when both bin\bash.exe and usr\bin\bash.exe exist. A bash.exe found on PATH is
 * never a candidate: on a stock Windows the first one is WSL's launcher. Else null.
 */
export function resolveGitBash({ platform = process.platform, env = process.env, exists = existsSync } = {}) {
  if (platform !== "win32") return "bash";
  const root = findGitRoot({ env, exists });
  return root === null ? null : win.join(root, "bin", "bash.exe");
}

let cachedRoot;

function gitRoot() {
  if (cachedRoot === undefined) cachedRoot = findGitRoot();
  if (cachedRoot === null) throw Object.assign(new Error(GIT_BASH_MISSING), { code: "GIT_BASH_MISSING" });
  return cachedRoot;
}

/** Cached. win32: Git Bash, or throws an error with code GIT_BASH_MISSING. POSIX: "bash". */
export function bashPath() {
  return process.platform === "win32" ? win.join(gitRoot(), "bin", "bash.exe") : "bash";
}

/** win32: Git's <root>\usr\bin\sh.exe. POSIX: "sh". */
export function shPath() {
  return process.platform === "win32" ? win.join(gitRoot(), "usr", "bin", "sh.exe") : "sh";
}

/** For entry points: bashPath(), or GIT_BASH_MISSING as one stderr line and exit 1. */
export function requireGitBash() {
  try {
    return bashPath();
  } catch (error) {
    if (error.code !== "GIT_BASH_MISSING") throw error;
    console.error(GIT_BASH_MISSING);
    process.exit(1);
  }
}

/**
 * The folders a POSIX tool is found in. win32: Git's toolchain bin (mingw64, clangarm64 or
 * mingw32, whichever exists) and usr\bin – what a Git Bash session puts first on PATH.
 * POSIX: ["/usr/bin", "/bin"]. `options` ({ platform, env, exists }) is for tests only.
 */
export function posixToolDirs(options) {
  const platform = options?.platform ?? process.platform;
  if (platform !== "win32") return ["/usr/bin", "/bin"];
  const exists = options?.exists ?? existsSync;
  let root;
  if (options) {
    root = findGitRoot({ env: options.env ?? process.env, exists });
    if (root === null) throw Object.assign(new Error(GIT_BASH_MISSING), { code: "GIT_BASH_MISSING" });
  } else {
    root = gitRoot();
  }
  const toolchain = TOOLCHAINS.map((name) => win.join(root, name, "bin")).find((dir) => exists(dir));
  return [...(toolchain ? [toolchain] : []), win.join(root, "usr", "bin")];
}

/** "\r\n" -> "\n" only; a lone "\r" is kept, and LF text comes back identical. */
export function toLF(text) {
  return text.replaceAll("\r\n", "\n");
}

/** win32: "\" -> "/". POSIX: unchanged ("\" is a legal filename byte there). */
export function toPosixPath(p, platform = process.platform) {
  return platform === "win32" ? p.replaceAll("\\", "/") : p;
}

/** path.relative(from, to) written with "/". */
export function relPosix(from, to) {
  return toPosixPath(path.relative(from, to));
}

/**
 * A NEW env whose PATH starts with `dirs`. On win32 the result has exactly one PATH key (every
 * other spelling is removed) and the separator is ";". POSIX: {PATH: x} gives
 * `${dirs.join(":")}:${x}`, the same string the tests built by hand before.
 */
export function prependPath(env, dirs, platform = process.platform) {
  const old = envGet(env, "PATH", platform);
  const value = [...dirs, ...(old === undefined || old === "" ? [] : [old])].join(platform === "win32" ? ";" : ":");
  return envSet(env, "PATH", value, platform);
}

/**
 * A NEW env for a child that runs bash or POSIX tools. win32: Git's tool folders first on PATH;
 * NoDefaultCurrentDirectoryInExePath=1, so a bare name never resolves from the working folder;
 * and "noglob" added to MSYS, because the MSYS runtime otherwise expands an unquoted `*` or
 * `{a,b}` argument that a native process passes to an MSYS program. POSIX: a shallow copy.
 * `options` ({ platform, exists }) is for tests only.
 */
export function withGitTools(env = process.env, options) {
  const platform = options?.platform ?? process.platform;
  if (platform !== "win32") return { ...env };
  const dirs = posixToolDirs(options ? { platform, env, exists: options.exists } : undefined);
  let next = prependPath(env, dirs, platform);
  next = envSet(next, "NoDefaultCurrentDirectoryInExePath", "1", platform);
  const msys = envGet(next, "MSYS", platform) ?? "";
  if (!/(^|\s)noglob(\s|$)/.test(msys)) next = envSet(next, "MSYS", msys ? `${msys} noglob` : "noglob", platform);
  return next;
}
