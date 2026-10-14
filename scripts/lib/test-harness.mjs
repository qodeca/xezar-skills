// Test fixtures that let this repository's tests run on native Windows (#122).
//
// The tests adapt the ENVIRONMENT on win32, never the kit runtime: Git's tools first on PATH,
// core.autocrlf off in the temp repos they build, a jq that writes LF, extensionless stubs
// started through Git Bash, real symbolic links, and ACL-based permission denial (the test process
// gives up its backup and restore privileges for it, see restrict()). A green
// Windows gate therefore proves the kit's logic on Windows, not that the kit runs there
// natively (DECISIONS.md). Every helper is a no-op off win32 unless its comment says otherwise.
//
// Imports node:* and ./platform.mjs only. Used by tests and stub-spawn.mjs; never by a CLI,
// by install-skills.mjs, by upgrade/tools or by a kit file.

import cp, { execFileSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  lstatSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { syncBuiltinESMExports } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import { bashPath, envGet, msysSpawnArgs, prependPath, requireGitBash, shPath, withGitTools } from "./platform.mjs";

export const DEVELOPER_MODE_NEEDED =
  "Cannot create a symbolic link (EPERM). Turn on Developer Mode (Settings > System > For developers), then run this again.";
export const JQ_CRLF = "jq on PATH writes CRLF line endings and has no --binary option. Install jq 1.7 or later.";

const win = path.win32;
const STUB_MARKER = ".stub-spawn";
const STUB_SPAWN_URL = new URL("./stub-spawn.mjs", import.meta.url).href;

/**
 * win32: core.autocrlf=false and core.symlinks=true appended through GIT_CONFIG_COUNT /
 * GIT_CONFIG_KEY_n / GIT_CONFIG_VALUE_n, keeping entries already there. POSIX: env unchanged.
 * Pure; returns a new object.
 */
export function pinTestGitConfig(env, platform = process.platform) {
  if (platform !== "win32") return { ...env };
  const count = Number(envGet(env, "GIT_CONFIG_COUNT", platform)) || 0;
  const next = { ...env };
  for (const key of Object.keys(next)) if (key.toUpperCase() === "GIT_CONFIG_COUNT") delete next[key];
  const pins = [
    ["core.autocrlf", "false"],
    ["core.symlinks", "true"],
  ];
  pins.forEach(([key, value], i) => {
    next[`GIT_CONFIG_KEY_${count + i}`] = key;
    next[`GIT_CONFIG_VALUE_${count + i}`] = value;
  });
  next.GIT_CONFIG_COUNT = String(count + pins.length);
  return next;
}

/**
 * win32: probes one file symlink in os.tmpdir(); EPERM prints DEVELOPER_MODE_NEEDED as one line
 * and exits 1. POSIX: no-op. Call it before a test builds any fixture, so nothing is left behind.
 */
export function requireSymlinks() {
  if (process.platform !== "win32") return;
  const dir = mkdtempSync(path.join(tmpdir(), "symlink-probe-"));
  try {
    writeFileSync(path.join(dir, "target"), "");
    symlinkSync(path.join(dir, "target"), path.join(dir, "link"), "file");
  } catch (error) {
    if (error.code !== "EPERM") throw error;
    console.error(DEVELOPER_MODE_NEEDED);
    process.exit(1);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/**
 * writeFileSync + chmod 0755, byte-identical to the call sites it replaces on POSIX. win32 only:
 * also marks the folder with `.stub-spawn`, so the stub-spawn preload may start the stub.
 */
export function writeStub(file, content) {
  writeFileSync(file, content);
  chmodSync(file, 0o755);
  if (process.platform === "win32") {
    const marker = path.join(path.dirname(file), STUB_MARKER);
    if (!existsSync(marker)) writeFileSync(marker, "");
  }
}

/**
 * win32: writes `<file>.cmd` beside the extensionless stub `file`:
 * `@"<Git>\bin\bash.exe" "%~dp0<name>" %*`. A program that finds its tools by PATHEXT – the kit's
 * deps.mjs on Windows, which starts npm.cmd through cmd.exe – then reaches the stub the way it
 * reaches the real tool. POSIX: no-op.
 */
export function writeCmdShim(file) {
  if (process.platform !== "win32") return;
  writeFileSync(`${file}.cmd`, `@"${bashPath()}" "%~dp0${path.basename(file)}" %*\r\n`);
}

const isRegularFile = (file) => {
  try {
    return statSync(file).isFile();
  } catch {
    return false;
  }
};

/**
 * Pure. win32: the stub a native spawn of `file` would reach, or null. A bare name walks PATH in
 * order: a real <name>.com or <name>.exe in a folder wins (null); otherwise an extensionless
 * regular file <dir>\<name> in a folder holding `.stub-spawn` is the stub. An absolute path
 * without an extension in a marked folder is that file. A name with an extension, a relative
 * path, or `shell` set: null. POSIX: always null.
 */
export function resolveStub(file, env, { platform = process.platform, exists = existsSync, isFile = isRegularFile, shell } = {}) {
  if (platform !== "win32" || shell || typeof file !== "string" || file === "") return null;
  if (win.extname(file) !== "") return null;
  if (/[\\/]/.test(file)) {
    if (!win.isAbsolute(file)) return null;
    return exists(win.join(win.dirname(file), STUB_MARKER)) && isFile(file) ? file : null;
  }
  const dirs = String(envGet(env ?? {}, "PATH", platform) ?? "")
    .split(";")
    .filter(Boolean);
  for (const dir of dirs) {
    if (exists(win.join(dir, `${file}.com`)) || exists(win.join(dir, `${file}.exe`))) return null;
    const candidate = win.join(dir, file);
    if (exists(win.join(dir, STUB_MARKER)) && isFile(candidate)) return candidate;
  }
  return null;
}

const WRAPPED = Symbol.for("xezar-skills.stub-spawn");

/** True when `file` is Git Bash or Git's sh, the MSYS shells the tests start by absolute path. */
function isGitShell(file) {
  if (typeof file !== "string") return false;
  try {
    return [bashPath(), shPath()].some((shell) => shell.toLowerCase() === file.toLowerCase());
  } catch {
    return false;
  }
}

/**
 * The (file, args, options, ...rest) of a spawn that must start an MSYS shell with an MSYS-quoted
 * command line – a stub (run through Git Bash) or Git Bash or sh itself – or null to leave the
 * call alone. The call shape is (file, args?, options?, callback?): args and options are optional.
 */
function msysCall(file, rest) {
  const hasArgs = Array.isArray(rest[0]) || (rest[0] == null && rest.length > 1);
  const args = hasArgs ? (rest[0] ?? []) : [];
  const after = hasArgs ? rest.slice(1) : rest;
  const options = after[0] !== null && typeof after[0] === "object" ? after[0] : undefined;
  if (options?.shell || options?.windowsVerbatimArguments) return null;
  const env = options?.env ?? process.env;
  const stub = resolveStub(file, env);
  if (stub === null && !isGitShell(file)) return null;
  const program = stub === null ? file : bashPath();
  const argv = stub === null ? args : [stub, ...args];
  const tail = options ? after.slice(1) : after;
  return [...msysSpawnArgs(program, argv, { ...options, env }, "win32"), ...tail];
}

/**
 * win32 only, idempotent: wraps spawn, spawnSync, execFile and execFileSync of the given
 * child_process module object. A call whose program resolveStub() maps to a stub runs
 * `<Git Bash> <stub> ...args`; a call that starts Git Bash or Git's sh keeps its program. Both get
 * the same options, an env whose MSYS holds "noglob", and the command line quoted for MSYS
 * (msysQuote). POSIX: no-op. Called by stub-spawn.mjs and by prepareTestPlatform().
 */
export function installStubSpawn(cp) {
  if (process.platform !== "win32" || cp[WRAPPED]) return;
  for (const name of ["spawn", "spawnSync", "execFile", "execFileSync"]) {
    const original = cp[name];
    cp[name] = function stubAware(file, ...rest) {
      const call = msysCall(file, rest);
      return call === null ? original.call(this, file, ...rest) : original.call(this, ...call);
    };
  }
  cp[WRAPPED] = true;
}

/**
 * win32: { NODE_OPTIONS } that preloads stub-spawn.mjs, keeping any earlier value; merge it into
 * ONE child's env. POSIX: {}. Never writes process.env.
 */
export function stubSpawnEnv(env = process.env, platform = process.platform) {
  if (platform !== "win32") return {};
  return { NODE_OPTIONS: [envGet(env, "NODE_OPTIONS", platform), "--import", STUB_SPAWN_URL].filter(Boolean).join(" ") };
}

/** win32: the long form of os.tmpdir() (expands 8.3 names such as RUNNER~1). POSIX: os.tmpdir(). */
export function tempRoot() {
  return process.platform === "win32" ? realpathSync.native(tmpdir()) : tmpdir();
}

/** Whether the real path `real` lies inside tempRoot() – never the temp folder itself. */
export function insideTempRoot(real) {
  // Both sides resolved: on macOS os.tmpdir() is /var/folders/…, whose real path is /private/var/folders/….
  const root = realpathSync.native(tempRoot());
  const fold = (p) => (process.platform === "win32" ? p.toLowerCase() : p);
  const rel = path.relative(fold(root), fold(real));
  return rel !== "" && !rel.startsWith("..") && !path.isAbsolute(rel);
}

/** <SystemRoot>\System32\<parts…>. SystemRoot must be a drive path, as in xezar's regExePath. */
function system32(...parts) {
  const systemRoot = envGet(process.env, "SystemRoot");
  if (typeof systemRoot !== "string" || !/^[A-Za-z]:\\/.test(systemRoot)) {
    throw new Error(`SystemRoot is not a drive path, so ${parts.at(-1)} cannot be located`);
  }
  return win.join(systemRoot, "System32", ...parts);
}

/**
 * Spawn options that let killTree() reach every process a child starts: POSIX, a process group of
 * its own (detached); win32, none – taskkill follows the parent links, and a detached child there
 * would get a console window of its own.
 */
export const TREE_SPAWN = process.platform === "win32" ? {} : { detached: true };

/**
 * Stops a running `child` and every process it started: POSIX, SIGKILL to its process group (it
 * must have been started with TREE_SPAWN); win32, `taskkill /T /F`. A child that has ended is left
 * alone: its pid may name another process by now.
 */
export function killTree(child) {
  if (child.pid === undefined || child.exitCode !== null || child.signalCode !== null) return;
  try {
    if (process.platform === "win32") execFileSync(system32("taskkill.exe"), ["/PID", String(child.pid), "/T", "/F"], { stdio: "ignore" });
    else process.kill(-child.pid, "SIGKILL");
  } catch {
    child.kill("SIGKILL"); // the tree ended meanwhile, or taskkill could not run: the child at least
  }
}

// Administrators hold these two. An MSYS program (Git Bash and its tools) enables both when it
// starts and opens files with backup intent, and a child inherits them enabled – so in an elevated
// process (GitHub's Windows runners run as an administrator) no deny entry holds: Node's own fs
// calls and every MSYS tool read and write straight through it, while git.exe is refused.
const DENY_BYPASS_PRIVILEGES = ["SeBackupPrivilege", "SeRestorePrivilege"];
let denyBypassDropped = false;

const TOKEN_PRIVILEGES_CS = String.raw`
using System;
using System.ComponentModel;
using System.Runtime.InteropServices;
public static class XezarTestTokenPrivileges {
  [StructLayout(LayoutKind.Sequential, Pack = 4)]
  struct TokenPrivileges { public int Count; public long Luid; public int Attributes; }
  [DllImport("kernel32.dll", SetLastError = true)] static extern IntPtr OpenProcess(int access, bool inherit, int pid);
  [DllImport("kernel32.dll", SetLastError = true)] static extern bool CloseHandle(IntPtr handle);
  [DllImport("advapi32.dll", SetLastError = true)] static extern bool OpenProcessToken(IntPtr process, int access, out IntPtr token);
  [DllImport("advapi32.dll", SetLastError = true, CharSet = CharSet.Unicode)] static extern bool LookupPrivilegeValue(string system, string name, out long luid);
  [DllImport("advapi32.dll", SetLastError = true)] static extern bool AdjustTokenPrivileges(IntPtr token, bool disableAll, ref TokenPrivileges state, int length, IntPtr previous, IntPtr returned);
  public static void Remove(int pid, string name) {
    IntPtr process = OpenProcess(0x1000, false, pid); // PROCESS_QUERY_LIMITED_INFORMATION
    if (process == IntPtr.Zero) throw new Win32Exception();
    IntPtr token;
    bool opened = OpenProcessToken(process, 0x20 | 0x8, out token); // TOKEN_ADJUST_PRIVILEGES | TOKEN_QUERY
    int openError = Marshal.GetLastWin32Error();
    CloseHandle(process);
    if (!opened) throw new Win32Exception(openError);
    try {
      TokenPrivileges state = new TokenPrivileges();
      state.Count = 1;
      state.Attributes = 0x4; // SE_PRIVILEGE_REMOVED
      if (!LookupPrivilegeValue(null, name, out state.Luid)) throw new Win32Exception();
      if (!AdjustTokenPrivileges(token, false, ref state, 0, IntPtr.Zero, IntPtr.Zero)) throw new Win32Exception();
      int error = Marshal.GetLastWin32Error();
      if (error != 0) throw new Win32Exception(error); // 1300: the token did not hold it
    } finally {
      CloseHandle(token);
    }
  }
}
`;

/** The names from `names` that `whoami /priv` lists for this process's token, enabled or not. */
function listedPrivileges(names) {
  const listing = execFileSync(system32("whoami.exe"), ["/priv"], { encoding: "utf8" });
  return names.filter((name) => new RegExp(`^${name}\\s`, "m").test(listing));
}

/**
 * win32: removes each named privilege this process holds from its own token, for the rest of its
 * life, and returns the names it removed; every program it starts from then on lacks them too.
 * Throws when a name is not a privilege name, or when one is still listed afterwards. POSIX: [].
 */
export function dropPrivileges(names) {
  for (const name of names) if (!/^Se[A-Za-z]+Privilege$/.test(name)) throw new Error(`dropPrivileges(): "${name}" is not a privilege name`);
  if (process.platform !== "win32") return [];
  const held = listedPrivileges(names);
  if (held.length === 0) return [];
  const script = [
    "$ErrorActionPreference = 'Stop'",
    `Add-Type -TypeDefinition @'${TOKEN_PRIVILEGES_CS}'@`,
    ...held.map((name) => `[XezarTestTokenPrivileges]::Remove(${process.pid}, '${name}')`),
  ].join("\n");
  const encoded = Buffer.from(script, "utf16le").toString("base64");
  execFileSync(system32("WindowsPowerShell", "v1.0", "powershell.exe"), ["-NoProfile", "-NonInteractive", "-EncodedCommand", encoded], {
    stdio: ["ignore", "ignore", "pipe"],
  });
  const left = listedPrivileges(held);
  if (left.length > 0) throw new Error(`dropPrivileges(): ${left.join(", ")} still held after removing it`);
  return held;
}

/**
 * Makes a path unreadable ("no-read") or unwritable ("no-write") for the current user and returns
 * restore(). Refuses (throws) unless the real path lies inside tempRoot() and is not itself a
 * symbolic link or junction. restore() is idempotent and also runs on process "exit" until it has
 * run once, so a crash between the two cannot leave the restriction behind.
 * POSIX: chmod 0o000 / 0o555, restored to the mode read before. win32: an Everyone deny entry via
 * icacls (Windows ignores the read-only attribute on folders, so chmod cannot build these cases),
 * after the first call has dropped the backup and restore privileges from this process, so the
 * entry holds for an administrator too (DENY_BYPASS_PRIVILEGES).
 */
export function restrict(target, access) {
  if (access !== "no-read" && access !== "no-write") throw new Error(`restrict(): unknown access "${access}"`);
  const real = realpathSync.native(target);
  if (!insideTempRoot(real)) throw new Error(`restrict(): ${target} is not inside ${tempRoot()}`);
  if (lstatSync(target).isSymbolicLink()) throw new Error(`restrict(): ${target} is a symbolic link or junction`);
  let undo;
  if (process.platform === "win32") {
    if (!denyBypassDropped) {
      dropPrivileges(DENY_BYPASS_PRIVILEGES);
      denyBypassDropped = true;
    }
    const tool = system32("icacls.exe");
    const rights = access === "no-read" ? "(RD)" : "(WD,AD)";
    execFileSync(tool, [real, "/deny", `*S-1-1-0:${rights}`], { stdio: "ignore" });
    undo = () => execFileSync(tool, [real, "/remove:d", "*S-1-1-0"], { stdio: "ignore" });
  } else {
    const mode = statSync(real).mode & 0o7777;
    chmodSync(real, access === "no-read" ? 0o000 : 0o555);
    undo = () => chmodSync(real, mode);
  }
  let restored = false;
  const restore = () => {
    if (restored) return;
    restored = true;
    process.removeListener("exit", restore);
    undo();
  };
  process.on("exit", restore);
  return restore;
}

/** The absolute path of the first jq.exe on PATH, or null. */
function jqOnPath() {
  const dirs = String(envGet(process.env, "PATH") ?? "").split(";").filter(Boolean);
  for (const dir of dirs) {
    const candidate = win.join(dir, "jq.exe");
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

/**
 * win32: when the jq on PATH writes CRLF, put an LF shim named `jq` first on PATH for the rest
 * of this process and its children (kit scripts compare `$(jq -r …)` output in `case`). A jq
 * without --binary is refused with JQ_CRLF. No jq on PATH: nothing to do.
 */
function ensureLfJq() {
  const jq = jqOnPath();
  if (jq === null) return;
  const probe = (args) => execFileSync(jq, args, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
  if (!probe(["-n", '"x"']).includes("\r")) return;
  let binary = "";
  try {
    binary = probe(["--binary", "-n", '"x"']);
  } catch {
    binary = "";
  }
  if (binary !== '"x"\n') {
    console.error(JQ_CRLF);
    process.exit(1);
  }
  const dir = mkdtempSync(path.join(tempRoot(), "jq-lf-"));
  const quoted = `'${jq.replaceAll("\\", "/").replaceAll("'", "'\\''")}'`;
  writeStub(path.join(dir, "jq"), `#!/usr/bin/env bash\nexec ${quoted} --binary "$@"\n`);
  process.env.PATH = prependPath(process.env, [dir]).PATH;
  process.on("exit", () => rmSync(dir, { recursive: true, force: true }));
}

/**
 * One call at the top of a test that runs bash or kit scripts. POSIX: no-op. win32: requires Git
 * Bash; writes withGitTools() and pinTestGitConfig() onto process.env IN PLACE, key by key (a
 * replaced process.env object would lose Windows' case-insensitive lookup for every later spawn);
 * puts an LF jq first on PATH when needed; quotes the test's own Git Bash and sh command lines for
 * MSYS (installStubSpawn); with { symlinks: true } also requireSymlinks().
 */
export function prepareTestPlatform({ symlinks = false } = {}) {
  if (process.platform !== "win32") return;
  requireGitBash();
  // One helper at a time: each reads process.env as the previous one left it.
  for (const helper of [withGitTools, pinTestGitConfig]) {
    for (const [key, value] of Object.entries(helper(process.env))) {
      if (process.env[key] !== value) process.env[key] = value;
    }
  }
  ensureLfJq();
  // The test's own spawns of Git Bash and sh get an MSYS-quoted command line too (see msysQuote).
  installStubSpawn(cp);
  syncBuiltinESMExports(); // the test's named imports of node:child_process see the wrapped functions
  if (symlinks) requireSymlinks();
}
