#!/usr/bin/env node
// Behavioural test for dependency units (`kit/checks/lib/deps.mjs`, `kit/checks/deps-restore.sh`
// and the units paths in `kit/checks/lib/common.sh`, `repo-gates.sh`, `worktree-setup.sh`).
//
// What it protects: a repository with no root manifest installs each unit it lists, and only
// those, with the flags the kit promises; the list comes from the BASE BRANCH, so a branch cannot
// change what runs; a unit that cannot be found, a symlinked folder and Yarn 2 or later are
// refused; freshness goes stale on every input the plan names; and a project WITHOUT units keeps
// exactly the single npm root behaviour it had.
//
// Each case builds real repositories in a temp dir. The package managers are stubs on PATH that
// RECORD their argv, working folder and HUSKY, so the flags are asserted, not assumed.
//
// Opt-in real-tool mode: XEZ_DEPS_REAL=1 also runs the real yarn (Yarn 1) and dotnet when they are
// installed, and prints SKIP for each one that is not. It needs no network: the fixtures declare
// no packages.
//
// Run: node scripts/test-deps-units.mjs
//      XEZ_DEPS_TEST_ONLY=53 node scripts/test-deps-units.mjs   (the #53 tree-digest and resume cases only)

import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { chmodSync, copyFileSync, existsSync, lstatSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, realpathSync, rmSync, symlinkSync, writeFileSync, appendFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const KIT = join(root, "skills", "xez-onboard-opinionated", "kit");
const RESTORE = ".xezar/checks/deps-restore.sh";

const ONLY_53_DONE = Symbol("only the #53 cases were asked for");
let failures = 0;
let asserts = 0;
const expect = (name, ok, detail = "") => {
  asserts += 1;
  if (!ok) { failures += 1; console.error(`FAIL  ${name}${detail ? `\n      ${detail}` : ""}`); }
};

const lab = realpathSync(mkdtempSync(join(tmpdir(), "kit-deps-units-")));
const write = (file, text) => { mkdirSync(dirname(file), { recursive: true }); writeFileSync(file, text); };
const git = (cwd, ...args) =>
  execFileSync("git", ["-c", "user.name=t", "-c", "user.email=t@example.com", "-c", "init.defaultBranch=main", ...args], { cwd, encoding: "utf8", stdio: "pipe" }).trim();
const sha = (text) => createHash("sha256").update(text).digest("hex");

// --- stubs that record ------------------------------------------------------------------------
const bin = join(lab, "bin");
const LOG = join(lab, "calls.ndjson");
const record = `node -e 'require("fs").appendFileSync(process.env.DEPS_STUB_LOG, JSON.stringify({ tool: process.argv[1], argv: process.argv.slice(2), cwd: process.cwd(), husky: process.env.HUSKY ?? null }) + "\\n")'`;
const stub = (name, body) => { write(join(bin, name), `#!/usr/bin/env bash\n${body}\n`); chmodSync(join(bin, name), 0o755); };
stub("yarn", `[ "\${1:-}" = "--version" ] && { echo "\${STUB_YARN_VERSION:-1.22.22}"; exit 0; }
${record} yarn "$@"
[ -n "\${STUB_FAIL:-}" ] && exit 1
mkdir -p node_modules && : > node_modules/.yarn-integrity`);
stub("npm", `[ "\${1:-}" = "--version" ] && { echo 10.9.0; exit 0; }
${record} npm "$@"
mkdir -p node_modules && : > node_modules/.package-lock.json`);
stub("dotnet", `[ "\${1:-}" = "--version" ] && { echo "\${STUB_DOTNET_VERSION:-8.0.100}"; exit 0; }
${record} dotnet "$@"
find . -name '*.csproj' -not -path '*/obj/*' -not -path '*/bin/*' | while IFS= read -r f; do
  d="$(cd "$(dirname "$f")" && pwd -P)"; mkdir -p "$d/obj"
  printf '{"project":{"restore":{"projectPath":"%s/%s"}}}' "$d" "$(basename "$f")" > "$d/obj/project.assets.json"
done`);

const home = join(lab, "home");
mkdirSync(home, { recursive: true });
const baseEnv = () => ({ ...process.env, PATH: `${bin}:${process.env.PATH}`, DEPS_STUB_LOG: LOG, HOME: home, NVM_DIR: join(lab, "no-nvm") });
const calls = () => (existsSync(LOG) ? readFileSync(LOG, "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l)) : []);
const clearCalls = () => rmSync(LOG, { force: true });

function run(cmd, args, cwd, env = {}) {
  const r = spawnSync(cmd, args, { cwd, encoding: "utf8", env: { ...baseEnv(), ...env } });
  return { code: r.status, out: r.stdout ?? "", err: r.stderr ?? "" };
}
const deps = (repo, command, env) => run("node", [join(repo, ".xezar/checks/lib/deps.mjs"), command, "--root", repo], repo, env);
// A bash snippet with lib/common.sh sourced and the task paths resolved.
const sh = (repo, snippet, env) =>
  run("bash", ["-c", `set -uo pipefail\n. .xezar/checks/lib/common.sh\nresolve_task_paths || exit 99\n${snippet}`], repo, env);

// --- fixtures -----------------------------------------------------------------------------------
let seq = 0;
const UNITS = [
  { dir: "apps/web", provider: "yarn" },
  { dir: "apps/widget", provider: "yarn", lockfile: "yarn.lock" },
  { dir: "apps/tool", provider: "npm" },
  { dir: "svc", provider: "dotnet", entry: "Svc.sln" },
];

// A primary checkout with an origin whose default branch carries `config`, and the kit installed.
function repo({ config, files = {}, extra = () => {} } = {}) {
  const dir = join(lab, `repo-${++seq}`);
  mkdirSync(dir, { recursive: true });
  git(dir, "init", "--quiet");
  for (const f of ["lib/deps.mjs", "lib/common.sh", "deps-restore.sh", "local-tree.sh", "repo-gates.sh", "lib/gate-record.sh", "lib/gate-results.mjs"]) {
    mkdirSync(dirname(join(dir, ".xezar/checks", f)), { recursive: true });
    copyFileSync(join(KIT, "checks", f), join(dir, ".xezar/checks", f));
  }
  write(join(dir, ".xezar/config.json"), '{"baseBranch":"main"}\n');
  write(join(dir, ".gitignore"), ".local/\nnode_modules/\nobj/\n");
  if (config) write(join(dir, ".xezar/pipeline/config.json"), `${JSON.stringify(config, null, 2)}\n`);
  for (const [path, text] of Object.entries(files)) write(join(dir, path), text);
  extra(dir);
  git(dir, "add", "-A");
  git(dir, "commit", "--quiet", "-m", "fixture");
  git(lab, "clone", "--quiet", "--bare", dir, `origin-${seq}.git`);
  git(dir, "remote", "add", "origin", join(lab, `origin-${seq}.git`));
  git(dir, "fetch", "--quiet", "origin");
  git(dir, "remote", "set-head", "origin", "main");
  return dir;
}

const unitFiles = {
  "apps/web/package.json": '{"name":"web"}\n',
  "apps/web/yarn.lock": "# yarn lockfile v1\n",
  "apps/widget/package.json": '{"name":"widget"}\n',
  "apps/widget/yarn.lock": "# yarn lockfile v1\n",
  "apps/widget/package-lock.json": '{"lockfileVersion":3}\n',
  "apps/tool/package.json": '{"name":"tool"}\n',
  "apps/tool/package-lock.json": '{"lockfileVersion":3}\n',
  "apps/excluded/package.json": '{"name":"excluded"}\n',
  "apps/excluded/yarn.lock": "# yarn lockfile v1\n",
  "svc/Svc.sln": "Microsoft Visual Studio Solution File\n",
  "svc/Api/Api.csproj": "<Project/>\n",
};
const unitsConfig = (units = UNITS, first = RESTORE) => ({ validation: { commands: [first, "npm test"] }, dependencies: { units } });

try {
  // #53: what is IN the tree. The nonce and the folder's inode catch a node_modules replaced
  // wholesale; a package folder swapped or a file edited inside the same tree needs the digest.
  {
    const r = repo({ config: unitsConfig([{ dir: "apps/web", provider: "yarn" }]), files: unitFiles });
    run("bash", [join(r, RESTORE)], r);
    const nm = join(r, "apps/web/node_modules");
    const pkg = (name, body = "module.exports = 1;\n") => { write(join(nm, name, "package.json"), `{"name":"${name}"}\n`); write(join(nm, name, "index.js"), body); };
    pkg("left-pad");
    pkg("other");
    mkdirSync(join(nm, ".bin"));
    symlinkSync("../left-pad/index.js", join(nm, ".bin/left-pad"));
    pkg("other/node_modules/nested");
    const fresh = (env) => sh(r, "deps_are_fresh", env).code;
    const restamp = () => sh(r, "write_deps_stamp").code === 0 && fresh() === 0;
    expect("digest: installed and stamped is fresh", restamp());
    const nonce = readFileSync(join(nm, ".xezar-deps-tree"), "utf8");
    const ino = lstatSync(nm).ino;
    rmSync(join(nm, "left-pad"), { recursive: true });
    pkg("left-pad");
    expect("digest: the swap kept the folder and the nonce, so only the digest can refuse it", readFileSync(join(nm, ".xezar-deps-tree"), "utf8") === nonce && lstatSync(nm).ino === ino && deps(r, "resolve").code === 0);
    expect("stale: one package folder replaced inside node_modules, folder and nonce kept (#53)", fresh() !== 0);
    const gates = readFileSync(join(KIT, "checks/repo-gates.sh"), "utf8");
    expect("digest: the fast gate reinstalls whenever deps_are_fresh refuses", gates.includes('if [ "$FAST" -eq 1 ] && ! deps_are_fresh; then'));
    expect("digest: re-stamped, fresh again", restamp());
    write(join(nm, "other/index.js"), "module.exports = 2;\n");
    expect("stale: a file edited in place, same size (#53)", fresh() !== 0);
    expect("digest: re-stamped after the edit", restamp());
    rmSync(join(nm, ".bin/left-pad"));
    symlinkSync("../other/index.js", join(nm, ".bin/left-pad"));
    expect("stale: a .bin entry swapped (#53)", fresh() !== 0);
    expect("digest: re-stamped after the swap", restamp());
    // What the gates themselves write: build caches directly inside a node_modules.
    write(join(nm, ".vite/deps/chunk.js"), "x\n");
    write(join(nm, ".vite-temp/vite.config.ts.timestamp.mjs"), "x\n");
    write(join(nm, ".cache/babel/entry.json"), "{}\n");
    write(join(nm, ".vitest/results.json"), "{}\n");
    write(join(nm, "other/node_modules/.cache/x.json"), "{}\n");
    expect("digest: a gate run that writes build caches inside node_modules does not make the next run stale (#53)", fresh() === 0);
    write(join(nm, ".vite/deps/chunk.js"), "y, and longer\n");
    expect("digest: a cache rewritten by the next gate run is still fresh", fresh() === 0);
    const cacheCase = (name, build, undo) => {
      build();
      expect(`stale: ${name}`, fresh() !== 0);
      undo();
      expect(`stale: ${name} (and fresh again once undone)`, fresh() === 0);
    };
    cacheCase("a build cache that holds a package.json is digested like the rest", () => write(join(nm, ".cache/evil/package.json"), "{}\n"), () => rmSync(join(nm, ".cache/evil"), { recursive: true }));
    cacheCase("a build cache that holds a .bin", () => write(join(nm, ".vite/.bin/tool"), "x\n"), () => rmSync(join(nm, ".vite/.bin"), { recursive: true }));
    cacheCase("a build cache that holds a link", () => symlinkSync("../other", join(nm, ".cache/ln")), () => rmSync(join(nm, ".cache/ln")));
    cacheCase("a cache-named folder that is not directly inside a node_modules", () => write(join(nm, "other/.cache/x"), "x\n"), () => rmSync(join(nm, "other/.cache"), { recursive: true }));
    symlinkSync(".cache/babel", join(nm, "sneaky"));
    const into = deps(r, "fresh");
    expect("refused: a link into a build cache the digest leaves out (#53)", into.code === 1 && into.err.includes("sneaky links into the build cache .cache"), JSON.stringify(into));
    rmSync(join(nm, "sneaky"));
    expect("digest: fresh again once the link is gone", fresh() === 0);
    if (process.getuid?.() !== 0) {
      chmodSync(join(nm, "other"), 0o000);
      const locked = deps(r, "fresh");
      chmodSync(join(nm, "other"), 0o755);
      expect("refused: a tree the digest cannot read is not fresh, never skipped (#53)", locked.code === 1 && locked.err.includes("cannot be read"), JSON.stringify(locked));
    } else console.log("SKIP  unreadable tree: running as root, which reads everything");
    const slow = deps(r, "fresh", { XEZ_DEPS_DIGEST_TIMEOUT_MS: "0" });
    expect("refused: a digest that times out is not fresh (#53)", slow.code === 1 && slow.err.includes("timed out"), JSON.stringify(slow));
    const slowStamp = deps(r, "stamp", { XEZ_DEPS_DIGEST_TIMEOUT_MS: "0" });
    expect("digest: a stamp written when the digest timed out says so", slowStamp.code === 0 && slowStamp.err.includes("stamped as not fresh"), JSON.stringify(slowStamp));
    expect("refused: a stamp with no digest is never fresh, even once the digest is fast again", fresh() !== 0);
    expect("digest: a normal stamp afterwards is fresh", restamp());

    // Resume reuses sealed evidence only when the dependencies are fresh. The stages around the
    // decision are stubs: preflight passes, the counters are not spent, the seal answers eligible.
    const log = join(lab, `resume-${seq}.log`);
    const res = repo({
      config: unitsConfig([{ dir: "apps/web", provider: "yarn" }]),
      files: unitFiles,
      extra: (d) => {
        const x = (f, body) => { write(join(d, ".xezar/checks", f), `#!/usr/bin/env bash\n${body}\n`); chmodSync(join(d, ".xezar/checks", f), 0o755); };
        copyFileSync(join(KIT, "checks/resume-complete.sh"), join(d, ".xezar/checks/resume-complete.sh"));
        x("worktree-preflight.sh", `printf 'preflight %s\\n' "$*" >> "$RESUME_LOG"`);
        x("phase-record.sh", "exit 1");
        x("repo-gates.sh", `if [ "\${1:-}" = --list ]; then printf '{"commandListId":"L","gates":[{"name":"${RESTORE}"}]}'; exit 0; fi\nprintf 'gates %s\\n' "$*" >> "$RESUME_LOG"`);
        write(join(d, ".xezar/checks/lib/gate-results.mjs"), 'console.log("seal: eligible (stub)");\n');
      },
    });
    run("bash", [join(res, RESTORE)], res);
    write(join(res, "apps/web/node_modules/dep/package.json"), '{"name":"dep"}\n');
    sh(res, "write_deps_stamp");
    const resume = (flag, env = {}) => { rmSync(log, { force: true }); const o = run("bash", [".xezar/checks/resume-complete.sh", ...(flag ? [flag] : [])], res, { XEZ_TASK_ID: "run-53", RESUME_LOG: log, ...env }); return { ...o, log: existsSync(log) ? readFileSync(log, "utf8") : "" }; };
    const reused = resume("--dry-run");
    expect("resume: eligible evidence with fresh dependencies is reused", reused.code === 0 && reused.out.includes("would be reused"), reused.out + reused.err);
    rmSync(join(res, "apps/web/node_modules/dep"), { recursive: true });
    write(join(res, "apps/web/node_modules/dep/package.json"), '{"name":"dep"}\n');
    const planned = resume("--dry-run");
    expect("resume: eligible evidence with stale dependencies plans a gate re-run (#53)", planned.code === 2 && planned.out.includes("the dependencies are stale or unknown") && planned.out.includes("would re-run"), planned.out + planned.err);
    const reran = resume("");
    expect("resume: eligible evidence with stale dependencies re-runs the gates and seals (#53)", reran.code === 0 && reran.log.includes("gates --producer gates") && reran.log.includes("preflight --record-gate-evidence"), reran.out + reran.err + reran.log);
    sh(res, "write_deps_stamp");
    const unknown = resume("--dry-run", { XEZ_DEPS_DIGEST_TIMEOUT_MS: "0" });
    expect("resume: a freshness check that cannot finish re-runs the gates, never reuses (#53)", unknown.code === 2 && unknown.out.includes("would re-run"), unknown.out + unknown.err);
  }

  // #53 on a single npm root (owner decision, 3.1.0): the stamp inside node_modules carries the same
  // tree digest, so a package changed after install is stale there too, and a stamp an older kit
  // wrote (the fingerprint alone) reads as not fresh, never as fresh.
  {
    const r = repo({
      config: { validation: { commands: ["npm ci", "npm test"] } },
      files: { "package.json": '{"name":"one"}\n', "package-lock.json": '{"lockfileVersion":3}\n' },
    });
    const nm = join(r, "node_modules");
    write(join(nm, "left-pad/package.json"), '{"name":"left-pad"}\n');
    write(join(nm, "left-pad/index.js"), "module.exports = 1;\n");
    const fresh = () => sh(r, "deps_are_fresh").code;
    const restamp = () => sh(r, "write_deps_stamp").code === 0 && fresh() === 0;
    expect("single root digest: installed and stamped is fresh", restamp());
    const stampFile = join(nm, ".xezar-deps-stamp");
    const lines = readFileSync(stampFile, "utf8").split("\n");
    expect("single root digest: the stamp is the fingerprint, then contents=<digest>", lines.length === 3 && /^[0-9a-f]{64}$/.test(lines[0]) && /^contents=[0-9a-f]{64}$/.test(lines[1]) && lines[2] === "", JSON.stringify(lines));
    rmSync(join(nm, "left-pad"), { recursive: true });
    write(join(nm, "left-pad/package.json"), '{"name":"left-pad"}\n');
    write(join(nm, "left-pad/index.js"), "module.exports = 1;\n");
    expect("single root stale: one package folder replaced inside node_modules (#53)", fresh() !== 0);
    expect("single root digest: re-stamped, fresh again", restamp());
    write(join(nm, "left-pad/index.js"), "module.exports = 2;\n");
    expect("single root stale: a file edited in place, same size (#53)", fresh() !== 0);
    expect("single root digest: re-stamped after the edit", restamp());
    write(join(nm, ".vite/deps/chunk.js"), "x\n");
    expect("single root digest: a build cache the gates write does not make the next run stale", fresh() === 0);
    writeFileSync(stampFile, `${lines[0]}\n`);
    expect("single root: a stamp an older kit wrote (fingerprint only) is not fresh, so the task reinstalls", fresh() !== 0);
    expect("single root digest: a new stamp after the reinstall is fresh", restamp());
    const slow = sh(r, "write_deps_stamp", { XEZ_DEPS_DIGEST_TIMEOUT_MS: "0" });
    expect("single root digest: a stamp written when the digest timed out says so", slow.code === 0 && slow.err.includes("stamped as not fresh") && readFileSync(stampFile, "utf8").endsWith("contents=unavailable\n"), JSON.stringify(slow));
    expect("single root refused: a stamp with no digest is never fresh, even once the digest is fast again", fresh() !== 0);
    expect("single root digest: a normal stamp afterwards is fresh", restamp());
  }

  // The guard suite breaks the #53 properties one at a time and needs only the block above.
  if (process.env.XEZ_DEPS_TEST_ONLY === "53") throw ONLY_53_DONE;

  // 1. A single npm root: no units, and every output is what it always was.
  {
    const r = repo({
      config: { validation: { commands: ["npm ci", "npm test"] } },
      files: { "package.json": '{"name":"one","packageManager":"npm@10.9.0"}\n', "package-lock.json": '{"lockfileVersion":3}\n', ".nvmrc": "22\n" },
    });
    const mode = deps(r, "mode");
    expect("a single npm root is single mode, silently", mode.code === 0 && mode.out === "single\n" && mode.err === "", JSON.stringify(mode));
    expect("a single npm root is never pinned to a Node, even with a numeric .nvmrc", deps(r, "node-pin").out === "");
    // The old fingerprint, computed independently: `shasum -a 256` lines, then the three facts.
    const line = (f) => `${sha(readFileSync(join(r, f)))}  ${f}\n`;
    const want = sha(`${line("package-lock.json")}${line("package.json")}packageManager=npm@10.9.0\nnpm=10.9.0\nnode=${process.version}\n`);
    const fp = sh(r, "deps_fingerprint");
    expect("single root: deps_fingerprint is the old formula, byte for byte", fp.out === `${want}\n`, `got ${JSON.stringify(fp)} want ${want}`);
    // The stamp's first line is still that fingerprint, byte for byte. Since 3.1.0 a second line
    // follows, `contents=<digest>`: the #53 tree digest of node_modules, extended to the single
    // root by owner decision. Here node_modules holds only the stamp, which the digest leaves out,
    // so the digest is that of an empty tree: sha256 of nothing.
    const stamped = sh(r, "write_deps_stamp && deps_are_fresh && cat node_modules/.xezar-deps-stamp");
    expect("single root: the stamp is still node_modules/.xezar-deps-stamp, the old fingerprint then the tree digest, and makes the tree fresh", stamped.code === 0 && stamped.out === `${want}\ncontents=${sha("")}\n`, JSON.stringify(stamped));
    expect("single root: no unit stamp folder is created", !existsSync(join(r, ".local/xezar/cache/deps")));
    write(join(r, "package.json"), '{"name":"one","workspaces":["packages/*"]}\n');
    write(join(r, "packages/a/package.json"), '{"name":"a"}\n');
    const res = sh(r, "deps_resolve_in_task");
    expect("single root: the workspace check prints its old message", res.code === 1 && res.err.includes("DEPENDENCIES RESOLVE OUTSIDE THIS TASK (#286)") && res.err.includes(`Reinstall in this checkout (npm ci in ${r})`), JSON.stringify(res));
    const profile = sh(r, "env_profile");
    expect("single root: env_profile records exactly the old keys", JSON.stringify(Object.keys(JSON.parse(profile.out))) === '["platform","arch","node","npm","git","bash"]', profile.out);
    clearCalls();
    const restore = run("bash", [join(r, RESTORE)], r);
    expect("single root: deps-restore.sh runs npm ci at the root", restore.code === 0 && JSON.stringify(calls().map((c) => [c.tool, c.argv, c.cwd])) === JSON.stringify([["npm", ["ci"], r]]), JSON.stringify(calls()));
  }

  // 2-3. Units: one install set across setup, gates and config; an excluded folder never runs.
  const u = repo({ config: unitsConfig(), files: unitFiles });
  {
    const listed = JSON.parse(deps(u, "units").out).map((x) => x.dir);
    expect("units: the loader lists exactly the configured units, in order", JSON.stringify(listed) === JSON.stringify(UNITS.map((x) => x.dir)), JSON.stringify(listed));
    clearCalls();
    const restore = run("bash", [join(u, RESTORE)], u);
    const got = calls();
    expect("units: deps-restore.sh installs every unit and nothing else", restore.code === 0 && JSON.stringify(got.map((c) => c.cwd)) === JSON.stringify(UNITS.map((x) => join(u, x.dir))), `${restore.err}\n${JSON.stringify(got)}`);
    expect("units: the excluded folder is never installed", !got.some((c) => c.cwd.endsWith("apps/excluded")));
    const yarnCalls = got.filter((c) => c.tool === "yarn");
    expect("units: Yarn 1 runs with --frozen-lockfile --non-interactive and HUSKY=0", yarnCalls.length === 2 && yarnCalls.every((c) => JSON.stringify(c.argv) === '["install","--frozen-lockfile","--non-interactive"]' && c.husky === "0"), JSON.stringify(yarnCalls));
    expect("units: npm runs npm ci", JSON.stringify(got.filter((c) => c.tool === "npm").map((c) => c.argv)) === '[["ci"]]');
    expect("units: dotnet restores the entry, without --locked-mode when no project has packages.lock.json", JSON.stringify(got.filter((c) => c.tool === "dotnet").map((c) => c.argv)) === '[["restore","Svc.sln"]]');
    const setup = readFileSync(join(KIT, "checks/worktree-setup.sh"), "utf8");
    expect("units: worktree-setup.sh installs through deps-restore.sh, the gates' first command", /DEPS_UNITS" -eq 0 \]; then\n\s+"\$SCRIPT_DIR\/deps-restore\.sh"/.test(setup));
    const gates = run("bash", [join(u, ".xezar/checks/repo-gates.sh")], u, { XEZ_GATE_LEASE: "1" });
    expect("units: the gates refuse a first gate that is not deps-restore.sh", gates.code === 1 && gates.err.includes('the first gate must be .xezar/checks/deps-restore.sh, and it is "npm ci"'), gates.err);
    const drift = repo({ config: unitsConfig(UNITS, "npm ci"), files: unitFiles });
    const refused = deps(drift, "mode");
    // Adoption order: units merge first while the old install gate still runs, then the scripts
    // and the first gate switch. The units must be accepted in between.
    expect("units: units are accepted while validation.commands[0] still names the old install", refused.code === 0, refused.err);
  }

  // Freshness, then about ten ways it goes stale.
  {
    const fresh = () => sh(u, "deps_are_fresh").code;
    const stamp = sh(u, "deps_resolve_in_task && write_deps_stamp && deps_are_fresh");
    expect("units: installed, resolved and stamped is fresh", stamp.code === 0, stamp.err);
    const stale = (name, mutate, restore, env) => {
      mutate();
      const code = env ? sh(u, "deps_are_fresh", env).code : fresh();
      expect(`stale: ${name}`, code !== 0, "still fresh after the change");
      restore?.();
      expect(`stale: ${name} (and fresh again once undone)`, fresh() === 0, "did not recover");
    };
    const edit = (f, text) => { const before = readFileSync(join(u, f), "utf8"); return [() => write(join(u, f), before + text), () => write(join(u, f), before)]; };
    const add = (f) => [() => write(join(u, f), "x\n"), () => rmSync(join(u, f))];
    stale("a unit's yarn.lock changed", ...edit("apps/web/yarn.lock", "# edit\n"));
    stale("a unit's package.json changed", ...edit("apps/tool/package.json", " "));
    stale("a .yarnrc appeared in a unit", ...add("apps/widget/.yarnrc"));
    stale("a root .npmrc appeared", ...add(".npmrc"));
    stale("a patch appeared", ...add("apps/web/patches/p.patch"));
    stale("a .csproj changed", ...edit("svc/Api/Api.csproj", "<!-- edit -->\n"));
    stale("a Directory.Build.props appeared", ...add("svc/Directory.Build.props"));
    stale("a packages.lock.json appeared", ...add("svc/Api/packages.lock.json"));
    stale("the Yarn version changed", () => {}, null, { STUB_YARN_VERSION: "1.22.19" });
    stale("the .NET SDK version changed", () => {}, null, { STUB_DOTNET_VERSION: "9.0.100" });
    // Undone by a new stamp: a file written again is a different entry to the tree digest (#53).
    stale("Yarn did not finish (.yarn-integrity gone)", () => rmSync(join(u, "apps/web/node_modules/.yarn-integrity")), () => { write(join(u, "apps/web/node_modules/.yarn-integrity"), ""); sh(u, "write_deps_stamp"); });
    const stampDir = join(u, ".local/xezar/cache/deps");
    const stamps = readdirSync(stampDir);
    expect("units: one stamp per unit", stamps.length === UNITS.length, stamps.join(", "));
    const one = join(stampDir, stamps[0]);
    const saved = readFileSync(one, "utf8");
    stale("a stamp copied from another checkout", () => write(one, saved.replace(/task=.*/, "task=/elsewhere/apps/web")), () => write(one, saved));
    stale("a stamp that is a symlink", () => { rmSync(one); symlinkSync(join(lab, "home"), one); }, () => { rmSync(one); write(one, saved); });
    stale("a declared package is missing", () => write(join(u, "apps/web/package.json"), '{"name":"web","devDependencies":{"vitest":"1"}}\n'), () => write(join(u, "apps/web/package.json"), '{"name":"web"}\n'));
    stale("node_modules borrowed through a symlink", () => { rmSync(join(u, "apps/web/node_modules"), { recursive: true }); symlinkSync(join(u, "apps/widget/node_modules"), join(u, "apps/web/node_modules")); }, () => { rmSync(join(u, "apps/web/node_modules")); write(join(u, "apps/web/node_modules/.yarn-integrity"), ""); sh(u, "write_deps_stamp"); });
    stale("a package linked outside the task", () => symlinkSync(lab, join(u, "apps/web/node_modules/borrowed")), () => rmSync(join(u, "apps/web/node_modules/borrowed")));
    const assets = join(u, "svc/Api/obj/project.assets.json");
    const assetsText = readFileSync(assets, "utf8");
    stale("restored .NET assets name another checkout's project", () => write(assets, '{"project":{"restore":{"projectPath":"/elsewhere/Api.csproj"}}}'), () => write(assets, assetsText));
    stale("the solution's contents changed (#46)", ...edit("svc/Svc.sln", "Global\nEndGlobal\n"));
    // dotnet writes an absolute path; a relative one that happens to name this project from the
    // process's cwd is still refused.
    write(assets, '{"project":{"restore":{"projectPath":"svc/Api/Api.csproj"}}}');
    const relAssets = deps(u, "resolve");
    expect("refused: a relative projectPath in project.assets.json, even one that names this project from the cwd", relAssets.code === 1 && relAssets.err.includes("was restored for svc/Api/Api.csproj"), relAssets.err);
    write(assets, assetsText);
    write(join(u, "apps/web/package.json"), '{"name":"web","devDependencies":{"vitest":"1"},"optionalDependencies":{"fsevents":"2"}}\n');
    const undeclared = deps(u, "resolve");
    expect("units: a declared package missing from the unit's own node_modules is named, an optional one is not", undeclared.code === 1 && undeclared.err.includes("vitest is not installed here") && !undeclared.err.includes("fsevents"), undeclared.err);
    write(join(u, "apps/web/package.json"), '{"name":"web"}\n');
    // A cycle inside the task holds nothing foreign: it must pass, and must terminate.
    mkdirSync(join(u, "apps/web/node_modules/cyc-a"));
    mkdirSync(join(u, "apps/web/node_modules/cyc-b"));
    symlinkSync(join(u, "apps/web/node_modules/cyc-b"), join(u, "apps/web/node_modules/cyc-a/node_modules"));
    symlinkSync(join(u, "apps/web/node_modules/cyc-a"), join(u, "apps/web/node_modules/cyc-b/node_modules"));
    expect("units: a link cycle inside the task terminates and passes", deps(u, "resolve").code === 0);
    rmSync(join(u, "apps/web/node_modules/cyc-a"), { recursive: true });
    rmSync(join(u, "apps/web/node_modules/cyc-b"), { recursive: true });
    // Links that stay inside the task but hold a link out: each shape is followed and refused.
    const nmw = join(u, "apps/web/node_modules");
    const stash = join(u, "stash");
    const linkShape = (name, build, undo) => {
      mkdirSync(stash, { recursive: true });
      build();
      const res = deps(u, "resolve");
      expect(`refused: ${name}`, res.code === 1 && res.err.includes("outside this task"), res.err || "resolved clean");
      undo();
      rmSync(stash, { recursive: true, force: true });
      expect(`refused: ${name} (and resolves again once undone)`, deps(u, "resolve").code === 0);
    };
    linkShape("node_modules/.bin links to a folder in the task that holds a link outside",
      () => { symlinkSync(lab, join(stash, "tool")); symlinkSync(stash, join(nmw, ".bin")); }, () => rmSync(join(nmw, ".bin")));
    linkShape("a scope folder links to a folder in the task whose package links outside",
      () => { symlinkSync(lab, join(stash, "pkg")); symlinkSync(stash, join(nmw, "@scope")); }, () => rmSync(join(nmw, "@scope")));
    linkShape("a package links to a folder in the task whose nested node_modules links outside",
      () => { mkdirSync(join(stash, "pkg")); symlinkSync(lab, join(stash, "pkg/node_modules")); symlinkSync(join(stash, "pkg"), join(nmw, "linked-pkg")); }, () => rmSync(join(nmw, "linked-pkg")));
    linkShape("a real package's nested node_modules links to a folder in the task that holds a link outside",
      () => { mkdirSync(join(nmw, "real-pkg")); symlinkSync(lab, join(stash, "out")); symlinkSync(stash, join(nmw, "real-pkg/node_modules")); }, () => rmSync(join(nmw, "real-pkg"), { recursive: true }));
    // #46: the stamp lives outside node_modules, so it must be bound to the tree it was written
    // for. A twin task with equal inputs, installed and stamped; its tree copied over ours.
    const twin = repo({ config: unitsConfig(), files: unitFiles });
    run("bash", [join(twin, RESTORE)], twin);
    expect("tree swap: the twin task is installed and fresh", sh(twin, "deps_resolve_in_task && write_deps_stamp && deps_are_fresh").code === 0);
    rmSync(nmw, { recursive: true });
    execFileSync("cp", ["-R", join(twin, "apps/web/node_modules"), nmw]);
    expect("tree swap: the copied tree passes the link check, so only the receipt can refuse it", deps(u, "resolve").code === 0);
    expect("stale: a unit's node_modules replaced with another task's copy is not fresh (#46)", fresh() !== 0);
    rmSync(nmw, { recursive: true });
    execFileSync("cp", ["-Rp", join(twin, "apps/web/node_modules"), nmw]);
    expect("stale: the copy is not fresh even with its timestamps kept (cp -p)", fresh() !== 0);
    const gates = readFileSync(join(KIT, "checks/repo-gates.sh"), "utf8");
    expect("tree swap: the fast gate installs whenever deps_are_fresh refuses", gates.includes('if [ "$FAST" -eq 1 ] && ! deps_are_fresh; then'));
    clearCalls();
    const again = run("bash", ["-c", `bash ${RESTORE} && . .xezar/checks/lib/common.sh && resolve_task_paths && write_deps_stamp && deps_are_fresh`], u);
    expect("tree swap: reinstalling and stamping makes the task fresh again", again.code === 0 && calls().some((c) => c.tool === "yarn" && c.cwd === join(u, "apps/web")), again.err);
    // The no-unit failure: a unit whose folder is gone is a failure, never a skip.
    execFileSync("mv", [join(u, "apps/tool"), join(lab, "tool-away")]);
    const gone = deps(u, "resolve");
    expect("stale: a unit whose folder is gone fails resolve (no-unit failure)", gone.code === 1 && gone.err.includes("apps/tool: the folder does not exist, so this unit cannot be installed or resolved"), JSON.stringify(gone));
    expect("stale: a unit whose folder is gone is not fresh", fresh() !== 0);
    execFileSync("mv", [join(lab, "tool-away"), join(u, "apps/tool")]);
    rmSync(join(u, "apps/web/package.json"));
    const noManifest = deps(u, "resolve");
    expect("stale: a unit with no package.json fails resolve", noManifest.code === 1 && noManifest.err.includes("apps/web: there is no package.json"), noManifest.err);
    write(join(u, "apps/web/package.json"), '{"name":"web"}\n');
    expect("units: fresh again after every stale case was undone", fresh() === 0);
    const profile = JSON.parse(sh(u, "env_profile").out);
    expect("units: the gate record gains the yarn and dotnet versions", profile.yarn === "1.22.22" && profile.dotnet === "8.0.100", JSON.stringify(profile));

    // The stamp location passes the tidiness check.
    for (const d of ["runtime", "tasks", "worktrees", "scratch", "qa"]) mkdirSync(join(u, ".local/xezar", d), { recursive: true });
    const tidy = run("bash", [join(u, ".xezar/checks/local-tree.sh")], u, { PATH: `${bin}:/usr/bin:/bin:${dirname(process.execPath)}` });
    expect("units: the stamps under .local/xezar/cache/deps pass local-tree.sh", tidy.code === 0, tidy.out + tidy.err);
  }

  // 5. Units come from the base branch: a working-tree edit is ignored.
  {
    const r = repo({ config: unitsConfig(), files: unitFiles });
    const wt = unitsConfig([...UNITS, { dir: "apps/excluded", provider: "yarn" }]);
    write(join(r, ".xezar/pipeline/config.json"), JSON.stringify(wt));
    clearCalls();
    run("bash", [join(r, RESTORE)], r);
    expect("units read from the base branch: a unit added in the working tree is not installed", calls().length === UNITS.length && !calls().some((c) => c.cwd.endsWith("apps/excluded")), JSON.stringify(calls().map((c) => c.cwd)));
    write(join(r, ".xezar/pipeline/config.json"), '{"validation":{"commands":["npm ci"]}}\n');
    expect("units read from the base branch: removing the units in the working tree changes nothing", deps(r, "mode").out === "units\n");
    const none = repo({ config: { validation: { commands: ["npm ci"] } }, files: unitFiles });
    write(join(none, ".xezar/pipeline/config.json"), JSON.stringify(unitsConfig()));
    expect("units read from the base branch: units added only in the working tree do not switch units mode on", deps(none, "mode").out === "single\n");
    git(none, "remote", "set-head", "origin", "--delete");
    const blind = deps(none, "mode");
    expect("units read from the base branch: with no readable base, working-tree units are refused, not used", blind.code === 2 && blind.err.includes("read from the base branch only"), blind.err);
    write(join(r, ".xezar/pipeline/config.json"), JSON.stringify(unitsConfig()));
    write(join(r, ".xezar/config.json"), '{"baseBranch":"feature"}\n');
    const other = deps(r, "mode");
    expect("units read from the base branch: a checkout naming another base is refused", other.code === 2 && other.err.includes("refused, not believed"), other.err);
  }

  // 4. Symlinked folders and bad shapes are refused.
  {
    const linked = repo({ config: unitsConfig([{ dir: "apps/link", provider: "yarn" }]), files: unitFiles, extra: (d) => symlinkSync("web", join(d, "apps/link")) });
    const r1 = deps(linked, "mode");
    expect("a symlinked unit folder is refused", r1.code === 2 && r1.err.includes("symlink refused: apps/link"), r1.err);
    const parent = repo({ config: unitsConfig([{ dir: "lnk/web", provider: "yarn" }]), files: unitFiles, extra: (d) => symlinkSync("apps", join(d, "lnk")) });
    const r2 = deps(parent, "mode");
    expect("a unit under a symlinked parent is refused", r2.code === 2 && r2.err.includes("symlink refused: lnk/web"), r2.err);
    for (const [name, units, fragment] of [
      ["an empty list", [], "must be a non-empty list"],
      ["a provider outside the kit's install map", [{ dir: "apps/web", provider: "pnpm" }], 'provider "pnpm" is not one this kit installs'],
      ["a folder that climbs out", [{ dir: "../x", provider: "yarn" }], "must be a plain relative folder"],
      ["an entry that is a path", [{ dir: "svc", provider: "dotnet", entry: "../Svc.sln" }], "must be a plain .sln or .slnx file name"],
      ["a wrong lockfile", [{ dir: "apps/web", provider: "yarn", lockfile: "package-lock.json" }], "is not a yarn lockfile"],
      ["an unknown key", [{ dir: "apps/web", provider: "yarn", lockFile: "yarn.lock" }], 'unknown key "lockFile"'],
    ]) {
      const bad = repo({ config: unitsConfig(units), files: unitFiles });
      const res = deps(bad, "mode");
      expect(`refused: ${name}`, res.code === 2 && res.err.includes(fragment), res.err);
    }
  }

  // Yarn 2 or later is refused by name, before anything is installed.
  for (const [name, files, env] of [
    ["packageManager yarn@3", { "apps/web/package.json": '{"name":"web","packageManager":"yarn@3.6.0"}\n' }, {}],
    ["a .yarnrc.yml", { "apps/web/.yarnrc.yml": "nodeLinker: node-modules\n" }, {}],
    ["yarn --version 4.1.0", {}, { STUB_YARN_VERSION: "4.1.0" }],
  ]) {
    const r = repo({ config: unitsConfig([{ dir: "apps/web", provider: "yarn" }]), files: { ...unitFiles, ...files } });
    clearCalls();
    const res = run("bash", [join(r, RESTORE)], r, env);
    expect(`Yarn 2+ refused: ${name}`, res.code !== 0 && res.err.includes("Yarn 1 only") && calls().length === 0, `${res.err} ${JSON.stringify(calls())}`);
  }
  {
    const r = repo({ config: unitsConfig([{ dir: "apps/web", provider: "yarn" }]), files: unitFiles });
    const res = run("bash", [join(r, RESTORE)], r, { STUB_FAIL: "1" });
    expect("a failing install fails deps-restore.sh and names the unit", res.code === 1 && res.err.includes("failed in apps/web"), res.err);
  }

  // .slnx and --locked-mode.
  {
    const r = repo({
      config: unitsConfig([{ dir: "svc", provider: "dotnet", entry: "Svc.slnx" }]),
      files: { "svc/Svc.slnx": "<Solution/>\n", "svc/Api/Api.csproj": "<Project/>\n", "svc/Api/packages.lock.json": "{}\n" },
    });
    clearCalls();
    const res = run("bash", [join(r, RESTORE)], r);
    expect("dotnet: a .slnx entry is restored, with --locked-mode when packages.lock.json exists", res.code === 0 && JSON.stringify(calls().map((c) => c.argv)) === '[["restore","Svc.slnx","--locked-mode"]]', `${res.err} ${JSON.stringify(calls())}`);
  }

  // A solution may build a project outside the unit folder: it is fingerprinted and must be
  // this task's own restore too (#46). One outside the repository is refused.
  {
    const sln = (paths) => `Microsoft Visual Studio Solution File, Format Version 12.00\r\n${paths.map((p, i) => `Project("{FAE04EC0-301F-11D3-BF4B-00C04F79EFBC}") = "P${i}", "${p}", "{0000000${i}-0000-0000-0000-000000000000}"\r\nEndProject\r\n`).join("")}Global\r\nEndGlobal\r\n`;
    const r = repo({
      config: unitsConfig([{ dir: "svc", provider: "dotnet", entry: "Svc.sln" }]),
      files: { "svc/Svc.sln": sln(["Api\\Api.csproj", "..\\shared\\Lib\\Lib.csproj"]), "svc/Api/Api.csproj": "<Project/>\n", "shared/Lib/Lib.csproj": "<Project/>\n" },
    });
    run("bash", [join(r, RESTORE)], r);
    const unrestored = deps(r, "resolve");
    expect("dotnet: a project the solution lists outside the unit must be restored too", unrestored.code === 1 && unrestored.err.includes("shared/Lib/Lib.csproj: not restored"), unrestored.err);
    write(join(r, "shared/Lib/obj/project.assets.json"), JSON.stringify({ project: { restore: { projectPath: join(r, "shared/Lib/Lib.csproj") } } }));
    expect("dotnet: once restored, it resolves", deps(r, "resolve").code === 0);
    const f = sh(r, "write_deps_stamp && deps_are_fresh");
    expect("dotnet: stamped with the outside project, fresh", f.code === 0, f.err);
    write(join(r, "shared/Lib/Lib.csproj"), "<Project><!-- edit --></Project>\n");
    expect("stale: a project the solution lists outside the unit changed (#46)", sh(r, "deps_are_fresh").code !== 0);
    write(join(r, "svc/Svc.sln"), sln(["Api\\Api.csproj", "..\\..\\far\\Far.csproj"]));
    const far = deps(r, "resolve");
    expect("refused: a solution that lists a project outside the task", far.code === 1 && far.err.includes("outside this task"), far.err);
  }

  // Node: a numeric .nvmrc pins, an alias is a note, and the newest version wins numerically.
  {
    const major = Number(process.versions.node.split(".")[0]);
    const nvm = join(lab, "nvm");
    const fake = (v) => { write(join(nvm, "versions/node", v, "bin/node"), `#!/bin/sh\nexec "${process.execPath}" "$@"\n`); chmodSync(join(nvm, "versions/node", v, "bin/node"), 0o755); };
    fake(`v${major + 1}.9.0`);
    fake(`v${major + 1}.10.0`);
    fake(`v${major + 2}.1.0`);
    const pinned = repo({ config: unitsConfig([{ dir: "apps/web", provider: "yarn" }]), files: { ...unitFiles, ".nvmrc": `v${major + 1}.3.0\n` } });
    const pin = deps(pinned, "node-pin", { NVM_DIR: nvm });
    const want = join(nvm, "versions/node", `v${major + 1}.10.0`, "bin");
    expect("node pin: the numerically newest v<major>.* is chosen (10 beats 9)", pin.out === `${want}\n`, JSON.stringify(pin));
    const onPath = sh(pinned, "command -v node", { NVM_DIR: nvm });
    expect("node pin: lib/common.sh puts it first on PATH", onPath.out === `${join(want, "node")}\n`, JSON.stringify(onPath));
    const missing = deps(pinned, "tools");
    expect("node pin: with the pinned major not installed, setup names the Node found and the major wanted", missing.code === 1 && missing.err.includes(`node ${process.version} is on PATH, but this repository pins Node ${major + 1}`), missing.err);
    const same = repo({ config: unitsConfig([{ dir: "apps/web", provider: "yarn" }]), files: { ...unitFiles, ".nvmrc": `${major}\n` } });
    expect("node pin: the running major needs no change", deps(same, "node-pin", { NVM_DIR: nvm }).out === "" && deps(same, "tools").code === 0);
    const alias = repo({ config: unitsConfig([{ dir: "apps/web", provider: "yarn" }]), files: { ...unitFiles, ".nvmrc": "lts/*\n" } });
    const note = deps(alias, "tools");
    expect("node pin: an alias is a note, not a failure", note.code === 0 && note.out.includes('.nvmrc holds "lts/*", which is not a version number') && note.out.includes("(Yarn 1)"), JSON.stringify(note));
  }

  // The permitted skip is named by the caller, never by the record.
  {
    const gr = join(KIT, "checks/lib/gate-results.mjs");
    const complete = (commands, installGate) => {
      const d = join(lab, `attempt-${++seq}`);
      write(join(d, "attempt.json"), JSON.stringify({ required: commands.map((c) => c.name), commands: commands.map((c) => ({ logOk: true, ...c })), loggingOk: true }));
      return run("node", [gr, "complete", "--dir", d, "--install-gate", installGate, "--json", "{}"], lab).out.trim();
    };
    const skip = (name) => ({ name, status: "skipped", skipReason: "deps-verified-current" });
    const pass = (name) => ({ name, status: "passed" });
    expect("skip: the install gate the caller names may be skipped as verified current", complete([skip(".xezar/checks/deps-restore.sh"), pass("test")], ".xezar/checks/deps-restore.sh") === "passed");
    expect("skip: any other gate skipped the same way fails, whatever the record says", complete([pass(".xezar/checks/deps-restore.sh"), skip("test")], ".xezar/checks/deps-restore.sh") === "failed");
    expect("skip: the legacy npm ci skip still seals old records", complete([skip("npm ci"), pass("test")], ".xezar/checks/deps-restore.sh") === "passed");
  }

  // Opt-in: the real tools.
  if (process.env.XEZ_DEPS_REAL === "1") {
    const realEnv = { PATH: process.env.PATH, HOME: process.env.HOME, NVM_DIR: process.env.NVM_DIR ?? "" };
    const yarnV = spawnSync("yarn", ["--version"], { encoding: "utf8" });
    if (yarnV.status === 0 && /^1\./.test(yarnV.stdout)) {
      const r = repo({ config: unitsConfig([{ dir: "apps/web", provider: "yarn" }]), files: { "apps/web/package.json": '{"name":"web","version":"1.0.0","private":true}\n', "apps/web/yarn.lock": "# THIS IS AN AUTOGENERATED FILE. DO NOT EDIT THIS FILE DIRECTLY.\n# yarn lockfile v1\n\n\n" } });
      const res = run("bash", ["-c", `bash ${RESTORE} && . .xezar/checks/lib/common.sh && resolve_task_paths && deps_resolve_in_task && write_deps_stamp && deps_are_fresh`], r, realEnv);
      expect("real yarn: install, resolve, stamp and fresh", res.code === 0, res.out + res.err);
    } else console.log("SKIP  real yarn: Yarn 1 is not installed here");
    const dotnet = spawnSync("dotnet", ["--version"], { encoding: "utf8" });
    if (dotnet.status === 0) {
      const r = repo({
        config: unitsConfig([{ dir: "svc", provider: "dotnet", entry: "Svc.sln" }]),
        // Written by hand: `dotnet new sln` makes a .slnx from SDK 10 on, and the entry names a .sln.
        files: {
          "svc/Api/Api.csproj": '<Project Sdk="Microsoft.NET.Sdk"><PropertyGroup><TargetFramework>netstandard2.0</TargetFramework></PropertyGroup></Project>\n',
          "svc/Svc.sln": "Microsoft Visual Studio Solution File, Format Version 12.00\nGlobal\nEndGlobal\n",
        },
      });
      execFileSync("dotnet", ["sln", join(r, "svc/Svc.sln"), "add", join(r, "svc/Api/Api.csproj")], { stdio: "ignore" });
      git(r, "add", "-A"); git(r, "commit", "--quiet", "-m", "sln"); git(r, "push", "--quiet", "origin", "HEAD:main"); git(r, "fetch", "--quiet", "origin");
      const res = run("bash", ["-c", `bash ${RESTORE} && . .xezar/checks/lib/common.sh && resolve_task_paths && deps_resolve_in_task && write_deps_stamp && deps_are_fresh`], r, realEnv);
      expect("real dotnet: restore, resolve, stamp and fresh", res.code === 0, res.out + res.err);
    } else console.log("SKIP  real dotnet: the .NET SDK is not installed here");
  }
} catch (e) {
  if (e !== ONLY_53_DONE) throw e;
} finally {
  rmSync(lab, { recursive: true, force: true });
}

if (failures) {
  console.error(`\ndeps units: ${failures} of ${asserts} assertions failed`);
  process.exit(1);
}
if (process.env.XEZ_DEPS_TEST_ONLY === "53") console.log(`Dependency units OK (#53 cases only, ${asserts} assertions).`);
else console.log(`Dependency units OK (${asserts} assertions: single root with its tree digest, units from the base branch, Yarn 1 and dotnet flags, stale cases, refusals).`);
