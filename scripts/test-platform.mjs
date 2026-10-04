#!/usr/bin/env node
// Unit and integration test for scripts/lib/platform.mjs and scripts/lib/test-harness.mjs (#122), and
// unit cases for scripts/lib/sections.mjs, scripts/lib/gate-runner.mjs and scripts/lib/tree-copy.mjs
// (#123).
//
// The pure cases inject platform "win32" and a fake file system, so the Windows logic – above
// all "never start WSL's bash.exe" – is proven on the Linux CI runner too. The integration cases
// run on whatever machine this is: on Windows they prove Git Bash is found and sets up its own
// tools, that a bare `bash` under the prepared PATH is Git's, and that arguments survive the
// native -> MSYS start of a stub.
//
// Run: node scripts/test-platform.mjs (scripts/lint.sh runs it too)

import assert from "node:assert/strict";
import { fork, spawn, spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, renameSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import path, { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  GIT_BASH_MISSING,
  bashPath,
  msysQuote,
  msysSpawnArgs,
  prependPath,
  resolveGitBash,
  spawnGitBash,
  toLF,
  toPosixPath,
  withGitTools,
  withNoglob,
} from "./lib/platform.mjs";
import {
  dropPrivileges,
  pinTestGitConfig,
  prepareTestPlatform,
  resolveStub,
  restrict,
  stubSpawnEnv,
  tempRoot,
  writeStub,
} from "./lib/test-harness.mjs";
import { parseOnly, sections } from "./lib/sections.mjs";
import { gateEnv, runPool } from "./lib/gate-runner.mjs";
import { assertInside, copyTree, removeStaleCopies, removeTree, writeInside } from "./lib/tree-copy.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const win32 = process.platform === "win32";
const win = path.win32;

let cases = 0;
let failures = 0;

/** One case. An async case returns its promise; await it. */
function check(name, fn) {
  cases += 1;
  const fail = (error) => {
    failures += 1;
    console.error(`FAIL  ${name}\n      ${String(error.message).split("\n").join("\n      ")}`);
  };
  try {
    const result = fn();
    if (result instanceof Promise) return result.catch(fail);
  } catch (error) {
    fail(error);
  }
}

/** A fake, case-insensitive file system holding exactly `paths`. */
const fakeFs = (...paths) => {
  const known = new Set(paths.map((p) => p.toLowerCase()));
  return (p) => known.has(p.toLowerCase());
};

const GIT = "C:\\Program Files\\Git";
const GIT_BASH = `${GIT}\\bin\\bash.exe`;
const GIT_FILES = [`${GIT}\\cmd\\git.exe`, `${GIT}\\mingw64\\bin`, `${GIT}\\mingw64\\bin\\git.exe`, GIT_BASH, `${GIT}\\usr\\bin\\bash.exe`];
const SYSTEM32 = "C:\\Windows\\System32";
const WINDOWS_APPS = "C:\\Users\\u\\AppData\\Local\\Microsoft\\WindowsApps";
// The kit's gate scheduler finds Git Bash with its own copy of the rule (a kit file never imports
// scripts/lib). Every resolver case below runs through both, and they must agree (#122).
const kitProcess = await import(new URL("../skills/xez-onboard-opinionated/kit/checks/lib/windows-process.mjs", import.meta.url).href);
// The kit's check scripts start Git Bash through windows-programs.mjs's gitBash(), held to the same rule.
const kitPrograms = await import(new URL("../skills/xez-onboard-opinionated/kit/checks/lib/windows-programs.mjs", import.meta.url).href);
const parity = [];
const resolve = (env, ...paths) => {
  const exists = fakeFs(...paths);
  const got = resolveGitBash({ platform: "win32", env, exists });
  const kitRoot = kitProcess.gitRoot({ env, exists });
  const kit = kitRoot === null ? null : win.join(kitRoot, "bin", "bash.exe");
  if (kit !== got) parity.push(`${JSON.stringify(env)}: kit ${kit}, scripts/lib ${got}`);
  const checkBash = kitPrograms.gitBash({ env, exists });
  if (checkBash !== got) parity.push(`${JSON.stringify(env)}: kit gitBash() ${checkBash}, scripts/lib ${got}`);
  return got;
};

// --- Git Bash resolver --------------------------------------------------------------------

check("the resolver skips WSL's bash.exe that a stock Windows puts first on PATH", () => {
  const got = resolve(
    { PATH: `${SYSTEM32};${WINDOWS_APPS};${GIT}\\cmd` },
    `${SYSTEM32}\\bash.exe`,
    `${WINDOWS_APPS}\\bash.exe`,
    `${GIT}\\cmd\\bash.exe`,
    ...GIT_FILES,
  );
  assert.equal(got, GIT_BASH, `picked WSL's bash.exe (or another bash.exe from PATH): got ${got}`);
});

check("git.exe in <root>\\mingw64\\bin finds the root two levels up", () => {
  const got = resolve({ PATH: `${GIT}\\mingw64\\bin` }, `${GIT}\\mingw64\\bin\\git.exe`, GIT_BASH, `${GIT}\\usr\\bin\\bash.exe`);
  assert.equal(got, GIT_BASH);
});

check("PATH is read case-insensitively, with quoted and empty entries", () => {
  assert.equal(resolve({ Path: `;"${GIT}\\cmd";;` }, ...GIT_FILES), GIT_BASH);
});

check("a relative PATH entry is skipped and the next candidate is used", () => {
  const got = resolve(
    { PATH: `.;${GIT}\\cmd` },
    "git.exe",
    ".\\git.exe",
    "..\\bin\\bash.exe",
    "..\\usr\\bin\\bash.exe",
    ...GIT_FILES,
  );
  assert.equal(got, GIT_BASH);
});

check("a scoop shim folder holding git.exe is not Git's layout", () => {
  const scoop = "C:\\Users\\u\\scoop";
  const got = resolve(
    { PATH: `${scoop}\\shims`, ProgramFiles: "C:\\Program Files" },
    `${scoop}\\shims\\git.exe`,
    `${scoop}\\bin\\bash.exe`,
    `${scoop}\\usr\\bin\\bash.exe`,
    ...GIT_FILES,
  );
  assert.equal(got, GIT_BASH);
});

check("a Git root without usr\\bin\\bash.exe is skipped", () => {
  const portable = "D:\\PortableGit";
  const got = resolve(
    { PATH: `${portable}\\cmd`, ProgramFiles: "C:\\Program Files" },
    `${portable}\\cmd\\git.exe`,
    `${portable}\\bin\\bash.exe`,
    ...GIT_FILES,
  );
  assert.equal(got, GIT_BASH);
});

check("without git on PATH the Program Files install is used", () => {
  const got = resolve({ PATH: SYSTEM32, ProgramW6432: "C:\\Program Files" }, `${SYSTEM32}\\bash.exe`, ...GIT_FILES);
  assert.equal(got, GIT_BASH);
});

check("a ProgramFiles value that is not a drive path is ignored", () => {
  assert.equal(resolve({ PATH: "", ProgramFiles: "Git" }, "Git\\Git\\bin\\bash.exe", "Git\\Git\\usr\\bin\\bash.exe"), null);
});

check("only WSL's bash and no Git anywhere gives null and a one-line message naming Git Bash", () => {
  const got = resolve({ PATH: `${SYSTEM32};${WINDOWS_APPS}` }, `${SYSTEM32}\\bash.exe`, `${WINDOWS_APPS}\\bash.exe`);
  assert.equal(got, null, `picked WSL's bash.exe (or another bash.exe from PATH): got ${got}`);
  assert.equal(GIT_BASH_MISSING.includes("\n"), false);
  assert.match(GIT_BASH_MISSING, /Git Bash/);
});

check("the kit's Git Bash resolver agrees with scripts/lib/platform.mjs on every case above", () => {
  assert.equal(parity.length, 0, `the kit's Git Bash resolver disagrees with scripts/lib/platform.mjs:\n${parity.join("\n")}`);
});

check("off Windows the resolver answers plain bash", () => {
  assert.equal(resolveGitBash({ platform: "linux", env: {}, exists: fakeFs() }), "bash");
});

// The kit also keeps its own copy of the MSYS quoting, the noglob env and the missing-Git-Bash
// message (a kit file installs standalone); each must say what scripts/lib/platform.mjs says.
check("the kit's MSYS quoting, noglob env and Git Bash message agree with scripts/lib/platform.mjs", () => {
  for (const arg of ["", "a b", 'a"b', '""', "it's", "*", "{a,b}", "C:\\dir\\", 'x"\'"y'])
    assert.equal(kitProcess.msysQuote(arg), msysQuote(arg), `msysQuote disagrees on ${JSON.stringify(arg)}`);
  for (const env of [{}, { MSYS: "winsymlinks:lnk" }, { Msys: "noglob" }, { msys: "a", MSYS: "b noglob" }, { MSYS: "noglobx" }])
    assert.deepEqual(kitProcess.withNoglob(env), withNoglob(env, "win32"), `withNoglob disagrees on ${JSON.stringify(env)}`);
  assert.equal(kitProcess.GIT_BASH_MISSING, GIT_BASH_MISSING);
});

check("msysSpawnArgs quotes every argument for MSYS on win32 and changes nothing elsewhere", () => {
  const [file, args, options] = msysSpawnArgs(GIT_BASH, ["-c", 'printf "%s" "$1"', "_", 'a"b'], { cwd: "C:\\x", env: { MSYS: "winsymlinks:lnk" } }, "win32");
  assert.equal(file, GIT_BASH);
  assert.deepEqual(args, ['"-c"', `"printf "'"'"%s"'"'" "'"'"$1"'"'""`, '"_"', `"a"'"'"b"`]);
  assert.equal(options.windowsVerbatimArguments, true);
  assert.equal(options.argv0, `"${GIT_BASH}"`);
  assert.equal(options.cwd, "C:\\x");
  assert.equal(options.env.MSYS, "winsymlinks:lnk noglob");
  const posix = { env: { A: "1" } };
  assert.deepEqual(msysSpawnArgs("bash", ["-c", 'a"b'], posix, "linux"), ["bash", ["-c", 'a"b'], posix]);
});

// --- the kit's program finder and .cmd launcher (windows-programs.mjs) ---------------------
// On Windows the agents and package managers are claude.exe, codex.cmd, npm.cmd: route.mjs and
// deps.mjs find them by PATHEXT, and a .cmd starts through cmd.exe only with checked text (#122).

const BIN = "C:\\Users\\u\\AppData\\Roaming\\npm";
const NODEJS = "C:\\Program Files\\nodejs";

check("findProgram finds claude.exe, codex.cmd and pi.cmd by PATHEXT, and never an extensionless file", () => {
  const env = { Path: `${BIN};C:\\Users\\u\\.local\\bin`, PATHEXT: ".COM;.EXE;.BAT;.CMD;.VBS;.JS" };
  const exists = fakeFs("C:\\Users\\u\\.local\\bin\\claude.exe", `${BIN}\\codex.cmd`, `${BIN}\\codex`, `${BIN}\\pi.cmd`, `${BIN}\\opencode`);
  const find = (name) => kitPrograms.findProgram(name, { env, exists });
  assert.equal(find("claude"), "C:\\Users\\u\\.local\\bin\\claude.exe", "findProgram did not find claude.exe for claude");
  assert.equal(find("codex"), `${BIN}\\codex.cmd`, "findProgram did not find codex.cmd for codex");
  assert.equal(find("pi"), `${BIN}\\pi.cmd`);
  assert.equal(find("opencode"), null, "an extensionless opencode is not a program Windows starts");
  assert.equal(find("..\\claude"), null);
  assert.equal(find(""), null);
});

check("findProgram tries only .com .exe .bat .cmd, in PATHEXT's order", () => {
  const exists = fakeFs(`${BIN}\\tool.js`, `${BIN}\\tool.cmd`, `${BIN}\\other.js`);
  assert.equal(kitPrograms.findProgram("tool", { env: { PATH: BIN, PATHEXT: ".JS;.CMD" }, exists }), `${BIN}\\tool.cmd`);
  assert.equal(kitPrograms.findProgram("other", { env: { PATH: BIN, PATHEXT: ".JS;.CMD" }, exists }), null, "findProgram returned a .js file");
  assert.deepEqual(kitPrograms.programExtensions({ PATHEXT: ".JS;.CMD;.EXE;.cmd" }), [".cmd", ".exe"]);
  assert.deepEqual(kitPrograms.programExtensions({}), [".com", ".exe", ".bat", ".cmd"]);
  const both = fakeFs(`${BIN}\\npm.cmd`, `${BIN}\\npm.exe`);
  assert.equal(kitPrograms.findProgram("npm", { env: { PATH: BIN }, exists: both }), `${BIN}\\npm.exe`);
});

check("findProgram skips a relative PATH entry and takes absolute extra folders after PATH", () => {
  const env = { PATH: `.;bin;${BIN}`, DOTNET_ROOT: "D:\\dotnet" };
  assert.equal(kitPrograms.findProgram("claude", { env, exists: fakeFs(".\\claude.exe", "bin\\claude.exe") }), null);
  const dotnetRoot = kitPrograms.findProgram("dotnet", { env, extraDirs: ["D:\\dotnet", "C:\\Users\\u\\.dotnet"], exists: fakeFs("D:\\dotnet\\dotnet.exe", "C:\\Users\\u\\.dotnet\\dotnet.exe") });
  assert.equal(dotnetRoot, "D:\\dotnet\\dotnet.exe", "dotnet.exe under DOTNET_ROOT was not found");
  const userDotnet = kitPrograms.findProgram("dotnet", { env, extraDirs: [undefined, "relative", "C:\\Users\\u\\.dotnet"], exists: fakeFs("C:\\Users\\u\\.dotnet\\dotnet.exe", "relative\\dotnet.exe") });
  assert.equal(userDotnet, "C:\\Users\\u\\.dotnet\\dotnet.exe", "dotnet.exe under %USERPROFILE%\\.dotnet was not found");
});

const launchEnv = { PATH: NODEJS, SystemRoot: "C:\\Windows", HUSKY: "0", GH_TOKEN: "" };

check("launchPlan starts a .exe directly and a .cmd through cmd.exe with one quoted command line", () => {
  assert.deepEqual(kitPrograms.launchPlan("C:\\Users\\u\\.dotnet\\dotnet.exe", ["restore", "A.sln"], { env: launchEnv }), {
    file: "C:\\Users\\u\\.dotnet\\dotnet.exe", args: ["restore", "A.sln"], options: {},
  });
  const plan = kitPrograms.launchPlan(`${NODEJS}\\npm.cmd`, ["ci"], { env: launchEnv, cwd: "C:\\p\\a&b%PATH%^c" });
  assert.equal(plan.file, "C:\\Windows\\System32\\cmd.exe");
  assert.deepEqual(plan.args, ["/d", "/v:off", "/s", "/c", '""C:\\Program Files\\nodejs\\npm.cmd" ci"']);
  assert.equal(plan.options.windowsVerbatimArguments, true);
  assert.equal(plan.options.env.HUSKY, "0");
  assert.equal(plan.options.env.GH_TOKEN, "");
  assert.ok(!plan.args.some((arg) => arg.includes("a&b")), "the working folder reached cmd.exe's command line");
  assert.equal("cwd" in plan.options, false);
  assert.deepEqual(kitPrograms.launchPlan(`${NODEJS}\\npm.cmd`, [], { env: launchEnv }).args.at(-1), '""C:\\Program Files\\nodejs\\npm.cmd""');
});

check("a .cmd launch sets NoDefaultCurrentDirectoryInExePath=1, so cmd.exe never searches the working folder", () => {
  for (const env of [launchEnv, { ...launchEnv, nodefaultcurrentdirectoryinexepath: "0" }]) {
    const { options } = kitPrograms.launchPlan(`${NODEJS}\\npm.cmd`, ["ci"], { env });
    const keys = Object.keys(options.env).filter((key) => key.toUpperCase() === "NODEFAULTCURRENTDIRECTORYINEXEPATH");
    assert.deepEqual(keys.map((key) => options.env[key]), ["1"], `a .cmd launch searches the working folder for a program it names: ${JSON.stringify(keys)}`);
  }
});

check("a .cmd launch with a cmd.exe metacharacter in its path or arguments is refused", () => {
  const refused = (file, args, options = {}) =>
    assert.throws(() => kitPrograms.launchPlan(file, args, { env: launchEnv, ...options }), (error) => error.code === "CMD_UNSAFE", `not refused: ${JSON.stringify([file, args, options])}`);
  refused("C:\\a%b\\npm.cmd", ["ci"]);
  refused("C:\\a&b\\npm.cmd", ["ci"]);
  refused("C:\\a!b\\npm.bat", ["ci"]);
  refused(`${NODEJS}\\npm.cmd`, ["a&b"]);
  refused(`${NODEJS}\\npm.cmd`, ["a b"]);
  refused(`${NODEJS}\\npm.cmd`, ['a"b']);
  refused(`${NODEJS}\\npm.cmd`, ["%PATH%"]);
  refused(`${NODEJS}\\npm.cmd`, [""]);
  refused(`${NODEJS}\\npm.cmd`, ["ci"], { cwd: "\\\\srv\\share\\x" });
  refused(`${NODEJS}\\npm.cmd`, ["ci"], { env: { PATH: NODEJS } });
  refused(`${NODEJS}\\npm.cmd`, ["ci"], { env: { SystemRoot: "C:\\Win dows" } });
  assert.throws(() => kitPrograms.launchPlan(`${NODEJS}\\npm`, ["ci"], { env: launchEnv }), (error) => error.code === "NOT_A_PROGRAM", "a file that is not .exe, .com, .cmd or .bat was not refused as NOT_A_PROGRAM");
  assert.doesNotThrow(() => kitPrograms.launchPlan(`${NODEJS}\\npm.cmd`, ["install", "--frozen-lockfile", "--non-interactive", "@scope/x=1+2,3:4"], { env: launchEnv }));
});

check("a .cmd launch refuses a SystemRoot holding a cmd.exe metacharacter or a forward slash", () => {
  for (const systemRoot of ["C:\\Win&dows", "C:\\Win%x%", "C:\\Win^dows", "C:\\Win/c"]) {
    assert.throws(
      () => kitPrograms.launchPlan(`${NODEJS}\\npm.cmd`, ["ci"], { env: { ...launchEnv, SystemRoot: systemRoot } }),
      (error) => error.code === "CMD_UNSAFE",
      `a cmd.exe path built from SystemRoot ${JSON.stringify(systemRoot)} would reach cmd.exe's command line unquoted`,
    );
  }
});

// launchFor is deps.mjs's whole Windows start: find, plan, and every failure returned as { error }.
check("launchFor never starts a tool it could not find, and returns a refusal instead of throwing", () => {
  const missing = kitPrograms.launchFor("npm", ["ci"], { env: launchEnv, exists: fakeFs() });
  assert.equal(missing.file, undefined, `a tool that was not found would be started by bare name: ${JSON.stringify(missing)}`);
  assert.ok(missing.error, `a tool that was not found would be started by bare name: ${JSON.stringify(missing)}`);
  assert.equal(missing.error.code, "ENOENT");
  assert.equal(missing.error.message, "spawnSync npm ENOENT");
  const shim = kitPrograms.launchFor("npm", ["ci"], { env: launchEnv, cwd: "C:\\p\\unit", exists: fakeFs(`${NODEJS}\\npm.cmd`) });
  assert.equal(shim.file, "C:\\Windows\\System32\\cmd.exe");
  assert.deepEqual(shim.args, ["/d", "/v:off", "/s", "/c", '""C:\\Program Files\\nodejs\\npm.cmd" ci"']);
  assert.equal(shim.options.env.NoDefaultCurrentDirectoryInExePath, "1");
  let looked = 0;
  const direct = kitPrograms.launchFor("D:\\dotnet\\dotnet.exe", ["restore", "A.sln"], { env: launchEnv, exists: () => { looked += 1; return true; } });
  assert.deepEqual(direct, { file: "D:\\dotnet\\dotnet.exe", args: ["restore", "A.sln"], options: {} });
  assert.equal(looked, 0, "an absolute tool path was looked up instead of kept");
  let unsafe;
  assert.doesNotThrow(() => { unsafe = kitPrograms.launchFor("npm", ["a&b"], { env: launchEnv, exists: fakeFs(`${NODEJS}\\npm.cmd`) }); });
  assert.equal(unsafe.error?.code, "CMD_UNSAFE", `an unsafe argument was not returned as a refusal: ${JSON.stringify(unsafe)}`);
  assert.equal(unsafe.file, undefined);
});

// --- what skills and descriptors teach (#122) -----------------------------------------------
// jq on native Windows ends every line it writes with CRLF, and jq 1.6 there has no --binary: a
// list read (`jq -r '…[]'`) then leaves a CR on every item. Each one a skill teaches strips it.

/** Every file under `dir`, as [repo-relative path, text]. */
const filesUnder = (dir) => {
  const out = [];
  const walk = (d) => {
    for (const entry of readdirSync(d, { withFileTypes: true })) {
      const p = join(d, entry.name);
      if (entry.isDirectory()) walk(p);
      else if (entry.isFile()) out.push([path.relative(root, p).split(path.sep).join("/"), readFileSync(p, "utf8")]);
    }
  };
  walk(join(root, dir));
  return out;
};

check("no skill keeps jq's CR in a list read", () => {
  const offenders = [];
  for (const [rel, text] of filesUnder("skills")) {
    text.split(/\r?\n/).forEach((line, i) => {
      if (/\bjq -r '[^']*\[\]/.test(line) && !line.includes("tr -d '\\r'") && !line.includes("| drop_jq_cr")) offenders.push(`${rel}:${i + 1}`);
    });
  }
  assert.deepEqual(offenders, [], `a skill keeps jq's CR in a list read (append | tr -d '\\r', or | drop_jq_cr in a kit script): ${offenders.join(", ")}`);
});

