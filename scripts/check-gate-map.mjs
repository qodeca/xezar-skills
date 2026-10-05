#!/usr/bin/env node
// Checks the map the quick local check (T0, `npm run gate:changed`) selects commands by,
// scripts/gate-map.json, and holds the line that the gate itself (T1: `npm run gate`, the CI
// `lint` and cross-platform jobs) never selects and is never narrowed (#123).
//
// Rules, each with its own message:
//   (a) every validation.commands entry is in `always` or in a rule;
//   (b) every command the map names is a validation.commands entry;
//   (c) every glob parses (the kit's trust-pattern grammar) and matches a file in the tree – a
//       tracked one, or one git would add (untracked, not ignored), so a new file you have not
//       committed yet counts;
//   (d) every `node scripts/<file>` command has a rule that maps scripts/<file> to it;
//   (e) T1 never selects: package.json's `gate` is run-gate.mjs; no module that run-gate.mjs or a
//       gate command's script reaches through relative imports (static, re-exports and literal
//       dynamic imports, followed transitively; read by scripts/lib/module-scan.mjs, which fails
//       closed) holds a string naming gate-map, gate-select or gate-changed – comments are free –
//       and lint.sh does not name them at all; no validation.commands entry or `run:` line of the
//       lint and cross-platform jobs names gate:changed;
//   (f) `everything` holds scripts/lint.sh and scripts/lib/**;
//   (g) T1 runs in full: no validation.commands entry, `run:` line of those jobs, or `env:` entry
//       in lint.yml holds --only, --files or a variable gate-runner.mjs's isNarrowingVariable
//       names (gateEnv drops those at run time too);
//   (h) every guard case's (file → gate) pair from `test-guards.mjs --list` is selected: a change
//       to the file selects the gate through `always`, a rule or an `everything` glob;
// then self-tests: the selection in scripts/lib/gate-select.mjs with the real map ("T0 selection:
// <case>"), the readers of rules (e) and (g) ("T1 in full: <case>") and scripts/lib/module-scan.mjs
// ("T1 scanner: <case>").
//
// Run: node scripts/check-gate-map.mjs

import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { dirname, join, posix } from "node:path";
import { fileURLToPath } from "node:url";
import { toLF } from "./lib/platform.mjs";
import { requireSymlinks, tempRoot } from "./lib/test-harness.mjs";
import { isNarrowingVariable } from "./lib/gate-runner.mjs";
import { changedFiles, FULL_LINT, isPlainFile, lintTask, matches, parseNameStatus, readMap, selectCommands, selectSafely } from "./lib/gate-select.mjs";
import { scanModule } from "./lib/module-scan.mjs";

requireSymlinks(); // a self-test makes a real link; without Developer Mode, stop and say so (never skip it)

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read =(path) => toLF(readFileSync(join(root, path), "utf8"));
const problems = [];

const commands = JSON.parse(read(".xezar/pipeline/config.json")).validation?.commands ?? [];
let map;
try {
  map = readMap(root);
} catch (error) {
  console.error(`gate map: ${error.message}`);
  process.exit(1);
}
const named = [...map.always, ...map.rules.flatMap((rule) => rule.commands)];

// --- (a), (b): the map and the gate name the same commands -------------------------------------
for (const command of commands) if (!named.includes(command)) problems.push(`"${command}" is not mapped: add it to always or to a rule`);
for (const command of new Set(named)) if (!commands.includes(command)) problems.push(`the map names "${command}", which is not a gate command`);

// --- (c): every glob is valid and matches a file in the tree --------------------------------------
const globs = [...new Set([...map.everything, ...map.rules.flatMap((rule) => rule.paths)])];
let files = [];
try {
  files = execFileSync("git", ["ls-files", "-z", "--cached", "--others", "--exclude-standard"], { cwd: root, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 }).split("\0").filter(Boolean);
} catch (error) {
  problems.push(`git could not list the files in the tree: ${error.message}`);
}
for (const glob of globs) {
  try {
    matches(glob, ""); // parses it, so a refused glob is reported even when git could not list the files
    if (files.length && !files.some((path) => matches(glob, path))) problems.push(`the map's glob ${glob} matches no tracked file, nor an untracked one`);
  } catch (error) {
    problems.push(error.message); // "the map's glob <g> is not valid: <why>"
  }
}

