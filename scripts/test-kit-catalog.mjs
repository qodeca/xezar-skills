#!/usr/bin/env node
// Proves the onboarding kit's catalog loads, is routed, and is counted right.
//
// Why this exists. The kit ships its own validator, `kit/checks/catalog-check.mjs`, but that
// validator only ever runs inside a project that was onboarded. Nothing in THIS repository ran
// it against the kit, so a workflow naming a skill that does not exist, or a step key the engine
// silently drops, shipped to every project and failed there. And one fault is invisible even to
// that validator: a workflow that is installed and valid and named by no routing row. The leader
// picks work by a row's trigger sentence, so such a workflow can never be selected by anything.
//
// Seven checks, each one a way the kit went wrong or could:
//
//   1. the kit's own validator passes on the kit, staged the way a project holds it;
//   2. the validator's list of maintained skills IS the set of skill files -- a name left off
//      that list is not held to the shared contract, and passes in silence;
//   3. every workflow has a routing row in kit/routing.json, and every workflow a row names
//      exists; the file passes `route.mjs --check`, the script and the schema name the same
//      keys, the file is its stored defaults copy, reading rows run reading workflows, and
//      `route` itself answers right on a staged project;
//   4. every count of rows and classes written in prose equals the table it describes;
//   5. the grammar of the guarded workflows' config keys tells a typo from an honest empty list;
//   6. a guard step sits where it is worth something: before the install it exists to save, and
//      in `deploy`, between the agent that writes the authority and the agent that dispatches;
//   7. the two guard scripts, RUN, in a throwaway repository with a remote -- a shell script
//      nothing executes is a description of a guard, and every refusal below was once only that;
//   8. the tidiness check's own list of engine names is the engine's published 0.19.0 list, and
//      it takes a name a newer engine adds from `xezar state-names --json`, RUN with a stand-in;
//   9. the documented-output check, RUN on the kit staged as a project, outside a leader session –
//      which is how every gate runs it.
//
// Run: node scripts/test-kit-catalog.mjs