// A descriptor's snippet runs on the consumer's machine: a fixed /tmp name collides between two
// runs, and native Windows tools do not read MSYS's /tmp. Each temp file comes from mktemp.
check("no descriptor writes a fixed /tmp file", () => {
  const listed = spawnSync("git", ["ls-files", "-z"], { cwd: root, encoding: "utf8" });
  assert.equal(listed.status, 0, listed.stderr);
  const family = /(^|\/)(trackers|browsers|toolchains|security)\/[^/]+\.md$/;
  const files = listed.stdout.split("\0").filter((rel) => family.test(rel) || rel.startsWith("skills/xez-onboard-opinionated/kit/pipeline/"));
  assert.ok(files.length > 0, "git listed no descriptor files, so nothing was checked");
  const offenders = files.filter((rel) => existsSync(join(root, rel)) && readFileSync(join(root, rel), "utf8").includes("/tmp/"));
  assert.deepEqual(offenders, [], `a descriptor writes a fixed /tmp file (take one from mktemp): ${offenders.join(", ")}`);
});

// --- text, paths and environment ----------------------------------------------------------

check("toLF rewrites CRLF only", () => {
  assert.equal(toLF("a\r\nb\r\n"), "a\nb\n");
  assert.equal(toLF("a\rb\n"), "a\rb\n");
  const lf = "a\nb\n";
  assert.equal(toLF(lf), lf);
});