// --- (d): a script's own change selects its command --------------------------------------------
const mapsTo = (path, command) => map.rules.some((rule) => rule.commands.includes(command) && rule.paths.some((glob) => safeMatch(glob, path)));
function safeMatch(glob, path) {
  try {
    return matches(glob, path);
  } catch {
    return false; // an invalid glob is reported under (c)
  }
}
for (const command of commands) {
  const own = /^node (scripts\/\S+)$/.exec(command);
  if (own && !mapsTo(own[1], command)) problems.push(`a change to ${own[1]} does not select its own command`);
}

// --- (f): what changes every command selects every command -------------------------------------
for (const glob of ["scripts/lint.sh", "scripts/lib/**"]) {
  if (!map.everything.includes(glob)) problems.push(`the map's everything list must include ${glob}`);
}


// --- (e): T1 never selects – by import closure, from every gate command --------------------------
const T0_NAMES = ["gate-map", "gate-select", "gate-changed"];
const pkg = JSON.parse(read("package.json"));
const SELF = "scripts/check-gate-map.mjs"; // names the T0 files by design; it selects nothing

/** The script a gate command starts – `npm run <name>` through package.json – or null. */
function scriptOf(command, seen = new Set()) {
  const npm = /^npm run (\S+)$/.exec(command);
  if (npm) {
    const target = pkg.scripts?.[npm[1]];
    return typeof target === "string" && !seen.has(target) ? scriptOf(target, new Set([...seen, target])) : null;
  }
  return /^(?:node|bash) (scripts\/[^\s]+)(?:\s|$)/.exec(command)?.[1] ?? null;
}