import { execFileSync } from "node:child_process";
import { chmodSync, cpSync, existsSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const SKILL = "skills/xez-onboard-opinionated";
const KIT = join(root, SKILL, "kit");
const ROUTING = `${SKILL}/kit/routing.json`;

let problems = 0;
const fail = (message) => {
  problems += 1;
  console.error(`FAIL  ${message}`);
};

// --- 1. The kit's own validator, on the kit ---------------------------------------------------
// Staged as `<tmp>/.xezar/{workflows,skills,checks}` because that is the only layout the
// validator reads. The config is the smallest one it accepts.
const stage = mkdtempSync(join(tmpdir(), "kit-catalog-"));
try {
  mkdirSync(join(stage, ".xezar"));
  for (const dir of ["workflows", "skills", "checks"]) {
    cpSync(join(KIT, dir), join(stage, ".xezar", dir), { recursive: true });
  }
  writeFileSync(join(stage, ".xezar/config.json"), '{"baseBranch":"main"}\n');
  // The kit's own Claude settings too: they must not widen a reading step's shell.
  cpSync(join(KIT, "claude"), join(stage, ".claude"), { recursive: true });
  try {
    execFileSync("node", [join(KIT, "checks/catalog-check.mjs"), stage], { encoding: "utf8", stdio: "pipe" });
  } catch (error) {
    fail(`the kit's catalog-check refuses the kit:\n${(error.stdout ?? "") + (error.stderr ?? "")}`);
  }
} finally {
  rmSync(stage, { recursive: true, force: true });
}

// --- 2. Maintained skills: the list is the directory --------------------------------------------
const checker = readFileSync(join(KIT, "checks/catalog-check.mjs"), "utf8");
const listed = /const MAINTAINED_SKILLS = new Set\(\[([\s\S]*?)\]\);/.exec(checker);
const skillFiles = readdirSync(join(KIT, "skills"))
  .filter((name) => /^xezar-.*\.md$/.test(name))
  .map((name) => name.replace(/\.md$/, ""))
  .sort();
if (!listed) {
  fail("catalog-check.mjs no longer declares MAINTAINED_SKILLS as a Set literal this test can read");
} else {
  const names = [...listed[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]).sort();
  for (const name of skillFiles) {
    if (!names.includes(name)) fail(`kit/skills/${name}.md is not in MAINTAINED_SKILLS, so its shared contract is never checked`);
  }
  for (const name of names) {
    if (!skillFiles.includes(name)) fail(`MAINTAINED_SKILLS names "${name}", and kit/skills/ has no such file`);
  }
}

// --- 3. Workflows and routing rows name each other ---------------------------------------------
// The rows live in `kit/routing.json`. A row may name more than one workflow file.
const routing = JSON.parse(readFileSync(join(KIT, "routing.json"), "utf8"));
const rows = routing.rows.map((row) => ({ id: row.id, workflows: row.workflows, cls: row.class }));
const workflowFiles = readdirSync(join(KIT, "workflows")).filter((name) => name.endsWith(".yaml")).sort();
const routed = new Set(rows.flatMap((row) => row.workflows));

if (rows.length === 0) fail(`${ROUTING} has no rows`);
for (const name of workflowFiles) {
  if (!routed.has(name)) fail(`kit/workflows/${name} is named by no routing row -- installed, valid, and unreachable`);
}
for (const name of routed) {
  if (!workflowFiles.includes(name)) fail(`${ROUTING} routes to ${name}, and kit/workflows/ has no such file`);
}

// --- 3b. The routing file passes its own check, and agrees with the schema and the catalog -------
{
  const ROUTE = join(KIT, "checks/route.mjs");
  const { KNOWN, readingRow } = await import(pathToFileURL(ROUTE).href);
  try {
    execFileSync("node", [ROUTE, "--check", join(KIT, "routing.json")], { encoding: "utf8", stdio: "pipe" });
  } catch (error) {
    fail(`route --check refuses ${ROUTING}:\n${(error.stdout ?? "") + (error.stderr ?? "")}`);
  }

  // The script's key lists and the schema's properties are the same lists.
  const schema = JSON.parse(readFileSync(join(KIT, "routing.schema.json"), "utf8"));
  const d = schema.$defs;
  const pairs = {
    top: schema.properties, defaults: schema.properties.defaults.properties, leader: schema.properties.leader.properties,
    tool: d.tool.properties, lane: d.lane.properties, reserved: schema.properties.reservedLanes.additionalProperties.properties,
    globalBan: schema.properties.globalBans.items.properties, noMatch: schema.properties.noMatch.properties,
    lookAlike: schema.properties.lookAlikes.items.properties, row: d.row.properties, match: d.match.properties,
    secondOpinion: d.row.properties.secondOpinion.properties,
  };
  for (const [name, props] of Object.entries(pairs)) {
    const a = [...KNOWN[name]].sort().join(",");
    const b = Object.keys(props ?? {}).sort().join(",");
    if (a !== b) fail(`route.mjs KNOWN.${name} is [${a}] and routing.schema.json says [${b}] -- the script and the schema must name the same keys`);
  }

  // The shipped file is the stored copy of its defaults version: the upgrade diff's base.
  const stored = `${SKILL}/references/routing-defaults/${routing.defaults.version}.json`;
  if (!existsSync(join(root, stored))) fail(`${ROUTING} says defaults version ${routing.defaults.version}, and ${stored} does not exist`);
  else if (readFileSync(join(root, stored), "utf8") !== readFileSync(join(KIT, "routing.json"), "utf8")) {
    fail(`${ROUTING} differs from ${stored}: changing the shipped defaults raises defaults.version and stores the new copy`);
  }

  // A reading row runs a reading workflow, and a runs-code row a workflow that runs code: the
  // tool-limits ban is only as good as the row telling the truth about its step.
  const lists = readFileSync(join(KIT, "checks/catalog-check.mjs"), "utf8");
  const setOf = (name) => {
    const m = new RegExp(`const ${name} = new Set\\(\\[([\\s\\S]*?)\\]\\);`).exec(lists);
    return new Set(m ? [...m[1].matchAll(/"([^"]+)"/g)].map((x) => `${x[1]}.yaml`) : []);
  };
  const reading = setOf("READ_ONLY_WORKFLOWS");
  const runsCode = setOf("RUNS_CODE_WORKFLOWS");
  if (!reading.size || !runsCode.size) fail("catalog-check.mjs no longer declares READ_ONLY_WORKFLOWS and RUNS_CODE_WORKFLOWS as Set literals this test can read");
  for (const row of routing.rows) {
    for (const wf of row.workflows) {
      if (reading.has(wf) && !readingRow(row)) fail(`${ROUTING}: row ${row.id} runs the reading workflow ${wf}, so it is writes: false with no runsCode`);
      if (runsCode.has(wf) && row.runsCode !== true) fail(`${ROUTING}: row ${row.id} runs ${wf}, which builds and runs code, so it says runsCode: true`);
    }
  }

  // --rows is the classification view: it must carry no lane and no login.
  const lab = mkdtempSync(join(tmpdir(), "kit-route-"));
  try {
    const out = execFileSync("node", [ROUTE, "--file", join(KIT, "routing.json"), "--rows"], { cwd: lab, encoding: "utf8", stdio: "pipe" });
    for (const lane of Object.keys(routing.lanes)) if (out.includes(lane)) fail(`route --rows leaks lane data: "${lane}"`);
  } catch (error) {
    fail(`route --rows failed:\n${error.stderr ?? ""}`);
  }
  // A staged single-project workspace: two logins, one program missing.
  try {
    const project = join(lab, "project");
    mkdirSync(join(project, ".xezar"), { recursive: true });
    execFileSync("git", ["-c", "init.defaultBranch=main", "init", "--quiet", project], { stdio: "pipe" });
    writeFileSync(join(project, ".xezar/workspace.json"), "{}\n");
    const copy = structuredClone(routing);
    copy.tools.claude.rotation = ["acct-one", "acct-two"];
    copy.tools.codex.rotation = ["acct-three"];
    writeFileSync(join(project, ".xezar/routing.json"), JSON.stringify(copy));
    writeFileSync(join(project, ".xezar/agent-accounts.json"), JSON.stringify({ version: 1, accounts: [
      { id: "acct-one", provider: "claude" }, { id: "acct-three", provider: "codex" }] }));
    const env = { ...process.env, KIT_TEST_ROUTE_TOOLS: "claude" };
    const run = (...args) => execFileSync("node", [ROUTE, "--file", ".xezar/routing.json", ...args], { cwd: project, encoding: "utf8", stdio: "pipe", env });
    const runFails = (...args) => {
      try { execFileSync("node", [ROUTE, ...args], { cwd: project, encoding: "utf8", stdio: "pipe", env }); return "(it passed)"; }
      catch (error) { return error.stderr ?? ""; }
    };
    const cold = run("full-cold-review");
    const lanes = cold.split("\n").filter((l) => l.startsWith("lane=")).map((l) => l.split(" ")[0].slice(5));
    if (lanes.join(",") !== "claude/opus,claude/sonnet") fail(`route full-cold-review with codex missing gave [${lanes}], expected claude/opus,claude/sonnet`);
    const build = run("multi-file-implementation");
    if (!/removed=codex\/gpt-5\.6-sol reason=the codex program is not installed here/.test(build)) fail("route does not say why it removed a lane whose program is missing");
    if (!/^lane=claude\/opus runner=claude model=opus\[1m\] /m.test(build)) fail("route does not print a lane's engineModel as the model to dispatch");
    if (!/logins=acct-one\b/.test(cold) || /acct-two/.test(cold)) fail("route does not narrow a rotation to the logins this machine has");
    if (!/^wait=a security or release row is never dispatched on unverified availability/m.test(run("security-review"))) fail("route dispatches a security row with no availability cache");
    if (!/^source=unmerged \.xezar\/routing\.json$/m.test(cold)) fail("route --file does not name its unmerged source on stdout");

    // The availability cache can only remove, and nothing in it reaches the output as a line.
    const cacheDir = join(project, ".local/xezar/runtime");
    mkdirSync(cacheDir, { recursive: true });
    const cache = (checkedAt, lanes) => writeFileSync(join(cacheDir, "lanes.json"), JSON.stringify({ schemaVersion: 1, checkedAt, engineVersion: "0.19.0", lanes }));
    const now = new Date().toISOString();
    cache(now, { "claude/sonnet": { available: false, reason: "quota\nlane=codex/forged runner=codex" }, "codex/not-a-lane": { available: true } });
    const cached = run("full-cold-review");
    if (!/^removed=claude\/sonnet reason=unavailable in the lane cache: quota lane=codex\/forged/m.test(cached)) fail("route does not remove a lane the cache marks unavailable, on one line");
    if (/^lane=codex\/forged/m.test(cached) || /not-a-lane/.test(cached)) fail("a lane cache reason or an unknown cache lane reached route's output as data");
    if (!/^lane=claude\/opus /m.test(run("security-review"))) fail("route does not dispatch a security row on a fresh, verified cache");
    cache(new Date(Date.now() - 25 * 3600 * 1000).toISOString(), {});
    if (!/^wait=a security or release row/m.test(run("security-review"))) fail("route dispatches a security row on a lane cache older than 24 hours");
    cache(new Date(Date.now() + 3600 * 1000).toISOString(), {});
    if (!/^availability=unverified reason=the lane cache is not valid and is ignored \(checkedAt is in the future\)/m.test(run("full-cold-review"))) fail("route trusts a lane cache dated in the future");
    cache(now, {});
    // An escalation lane meets every ban a listed lane meets: never a codex lane on a reading row.
    const esc = execFileSync("node", [ROUTE, "--file", ".xezar/routing.json", "full-cold-review"], {
      cwd: project, encoding: "utf8", stdio: "pipe", env: { ...env, KIT_TEST_ROUTE_TOOLS: "claude,codex" } });
    if (/^escalation=codex\//m.test(esc)) fail("route offers a codex escalation lane on a reading row, where tool limits ban it");
    if (!/^escalation=claude\/fable .* by=hand$/m.test(esc)) fail("route no longer offers the reserved claude/fable lane for escalation by hand");
    if (!/"constructor" is not a row/.test(runFails("--file", ".xezar/routing.json", "constructor"))) fail("route answers a row id that only Object.prototype has");

    const rowsOut = run("--rows");
    for (const lane of Object.keys(copy.lanes)) if (rowsOut.includes(lane)) fail(`route --rows leaks lane data: "${lane}"`);
    if (/acct-/.test(rowsOut)) fail("route --rows leaks a login");
    // Without --file, routing is read from the remote default branch and from nowhere else.
    const g = (...a) => execFileSync("git", ["-C", project, ...a], { stdio: "pipe" });
    if (!/refs\/remotes\/origin\/HEAD is not set/.test(runFails("full-cold-review"))) fail("route reads routing without an origin/HEAD instead of refusing");
    execFileSync("git", ["-c", "init.defaultBranch=main", "init", "--quiet", "--bare", join(lab, "origin.git")], { stdio: "pipe" });
    g("add", ".xezar/routing.json");
    g("-c", "user.name=kit", "-c", "user.email=kit@example.invalid", "commit", "--quiet", "-m", "routing");
    g("remote", "add", "origin", join(lab, "origin.git"));
    g("push", "--quiet", "origin", "main");
    g("remote", "set-head", "origin", "main");
    const fromBase = execFileSync("node", [ROUTE, "full-cold-review"], { cwd: project, encoding: "utf8", stdio: "pipe", env });
    if (!/^source=origin\/main:\.xezar\/routing\.json$/m.test(fromBase)) fail("route does not read routing from origin/main and say so");
    writeFileSync(join(project, ".xezar/config.json"), '{"baseBranch":"feature"}\n');
    if (!/a checkout that names another base is refused/.test(runFails("full-cold-review"))) fail("route believes a checkout that names another base branch");
    rmSync(join(project, ".xezar/config.json"));

    // --check reads the working tree: a broken file there fails, whatever the base branch holds.
    copy.rows[0].lanes = ["claude/no-such-model"];
    writeFileSync(join(project, ".xezar/routing.json"), JSON.stringify(copy));
    try {
      execFileSync("node", [ROUTE, "--check"], { cwd: project, encoding: "utf8", stdio: "pipe" });
      fail("route --check passed a broken working-tree file");
    } catch (error) {
      if (!/\[ref\] rows\.[a-z-]+\.lanes\[0\]: "claude\/no-such-model" is not a lane/.test(error.stderr ?? "")) {
        fail(`route --check refused a broken file for the wrong reason:\n${error.stderr ?? error.message}`);
      }
    }
  } catch (error) {
    fail(`the staged route fixture could not run: ${error.message}\n${error.stderr ?? ""}`);
  } finally {
    rmSync(lab, { recursive: true, force: true });
  }
}

// --- 4. Counts written in prose ------------------------------------------------------------------
// A number standing directly before "rows" or "classes" in these files is a claim about the
// table, and it has to be the table's number. Spelled or in digits; a placeholder is not a claim.
// For rows a number under five is not one either -- "when two rows are equally specific" talks
// about two rows, not about the table. A class count is always a claim: nobody writes about
// "three classes" of a table that has eight and means something else.
const classes = [...new Set(rows.map((row) => row.cls))];
const UNITS = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten",
  "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen"];
const TENS = { twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90 };
const toNumber = (text) => {
  const word = text.toLowerCase();
  if (/^\d+$/.test(word)) return Number(word);
  if (UNITS.includes(word)) return UNITS.indexOf(word);
  const [tens, unit] = word.split("-");
  if (!(tens in TENS)) return null;
  return TENS[tens] + (unit ? UNITS.indexOf(unit) : 0);
};
const NUMBER = `(\\d+|(?:${Object.keys(TENS).join("|")})(?:-[a-z]+)?|${UNITS.join("|")})`;
const COUNT_SITES = [
  `${SKILL}/references/routing-interview.md`,
  `${SKILL}/references/interview.md`,
  `${SKILL}/references/report-templates.md`,
  `${SKILL}/SKILL.md`,
  `docs/skills/xez-onboard-opinionated.md`,
];
const EXPECTED = { rows: rows.length, classes: classes.length };
for (const site of COUNT_SITES) {
  const lines = readFileSync(join(root, site), "utf8").split("\n");
  lines.forEach((line, index) => {
    for (const match of line.matchAll(new RegExp(`\\b${NUMBER} (?:routing |task )?(rows|classes)\\b`, "gi"))) {
      const found = toNumber(match[1]);
      const unit = match[2].toLowerCase();
      const claim = found !== null && (unit === "classes" || found >= 5);
      if (claim && found !== EXPECTED[unit]) {
        fail(`${site}:${index + 1} says "${match[0]}", and the routing table has ${EXPECTED[unit]} ${unit}`);
      }
    }
  });
}

// --- 5. The config grammar keeps its four answers apart --------------------------------------------
// A guarded workflow refuses on an empty list, so "empty" is load-bearing. The failure this pins
// is the quiet one: a misspelt key, or a value of the wrong shape, reading as "none configured".
const { judge, GRAMMAR } = await import(pathToFileURL(join(KIT, "checks/lib/config-grammar.mjs")).href);
const CASES = [
  ["ok", "deploy.environments", { deploy: { environments: ["staging=deploy.yml"] } }],
  ["empty", "deploy.environments", { deploy: { environments: [] } }],
  ["absent", "deploy.environments", {}],
  ["malformed", "deploy.environments", { deploy: { enviroments: ["staging=deploy.yml"] } }],
  ["malformed", "deploy.environments", { deploy: { environments: ["prod=../other/deploy.yml"] } }],
  ["malformed", "deploy.environments", { deploy: { environments: ["prod=deploy.yml; rm -rf ."] } }],
  ["malformed", "deploy.rollback", { deploy: { rollback: "rollback.yml" } }],
  ["ok", "performance.budgets", { performance: { budgets: ["cold-start-ms=p95<400@n=20"] } }],
  ["malformed", "performance.budgets", { performance: { budgets: ["cold-start-ms=400"] } }],
  ["malformed", "performance.budgets", { performance: { budgets: ["cold-start-ms=p95<400@n=1"] } }],
  ["ok", "localisation.locales", { localisation: { locales: ["pl", "pt-BR"] } }],
  ["malformed", "localisation.locales", { localisation: { locales: ["../etc"] } }],
  // An unknown neighbour is a typo only while the key itself is missing. Beside a key that IS
  // set it is a later release's key, and refusing on it would break every installed grammar.
  ["ok", "deploy.environments", { deploy: { environments: ["staging=deploy.yml"], strategy: "blue-green" } }],
  ["malformed", "deploy.environments", { deploy: { strategy: "blue-green" } }],
  ["malformed", "localisation.locales", { localisation: { locales: ["pl", "pl"] } }],
  ["malformed", "deploy.environments", { deploy: { environments: ["staging=deploy.yml", "staging=other.yml"] } }],
  ["ok", "deploy.rollback", { deploy: { environments: ["staging=deploy.yml"], rollback: ["staging=rollback.yml"] } }],
  ["malformed", "deploy.rollback", { deploy: { environments: ["staging=deploy.yml"], rollback: ["production=rollback.yml"] } }],
];
for (const [expected, key, config] of CASES) {
  const got = judge(config, key).status;
  if (got !== expected) fail(`config grammar: ${key} on ${JSON.stringify(config)} is "${got}", expected "${expected}"`);
}
// Every key a guarded workflow names must be one the grammar knows.
for (const name of workflowFiles) {
  const text = readFileSync(join(KIT, "workflows", name), "utf8");
  for (const match of text.matchAll(/config-guard\.sh ([a-zA-Z.]+)/g)) {
    if (!GRAMMAR[match[1]]) fail(`kit/workflows/${name} guards on "${match[1]}", and the grammar has no such key`);
  }
}

// --- 6. A guard step sits where it is worth something ------------------------------------------
// `catalog-check.mjs` orders the six named phases and lets any other check step sit anywhere, so
// a guard moved below `setup` still loads. It would then refuse after the install it exists to
// save. And in `deploy` the order IS the safety: the permit check between the two agents.
const stepsOf = (text) =>
  text.split(/^  - id: /m).slice(1).map((block) => ({
    id: block.split("\n")[0].trim(),
    command: (/^    command: (.*)$/m.exec(block) ?? [])[1] ?? "",
    isAgent: /^    prompt: /m.test(block),
  }));
for (const name of workflowFiles) {
  const steps = stepsOf(readFileSync(join(KIT, "workflows", name), "utf8"));
  const ids = steps.map((step) => step.id);
  const setup = ids.indexOf("setup");
  steps.forEach((step, index) => {
    if (!/(config|deploy)-guard\.sh/.test(step.command)) return;
    if (setup !== -1 && index > setup) {
      fail(`kit/workflows/${name}: guard step "${step.id}" runs after \`setup\` -- it must refuse before the install is paid for`);
    }
    const firstAgent = steps.findIndex((s) => s.isAgent);
    if (/config-guard\.sh/.test(step.command) && firstAgent !== -1 && index > firstAgent) {
      fail(`kit/workflows/${name}: config guard "${step.id}" runs after an agent step -- a workflow asleep in this project must refuse before any agent is paid for`);
    }
  });
}
{
  const steps = stepsOf(readFileSync(join(KIT, "workflows/deploy.yaml"), "utf8"));
  const at = (id) => steps.findIndex((step) => step.id === id);
  const [authorise, permit, dispatch] = [at("authorise"), at("permit"), at("dispatch")];
  if (authorise === -1 || permit === -1 || dispatch === -1) {
    fail("kit/workflows/deploy.yaml must have the steps `authorise`, `permit` and `dispatch` -- the permit check between the two agents is the deploy's safety");
  } else {
    if (!(authorise < permit && permit < dispatch)) {
      fail("kit/workflows/deploy.yaml: `permit` must come after `authorise` and before `dispatch`");
    }
    if (!/\.xezar\/checks\/deploy-guard\.sh/.test(steps[permit].command)) {
      fail("kit/workflows/deploy.yaml: step `permit` must run .xezar/checks/deploy-guard.sh as a check step");
    }
    const between = steps.slice(permit + 1, dispatch).filter((step) => step.isAgent);
    if (between.length) fail("kit/workflows/deploy.yaml: an agent step sits between `permit` and `dispatch`");
  }
  if (/onFail:/.test(readFileSync(join(KIT, "workflows/deploy.yaml"), "utf8").replace(/^#.*$/gm, ""))) {
    fail("kit/workflows/deploy.yaml declares an onFail -- a failed deploy is never dispatched twice by a machine");
  }
}

// --- 7. The guard scripts, run -------------------------------------------------------------------
// A bare remote and a clone, the way a project holds them. The scripts run from the kit with the
// clone as the working directory; the run id comes from XEZ_TASK_ID, as it does for an agent step.
// Every case names the distinctive words of the refusal, not just its exit status: a guard that
// fails for another reason is not the guard working.
{
  const lab = mkdtempSync(join(tmpdir(), "kit-guards-"));
  const work = join(lab, "work");
  const TASK = "fixture-task-1";
  const evidence = join(work, ".local/xezar/tasks", TASK);
  const env = {
    ...Object.fromEntries(Object.entries(process.env).filter(([name]) => !name.startsWith("GIT_"))),
    GIT_CONFIG_GLOBAL: "/dev/null",
    GIT_CONFIG_NOSYSTEM: "1",
    XEZ_TASK_ID: TASK,
  };
  const git = (...args) => execFileSync("git", args, { cwd: work, env, encoding: "utf8", stdio: "pipe" }).trim();
  const put = (file, text) => {
    mkdirSync(dirname(join(work, file)), { recursive: true });
    writeFileSync(join(work, file), text);
  };
  const guard = (name, ...args) => {
    try {
      const out = execFileSync("bash", [join(KIT, "checks", name), ...args], { cwd: work, env, encoding: "utf8", stdio: "pipe" });
      return { code: 0, out };
    } catch (error) {
      return { code: error.status ?? -1, out: (error.stdout ?? "") + (error.stderr ?? "") };
    }
  };
  const expect = (label, got, code, words) => {
    if (got.code !== code || !got.out.includes(words)) {
      fail(`guard fixture: ${label} -- expected exit ${code} saying "${words}", got exit ${got.code}:\n${got.out.trim()}`);
    }
  };
  const dispatchable = (inputs) =>
    `name: x\non:\n  workflow_dispatch:\n${inputs ? "    inputs:\n      sha:\n        required: true\n        type: string\n" : ""}jobs:\n  x:\n    runs-on: ubuntu-latest\n    steps:\n      - run: "true"\n`;
  const baseConfig = {
    deploy: { environments: ["staging=deploy.yml", "bare=plain.yml"], rollback: ["staging=deploy.yml"] },
    performance: { budgets: [] },
    localisation: { locales: ["pl"] },
    paths: { migrations: "docs/migrations" },
  };
  try {
    execFileSync("git", ["-c", "init.defaultBranch=main", "init", "--quiet", "--bare", join(lab, "origin.git")], { env, stdio: "pipe" });
    execFileSync("git", ["-c", "init.defaultBranch=main", "init", "--quiet", work], { env, stdio: "pipe" });
    git("config", "user.name", "Kit Fixture");
    git("config", "user.email", "fixture@example.invalid");
    git("config", "commit.gpgsign", "false");
    put(".gitignore", ".local/\n");
    put(".xezar/config.json", '{"baseBranch":"main"}\n');
    put(".xezar/pipeline/config.json", `${JSON.stringify(baseConfig, null, 2)}\n`);
    put(".github/workflows/deploy.yml", dispatchable(true));
    put(".github/workflows/plain.yml", dispatchable(false));
    git("add", "-A");
    git("commit", "--quiet", "-m", "base");
    const OLD = git("rev-parse", "HEAD");
    put("docs/migrations/0001-users.md", "# users split\n\nreversibility: one-way\n");
    put("docs/migrations/0002-index.md", "# index\n\nreversibility: reversible\n");
    git("add", "-A");
    git("commit", "--quiet", "-m", "migrations");
    const TIP = git("rev-parse", "HEAD");
    git("remote", "add", "origin", join(lab, "origin.git"));
    git("push", "--quiet", "origin", "main");
    git("remote", "set-head", "origin", "main");
    git("checkout", "--quiet", "-b", "side");
    put("side.txt", "not merged\n");
    git("add", "-A");
    git("commit", "--quiet", "-m", "side");
    const SIDE = git("rev-parse", "HEAD");
    git("checkout", "--quiet", "main");

    // config-guard.sh, reading this checkout.
    const withConfig = (config, run) => {
      const file = join(work, ".xezar/pipeline/config.json");
      const before = readFileSync(file, "utf8");
      writeFileSync(file, JSON.stringify(config));
      try { return run(); } finally { writeFileSync(file, before); }
    };
    expect("a configured list passes", guard("config-guard.sh", "localisation.locales"), 0, "config-guard: ok");
    expect("an honest empty list is a refusal, and says empty", guard("config-guard.sh", "performance.budgets"), 1, "config-guard: empty");
    expect("a missing key says absent", withConfig({}, () => guard("config-guard.sh", "performance.budgets")), 1, "config-guard: absent");
    expect("a misspelt key is malformed, never empty",
      withConfig({ localisation: { locale: ["pl"] } }, () => guard("config-guard.sh", "localisation.locales")), 2, "config-guard: malformed");
    expect("a config that is not JSON is malformed", (() => {
      const file = join(work, ".xezar/pipeline/config.json");
      const before = readFileSync(file, "utf8");
      writeFileSync(file, "{ not json");
      try { return guard("config-guard.sh", "localisation.locales"); } finally { writeFileSync(file, before); }
    })(), 2, "not valid JSON");

    // config-guard.sh --from-base: the base is the REMOTE's default branch, validated.
    expect("the deploy list is read from the remote default branch", guard("config-guard.sh", "deploy.environments", "--from-base"), 0, "origin/main:.xezar/pipeline/config.json");
    expect("a worktree edit cannot change what --from-base reads",
      withConfig({ deploy: { environments: [] } }, () => guard("config-guard.sh", "deploy.environments", "--from-base")), 0, "config-guard: ok");
    git("symbolic-ref", "--delete", "refs/remotes/origin/HEAD");
    expect("an unknown remote default branch is refused", guard("config-guard.sh", "deploy.environments", "--from-base"), 2, "refs/remotes/origin/HEAD is not set");
    git("symbolic-ref", "refs/remotes/origin/HEAD", "refs/remotes/origin/-upload-pack=x");
    expect("a base branch name that would read as a git option is refused", guard("config-guard.sh", "deploy.environments", "--from-base"), 2, "not a plain branch name");
    git("remote", "set-head", "origin", "main");
    {
      const file = join(work, ".xezar/config.json");
      writeFileSync(file, '{"baseBranch":"side"}\n');
      try {
        expect("a checkout that names itself the base is refused, not believed", guard("config-guard.sh", "deploy.environments", "--from-base"), 2, "refused, not believed");
      } finally { writeFileSync(file, '{"baseBranch":"main"}\n'); }
    }

    // deploy-guard.sh: one authority record in, one permit out, at most once.
    const record = (fields) => ({ direction: "deploy", environment: "staging", sha: TIP, authorisedBy: "owner", words: "deploy it", source: "launch", ...fields });
    const permitFile = join(evidence, "deploy/permit.json");
    const attempt = (fields) => {
      rmSync(join(evidence, "deploy"), { recursive: true, force: true });
      mkdirSync(join(evidence, "deploy"), { recursive: true });
      if (fields) writeFileSync(join(evidence, "deploy/authority.json"), JSON.stringify(record(fields)));
      return guard("deploy-guard.sh");
    };
    const refused = (label, fields, words, code = 1) => {
      expect(label, attempt(fields), code, words);
      if (existsSync(permitFile)) fail(`guard fixture: ${label} -- refused, and a permit was written all the same`);
    };
    refused("no authority record", null, "no authority record");
    refused("authority from an answer, not the launch text", { source: "ask" }, "source must be");
    refused("a short SHA", { sha: TIP.slice(0, 12) }, "full 40-character commit");
    refused("an environment the list does not name", { environment: "production" }, "is not an environment");
    refused("a commit that was never merged", { sha: SIDE }, "is not on the history of origin/main");
    refused("a workflow that takes no sha input", { environment: "bare" }, "declares no `sha` input");
    refused("a rollback across a one-way migration", { direction: "rollback", sha: OLD }, "crosses a migration marked one-way: docs/migrations/0001-users.md");
    {
      mkdirSync(evidence, { recursive: true });
      writeFileSync(join(evidence, "BLOCKED"), "the launch text names no commit\n");
      try { refused("a BLOCKED file from the authorise step", {}, "wrote BLOCKED"); } finally { rmSync(join(evidence, "BLOCKED"), { force: true }); }
    }
    expect("a rollback the owner accepted by naming the page",
      attempt({ direction: "rollback", sha: OLD, acrossOneWay: ["docs/migrations/0001-users.md"] }), 0,
      `gh workflow run deploy.yml --ref main -f sha=${OLD}`);
    const good = attempt({});
    expect("a good record is permitted, with the exact command", good, 0, `gh workflow run deploy.yml --ref main -f sha=${TIP}`);
    if (existsSync(permitFile)) {
      const permit = JSON.parse(readFileSync(permitFile, "utf8"));
      const want = { direction: "deploy", environment: "staging", sha: TIP, workflow: "deploy.yml", ref: "main", refSha: TIP };
      for (const [name, value] of Object.entries(want)) {
        if (permit[name] !== value) fail(`guard fixture: the permit's ${name} is ${JSON.stringify(permit[name])}, expected ${JSON.stringify(value)}`);
      }
    } else {
      fail("guard fixture: a good record was permitted and no permit.json was written");
    }
    expect("the same authority, a second time", guard("deploy-guard.sh"), 1, "a permit already exists");
  } catch (error) {
    fail(`guard fixture could not be built or run: ${error.message}\n${(error.stdout ?? "") + (error.stderr ?? "")}`);
  } finally {
    rmSync(lab, { recursive: true, force: true });
  }
}

// --- 8. The tidiness check knows the engine's names ------------------------------------------------
// `local-tree.sh` fails a gate on any top-level name under `.local/xezar/` it does not know, so a name
// the engine writes and the kit forgot turns every project's gate red. Two halves: its own list must
// hold every name of the engine's published 0.19.0 list (the fixture is `xezar state-names --json`
// at that version, byte for byte), and a name only a newer engine prints must pass when that engine
// is on PATH -- and must still fail, as a stray file, when it is not.
{
  const tree = readFileSync(join(KIT, "checks/local-tree.sh"), "utf8");
  const words = (name) => (new RegExp(`^  ${name}="([^"]*)"$`, "m").exec(tree)?.[1] ?? "").split(/\s+/).filter(Boolean);
  const dirs = new Set([...words("ENGINE_DIRS"), ...words("ALLOWED")]);
  const allowedTree = /^ALLOWED="([^"]*)"$/m.exec(tree)?.[1].split(/\s+/) ?? [];
  for (const d of allowedTree) dirs.add(d);
  const files = new Set(words("ENGINE_FILES"));
  const published = JSON.parse(readFileSync(join(root, "scripts/fixtures/xezar-state-names-0.19.0.json"), "utf8"));
  for (const entry of published.names) {
    const known = entry.kind === "directory" ? dirs.has(entry.name) : files.has(entry.name);
    if (!known) fail(`local-tree.sh does not know the engine's ${entry.kind} "${entry.name}" (xezar state-names at 0.19.0) -- every project's gate would fail on it`);
  }

  const lab = mkdtempSync(join(tmpdir(), "kit-local-tree-"));
  try {
    const project = join(lab, "project");
    mkdirSync(join(project, ".xezar/checks"), { recursive: true });
    execFileSync("git", ["-c", "init.defaultBranch=main", "init", "--quiet", project], { stdio: "pipe" });
    cpSync(join(KIT, "checks/local-tree.sh"), join(project, ".xezar/checks/local-tree.sh"));
    writeFileSync(join(project, ".xezar/workspace.json"), "{}\n");
    for (const d of allowedTree) mkdirSync(join(project, ".local/xezar", d), { recursive: true });
    writeFileSync(join(project, ".local/xezar/future-engine-state.json"), "{}\n");
    const bin = join(lab, "bin");
    mkdirSync(bin);
    const standIn = (body) => { writeFileSync(join(bin, "xezar"), `#!/bin/sh\n${body}\n`); chmodSync(join(bin, "xezar"), 0o755); };
    const run = () => {
      try {
        return { code: 0, out: execFileSync("bash", [join(project, ".xezar/checks/local-tree.sh")], { encoding: "utf8", stdio: "pipe", env: { ...process.env, PATH: `${bin}:${process.env.PATH}` } }) };
      } catch (error) { return { code: error.status, out: (error.stdout ?? "") + (error.stderr ?? "") }; }
    };
    const newer = structuredClone(published);
    newer.names.push({ name: "future-engine-state.json", kind: "file", reason: "a name a newer engine writes", feature: null });
    writeFileSync(join(lab, "newer.json"), JSON.stringify(newer));
    standIn(`[ "$1 $2" = "state-names --json" ] && cat "${join(lab, "newer.json")}"`);
    const withEngine = run();
    if (withEngine.code !== 0) fail(`local-tree.sh refused a name the installed engine publishes:\n${withEngine.out}`);
    standIn("exit 1");
    const without = run();
    if (without.code === 0 || !without.out.includes("future-engine-state.json (file at the top level)")) fail(`local-tree.sh without the engine's list passed a name it does not know:\n${without.out}`);
    standIn(`echo '{"schemaVersion":1,"scope":"local-xezar-top-level","names":[{"name":"../x","kind":"file"},{"name":"future-engine-state.json","kind":"socket"}]}'`);
    if (run().code === 0) fail("local-tree.sh took a name from engine output that is not a plain file or folder name");
  } catch (error) {
    fail(`local-tree fixture could not be built or run: ${error.message}`);
  } finally {
    rmSync(lab, { recursive: true, force: true });
  }
}

// --- 9. The documented-output check passes on the kit, run as a gate runs it --------------------
// The leader loader is silent unless `XEZAR_LEADER=1`, and a gate never runs in the leader's session.
// Its fixture once ran the loader without the flag, so it failed in every onboarded project's gate
// and in no test here, because nothing here ran it.
{
  const lab = mkdtempSync(join(tmpdir(), "kit-documented-output-"));
  try {
    const project = join(lab, "project");
    mkdirSync(join(project, ".xezar"), { recursive: true });
    for (const dir of ["checks", "docs"]) cpSync(join(KIT, dir), join(project, ".xezar", dir), { recursive: true });
    const g = (...a) => execFileSync("git", ["-C", project, ...a], { stdio: "pipe" });
    execFileSync("git", ["-c", "init.defaultBranch=main", "init", "--quiet", project], { stdio: "pipe" });
    g("add", "-A");
    g("-c", "user.name=kit", "-c", "user.email=kit@example.invalid", "commit", "--quiet", "-m", "kit");
    const env = { ...process.env };
    delete env.XEZAR_LEADER;
    try {
      execFileSync("node", [join(project, ".xezar/checks/documented-output.mjs")], { cwd: project, encoding: "utf8", stdio: "pipe", env });
    } catch (error) {
      fail(`the kit's documented-output check fails on the kit, outside a leader session:\n${(error.stdout ?? "") + (error.stderr ?? "")}`);
    }
  } finally {
    rmSync(lab, { recursive: true, force: true });
  }
}

if (problems) {
  console.error(`\nkit catalog: ${problems} problem(s)`);
  process.exit(1);
}
console.log(
  `Kit catalog OK (${workflowFiles.length} workflows, ${skillFiles.length} skills, ` +
  `${rows.length} rows over ${classes.length} classes; every workflow routed, every count in step, both guard scripts run).`,
);
