// The programs the upgrade tools start – git and the engine – and how they are started.
//
// The tools never run a program from the project. On native Windows a bare program name is looked
// for in the working folder first (libuv, unless NoDefaultCurrentDirectoryInExePath is set), and
// the tools start git with the project as the working folder: a `git.exe` committed to the project
// would run. So on Windows every program is found by full path – each absolute PATH folder that is
// not the working folder or inside a project folder, never a relative entry – by this clone's own
// kit copy of the finder (never scripts/lib), loaded on Windows only. A .cmd shim (the npm-installed
// engine) starts through cmd.exe with NoDefaultCurrentDirectoryInExePath=1. Linux and macOS never
// search the working folder for a bare name, and start `git` as before.

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

/** PATH with every folder at or under the working folder or an avoided project removed (win32). */
function safeEnv(env = process.env) {
  const folders = [process.cwd(), ...avoided].map((d) => resolve(d).toLowerCase());
  const next = { ...env };
  let path = "";
  for (const key of Object.keys(next).sort()) {
    if (key.toUpperCase() !== "PATH") continue;
    if (!path) path = String(next[key] ?? ""); // Windows' rule: the first spelling wins
    delete next[key];
  }
  // findProgram() drops a relative entry itself; one inside a project folder is dropped here.
  const keep = path
    .split(";")
    .map((entry) => entry.trim().replace(/^"(.*)"$/, "$1").trim())
    .filter((entry) => entry && !(isAbsolute(entry) && folders.some((f) => inside(resolve(entry).toLowerCase(), f))));
  next.PATH = keep.join(";");
  return next;
}

/**
 * How to start `name` with `args`: { file, args, options }, `options` merged over the caller's.
 * POSIX: the bare name. win32: the full path findProgram() finds in a safe PATH, started through
 * cmd.exe when it is a .cmd or .bat shim; not found is an ENOENT error, never a bare-name start.
 */
export function launch(name, args, options = {}) {
  if (!WINDOWS) return { file: name, args, options };
  const env = safeEnv(options.env ?? process.env);
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