check("toPosixPath turns separators on win32 only", () => {
  assert.equal(toPosixPath("a\\b\\c", "win32"), "a/b/c");
  assert.equal(toPosixPath("a\\b", "linux"), "a\\b");
});

check("prependPath keeps exactly one PATH key and the old POSIX string", () => {
  const next = prependPath({ Path: "C:\\x", Other: "1" }, ["C:\\bin"], "win32");
  assert.deepEqual(Object.keys(next).filter((k) => k.toUpperCase() === "PATH"), ["PATH"]);
  assert.equal(next.PATH, "C:\\bin;C:\\x");
  assert.equal(next.Other, "1");
  const dirs = ["/bin"];
  const x = "/x";
  assert.equal(prependPath({ PATH: x }, dirs, "linux").PATH, `${dirs.join(":")}:${x}`);
});

check("withGitTools puts Git's tools first and adds noglob to MSYS once", () => {
  const options = { platform: "win32", exists: fakeFs(...GIT_FILES) };
  const next = withGitTools({ PATH: `${GIT}\\cmd`, MSYS: "winsymlinks:nativestrict" }, options);
  assert.equal(next.MSYS, "winsymlinks:nativestrict noglob");
  assert.equal(next.PATH, `${GIT}\\mingw64\\bin;${GIT}\\usr\\bin;${GIT}\\cmd`);
  assert.equal(next.NoDefaultCurrentDirectoryInExePath, "1");
  assert.equal(withGitTools({ PATH: `${GIT}\\cmd`, MSYS: "noglob winsymlinks:lnk" }, options).MSYS, "noglob winsymlinks:lnk");
  assert.equal("MSYS" in withGitTools({ PATH: "/x" }, { platform: "linux" }), false);
});

