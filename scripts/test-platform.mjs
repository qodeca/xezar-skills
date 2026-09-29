#!/usr/bin/env node
// Unit and integration test for scripts/lib/platform.mjs and scripts/lib/test-harness.mjs (#122).
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
import { existsSync, mkdirSync, mkdtempSync, readdirSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import path, { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  GIT_BASH_MISSING,
  bashPath,
  prependPath,
  resolveGitBash,
  toLF,
  toPosixPath,
  withGitTools,
} from "./lib/platform.mjs";
import {
  pinTestGitConfig,
  prepareTestPlatform,
  resolveStub,
  restrict,
  stubSpawnEnv,
  tempRoot,
  writeStub,
} from "./lib/test-harness.mjs";

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
const resolve = (env, ...paths) => resolveGitBash({ platform: "win32", env, exists: fakeFs(...paths) });

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

check("off Windows the resolver answers plain bash", () => {
  assert.equal(resolveGitBash({ platform: "linux", env: {}, exists: fakeFs() }), "bash");
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

  check("after prepareTestPlatform() a direct Git Bash spawn keeps quotes and globs as they are", () => {
    prepareTestPlatform(); // a no-op off Windows
    const args = ['. "$1" && run ""', "a b", "*", "", 'a"b', "it's", "C:\\dir\\"];
    const result = spawnSync(bashPath(), ["-c", 'for arg in "$@"; do printf \'%s\\n\' "$arg"; done', "_", ...args], { encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(result.stdout.split("\n").slice(0, -1), args);
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
