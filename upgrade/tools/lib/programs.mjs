// The programs the upgrade tools start – git and the engine – and how they are started.
//
// The tools never run a program from the project. On native Windows a bare program name is looked
// for in the working folder first (libuv, unless NoDefaultCurrentDirectoryInExePath is set), and
// the tools start git with the project as the working folder: a `git.exe` committed to the project
// would run. So on Windows every program is found by full path – each absolute PATH folder that is
// not the working folder or inside a project folder, never a relative entry – by this clone's own
// kit copy of the finder (never scripts/lib), loaded on Windows only. A .cmd shim (the npm-installed
// engine) starts through cmd.exe with NoDefaultCurrentDirectoryInExePath=1. Linux and macOS search
// only PATH for a bare name, so there the program starts by name with the same safe PATH: an empty
// or relative entry (which means the working folder) and any folder inside a project are dropped.

import { execFileSync } from "node:child_process";
import { isAbsolute, relative, resolve } from "node:path";

// kit-index.mjs's SKILL_DIR, spelled out: importing it from there would be a cycle (it reads hash.mjs).
const WINDOWS = process.platform === "win32"
  ? await import(new URL("../../../skills/xez-onboard-opinionated/kit/checks/lib/windows-programs.mjs", import.meta.url).href)
  : null;

const avoided = new Set();

/** A project folder no program is ever taken from. loadContext() names its project here. */
export function avoidFolder(dir) {
  if (dir) avoided.add(resolve(dir));
}

const inside = (dir, folder) => {
  const rel = relative(folder, dir);
  return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
};

/**
 * A copy of env whose PATH keeps only absolute folders that are not the working folder and not
 * inside an avoided project. (The working folder's subfolders stay: a tool started from `C:\` or
 * `/` would otherwise find nothing.) win32 compares without case and reads PATH the way Windows
 * does (any spelling, the first one wins, quotes stripped).
 */
function safeEnv(env = process.env) {
  const fold = (p) => (WINDOWS ? p.toLowerCase() : p);
  const cwd = fold(resolve(process.cwd()));
  const folders = [...avoided].map((d) => fold(resolve(d)));
  const next = { ...env };
  let path = "";
  if (WINDOWS) {
    for (const key of Object.keys(next).sort()) {
      if (key.toUpperCase() !== "PATH") continue;
      if (!path) path = String(next[key] ?? "");
      delete next[key];
    }
  } else path = String(next.PATH ?? "");
  const keep = path
    .split(WINDOWS ? ";" : ":")
    .map((entry) => (WINDOWS ? entry.trim().replace(/^"(.*)"$/, "$1").trim() : entry))
    .filter((entry) => {
      if (!entry || !isAbsolute(entry)) return false;
      const dir = fold(resolve(entry));
      return dir !== cwd && !folders.some((f) => inside(dir, f));
    });
  next.PATH = keep.join(WINDOWS ? ";" : ":");
  return next;
}

/**
 * How to start `name` with `args`: { file, args, options }, `options` merged over the caller's.
 * POSIX: the bare name, with a safe PATH in options.env. win32: the full path findProgram() finds
 * in a safe PATH, started through cmd.exe when it is a .cmd or .bat shim; not found is an ENOENT
 * error, never a bare-name start.
 */
export function launch(name, args, options = {}) {
  const env = safeEnv(options.env ?? process.env);
  if (!WINDOWS) return { file: name, args, options: { ...options, env } };
  const found = WINDOWS.findProgram(name, { env });
  if (!found) throw Object.assign(new Error(`spawnSync ${name} ENOENT: ${name} is not on PATH (the project folder is never searched)`), { code: "ENOENT" });
  const plan = WINDOWS.launchPlan(found, args, { env: options.env ?? process.env, cwd: options.cwd });
  return { file: plan.file, args: plan.args, options: { ...options, ...plan.options } };
}

/** execFileSync of `name` by launch(): same arguments, same result, same errors. */
export function run(name, args, options = {}) {
  const l = launch(name, args, options);
  return execFileSync(l.file, l.args, l.options);
}

/** A key that changes whenever the git launch() would start changes (apply.mjs caches by it). */
export function gitKey() {
  return `${process.env.PATH ?? ""}\0${process.cwd()}\0${[...avoided].join("\0")}`;
}