// #122: Git for Windows keeps `shasum` (which the kit hashes with) in usr\bin\core_perl, which only
// Git Bash's login profile puts on PATH; GitHub Actions' `shell: bash` and a run from PowerShell
// start bash without a login.
check("withGitTools appends Git's Perl script folders, as a Git Bash login does", () => {
  const perl = [`${GIT}\\usr\\bin\\vendor_perl`, `${GIT}\\usr\\bin\\core_perl`];
  const next = withGitTools({ PATH: `${GIT}\\cmd` }, { platform: "win32", exists: fakeFs(...GIT_FILES, ...perl) });
  assert.equal(next.PATH, `${GIT}\\mingw64\\bin;${GIT}\\usr\\bin;${GIT}\\cmd;${perl.join(";")}`, "withGitTools leaves Git's Perl script folders (shasum) off PATH");
  if (win32) {
    const env = prependPath(process.env, [], "win32");
    env.PATH = win.join(process.env.SystemRoot ?? "C:\\Windows", "System32");
    const probe = spawnSync(bashPath(), ["-c", "command -v shasum"], { encoding: "utf8", env: withGitTools(env) });
    assert.equal(probe.status, 0, `withGitTools leaves Git's Perl script folders (shasum) off PATH: ${probe.stdout}${probe.stderr}`);
  }
});

check("pinTestGitConfig appends after existing GIT_CONFIG entries on win32 only", () => {
  const env = { GIT_CONFIG_COUNT: "1", GIT_CONFIG_KEY_0: "user.name", GIT_CONFIG_VALUE_0: "x" };
  const next = pinTestGitConfig(env, "win32");
  assert.equal(next.GIT_CONFIG_COUNT, "3");
  assert.equal(next.GIT_CONFIG_KEY_0, "user.name");
  assert.equal(next.GIT_CONFIG_KEY_1, "core.autocrlf");
  assert.equal(next.GIT_CONFIG_VALUE_1, "false");
  assert.equal(next.GIT_CONFIG_KEY_2, "core.symlinks");
  assert.equal(next.GIT_CONFIG_VALUE_2, "true");
  assert.deepEqual(pinTestGitConfig(env, "linux"), env);
});

check("resolveStub maps only extensionless files in marked folders", () => {
  const env = { PATH: "C:\\a;C:\\stubs" };
  const isFile = (p) => p.toLowerCase().endsWith("\\npm");
  const marked = ["C:\\stubs\\.stub-spawn", "C:\\stubs\\npm"];
  const stub = (file, exists, platform = "win32") => resolveStub(file, env, { platform, exists: fakeFs(...exists), isFile });
  assert.equal(stub("npm", marked), "C:\\stubs\\npm");
  assert.equal(stub("npm", ["C:\\a\\npm.exe", ...marked]), null, "a real npm.exe earlier on PATH must win");
  assert.equal(stub("npm", ["C:\\stubs\\npm"]), null, "an unmarked folder is never a stub folder");
  assert.equal(stub("npm.cmd", marked), null);
  assert.equal(stub("C:\\stubs\\npm", marked), "C:\\stubs\\npm");
  assert.equal(stub("npm", marked, "linux"), null);
});

check("stubSpawnEnv returns one NODE_OPTIONS fragment and never writes process.env", () => {
  const before = process.env.NODE_OPTIONS;
  assert.deepEqual(stubSpawnEnv({}, "linux"), {});
  const fragment = stubSpawnEnv({ NODE_OPTIONS: "--no-warnings" }, "win32");
  assert.deepEqual(Object.keys(fragment), ["NODE_OPTIONS"]);
  assert.match(fragment.NODE_OPTIONS, /^--no-warnings --import file:\S+\/stub-spawn\.mjs$/);
  assert.equal(process.env.NODE_OPTIONS, before);
});

// --- scripts/lib/sections.mjs (#123) -------------------------------------------------------

const IDS = ["a", "b", "c"];
const CHECKS = "the checks are: a b c";

check("parseOnly: no arguments is the full run; --only names ids in declaration order; --sections lists", () => {
  assert.deepEqual(parseOnly([], IDS), { selected: null, list: false, error: null });
  assert.deepEqual(parseOnly(["--only", "b"], IDS).selected, ["b"]);
  assert.deepEqual(parseOnly(["--only", "c", "--only", "a", "--only", "c"], IDS).selected, ["a", "c"]);
  assert.deepEqual(parseOnly(["--sections"], IDS), { selected: null, list: true, error: null });
});

check("parseOnly: an unknown id, a missing id and another option are usage errors", () => {
  assert.equal(parseOnly(["--only", "x"], IDS).error, `unknown check 'x'; ${CHECKS}`);
  assert.equal(parseOnly(["--only", "a", "--only"], IDS).error, `--only needs a check id; ${CHECKS}`);
  assert.equal(parseOnly(["--files", "a"], IDS).error, "unknown option '--files'; the options are --only <check> and --sections");
});

check("parseOnly: a selected id brings the ids it needs, transitively, in declaration order", () => {
  assert.deepEqual(parseOnly(["--only", "c"], IDS, { c: ["b"], b: ["a"] }).selected, ["a", "b", "c"]);
  assert.deepEqual(parseOnly(["--only", "b"], IDS, { c: ["a"] }).selected, ["b"]);
});

check("sections: a wrong declaration throws – duplicate ids, undeclared needs or exclusive ids", () => {
  assert.throws(() => sections("t.mjs", ["a", "a"], { argv: [] }), /t\.mjs: section ids must be unique/);
  assert.throws(() => sections("t.mjs", IDS, { needs: { a: ["z"] }, argv: [] }), /needs\['a'\] names section 'z', which is not declared/);
  assert.throws(() => sections("t.mjs", IDS, { needs: { z: ["a"] }, argv: [] }), /needs names section 'z'/);
  assert.throws(() => sections("t.mjs", IDS, { exclusive: { z: "why" }, argv: [] }), /exclusive names section 'z', which is not declared/);
  assert.throws(() => sections("t.mjs", IDS, { exclusive: { a: " " }, argv: [] }), /exclusive\['a'\] needs a one-line reason/);
});

check("sections: an undeclared section id throws; require passes only for a section that ran", () => {
  const S = sections("t.mjs", IDS, { argv: ["--only", "b"] });
  assert.throws(() => S.section("z"), /t\.mjs: section 'z' is not declared/);
  assert.equal(S.section("a"), false);
  assert.equal(S.section("b"), true);
  S.require("b");
  assert.throws(() => S.require("a"), /t\.mjs: this section needs section 'a', which did not run – add it to needs/);
});

check("sections: finish() names a declared id a full run never entered, and a selected id that ran nothing", () => {
  const full = sections("t.mjs", IDS, { argv: [] });
  full.section("a");
  full.section("c");
  assert.equal(full.targeted, false);
  assert.deepEqual(full.finish(), ["section b never ran in a full run – its block is missing or gated by another id"]);
  const targeted = sections("t.mjs", IDS, { argv: ["--only", "b", "--only", "c"] });
  targeted.section("c");
  assert.deepEqual(targeted.finish(), ["the filter selected b, which ran no check – its block is missing or gated by another id"]);
  assert.equal(targeted.targetedLine("Kit facts"), "Kit facts OK for a targeted run (checks: b, c) – only the full run is a gate result.");
});

check("sections: with a count, a selected section that made no check fails unless mayBeEmpty says why", () => {
  assert.throws(() => sections("t.mjs", IDS, { mayBeEmpty: { z: "why" }, argv: [] }), /mayBeEmpty names section 'z', which is not declared/);
  assert.throws(() => sections("t.mjs", IDS, { mayBeEmpty: { a: "" }, argv: [] }), /mayBeEmpty\['a'\] needs a one-line reason/);
  let count = 0;
  const strict = sections("t.mjs", IDS, { count: () => count, argv: ["--only", "a", "--only", "b"] });
  if (strict.section("a")) count += 1;
  strict.section("b");
  assert.deepEqual(strict.finish(), ["the filter selected b, which made no check – a section that may check nothing says why in mayBeEmpty"]);
  const lenient = sections("t.mjs", IDS, { count: () => count, mayBeEmpty: { b: "needs a real tool" }, argv: ["--only", "b"] });
  lenient.section("b");
  assert.deepEqual(lenient.finish(), []);
});

