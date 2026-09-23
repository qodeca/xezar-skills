#!/usr/bin/env node
// Binds the gate list to every place that claims to state it.
//
// The problem. "Run the validation gate" is written down in four places:
//   `.xezar/pipeline/config.json` -> validation.commands   (what the skills run)
//   `.github/workflows/lint.yml`  -> the `run:` lines      (what CI runs)
//   `SDLC.md`                     -> the gate list         (what the process says)
//   `package.json`                -> the test:*/check:* scripts (what a contributor runs)
// Nothing kept them equal, and they had already drifted: SDLC.md listed eight commands
// when the config listed ten. A process document that under-states the gate is worse
// than no document -- a reader who runs its list believes they ran the gate.
//
// What is checked here:
//   1. SDLC.md's gate list equals validation.commands, in the same order.
//   2. Every package.json `test:*` / `check:*` script is reachable from the gate --
//      either it IS a gate command, or a gate command invokes it (transitively).
//      `test-discovery-contracts.mjs` is reachable this way: scripts/lint.sh runs it.
//   3. Anything deliberately outside the gate is in the opt-out table below, with a
//      written reason. An opt-out that names a script that no longer exists fails too,
//      so the table cannot rot into a blanket exemption.
//
// config vs lint.yml is deliberately NOT re-checked here: test-browser-providers.mjs
// already deep-equals those two in order. One assertion, one place.
//
// Run: node scripts/check-gate-list.mjs

import { readFileSync, existsSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(join(root, p), "utf8");

// Scripts that must never enter the gate. The entries live in scripts/allowlists.json
// with their reason, owner and expiry date, so this file cannot grow a quiet exemption
// of its own and every exception ages out on a date somebody has to renew.
const OPT_OUT = Object.fromEntries(
  Object.entries(
    JSON.parse(read("scripts/allowlists.json")).gateOptOut?.entries ?? {},
  ).map(([name, entry]) => [name, entry.why]),
);

const problems = [];
const pkg = JSON.parse(read("package.json"));
const config = JSON.parse(read(".xezar/pipeline/config.json"));
const commands = config.validation?.commands ?? [];

// --- 1: SDLC.md states the same gate, in the same order ----------------------
const sdlc = read("SDLC.md");
const listed = [...sdlc.matchAll(/^- `([^`]+)`$/gm)]
  .map((m) => m[1])
  .filter((c) => /^(bash|node|npm) /.test(c));

if (listed.length !== commands.length || listed.some((c, i) => c !== commands[i])) {
  problems.push(
    "SDLC.md's validation gate list does not match .xezar/pipeline/config.json " +
    "validation.commands, in order.\n" +
    `  SDLC.md: ${JSON.stringify(listed, null, 2)}\n` +
    `  config:  ${JSON.stringify(commands, null, 2)}`,
  );
}

// --- 2: every test:*/check:* script is reachable from the gate ---------------
// Follow what the gate commands actually execute, one hop at a time, so a script a
// gate script calls counts as covered.
const reached = new Set();
const queue = [];

function enqueueFromCommand(command) {
  // `npm run x` -> resolve through package.json; `node|bash path` -> the path itself.
  const npm = /^npm run ([A-Za-z0-9:_-]+)/.exec(command);
  if (npm) {
    reached.add(npm[1]);
    const target = pkg.scripts?.[npm[1]];
    if (target) enqueueFromCommand(target);
    return;
  }
  const file = /(?:^|\s)((?:scripts|\.\/scripts)\/[A-Za-z0-9._-]+)/.exec(command);
  if (file) queue.push(file[1].replace(/^\.\//, ""));
}

for (const command of commands) enqueueFromCommand(command);

const seenFiles = new Set();
while (queue.length) {
  const file = queue.shift();
  // A path such as `scripts/fixtures/…` names a folder of data, not something the gate executes.
  if (seenFiles.has(file) || !existsSync(join(root, file)) || !statSync(join(root, file)).isFile()) continue;
  seenFiles.add(file);
  const body = read(file);
  // Anything this file executes: another script by path, or an npm script by name.
  for (const m of body.matchAll(/(?:^|[\s"'`(])((?:\.\/)?scripts\/[A-Za-z0-9._-]+)/g)) {
    queue.push(m[1].replace(/^\.\//, ""));
  }
  for (const m of body.matchAll(/npm run ([A-Za-z0-9:_-]+)/g)) {
    reached.add(m[1]);
    const target = pkg.scripts?.[m[1]];
    if (target) enqueueFromCommand(target);
  }
}

// A named script counts as reached when its own file was reached.
for (const [name, body] of Object.entries(pkg.scripts ?? {})) {
  const file = /(?:^|\s)((?:\.\/)?scripts\/[A-Za-z0-9._-]+)/.exec(body);
  if (file && seenFiles.has(file[1].replace(/^\.\//, ""))) reached.add(name);
}

for (const name of Object.keys(pkg.scripts ?? {})) {
  if (!/^(test|check):/.test(name)) continue;
  if (reached.has(name)) {
    if (OPT_OUT[name]) {
      problems.push(
        `${name} is in the gate AND in the opt-out table -- delete one. ` +
        "An opt-out for something that already runs hides why it runs.",
      );
    }
    continue;
  }
  if (OPT_OUT[name]) continue;
  problems.push(
    `package.json script "${name}" is neither in validation.commands nor invoked by ` +
    "anything in it. Add it to the gate (config.json AND .github/workflows/lint.yml, " +
    "same position), or add it to OPT_OUT in this file with the reason.",
  );
}

// --- 3: the opt-out table cannot outlive its scripts -------------------------
for (const [name, reason] of Object.entries(OPT_OUT)) {
  if (!pkg.scripts?.[name]) {
    problems.push(`OPT_OUT names "${name}", which package.json no longer defines -- remove it.`);
  }
  // The reason's shape, the owner and the expiry are checked in check-allowlists.mjs;
  // here only the "does the script still exist" half applies.
  void reason;
}

if (problems.length) {
  for (const p of problems) console.error(p + "\n");
  console.error(`gate list: ${problems.length} problem(s)`);
  process.exit(1);
}

console.log(
  `Gate list bound OK (${commands.length} commands in config, workflow and SDLC.md; ` +
  `${Object.keys(pkg.scripts ?? {}).filter((n) => /^(test|check):/.test(n)).length} ` +
  `test/check scripts accounted for, ${Object.keys(OPT_OUT).length} opted out with a reason).`,
);
