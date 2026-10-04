#!/usr/bin/env node
// Unit and integration test for scripts/lib/platform.mjs and scripts/lib/test-harness.mjs (#122), and
// unit cases for scripts/lib/sections.mjs (#123).
//
// The pure cases inject platform "win32" and a fake file system, so the Windows logic – above
// all "never start WSL's bash.exe" – is proven on the Linux CI runner too. The integration cases
// run on whatever machine this is: on Windows they prove Git Bash is found and sets up its own
// tools, that a bare `bash` under the prepared PATH is Git's, and that arguments survive the
// native -> MSYS start of a stub.
//
// Run: node scripts/test-platform.mjs (scripts/lint.sh runs it too)

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
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

const root = fileURLToPath(new URL("../", import.meta.url));
const win32 = process.platform === "win32";
const win = path.win32;

let cases = 0;
let failures = 0;

function check(name, fn) {
  cases += 1;
  try {
    fn();
  } catch (error) {
    failures += 1;
    console.error(`FAIL  ${name}\n      ${String(error.message).split("\n").join("\n      ")}`);
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

  check("run-gate.mjs runs every command, reports each exit code and fails when one fails", () => {
    const gate = join(lab, "gate");
    mkdirSync(join(gate, "scripts", "lib"), { recursive: true });
    mkdirSync(join(gate, ".xezar", "pipeline"), { recursive: true });
    for (const file of ["run-gate.mjs", "lib/platform.mjs"]) writeFileSync(join(gate, "scripts", file), readFileSync(join(root, "scripts", file)));
    const commands = ["exit 0", "exit 3", `test "$(printf '%s' 'a"b')" = 'a"b'`];
    writeFileSync(join(gate, ".xezar/pipeline/config.json"), JSON.stringify({ validation: { commands } }));
    const env = { ...process.env };
    delete env.GITHUB_ACTIONS;
    const result = spawnSync(process.execPath, [join(gate, "scripts/run-gate.mjs")], { encoding: "utf8", env });
    const exits = [...result.stdout.matchAll(/^\| (\d+) \| .* \| (\S+) \| \d+ \|$/gm)].map((m) => [Number(m[1]), m[2]]);
    assert.equal(result.status, 1, result.stdout + result.stderr);
    assert.deepEqual(exits, [[1, "0"], [2, "3"], [3, "0"]], result.stdout + result.stderr);
    assert.match(result.stdout, /^2 of 3 gate commands passed in \d+ s\.$/m);
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
    assert.throws(() => restrict(root, "no-write"), /is not inside/);
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