check("sections: XEZ_SECTIONS_TRACE records each failure's section and each section's check count", () => {
  const dir = mkdtempSync(join(tempRoot(), "test-platform-sections-"));
  const before = process.env.XEZ_SECTIONS_TRACE;
  try {
    process.env.XEZ_SECTIONS_TRACE = join(dir, "trace.ndjson");
    let count = 0;
    const S = sections("t.mjs", IDS, { count: () => count, argv: ["--only", "c"] });
    if (S.section("a")) count += 5;
    count += 1; // a check outside every section
    if (S.section("c")) { count += 2; S.trace("c broke"); }
    assert.deepEqual(S.finish(), []);
    const lines = readFileSync(join(dir, "trace.ndjson"), "utf8").trim().split("\n").map((l) => JSON.parse(l));
    assert.deepEqual(lines, [
      { script: "t.mjs", section: "c", message: "c broke" },
      { script: "t.mjs", targeted: true, counts: { "(outside)": 1, c: 2 } },
    ]);
  } finally {
    if (before === undefined) delete process.env.XEZ_SECTIONS_TRACE;
    else process.env.XEZ_SECTIONS_TRACE = before;
    rmSync(dir, { recursive: true, force: true });
  }
});

// --- scripts/lib/gate-runner.mjs (#123) ---------------------------------------------------

await check("runPool runs an exclusive task alone, after the others, and every task once", async () => {
  const running = new Set();
  const overlapped = [];
  const started = [];
  const tasks = [0, 1, 2, 3, 4, 5].map((id) => ({ id, exclusive: id === 1 || id === 4 }));
  const results = await runPool(tasks, {
    jobs: 3,
    exclusive: (task) => task.exclusive,
    start: async (task) => {
      if ((task.exclusive && running.size > 0) || [...running].some((other) => other.exclusive)) overlapped.push(task.id);
      running.add(task);
      started.push(task.id);
      await new Promise((resolve) => setTimeout(resolve, 20));
      running.delete(task);
      return task.id * 10;
    },
  });
  assert.deepEqual(overlapped, [], `an exclusive task overlapped another (tasks ${overlapped.join(", ")})`);
  assert.deepEqual(results, [0, 10, 20, 30, 40, 50], "runPool returns one result per task, in task order");
  assert.deepEqual([...started].sort(), [0, 1, 2, 3, 4, 5], "a task ran twice or never");
  assert.deepEqual(started.slice(-2), [1, 4], "the exclusive tasks run last, in task order");
  for (const jobs of [0, 1.5, undefined]) {
    await assert.rejects(runPool([{ id: 0 }], { jobs, start: async () => 0 }), /whole number of at least 1/, `runPool accepted jobs ${jobs}`);
  }
});

check("gateEnv removes every narrowing variable, in any case, and keeps the rest", () => {
  const env = gateEnv({ PATH: process.env.PATH ?? "", XEZ_DEPS_TEST_ONLY: "53", XEZ_SECTIONS_TRACE: "x", xez_sections_trace: "y", XEZ_KEEP: "1" });
  const leaked = Object.keys(env).filter((key) => /^(XEZ_DEPS_TEST_ONLY$|XEZ_SECTIONS_)/i.test(key));
  assert.deepEqual(leaked, [], `a narrowing variable reached a gate command: ${leaked.join(", ")}`);
  assert.equal(env.XEZ_KEEP, "1");
});

// --- integration: this machine ------------------------------------------------------------

check("Git Bash starts and, on Windows, sets up its own tools", () => {
  const ok = spawnSync(bashPath(), ["-c", "printf ok"], { encoding: "utf8" });
  assert.equal(ok.error, undefined);
  assert.equal(ok.stdout, "ok");
  if (!win32) return;
  // A PATH without Git's usr\bin, like a PowerShell session's: the wrapper must add it. Nor does
  // such a session carry MSYS=noglob, which a harnessed parent (run-gate, test-guards) passes
  // down and under which the MSYS runtime no longer reads libuv's \" quoting (D-2c).
  const env = prependPath(process.env, [], "win32");
  env.PATH = win.join(process.env.SystemRoot ?? "C:\\Windows", "System32");
  for (const key of Object.keys(env)) if (key.toUpperCase() === "MSYS") delete env[key];
  const probe = spawnSync(bashPath(), ["-c", 'uname -o; cygpath -w "$(command -v sed)"'], { encoding: "utf8", env });
  const [system, sed] = probe.stdout.trim().split(/\r?\n/);
  assert.equal(system, "Msys", probe.stdout + probe.stderr);
  const gitRoot = win.dirname(win.dirname(bashPath())).toLowerCase();
  assert.ok(sed?.toLowerCase().startsWith(gitRoot), `sed resolved outside Git: ${sed}`);
});

check("a bare bash under withGitTools is Git's, never WSL's", () => {
  const result = spawnSync("bash", ["-c", "uname -o"], { encoding: "utf8", env: withGitTools(process.env) });
  assert.equal(result.error, undefined);
  assert.equal(result.status, 0, result.stderr);
  if (win32) assert.equal(result.stdout.trim(), "Msys");
});