if (pkg.scripts?.gate !== "node scripts/run-gate.mjs") {
  problems.push(`T1 must never select: package.json's gate script is ${JSON.stringify(pkg.scripts?.gate ?? null)}, not "node scripts/run-gate.mjs"`);
}
const starts = ["scripts/run-gate.mjs"];
for (const command of commands) {
  const script = scriptOf(command);
  if (script === null) problems.push(`T1 must never select: the gate command "${command}" starts no script this check can follow`);
  else if (script.endsWith(".sh")) {
    // A shell script is read as text, comments included.
    for (const token of T0_NAMES) if (read(script).includes(token)) problems.push(`T1 must never select: ${script} names ${token}`);
  } else if (script !== SELF && !starts.includes(script)) starts.push(script);
}
const via = new Map(starts.map((start) => [start, null])); // module → the module that imported it first
const queue = [...starts];
while (queue.length) {
  const file = queue.shift();
  const chain = [];
  for (let at = file; at; at = via.get(at)) chain.unshift(at);
  const { strings, specifiers, error } = scanModule(read(file));
  if (error) problems.push(`T1 must never select: ${chain.join(" → ")} could not be read as a module (${error}), so what it imports is unknown`);
  for (const token of T0_NAMES) {
    if (strings.some((value) => value.includes(token))) problems.push(`T1 must never select: ${chain.join(" → ")} names ${token}`);
  }
  for (const specifier of specifiers) {
    if (!/^\.\.?\//.test(specifier)) continue; // node:* and packages: not this repository's code
    const target = posix.normalize(posix.join(posix.dirname(file), specifier));
    if (via.has(target) || !existsSync(join(root, target))) continue;
    via.set(target, file);
    queue.push(target);
  }
}

// --- (e), (g): what lint.yml runs for T1 --------------------------------------------------------
const workflow = read(".github/workflows/lint.yml");
const jobs = workflow.split(/^(?=  \S)/m);
const T1_JOBS = ["lint", "cross-platform"];

/** The values of every `<key>:` entry in `text` – inline, or the more-indented block under it. */
function entries(text, key) {
  const lines = text.split("\n");
  const found = [];
  lines.forEach((line, index) => {
    const match = new RegExp(String.raw`^(\s*)(?:- )?${key}:\s*(.*)$`).exec(line);
    if (!match || line.trimStart().startsWith("#")) return;
    const indent = match[1].length;
    const block = [];
    for (let k = index + 1; k < lines.length; k += 1) {
      const more = lines[k];
      if (more.trim() === "" || more.trimStart().startsWith("#")) continue;
      if (more.length - more.trimStart().length <= indent) break;
      block.push(more.trim());
    }
    const inline = match[2].trim();
    found.push(...(inline === "" || /^[|>]/.test(inline) ? block : [inline])); // a block scalar or mapping: its lines
  });
  return found;
}

/** What in `text` narrows a run: --only, --files, or a variable gate-runner.mjs would strip. */
const narrowing = (text) => [
  ...["--only", "--files"].filter((flag) => text.includes(flag)),
  ...new Set((text.match(/[A-Za-z_][A-Za-z0-9_]*/g) ?? []).filter((word) => isNarrowingVariable(word))),
];
const T0_RUNS = ["gate:changed", "gate-changed"];
for (const name of T1_JOBS) {
  const job = jobs.find((block) => block.startsWith(`  ${name}:`));
  if (!job) {
    problems.push(`lint.yml has no ${name} job to check`);
    continue;
  }
  const runs = entries(job, "run");
  if (runs.length === 0) problems.push(`lint.yml's ${name} job has no run: line this check could read`);
  for (const line of runs) {
    for (const token of T0_RUNS) if (line.includes(token)) problems.push(`T1 must never select: the ${name} job's run: ${line} names ${token}`);
    for (const token of narrowing(line)) problems.push(`T1 must run in full: the ${name} job's run: ${line} holds ${token}`);
  }
}
for (const line of entries(workflow, "env")) {
  for (const token of narrowing(line)) problems.push(`T1 must run in full: lint.yml's env: ${line} holds ${token}`);
}
for (const command of commands) {
  for (const token of T0_RUNS) if (command.includes(token)) problems.push(`T1 must never select: validation.commands entry "${command}" names ${token}`);
  for (const token of narrowing(command)) problems.push(`T1 must run in full: validation.commands entry "${command}" holds ${token}`);
}

// --- (h): every guard case's (file → gate) pair selects that gate --------------------------------
// The guard suite's breaks are the record of what each gate reads: a change to the file a case
// breaks must select the gate that catches it. A case's gate outside the gate list counts for the
// gate commands whose script names it (lint.sh runs test-platform.mjs); a gate no gate command
// runs (the suite's own --list) is not T1's to select.
let cases = [];
try {
  cases = execFileSync(process.execPath, [join(root, "scripts/test-guards.mjs"), "--list"], { cwd: root, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 })
    .split("\n").filter(Boolean).map((line) => line.split("\t"));
} catch (error) {
  problems.push(`the guard cases could not be listed (node scripts/test-guards.mjs --list): ${String(error.stderr ?? error.message).trim().split("\n")[0]}`);
}
const selectsFor = (path, command) => map.always.includes(command) || map.everything.some((glob) => safeMatch(glob, path)) || mapsTo(path, command);
const scripts = new Map(commands.map((command) => [command, scriptOf(command)]));
for (const [index, gate, , file, name] of cases) {
  for (const part of gate.split(" && ")) {
    const started = /^(node|bash) (scripts\/\S+)/.exec(part);
    if (!started) {
      problems.push(`guard case #${index} (${name}) starts '${part}', which this check cannot place in the gate`);
      continue;
    }
    const own = `${started[1]} ${started[2]}`;
    const targets = commands.includes(own) ? [own] : commands.filter((command) => scripts.get(command) && read(scripts.get(command)).includes(started[2]));
    for (const target of targets) {
      if (!selectsFor(file, target)) problems.push(`guard case #${index} (${name}) breaks ${file} for ${target}, but a change to ${file} does not select it`);
    }
  }
}

// --- selection self-tests, with the real map ------------------------------------------------------
const KIT_TESTS = ["test-kit-facts", "test-kit-catalog", "test-bootstrap", "test-deps-units", "test-upgrade"].map((name) => `node scripts/${name}.mjs`);
const change = (path, status = "M") => ({ status, path });
const select = (changes) => selectCommands(changes, map, commands);
const everything = (result) => result.everything && result.commands.length === commands.length;
const always = commands.filter((command) => map.always.includes(command));
const full = (changes, exists = () => true) => lintTask(changes, exists) === FULL_LINT;
const CONTROL = /[\u0000-\u001f\u007f]/;

/** A throwaway git repository with one commit and origin/develop at it; `act(dir, git)` runs in it, then it is removed. */
function withRepo(act) {
  const dir = mkdtempSync(join(tempRoot(), "check-gate-map-"));
  const git = (...args) => execFileSync("git", ["-c", "user.name=check-gate-map", "-c", "user.email=check-gate-map@invalid", "-c", "commit.gpgsign=false", ...args], { cwd: dir, stdio: "ignore" });
  try {
    git("init", "-q");
    writeFileSync(join(dir, "old.md"), "old\n");
    git("add", "old.md");
    git("commit", "-q", "-m", "base");
    git("update-ref", "refs/remotes/origin/develop", "HEAD");
    return act(dir, git);
  } finally {
    rmSync(dir, { recursive: true, force: true, maxRetries: 3 });
  }
}

const SELF_TESTS = [
  ["a docs-only change selects no kit test", () => {
    const result = select([change("docs/x.md")]);
    return !result.everything && !KIT_TESTS.some((command) => result.commands.includes(command));
  }],
  ["a kit file selects catalog, facts and upgrade", () => {
    const result = select([change("skills/xez-onboard-opinionated/kit/checks/route.mjs")]);
    return !result.everything && ["node scripts/test-kit-catalog.mjs", "node scripts/test-kit-facts.mjs", "node scripts/test-upgrade.mjs"].every((command) => result.commands.includes(command));
  }],
  ["scripts/lint.sh selects everything", () => everything(select([change("scripts/lint.sh")]))],
  ["a shared library selects everything", () => everything(select([change("scripts/lib/platform.mjs")]))],
  ["an unmapped path selects everything", () => everything(select([change("docs/x.md"), change("foo/unmapped.txt")]))],
  ["no change set selects everything", () => everything(select(null))],
  ["a path with a control character selects everything", () => everything(select([change("docs/x\n.md")]))],
  ["a printed reason never holds a control character", () => {
    const reasons = [
      ...select([change("docs/a\n::warning::b.md")]).reasons,
      ...select([change("foo/\u001b[2Jx")]).reasons,
      ...selectCommands(null, map, commands, "git said\n::error::x").reasons,
    ];
    return reasons.length === 3 && reasons.every((reason) => !CONTROL.test(reason));
  }],
  ["an unusable map selects everything", () => {
    const broken = selectSafely([change("docs/x.md")], () => { throw new Error("no map"); }, commands);
    const badGlob = selectSafely([change("docs/x.md")], () => ({ ...map, rules: [{ paths: ["docs/{x}"], commands: always }] }), commands);
    return everything(broken) && everything(badGlob) && broken.reasons.join("\n").includes("the map could not be used");
  }],
  ["nothing changed selects the always list only", () => {
    const result = select([]);
    return !result.everything && result.commands.join("\n") === always.join("\n");
  }],
  ["the selection keeps the gate's order", () => {
    const result = select([change("skills/xez-approve-merge-pr/SKILL.md"), change("skills/xez-onboard-opinionated/kit/loops.json")]);
    return result.commands.join("\n") === commands.filter((command) => result.commands.includes(command)).join("\n");
  }],
  ["a deleted path still selects its commands", () => select([change("skills/xez-pipeline-retro/SKILL.md", "D")]).commands.includes("node scripts/test-classify-runs.mjs")],
  ["a deleted path makes lint full", () => full([change("docs/gone.md", "D"), change("docs/kept.md")], (path) => path === "docs/kept.md")],
  ["a rename's old path makes lint full", () => full([change("docs/old.md", "D"), change("docs/new.md", "A")], (path) => path === "docs/new.md")],
  ["lint gets each path as one argument", () => {
    const task = lintTask([change("docs/a b.md"), change("docs/x.md")], () => true);
    return Array.isArray(task?.argv) && task.argv.length === 4 && task.argv.join("\n") === ["scripts/lint.sh", "--files", "docs/a b.md", "docs/x.md"].join("\n");
  }],
  ["a path with shell metacharacters gives full lint", () => ["skills/xez-fix -exec sh x.sh ;/f.md", "a b/$(x)'.md", "docs/a#b.md", "docs/`x`.md"].every((odd) => full([change(odd), change("docs/x.md")]))],
  ["a path with a backslash or a control character gives full lint", () => ["docs\\x.md", "docs/x\n.md", "docs/x\t.md"].every((odd) => full([change(odd)]))],
  ["names past the command-line budget give full lint", () => full(Array.from({ length: 200 }, (_, index) => change(`docs/${"n".repeat(120)}${index}.md`)))],
  ["many short names still get lint on the files", () => !full(Array.from({ length: 300 }, (_, index) => change(`docs/f${index}.md`)))],
  ["a path that starts with - gives full lint", () => full([change("-x.md"), change("docs/x.md")])],
  ["no changed file left gives full lint", () => full([change("docs/x.md")], () => false)],
  ["everything selected gives full lint", () => lintTask([change("docs/x.md")], () => true, { everything: true }) === FULL_LINT],
  ["a base branch git cannot find gives no change set", () => {
    const result = changedFiles(root, "xez-no-such-base-branch");
    return result.changes === null && (result.error ?? "").includes("origin/xez-no-such-base-branch");
  }],
  ["a rename or copy record is refused", () => {
    const refused = (output) => {
      try {
        parseNameStatus(output);
        return false;
      } catch {
        return true;
      }
    };
    return refused("R100\0a.md\0b.md\0R090\0c.md\0d.md\0") && refused("C075\0a.md\0b.md\0M\0x.md\0") && refused("M\0");
  }],
  ["a delete and an add record parse as two changes", () => JSON.stringify(parseNameStatus("D\0old.md\0A\0new b.md\0")) === JSON.stringify([change("old.md", "D"), change("new b.md", "A")])],
  ["a rename reaches the change set as a delete and an add", () => withRepo((dir, git) => {
    git("mv", "old.md", "new.md");
    const changes = (changedFiles(dir, "develop").changes ?? []).map(({ status, path }) => `${status} ${path}`).sort();
    return changes.join("\n") === ["A new.md", "D old.md"].join("\n");
  })],
  ["a link is not a file lint is given", () => withRepo((dir) => {
    symlinkSync(join(dir, "old.md"), join(dir, "link.md"), "file");
    return isPlainFile(dir, "old.md") && !isPlainFile(dir, "missing.md") && !isPlainFile(dir, "link.md");
  })],
];

// What rules (e) and (g) read, on the shapes they must read.
const T1_TESTS = [
  ["lint.yml's run: and env: entries are read, inline and as blocks", () => {
    const job = "  lint:\n    steps:\n      - run: npm ci\n      - name: x\n        run: |\n          a\n          b\n        env:\n          XEZ_SECTIONS_ONLY: 1\n";
    return entries(job, "run").join("\n") === "npm ci\na\nb" && entries(job, "env").join("\n") === "XEZ_SECTIONS_ONLY: 1";
  }],
  ["a tuning variable is not a narrowing one", () => narrowing("XEZ_DEPS_DIGEST_TIMEOUT_MS=900 node scripts/test-deps-units.mjs").length === 0 && narrowing("xez_sections_only=1").length === 1],
];

// The module reader rule (e) relies on, on the shapes it must not misread.
const SCAN_TESTS = [
  ["a comment may name anything", () => scanModule("// gate-map\n/* gate-select */ const a = 1;").strings.length === 0],
  ["a string, a template's text and a regex body are read", () => {
    const { strings } = scanModule("const a = 'x\\'gate-map'; const b = `t ${ \"gate-select\" } u`; const c = /gate-changed/g;");
    return ["gate-map", "gate-select", "gate-changed"].every((token) => strings.some((value) => value.includes(token)));
  }],
  ["a division is not a regex", () => scanModule("const half = (a) / 2 / 1; const s = \"gate-map\";").strings.join() === "gate-map"],
  ["a quote inside a regex class is not a string", () => scanModule("const q = /[\"'`]/g; const s = 'gate-map';").strings.includes("gate-map")],
  ["static, re-exported and literal dynamic imports are followed", () => {
    const { specifiers } = scanModule("import a from \"./a.mjs\";\nexport { b } from './b.mjs';\nimport \"./c.mjs\";\nconst d = await import(`./d.mjs`);\nconst e = await import(name);");
    return specifiers.join() === "./a.mjs,./b.mjs,./c.mjs,./d.mjs";
  }],
  ["an unterminated string, template, regex or comment fails closed", () => ["const a = 'x\n", "const t = `x ${y", "const r = /x\n", "/* x"].every((source) => scanModule(source).error !== null)],
];

for (const [prefix, tests] of [["T0 selection", SELF_TESTS], ["T1 in full", T1_TESTS], ["T1 scanner", SCAN_TESTS]]) {
  for (const [name, test] of tests) {
    let passed;
    try {
      passed = test();
    } catch (error) {
      problems.push(`${prefix}: ${name} (it threw: ${error.message})`);
      continue;
    }
    if (!passed) problems.push(`${prefix}: ${name}`);
  }
}

// process.exitCode, never process.exit(): on Linux and macOS a pipe takes this output asynchronously,
// and exit() drops what it has not taken yet – a broken map prints about 200 problems, and the last
// ones were lost (#123).
if (problems.length) {
  for (const problem of problems) console.error(problem);
  console.error(`\ngate map: ${problems.length} problem(s)`);
  process.exitCode = 1;
} else console.log(
  `Gate map OK (${commands.length} commands mapped, ${map.rules.length} rules, ${globs.length} globs, each matching a file in the tree; ` +
  `${cases.length} guard cases select their gates; T1 reads no map and is never narrowed).`,
);