const lab = mkdtempSync(join(tempRoot(), "test-platform-"));
try {
  check("arguments survive a native start of an extensionless stub", () => {
    const bin = join(lab, "stub-bin");
    mkdirSync(bin);
    writeStub(join(bin, "roundtrip-stub"), '#!/usr/bin/env bash\nfor arg in "$@"; do printf \'%s\\n\' "$arg"; done\n');
    const args = ["a b", "*", "{a,b}", "C:\\x\\y", "", 'a"b', "it's", "C:\\dir\\"];
    const child = [
      'const { spawnSync } = require("node:child_process");',
      'const r = spawnSync("roundtrip-stub", JSON.parse(process.argv[1]), { encoding: "utf8" });',
      "if (r.error) { console.error(r.error.message); process.exit(2); }",
      "process.stdout.write(r.stdout); process.stderr.write(r.stderr); process.exit(r.status ?? 3);",
    ].join("\n");
    const result = spawnSync(process.execPath, ["-e", child, JSON.stringify(args)], {
      encoding: "utf8",
      cwd: lab,
      env: { ...prependPath(process.env, [bin]), ...stubSpawnEnv() },
    });
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(result.stdout.split("\n").slice(0, -1), args);
  });

  // Before prepareTestPlatform(): run-gate.mjs and run-bash.mjs start Git Bash from a process that
  // never installs the tests' child_process wrapper, so spawnGitBash must quote on its own.
  check("spawnGitBash keeps a quote in the command and in each argument", () => {
    const args = ['a"b', "*", "", "it's", "C:\\dir\\"];
    const command = 'for arg in "$@"; do printf \'%s\\n\' "$arg"; done; printf \'%s\\n\' "q\\"uote"';
    const result = spawnGitBash(["-c", command, "_", ...args], { encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(result.stdout.split("\n").slice(0, -1), [...args, 'q"uote']);
  });

  // The two entry points that start Git Bash for npm: their exit code is bash's, their arguments
  // arrive as given, and run-gate runs every command even after one fails.
  check("run-bash.mjs passes a script's arguments and exit code through", () => {
    const script = join(lab, "exit-seven.sh");
    writeFileSync(script, 'printf \'%s\\n\' "$@"\nexit 7\n');
    const result = spawnSync(process.execPath, [join(root, "scripts/run-bash.mjs"), script, 'a"b', "c d"], { encoding: "utf8" });
    assert.equal(result.status, 7, result.stdout + result.stderr);
    assert.deepEqual(result.stdout.split("\n").slice(0, -1), ['a"b', "c d"]);
  });

  // run-gate.mjs and its libraries in a fake checkout whose gate is `commands`; returns a runner.
  const fakeGate = (name, commands) => {
    const gate = join(lab, name);
    mkdirSync(join(gate, "scripts", "lib"), { recursive: true });
    mkdirSync(join(gate, ".xezar", "pipeline"), { recursive: true });
    for (const file of ["run-gate.mjs", "lib/platform.mjs", "lib/gate-runner.mjs"]) writeFileSync(join(gate, "scripts", file), readFileSync(join(root, "scripts", file)));
    writeFileSync(join(gate, ".xezar/pipeline/config.json"), JSON.stringify({ validation: { commands } }));
    return (args, extraEnv = {}) => {
      const env = { ...process.env };
      delete env.GITHUB_ACTIONS;
      delete env.XEZ_GATE_JOBS;
      return spawnSync(process.execPath, [join(gate, "scripts/run-gate.mjs"), ...args], { encoding: "utf8", env: { ...env, ...extraEnv } });
    };
  };
  const tableRows = (result) => [...result.stdout.matchAll(/^\| (\d+) \| .* \| (\S+) \| \d+ \|$/gm)].map((m) => [Number(m[1]), m[2]]);

  // The failing command comes first, so a scheduler that starts nothing after a failure is caught
  // in both modes. With --jobs 2, B starts once C has failed and must finish before A: A waits
  // (P1_WAIT) until B has written its marker – up to 30 s by the clock, so a saturated machine cannot
  // outlast the wait – and the order never depends on timing. The last command proves a quote in a
  // command survives the start of Git Bash.
  const P1 = [
    "echo C >&2; exit 3",
    'if [ -n "${P1_WAIT-}" ]; then until [ -e "$P1_WAIT/b" ] || [ "$SECONDS" -ge 30 ]; do sleep 0.1; done; sleep 0.3; fi; echo A',
    'echo B; if [ -n "${P1_WAIT-}" ]; then : > "$P1_WAIT/b"; fi',
    `test "$(printf '%s' 'a"b')" = 'a"b'`,
  ];
  let p1;
  const runP1 = () => {
    if (!p1) {
      const run = fakeGate("gate-p1", P1);
      const wait = join(lab, "p1-wait");
      mkdirSync(wait);
      p1 = { "--jobs 1": run(["--jobs", "1"]), "--jobs 2": run(["--jobs", "2"], { P1_WAIT: toPosixPath(wait) }) };
    }
    return p1;
  };

  check("run-gate.mjs runs every command, reports each exit code and fails when one fails, with --jobs 1 and --jobs 2", () => {
    for (const [mode, result] of Object.entries(runP1())) {
      const shown = `${mode}:\n${result.stdout}${result.stderr}`;
      assert.equal(result.status, 1, shown);
      assert.deepEqual(tableRows(result), [[1, "3"], [2, "0"], [3, "0"], [4, "0"]], shown);
      assert.match(result.stdout, /^3 of 4 gate commands passed in \d+ s\.$/m, shown);
    }
  });

  check("run-gate.mjs --jobs 2 prints each command's output in config order, then its wall time", () => {
    const result = runP1()["--jobs 2"];
    const lines = result.stdout.split(/\r?\n/);
    assert.ok(lines.includes("A") && lines.indexOf("A") < lines.indexOf("B"), `B, which finished first, was printed before A:\n${result.stdout}`);
    assert.match(result.stderr, /^C$/m, result.stderr);
    assert.match(result.stdout, /^Ran with 2 jobs; wall time \d+ s\.$/m, result.stdout);
  });

  check("run-gate.mjs --jobs 1 prints as a serial run always has, with no wall-time line", () => {
    const result = runP1()["--jobs 1"];
    const lines = result.stdout.split(/\r?\n/);
    assert.ok(lines.includes("A") && lines.indexOf("A") < lines.indexOf("B"), result.stdout);
    assert.doesNotMatch(result.stdout, /^Ran with/m, result.stdout);
  });

  check("run-gate.mjs starts its commands without a narrowing variable it was given", () => {
    const result = fakeGate("gate-p7", ['test -z "${XEZ_DEPS_TEST_ONLY-}"'])([], { XEZ_DEPS_TEST_ONLY: "53" });
    assert.equal(result.status, 0, `XEZ_DEPS_TEST_ONLY reached a gate command run-gate.mjs started:\n${result.stdout}${result.stderr}`);
  });

  check("run-gate.mjs refuses a bad --jobs, XEZ_GATE_JOBS or option with exit 2", () => {
    const run = fakeGate("gate-p3", ["exit 0"]);
    const range = "takes a whole number from 1 to 32";
    for (const [args, env, message] of [
      [["--jobs", "0"], {}, `run-gate: --jobs ${range}`],
      [["--jobs", "x"], {}, `run-gate: --jobs ${range}`],
      [["--bogus"], {}, "run-gate: unknown option '--bogus'"],
      [[], { XEZ_GATE_JOBS: "33" }, `run-gate: XEZ_GATE_JOBS ${range}`],
    ]) {
      const result = run(args, env);
      assert.equal(result.status, 2, `${args.join(" ")}: ${result.stdout}${result.stderr}`);
      assert.equal(result.stderr.trim(), message);
    }
  });

  // gate-changed.mjs (T0, #123) in a fake checkout with no map and no baseBranch: it cannot tell
  // what changed, so it runs every command. Whatever happens, its first and last lines say it is
  // never a gate result, and it exits as run-gate does: 0, 1 when a command fails, 2 on a usage error.
  check("gate-changed.mjs says it is never a gate result first and last, and exits 0, 1 or 2", () => {
    const changedGate = (name, commands) => {
      const gate = join(lab, name);
      const grammar = "skills/xez-onboard-opinionated/kit/checks/lib/config-grammar.mjs";
      mkdirSync(join(gate, "scripts", "lib"), { recursive: true });
      mkdirSync(join(gate, dirname(grammar)), { recursive: true });
      mkdirSync(join(gate, ".xezar", "pipeline"), { recursive: true });
      for (const file of ["gate-changed.mjs", "lib/platform.mjs", "lib/gate-runner.mjs", "lib/gate-select.mjs"]) writeFileSync(join(gate, "scripts", file), readFileSync(join(root, "scripts", file)));
      writeFileSync(join(gate, grammar), readFileSync(join(root, grammar)));
      writeFileSync(join(gate, ".xezar/pipeline/config.json"), JSON.stringify({ validation: { commands } }));
      return (args) => {
        const env = { ...process.env };
        delete env.GITHUB_ACTIONS;
        delete env.XEZ_GATE_JOBS;
        return spawnSync(process.execPath, [join(gate, "scripts/gate-changed.mjs"), ...args], { encoding: "utf8", env });
      };
    };
    const FIRST = "gate:changed (T0) – a quick check of what this branch changed. Never a gate result: run npm run gate before you push.";
    const LAST = "Never a gate result – this ran only what the changes can affect; npm run gate is the gate.";
    const runs = [
      ["every command passes", changedGate("changed-pass", ["exit 0", "exit 0"]), [], 0, /^Selected 2 of 2 commands\.$/m],
      ["a command fails", changedGate("changed-fail", ["exit 0", "exit 3"]), [], 1, /^1 of 2 selected commands passed in \d+ s\.$/m],
      ["a bad --jobs", changedGate("changed-usage", ["exit 0"]), ["--jobs", "0"], 2, /^gate-changed: --jobs takes a whole number from 1 to 32$/m],
    ];
    for (const [label, run, args, status, expected] of runs) {
      const result = run(args);
      const shown = `${label}:\n${result.stdout}${result.stderr}`;
      const lines = result.stdout.trimEnd().split(/\r?\n/);
      assert.equal(result.status, status, shown);
      assert.equal(lines[0], FIRST, shown);
      assert.equal(lines.at(-1), LAST, shown);
      assert.match(result.stdout + result.stderr, expected, shown);
      if (status !== 2) assert.match(result.stdout, /^Changed files: unknown\.$/m, shown);
    }
    // An error main() does not handle (a config that is JSON null): exit 1, the error on stderr,
    // and still the last line.
    const thrower = changedGate("changed-throw", []);
    writeFileSync(join(lab, "changed-throw", ".xezar/pipeline/config.json"), "null");
    const thrown = thrower([]);
    const shown = `a thrown error:\n${thrown.stdout}${thrown.stderr}`;
    const lines = thrown.stdout.trimEnd().split(/\r?\n/);
    assert.equal(thrown.status, 1, shown);
    assert.equal(lines[0], FIRST, shown);
    assert.equal(lines.at(-1), LAST, shown);
    assert.match(thrown.stderr, /^gate-changed: TypeError/m, shown);
  });

  // --- scripts/lib/tree-copy.mjs (#123) ---
  // A source repository with every kind of change a contributor's tree can hold, and its copy.
  const git = (cwd, ...args) => {
    const result = spawnSync("git", ["-C", cwd, ...args], { encoding: "utf8" });
    if (result.status !== 0) throw new Error(`git ${args.join(" ")}: ${result.stderr}`);
    return result.stdout;
  };
  let tree;
  const treeCopy = () => {
    if (tree) return tree;
    const base = join(lab, "tree");
    const source = join(base, "source");
    git(lab, "-c", "init.defaultBranch=main", "init", "-q", source);
    for (const [key, value] of [["core.autocrlf", "false"], ["user.email", "t@example.com"], ["user.name", "t"]]) git(source, "config", key, value);
    const files = { "kept.txt": "kept\n", "staged.txt": "staged 1\n", "unstaged.txt": "unstaged 1\n", "deleted.txt": "deleted\n", "run.sh": "#!/bin/sh\necho run\n", ".gitignore": "*.log\n" };
    for (const [name, text] of Object.entries(files)) writeFileSync(join(source, name), text);
    git(source, "add", ".");
    git(source, "update-index", "--chmod=+x", "run.sh");
    git(source, "commit", "-q", "-m", "base");
    writeFileSync(join(source, "staged.txt"), "staged 2\n");
    git(source, "add", "staged.txt");
    writeFileSync(join(source, "unstaged.txt"), "unstaged 2\n");
    writeFileSync(join(source, "ita.txt"), "intent to add\n");
    git(source, "add", "-N", "ita.txt");
    mkdirSync(join(source, "dir"));
    writeFileSync(join(source, "dir", "untracked.txt"), "untracked\n");
    writeFileSync(join(source, "ignored.log"), "ignored\n");
    rmSync(join(source, "deleted.txt"));
    // A nested repository: `git ls-files -o` lists it as one entry, "inner/".
    const inner = join(source, "inner");
    git(source, "-c", "init.defaultBranch=main", "init", "-q", inner);
    writeFileSync(join(inner, "nested.txt"), "nested\n");
    git(inner, "add", ".");
    git(inner, "-c", "user.email=t@example.com", "-c", "user.name=t", "commit", "-q", "-m", "inner");
    // Another worktree whose folder is gone: a global `git worktree prune` would drop its entry.
    git(source, "worktree", "add", "-q", "--detach", join(base, "side"), "HEAD");
    renameSync(join(base, "side"), join(base, "side-moved"));
    const before = { status: git(source, "status", "--porcelain"), index: git(source, "ls-files", "-s") };
    const copy = copyTree(source, join(base, "copy"));
    // Read before any `git status` in the copy, which would refresh its index itself.
    const unrefreshed = { copy: git(copy, "diff-files", "--name-only"), source: git(source, "diff-files", "--name-only") };
    tree = { base, source, before, copy, unrefreshed };
    return tree;
  };

  check("copyTree: the copy's index is the user's – staged changes, an executable file, intent-to-add", () => {
    const { copy, before, unrefreshed } = treeCopy();
    assert.equal(git(copy, "ls-files", "-s"), before.index, "the copy's index differs from the user's");
    assert.equal(unrefreshed.copy, unrefreshed.source, "the copy's index was left unrefreshed: diff-files lists files the user never changed");
    assert.match(before.index, /^100755 \S+ 0\trun\.sh$/m);
  });

  check("copyTree: the copy holds the user's untracked files and none of the ignored ones", () => {
    const { copy } = treeCopy();
    for (const path of ["dir/untracked.txt", "ita.txt", "inner/nested.txt", "inner/.git"]) assert.ok(existsSync(join(copy, path)), `the copy lacks an untracked file: ${path}`);
    assert.ok(!existsSync(join(copy, "ignored.log")), "the copy holds an ignored file");
  });

  check("copyTree: the copy has the user's status, bytes and unstaged diff", () => {
    const { copy, source, before } = treeCopy();
    assert.equal(git(copy, "status", "--porcelain"), before.status, "the copy's git status differs from the user's");
    for (const path of git(source, "ls-files", "-co", "--exclude-standard").split("\n").filter((line) => line && !line.endsWith("/"))) {
      const there = existsSync(join(source, path));
      assert.equal(existsSync(join(copy, path)), there, `${path}: present in one tree only`);
      if (there) assert.ok(readFileSync(join(copy, path)).equals(readFileSync(join(source, path))), `${path}: the copy's bytes differ`);
    }
    const quiet = (cwd) => spawnSync("git", ["-C", cwd, "diff", "--quiet"]).status;
    assert.equal(quiet(copy), quiet(source));
  });

  check("copyTree: writing in the copy leaves the source alone; removeTree prunes nothing else", () => {
    const { base, copy, source, before } = treeCopy();
    writeFileSync(join(copy, "kept.txt"), "changed in the copy\n");
    writeFileSync(join(copy, "new-in-copy.txt"), "new\n");
    assert.equal(git(source, "status", "--porcelain"), before.status, "a write in the copy changed the source");
    removeTree(source, base, copy);
    // Matched by the last two segments: git may print the temp folder resolved (macOS: /private/var).
    const listed = toPosixPath(git(source, "worktree", "list", "--porcelain"));
    assert.ok(!existsSync(copy) && !/^worktree .*\/tree\/copy$/m.test(listed), `removeTree left the copy or its entry:\n${listed}`);
    assert.match(listed, /^worktree .*\/tree\/side$/m, `removeTree pruned another worktree's entry:\n${listed}`);
  });

  check("removeTree refuses a link and a path outside its base, and removes nothing", () => {
    const { base, source } = treeCopy();
    const victim = join(lab, "remove-victim");
    mkdirSync(victim);
    writeFileSync(join(victim, "keep.txt"), "keep\n");
    const link = join(base, "link-copy");
    symlinkSync(victim, link, "junction"); // a junction on Windows; a directory link elsewhere
    const refusal = (path) => {
      try {
        removeTree(source, base, path);
        return "";
      } catch (error) {
        return error.message;
      }
    };
    assert.match(refusal(link), /is a link/, `removeTree did not refuse the link ${link}`);
    assert.match(refusal(victim), /is not inside/, `removeTree did not refuse ${victim}, outside ${base}`);
    assert.ok(existsSync(join(victim, "keep.txt")), "removeTree removed what a link points at");
    rmSync(link);
  });

  // A crashed run's copies sit in its private folder <base>/guards-<pid>-XXXXXX/guards-<pid>-<k>.
  check("removeStaleCopies removes a dead run's copies and leftover folders, and keeps a live run's", () => {
    const { base, source } = treeCopy();
    const temp = join(base, "temp");
    const elsewhere = join(base, "elsewhere");
    const sleeper = spawn(process.execPath, ["-e", "setTimeout(() => {}, 120000)"], { stdio: "ignore" });
    try {
      const dead = spawnSync(process.execPath, ["-e", ""]).pid;
      const live = sleeper.pid;
      const places = {
        dead: join(temp, `guards-${dead}-AbC123`, `guards-${dead}-0`),
        live: join(temp, `guards-${live}-DeF456`, `guards-${live}-0`),
        outside: join(elsewhere, `guards-${dead}-GhI789`, `guards-${dead}-0`),
      };
      for (const place of Object.values(places)) git(source, "worktree", "add", "-q", "--detach", place, "HEAD");
      const leftover = join(temp, `guards-${dead}-JkL012`);
      mkdirSync(join(leftover, `guards-${dead}-1`), { recursive: true }); // a copy whose entry is gone
      mkdirSync(join(temp, "guards-notes"));
      removeStaleCopies(source, temp, "guards-");
      const listed = toPosixPath(git(source, "worktree", "list", "--porcelain"));
      const has = (place) => listed.includes(`/${toPosixPath(path.relative(base, place))}\n`);
      assert.ok(!existsSync(dirname(places.dead)) && !has(places.dead), `removeStaleCopies kept a dead run's copy:\n${listed}`);
      assert.ok(!existsSync(leftover), "removeStaleCopies kept a dead run's leftover folder");
      assert.ok(existsSync(places.live) && has(places.live), "removeStaleCopies removed a copy whose run is still alive");
      assert.ok(existsSync(places.outside) && has(places.outside), "removeStaleCopies removed a copy outside its base");
      assert.ok(existsSync(join(temp, "guards-notes")), "removeStaleCopies removed a folder whose name only starts like a copy's");
      assert.match(listed, /^worktree .*\/tree\/side$/m, `removeStaleCopies pruned another worktree's entry:\n${listed}`);
      for (const place of [places.live, places.outside]) removeTree(source, base, place);
    } finally {
      sleeper.kill();
    }
  });

  check("writeInside writes inside its base and refuses ../ and another path, unwritten", () => {
    const base = join(lab, "write-base");
    mkdirSync(base);
    writeInside(base, join(base, "in.txt"), "in\n");
    assert.equal(readFileSync(join(base, "in.txt"), "utf8"), "in\n");
    for (const path of [join(base, "..", "write-escape.txt"), join(lab, "write-other.txt")]) {
      let refused = false;
      try {
        writeInside(base, path, "x\n");
      } catch {
        refused = true;
      }
      assert.ok(refused && !existsSync(path), `writeInside wrote outside ${base}: ${path}`);
    }
  });

  check("assertInside accepts a path inside its base and refuses ../, another path and a link out", () => {
    const base = join(lab, "inside-base");
    const outside = join(lab, "outside");
    mkdirSync(join(base, "sub"), { recursive: true });
    mkdirSync(outside);
    assertInside(base, join(base, "sub", "not-yet-written.txt"));
    symlinkSync(outside, join(base, "link-out"), "junction"); // a junction on Windows; a directory link elsewhere
    for (const path of [join(base, "..", "x"), outside, base, join(base, "link-out", "f")]) {
      assert.throws(() => assertInside(base, path), /is not inside/, `assertInside accepted a path outside ${base}: ${path}`);
    }
  });

  // test-guards.mjs in a checkout inside the temp folder, so only the checkout clause can refuse
  // that checkout, a folder in it or one holding it. The last start gets a temp folder of its own
  // in the lab and a copy beside it – absolute, existing, apart from the checkout – so only the
  // temp-folder clause can refuse that one. Each start must exit 2 before it reads anything.
  await check("test-guards.mjs --worker refuses an unforked start, a relative path, the checkout, in it, around it, outside temp", async () => {
    const checkout = join(lab, "guards-checkout");
    mkdirSync(join(checkout, "scripts"), { recursive: true });
    cpSync(join(root, "scripts", "lib"), join(checkout, "scripts", "lib"), { recursive: true });
    const suite = join(checkout, "scripts", "test-guards.mjs");
    writeFileSync(suite, readFileSync(join(root, "scripts", "test-guards.mjs")));
    const unforked = spawnSync(process.execPath, [suite, "--worker", join(lab, "write-base")], { encoding: "utf8" });
    assert.equal(unforked.status, 2, `an unforked --worker start was not refused:\n${unforked.stderr}`);
    const forked = (given, env = process.env) => new Promise((resolve) => {
      const child = fork(suite, ["--worker", given], { stdio: ["ignore", "ignore", "pipe", "ipc"], env });
      let stderr = "";
      child.stderr.on("data", (chunk) => { stderr += chunk; });
      const timer = setTimeout(() => child.kill(), 60000);
      child.on("message", () => child.kill()); // it started as a worker: stop it before it runs anything
      child.on("close", (code, signal) => {
        clearTimeout(timer);
        resolve({ given, code: code ?? signal, stderr });
      });
    });
    const ownTemp = join(lab, "guards-temp");
    const besideTemp = join(lab, "guards-beside-temp");
    mkdirSync(ownTemp);
    mkdirSync(besideTemp);
    const isTempKey = (key) => ["TMPDIR", "TEMP", "TMP"].includes(key.toUpperCase());
    const tempEnv = { ...Object.fromEntries(Object.entries(process.env).filter(([key]) => !isTempKey(key))), TMPDIR: ownTemp, TEMP: ownTemp, TMP: ownTemp };
    const refused = await Promise.all([
      ...["relative/copy", checkout, join(checkout, "scripts"), lab, dirname(tempRoot())].map((given) => forked(given)),
      forked(besideTemp, tempEnv),
    ]);
    for (const { given, code, stderr } of refused) {
      assert.equal(code, 2, `test-guards.mjs did not refuse --worker ${given} (exit ${code}):\n${stderr}`);
      assert.match(stderr, /^test-guards: --worker /m, stderr);
    }
  });

  check("after prepareTestPlatform() a direct Git Bash spawn keeps quotes and globs as they are", () => {
    prepareTestPlatform(); // a no-op off Windows
    const args = ['. "$1" && run ""', "a b", "*", "", 'a"b', "it's", "C:\\dir\\"];
    const result = spawnSync(bashPath(), ["-c", 'for arg in "$@"; do printf \'%s\\n\' "$arg"; done', "_", ...args], { encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(result.stdout.split("\n").slice(0, -1), args);
  });

  // An administrator's backup and restore privileges read and write through any deny entry, so
  // restrict() drops them from the test process. The mechanism is proven here on a privilege every
  // Windows account holds, in a child, so this test keeps it: the child's own check (a whoami it
  // starts after the removal) fails when the removal did not reach the programs it starts.
  check("dropPrivileges() removes a held privilege for the process and what it starts", () => {
    const harness = new URL("./lib/test-harness.mjs", import.meta.url).href;
    const child = [
      `import { dropPrivileges } from ${JSON.stringify(harness)};`,
      'process.stdout.write(JSON.stringify(dropPrivileges(["SeTimeZonePrivilege"])));',
    ].join("\n");
    const result = spawnSync(process.execPath, ["--input-type=module", "-e", child], { encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(JSON.parse(result.stdout), win32 ? ["SeTimeZonePrivilege"] : []);
    assert.throws(() => dropPrivileges(["Se'Privilege"]), /is not a privilege name/);
  });

  check("restrict(no-write) denies a write until restore()", () => {
    if (process.getuid?.() === 0) return; // root ignores both chmod and the check
    const dir = join(lab, "locked");
    mkdirSync(dir);
    const restore = restrict(dir, "no-write");
    try {
      assert.throws(() => writeFileSync(join(dir, "f"), "x"), (error) => ["EACCES", "EPERM"].includes(error.code));
    } finally {
      restore();
    }
    restore();
    writeFileSync(join(dir, "f"), "x");
  });

  check("restrict refuses a path outside the temp root and a link inside it", () => {
    // The temp root itself is outside it; so is the checkout – except when this run is in a
    // private copy under the temp root, as every gate in the guard suite is (#123).
    const insideTemp = (p) => {
      const rel = path.relative(realpathSync.native(tempRoot()), realpathSync.native(p));
      return rel !== "" && !rel.startsWith("..") && !path.isAbsolute(rel);
    };
    for (const outside of [tempRoot(), root].filter((p) => !insideTemp(p))) {
      assert.throws(() => restrict(outside, "no-write"), /is not inside/, `restrict accepted ${outside}`);
    }
    const target = join(lab, "link-target");
    mkdirSync(target);
    const link = join(lab, "link");
    symlinkSync(target, link, "junction"); // a junction on Windows (no Developer Mode needed); a dir link elsewhere
    assert.throws(() => restrict(link, "no-read"), /symbolic link or junction/);
  });

  check("install-skills replaces a foreign link without touching what it points at", () => {
    const home = join(lab, "home");
    const foreign = join(lab, "foreign-skill");
    mkdirSync(foreign);
    writeFileSync(join(foreign, "keep.txt"), "keep\n");
    const first = readdirSync(join(root, "skills"), { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && existsSync(join(root, "skills", entry.name, "SKILL.md")))
      .map((entry) => entry.name)
      .sort()[0];
    const target = join(home, ".claude", "skills", first);
    mkdirSync(dirname(target), { recursive: true });
    symlinkSync(foreign, target, "junction"); // a junction on Windows; a directory link elsewhere
    const install = (...args) =>
      spawnSync(process.execPath, [join(root, "scripts/install-skills.mjs"), "--agent", "claude", ...args], {
        encoding: "utf8",
        env: { ...process.env, HOME: home, USERPROFILE: home },
      });
    const linked = install();
    assert.equal(linked.status, 0, linked.stdout + linked.stderr);
    assert.ok(existsSync(join(foreign, "keep.txt")), "the replaced link's target lost keep.txt");
    assert.equal(realpathSync(target).toLowerCase(), realpathSync(join(root, "skills", first)).toLowerCase());
    const again = install();
    assert.match(again.stdout, new RegExp(`ok +${first} \\(already linked\\)`), again.stdout + again.stderr);
    const removed = install("--uninstall");
    assert.equal(removed.status, 0, removed.stdout + removed.stderr);
    assert.ok(existsSync(join(root, "skills", first, "SKILL.md")), "--uninstall removed the repository's own skill");
    assert.equal(existsSync(target), false, "--uninstall left the link behind");
  });
} finally {
  rmSync(lab, { recursive: true, force: true });
}

if (failures) {
  console.error(`\nplatform helpers: ${failures} of ${cases} cases failed`);
  process.exit(1);
}
console.log(`Platform helpers OK (${cases} cases: Git Bash resolver, text and path helpers, PATH env, stubs, restrict).`);
