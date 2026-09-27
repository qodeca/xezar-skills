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
// Nine checks, each one a way the kit went wrong or could:
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
import { chmodSync, cpSync, existsSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
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
  // A project's Codex exec-policy rules: "prompt" and "forbidden" pass, "allow" or no decision is refused.
  mkdirSync(join(stage, ".codex/rules"), { recursive: true });
  const codexRule = join(stage, ".codex/rules/project.rules");
  writeFileSync(codexRule, '# reading only\nprefix_rule(pattern=["git", "push"], decision="forbidden")\nprefix_rule(pattern=["npm"], decision="prompt")\n');
  try {
    execFileSync("node", [join(KIT, "checks/catalog-check.mjs"), stage], { encoding: "utf8", stdio: "pipe" });
  } catch (error) {
    fail(`catalog-check refuses Codex rules that only prompt or forbid:\n${(error.stdout ?? "") + (error.stderr ?? "")}`);
  }
  for (const [label, rule] of [["allow", 'prefix_rule(pattern=["npm", "test"], decision="allow")\n'], ["no decision", 'prefix_rule(pattern=["npm", "test"])\n']]) {
    writeFileSync(codexRule, rule);
    let out = "";
    try {
      execFileSync("node", [join(KIT, "checks/catalog-check.mjs"), stage], { encoding: "utf8", stdio: "pipe" });
    } catch (error) {
      out = (error.stdout ?? "") + (error.stderr ?? "");
    }
    if (!/runs a reading step's command outside its sandbox/.test(out)) fail(`catalog-check accepts a Codex prefix_rule with ${label}, which runs a reading step's command outside its sandbox`);
  }
} finally {
  rmSync(stage, { recursive: true, force: true });
}

// --- 1b. The reading roles' write scripts, from a pipe --------------------------------------------
// The engine's shared read-only lock (pi, Codex) allows a pipe only into an argument-free
// `bash <script>`, so a reader writes by piping ONE JSON request into the bare script. Two halves:
// every pipe the kit's docs teach has nothing after the script's name, and the JSON form works.
{
  const docs = [...readdirSync(join(KIT, "skills")).map((f) => `skills/${f}`), ...readdirSync(join(KIT, "docs")).map((f) => `docs/${f}`)]
    .filter((f) => f.endsWith(".md"));
  for (const rel of docs) {
    const text = readFileSync(join(KIT, rel), "utf8");
    for (const m of text.matchAll(/\|\s*bash \.xezar\/checks\/([a-z-]+\.sh)[ \t]+([^`\s|][^`\n]*)`/g))
      fail(`kit/${rel} teaches "| bash .xezar/checks/${m[1]} ${m[2].trim()}": the engine's lock refuses a pipe into a script with arguments; pipe one JSON request into the bare script`);
    if (/printf '%s'/.test(text)) fail(`kit/${rel} teaches printf, which no reading step's allowlist holds; build the text with jq -n`);
  }

  const lab = mkdtempSync(join(tmpdir(), "kit-writers-"));
  try {
    const repo = join(lab, "repo");
    mkdirSync(join(repo, ".xezar"), { recursive: true });
    cpSync(join(KIT, "checks"), join(repo, ".xezar/checks"), { recursive: true });
    execFileSync("git", ["-c", "init.defaultBranch=main", "init", "--quiet", repo], { stdio: "pipe" });
    execFileSync("git", ["-C", repo, "remote", "add", "origin", "https://github.com/acme/widget.git"], { stdio: "pipe" });
    const bin = join(lab, "bin");
    mkdirSync(bin);
    const log = join(lab, "gh.log");
    writeFileSync(join(bin, "gh"), `#!/usr/bin/env bash\nprintf 'ARGS %s\\n' "$*" >>"${log}"\ncase " $* " in *" --body-file - "*) { printf 'BODY '; cat; echo; } >>"${log}" ;; esac\nexit 0\n`);
    chmodSync(join(bin, "gh"), 0o755);
    const env = { ...process.env, PATH: `${bin}:${process.env.PATH}`, XEZ_HANDOFF_FILE: join(lab, "handoff"), XEZ_TASK_ID: "run-1", XEZ_STEP_ID: "review" };
    const pipe = (script, request, extra = {}) => {
      try {
        execFileSync("bash", [`.xezar/checks/${script}`], { cwd: repo, env: { ...env, ...extra }, input: JSON.stringify(request), encoding: "utf8", stdio: "pipe" });
        return 0;
      } catch (error) {
        return error.status;
      }
    };
    const read = () => (existsSync(log) ? readFileSync(log, "utf8") : "");
    if (pipe("gh-write.sh", { action: "comment", kind: "pr", number: 12, body: "## Security review\nline two" }) !== 0 ||
        !read().includes("ARGS pr comment 12 --repo acme/widget --body-file -") || !read().includes("BODY ## Security review\nline two"))
      fail(`gh-write.sh does not post a JSON comment request on this repository's origin:\n${read()}`);
    rmSync(log, { force: true });
    if (pipe("gh-write.sh", { action: "label", kind: "pr", number: 12, add: ["qa-approved"] }) !== 1 || read() !== "")
      fail("gh-write.sh lets a JSON label request add an approval label");
    if (pipe("gh-write.sh", { action: "label", kind: "issue", number: 7, add: ["risk-low"], remove: ["needs-qa"] }) !== 1)
      fail("gh-write.sh lets a JSON label request lift a blocking label");
    if (pipe("gh-write.sh", { action: "comment", kind: "pr", number: "12; rm -rf /", body: "x" }) !== 1)
      fail("gh-write.sh accepts a JSON request whose number is not a number");
    if (pipe("verdict-write.sh", { kind: "packet", packet: { verdict: "APPROVE" } }) !== 0 ||
        (existsSync(join(lab, "handoff.verdict.json")) ? readFileSync(join(lab, "handoff.verdict.json"), "utf8") : "") !== '{"verdict":"APPROVE","taskId":"run-1","stepId":"review"}\n')
      fail("verdict-write.sh does not write a JSON packet request as the verdict packet, stamped with the step's taskId and stepId");
    rmSync(join(lab, "handoff.verdict.json"), { force: true });
    if (pipe("verdict-write.sh", { kind: "packet", packet: { verdict: "APPROVE" } }, { XEZ_STEP_ID: "" }) !== 1 || existsSync(join(lab, "handoff.verdict.json")))
      fail("verdict-write.sh writes a packet with XEZ_STEP_ID unset, which the engine would refuse");
    if (pipe("verdict-write.sh", { kind: "packet", packet: { verdict: "APPROVE", taskId: "run-2" } }) !== 1 || existsSync(join(lab, "handoff.verdict.json")))
      fail("verdict-write.sh overwrites or accepts a packet that names another task instead of refusing it");
    if (pipe("verdict-write.sh", { kind: "packet", packet: "not an object" }) !== 1)
      fail("verdict-write.sh accepts a packet request whose packet is not an object");
  } finally {
    rmSync(lab, { recursive: true, force: true });
  }
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
  const { KNOWN, readingRow, check } = await import(pathToFileURL(ROUTE).href);
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
  // The engine's built-in login `default` exists for every tool and is in no account file. The
  // leader's login is refused only in the leader's own tool; another tool may rotate on `default`.
  {
    const own = structuredClone(routing);
    own.tools.codex.rotation = ["default"];
    const ownErrors = check(own).errors;
    if (ownErrors.length) fail(`route check refuses codex rotation ["default"] with a claude leader:\n${ownErrors.join("\n")}`);
    own.tools.claude.rotation = ["default"];
    if (!check(own).errors.some((e) => e.includes("tools.claude.rotation"))) fail("route check lets the leader's own login into the leader's tool rotation");
    const bare = join(lab, "bare");
    mkdirSync(join(bare, ".xezar"), { recursive: true });
    writeFileSync(join(bare, ".xezar/workspace.json"), "{}\n");
    own.tools.claude.rotation = [];
    writeFileSync(join(bare, ".xezar/routing.json"), JSON.stringify(own));
    try {
      const out = execFileSync("node", [ROUTE, "--file", ".xezar/routing.json", "multi-file-implementation"], {
        cwd: bare, encoding: "utf8", stdio: "pipe", env: { ...process.env, KIT_TEST_ROUTE_TOOLS: "claude,codex" } });
      if (!/^lane=codex\/\S+ runner=codex .* logins=default$/m.test(out)) fail(`route drops the built-in default login when no account file exists:\n${out}`);
      const seat = structuredClone(own);
      seat.leader.login = "leader-seat";
      seat.tools.claude.rotation = ["default"];
      writeFileSync(join(bare, ".xezar/routing-seat.json"), JSON.stringify(seat));
      const seatOut = execFileSync("node", [ROUTE, "--file", ".xezar/routing-seat.json", "multi-file-implementation"], {
        cwd: bare, encoding: "utf8", stdio: "pipe", env: { ...process.env, KIT_TEST_ROUTE_TOOLS: "claude,codex" } });
      if (/^lane=claude\/\S+ .*logins=default$/m.test(seatOut)) fail("route counts the leader's tool's built-in default as a task login");
    } catch (error) {
      fail(`route refused a codex rotation of ["default"] with no account file:\n${error.stderr ?? error.message}`);
    }
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
    if (!/removed=codex\/gpt-6-sol reason=the codex program is not installed here/.test(build)) fail("route does not say why it removed a lane whose program is missing");
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
    // An escalation lane meets every ban a listed lane meets: never a lane without tool limits on a reading row.
    const noLimits = structuredClone(copy);
    noLimits.lanes["codex/gpt-6-astra"].enforcesToolLimits = false;
    noLimits.rows.find((row) => row.id === "security-review").lanes = ["claude/opus"];
    noLimits.reservedLanes["codex/gpt-6-astra"].rows = noLimits.reservedLanes["codex/gpt-6-astra"].rows.filter((id) => id !== "security-review");
    writeFileSync(join(project, ".xezar/routing-no-limits.json"), JSON.stringify(noLimits));
    const esc = execFileSync("node", [ROUTE, "--file", ".xezar/routing-no-limits.json", "full-cold-review"], {
      cwd: project, encoding: "utf8", stdio: "pipe", env: { ...env, KIT_TEST_ROUTE_TOOLS: "claude,codex" } });
    if (/^escalation=codex\//m.test(esc)) fail("route offers an escalation lane without tool limits on a reading row, where tool limits ban it");
    const escWrite = execFileSync("node", [ROUTE, "--file", ".xezar/routing.json", "analysis-specs-research"], {
      cwd: project, encoding: "utf8", stdio: "pipe", env: { ...env, KIT_TEST_ROUTE_TOOLS: "claude,codex" } });
    if (!/^escalation=codex\/gpt-6-astra .* by=hand$/m.test(escWrite)) fail("route no longer offers the reserved codex/gpt-6-astra lane for escalation by hand on a writing row");
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

// --- 3c. The kit's node scripts run when reached through a link, or a path with a space ----------
// A script that asks "am I the main module" by comparing an unresolved path does nothing at all,
// and exits 0, when `.xezar/checks` is a link -- which reads as a pass.
{
  const lab = mkdtempSync(join(tmpdir(), "kit-main-"));
  try {
    const real = join(lab, "with space", "checks");
    mkdirSync(join(lab, "with space"), { recursive: true });
    cpSync(join(KIT, "checks"), real, { recursive: true });
    symlinkSync(real, join(lab, "link"), "dir");
    mkdirSync(join(lab, "empty"));
    for (const base of [join(lab, "link"), real]) {
      const node = (script, args, input) => {
        try {
          return { code: 0, out: execFileSync("node", [join(base, script), ...args], { cwd: lab, input: input ?? "", encoding: "utf8", stdio: "pipe" }) };
        } catch (error) {
          return { code: error.status, out: (error.stdout ?? "") + (error.stderr ?? "") };
        }
      };
      const cases = [
        ["route.mjs", ["--check", join(KIT, "routing.json")], undefined, (r) => r.code === 0 && /route: ok –/.test(r.out)],
        ["lib/project-policy.mjs", [], '{"labels":[]}', (r) => r.code === 0 && r.out.includes('{"passed":true}')],
        ["changelog-fragments.mjs", ["--check", join(lab, "empty")], undefined, (r) => r.code === 0 && /changelog-fragments: OK/.test(r.out)],
        ["lib/security-scan.mjs", [], undefined, (r) => r.code !== 0 && /--cwd is required/.test(r.out)],
      ];
      for (const [script, args, input, ok] of cases) {
        const r = node(script, args, input);
        if (!ok(r)) fail(`kit/checks/${script} run through ${base === real ? "a path with a space" : "a link"} did not run (exit ${r.code}): ${r.out.trim() || "(no output)"}`);
      }
    }
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

    // config-guard.sh browser: the chrome-devtools entry never changes against the base branch.
    expect("a base with no browser entry yet is the setup PR, left to the security-review row", guard("config-guard.sh", "browser", "--from-base"), 0, "config-guard: ok — browser");
    const mcp = readFileSync(join(KIT, "mcp.json"), "utf8");
    const codex = readFileSync(join(KIT, "codex/config.toml"), "utf8");
    put(".mcp.json", mcp);
    put(".codex/config.toml", codex);
    git("add", "-A");
    git("commit", "--quiet", "-m", "browser");
    git("push", "--quiet", "origin", "main");
    expect("the base branch's own browser entry passes", guard("config-guard.sh", "browser", "--from-base"), 0, "config-guard: ok — browser");
    const browserChange = (file, text, label) => {
      put(file, text);
      try { expect(label, guard("config-guard.sh", "browser", "--from-base"), 1, `the chrome-devtools entry in ${file} differs`); }
      finally { put(file, file === ".mcp.json" ? mcp : codex); }
    };
    browserChange(".mcp.json", mcp.replace("chrome-devtools-mcp@1.10.1", "chrome-devtools-mcp@latest"), "a browser entry repinned in .mcp.json needs a security review");
    browserChange(".codex/config.toml", codex.replace('"navigate_page",', '"navigate_page", "upload_file",'), "a browser tool added in .codex/config.toml needs a security review");
    expect("the browser check without --from-base is a usage error", guard("config-guard.sh", "browser"), 2, "compared with the base branch only");
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

// --- 3.1.0 stream anchors -------------------------------------------------------
// Each 3.1.0 stream adds its cases between its own start and end lines, never elsewhere,
// so parallel PRs do not touch the same lines. The release PR removes the markers.
// 3.1.0-stream-A:start
// 3.1.0-stream-A:end

// 3.1.0-stream-B:start
// --- #50: the author chain in route.mjs --------------------------------------------------------
// `route <row> --author <lane> [--repair <lane>]…` removes every lane that is not independent of
// the chain; without `--author` the output is byte-identical to 3.0.x (the golden hash below was
// taken from the 3.0.3 script on the frozen defaults copy 3.json, so it changes only when the
// no-author output does). Every line either form prints parses as NAME=value after the first `=`.
{
  const ROUTE = join(KIT, "checks/route.mjs");
  const { KNOWN, check } = await import(pathToFileURL(ROUTE).href);
  const { createHash } = await import("node:crypto");
  const schema = JSON.parse(readFileSync(join(KIT, "routing.schema.json"), "utf8"));
  const a = [...(KNOWN.vendorExclusion ?? [])].sort().join(",");
  const b = Object.keys(schema.properties.vendorExclusions?.items?.properties ?? {}).sort().join(",");
  if (!a || a !== b) fail(`route.mjs KNOWN.vendorExclusion is [${a}] and routing.schema.json says [${b}] -- the script and the schema must name the same keys`);

  const lab = mkdtempSync(join(tmpdir(), "kit-route-chain-"));
  const printed = [];
  try {
    const project = join(lab, "project");
    mkdirSync(join(project, ".xezar"), { recursive: true });
    writeFileSync(join(project, ".xezar/workspace.json"), "{}\n");
    writeFileSync(join(project, ".xezar/agent-accounts.json"), JSON.stringify({ version: 1, accounts: [
      { id: "acct-one", provider: "claude" }, { id: "acct-three", provider: "codex" }] }));
    const stage = (name, file) => {
      const copy = structuredClone(file);
      copy.tools.claude.rotation = ["acct-one", "acct-two"];
      copy.tools.codex.rotation = ["acct-three"];
      writeFileSync(join(project, `.xezar/${name}.json`), JSON.stringify(copy));
      return `.xezar/${name}.json`;
    };
    const env = { ...process.env, KIT_TEST_ROUTE_TOOLS: "claude,codex,pi" };
    const run = (file, ...args) => {
      const out = execFileSync("node", [ROUTE, "--file", file, ...args], { cwd: project, encoding: "utf8", stdio: "pipe", env });
      printed.push(...out.split("\n").filter(Boolean));
      return out;
    };
    const runCode = (file, ...args) => {
      try { execFileSync("node", [ROUTE, "--file", file, ...args], { cwd: project, encoding: "utf8", stdio: "pipe", env }); return { code: 0, err: "" }; }
      catch (error) { return { code: error.status, err: error.stderr ?? "" }; }
    };
    const lanesOf = (out) => out.split("\n").filter((l) => l.startsWith("lane=")).map((l) => l.split(" ")[0].slice(5));
    const shipped = stage("routing-shipped", routing);

    // Golden: no --author, every row, without and with a fresh lane cache.
    const frozen = JSON.parse(readFileSync(join(root, SKILL, "references/routing-defaults/3.json"), "utf8"));
    const old = stage("routing", frozen);
    const ids = frozen.rows.map((r) => r.id);
    let golden = run(old, ...ids);
    const cacheDir = join(project, ".local/xezar/runtime");
    mkdirSync(cacheDir, { recursive: true });
    writeFileSync(join(cacheDir, "lanes.json"), JSON.stringify({ schemaVersion: 1, checkedAt: new Date().toISOString(), lanes: { "claude/sonnet": { available: false, reason: "quota" } } }));
    golden += run(old, ...ids).replace(/checkedAt=\S+/g, "checkedAt=<now>");
    rmSync(join(project, ".local"), { recursive: true, force: true });
    const GOLDEN = "dc1e715b6a94c6ac1e598380da61cfd2786ba7c3a21bd2ab428de93135e25e65";
    if (createHash("sha256").update(golden).digest("hex") !== GOLDEN) fail("route without --author no longer prints byte-identical output (golden hash of every row of routing-defaults/3.json differs) -- the leader parses these lines");
    if (/escalation-eligible=|author-chain/.test(golden)) fail("route prints author-chain lines without --author");

    // A Claude-authored PR on full-cold-review gets a non-Claude lane, never a Claude lane.
    const vendorOf = (id) => routing.lanes[id]?.vendor;
    const modelOf = (id) => routing.lanes[id]?.engineModel ?? routing.lanes[id]?.model;
    for (const author of ["claude/opus", "claude/sonnet"]) {
      const out = run(shipped, "full-cold-review", "--author", author);
      const got = lanesOf(out);
      if (!got.length && !/^wait=no-independent-lane$/m.test(out)) fail(`route full-cold-review --author ${author} gave no lane and no wait=no-independent-lane:\n${out}`);
      if (got.some((id) => vendorOf(id) === "anthropic")) fail(`route full-cold-review --author ${author} still offers a Claude lane: [${got}]`);
      if (!/^removed=claude\/opus reason=author-chain: shared (model|vendor) with claude\/\S+$/m.test(out)) fail(`route full-cold-review --author ${author} does not say why it removed claude/opus:\n${out}`);
      for (const id of got) if (routing.reservedLanes[id]?.escalation && !new RegExp(`^escalation-eligible=${id.replace(/[/.]/g, "\\$&")}$`, "m").test(out)) fail(`route lists escalation lane ${id} as eligible without an escalation-eligible line`);
      if (/ by=hand$/m.test(out)) fail("route still prints an escalation lane as by=hand when an author chain is given");
    }
    // Nothing independent left: wait, never an invented fallback.
    const noCodex = execFileSync("node", [ROUTE, "--file", shipped, "full-cold-review", "--author", "claude/opus"], { cwd: project, encoding: "utf8", stdio: "pipe", env: { ...env, KIT_TEST_ROUTE_TOOLS: "claude" } });
    printed.push(...noCodex.split("\n").filter(Boolean));
    if (lanesOf(noCodex).length || !/^wait=no-independent-lane$/m.test(noCodex)) fail(`route full-cold-review for a Claude author with no codex program gave a lane instead of wait=no-independent-lane:\n${noCodex}`);

    // A repair chain excludes every model in it, and every vendor in it on a security row.
    const chain = ["claude/opus", "codex/gpt-6-sol"];
    const review = run(shipped, "acceptance-verification", "--author", chain[0], "--repair", chain[1]);
    const reviewLanes = lanesOf(review);
    if (reviewLanes.some((id) => chain.map(modelOf).includes(modelOf(id)))) fail(`route acceptance-verification keeps a lane that shares a model with the repair chain: [${reviewLanes}]`);
    if (!/^removed=codex\/gpt-6-sol reason=author-chain: shared model with codex\/gpt-6-sol$/m.test(review)) fail(`route does not remove the repairer's own model:\n${review}`);
    mkdirSync(cacheDir, { recursive: true });
    writeFileSync(join(cacheDir, "lanes.json"), JSON.stringify({ schemaVersion: 1, checkedAt: new Date().toISOString(), lanes: {} }));
    const sec = execFileSync("node", [ROUTE, "--file", shipped, "security-review", "--author", "codex/gpt-6-sol", "--repair", "claude/sonnet"], { cwd: project, encoding: "utf8", stdio: "pipe", env: { ...env, KIT_TEST_ROUTE_TOOLS: "claude,codex" } });
    printed.push(...sec.split("\n").filter(Boolean));
    if (lanesOf(sec).some((id) => ["openai", "anthropic"].includes(vendorOf(id)))) fail(`route security-review keeps a lane of a vendor in the repair chain:\n${sec}`);
    if (!/^wait=no-independent-lane$/m.test(sec)) fail(`route security-review with both vendors in the chain does not wait:\n${sec}`);
    const secOne = run(shipped, "security-review", "--author", "codex/gpt-5.6-terra");
    if (!/^removed=codex\/gpt-6-astra reason=author-chain: shared vendor with codex\/gpt-5\.6-terra$/m.test(secOne) || !/^lane=claude\/opus /m.test(secOne)) fail(`route security-review does not exclude the author's vendor on a security row:\n${secOne}`);

    // The vendor exclusion is data: dropped, a Claude lane may review Claude's work again; extended, it bites.
    const off = structuredClone(routing);
    delete off.vendorExclusions;
    const offOut = run(stage("routing-off", off), "full-cold-review", "--author", "claude/opus");
    if (lanesOf(offOut)[0] !== "claude/sonnet") fail(`route with no vendorExclusions does not offer claude/sonnet for a claude/opus author:\n${offOut}`);
    const more = structuredClone(routing);
    more.vendorExclusions = [...(more.vendorExclusions ?? []), { vendor: "openai" }];
    const moreOut = run(stage("routing-more", more), "full-cold-review", "--author", "codex/gpt-6-sol");
    if (lanesOf(moreOut).includes("codex/gpt-6-astra")) fail(`route ignores a vendorExclusions entry a project added:\n${moreOut}`);
    // --check validates the key.
    for (const [bad, expect] of [[[{ vendor: "nobody" }], "is the vendor of no lane"], [{ vendor: "anthropic" }, "must be a list"], [[{ vendor: "anthropic" }, { vendor: "anthropic" }], "is named twice"]]) {
      const broken = structuredClone(routing);
      broken.vendorExclusions = bad;
      if (!check(broken).errors.some((e) => e.includes(expect))) fail(`route check accepts vendorExclusions ${JSON.stringify(bad)} (expected "${expect}")`);
    }

    // An unknown lane in the chain, or a chain without an author, is a usage error: exit 2.
    for (const args of [["full-cold-review", "--author", "claude/no-such"], ["full-cold-review", "--author", "claude/opus", "--repair", "nobody"], ["full-cold-review", "--repair", "claude/opus"], ["--rows", "--author", "claude/opus"]]) {
      const r = runCode(shipped, ...args);
      if (r.code !== 2) fail(`route ${args.join(" ")} exits ${r.code}, expected 2 (a usage error):\n${r.err}`);
    }

    // Grammar: every line either form prints is a comment or NAME=value, parsed after the first `=`.
    for (const l of printed) {
      if (l.startsWith("# ")) continue;
      const i = l.indexOf("=");
      if (i < 1 || !/^[a-z][a-z-]*$/.test(l.slice(0, i))) fail(`route printed a line that does not parse as NAME=value: ${JSON.stringify(l)}`);
    }
  } catch (error) {
    fail(`the author-chain route fixture could not run: ${error.message}\n${error.stderr ?? ""}`);
  } finally {
    rmSync(lab, { recursive: true, force: true });
  }
}
// 3.1.0-stream-B:end

// 3.1.0-stream-C:start
// 3.1.0-stream-C:end

// 3.1.0-stream-D:start
// #52: every agent step carries a timeout, and the kit's validator refuses one without.
// D13 (replaces #63's read-only QA): every review and QA step may run the change through
// review-run.sh and holds every chrome-devtools tool; the review-only browser tools stay out of
// every other workflow; review preflights run strict; a verdict needs an unchanged tree.
{
  const lab = mkdtempSync(join(tmpdir(), "kit-stream-d-"));
  try {
    mkdirSync(join(lab, ".xezar"));
    for (const dir of ["workflows", "skills", "checks"]) cpSync(join(KIT, dir), join(lab, ".xezar", dir), { recursive: true });
    writeFileSync(join(lab, ".xezar/config.json"), '{"baseBranch":"main"}\n');
    const wf = (name) => join(lab, ".xezar/workflows", name);
    const refusal = (name, mutate, expect, what) => {
      const original = readFileSync(wf(name), "utf8");
      const changed = mutate(original);
      if (changed === original) { fail(`stream D fixture: the ${what} mutation of ${name} matched nothing`); return; }
      writeFileSync(wf(name), changed);
      let out = "(it passed)";
      try { execFileSync("node", [join(KIT, "checks/catalog-check.mjs"), lab], { encoding: "utf8", stdio: "pipe" }); }
      catch (error) { out = (error.stdout ?? "") + (error.stderr ?? ""); }
      finally { writeFileSync(wf(name), original); }
      if (!out.includes(expect)) fail(`catalog-check accepts ${what}:\n${out}`);
    };
    refusal("bug-fix.yaml", (t) => t.replace("    skill: xezar-handoff-draft-pr\n    timeout: 15m\n", "    skill: xezar-handoff-draft-pr\n"),
      'step "handoff": an agent step has no timeout', "a handoff step with no timeout");
    refusal("code-review.yaml", (t) => t.replace("    timeout: 2h\n", "    timeout: none\n"),
      'timeout "none" is not a positive duration', "an agent step with timeout: none");
    refusal("design.yaml", (t) => t.replace("mcp__chrome-devtools__get_css_styles", "mcp__chrome-devtools__get_css_styles, mcp__chrome-devtools__evaluate_script"),
      "grants mcp__chrome-devtools__evaluate_script, which only the review and QA workflows may hold", "evaluate_script in the design workflow");
    for (const name of ["qa.yaml", "code-review.yaml", "security-review.yaml"]) {
      refusal(name, (t) => t.replace(', "bash .xezar/checks/review-run.sh"', ""),
        "cannot run the change it judges (D13)", `a ${name} review step without review-run.sh`);
      refusal(name, (t) => t.replace(", mcp__chrome-devtools__lighthouse_audit", ""),
        "lacks mcp__chrome-devtools__lighthouse_audit", `a ${name} review step without every browser tool`);
      refusal(name, (t) => t.replace("allowedTools: [Read, Grep, Glob, Bash,", "allowedTools: [Read, Grep, Glob, Bash, Edit,"),
        "its allowedTools must be listed and hold only", `a ${name} review step that can edit`);
      refusal(name, (t) => t.replace('command: ".xezar/checks/worktree-preflight.sh"\n', 'command: ".xezar/checks/worktree-preflight.sh --allow-root"\n'),
        "runs worktree-preflight.sh with --allow-root", `a ${name} preflight back on --allow-root`);
    }
    refusal("qa.yaml", (t) => t.replace(/\n    bashAllowlist: \[[^\n]*\]/, ""),
      "it has no bashAllowlist", "a qa.yaml review step with no bashAllowlist");
  } finally {
    rmSync(lab, { recursive: true, force: true });
  }

  // The shipped data, read directly: a validator that passes is only half the claim.
  for (const name of ["qa", "design-review", "code-review", "security-review", "architecture-review", "acceptance-verification"]) {
    const text = readFileSync(join(KIT, "workflows", `${name}.yaml`), "utf8");
    if (!text.includes('"bash .xezar/checks/review-run.sh"')) fail(`kit/workflows/${name}.yaml: the review step cannot run the change (no review-run.sh)`);
    if (!text.includes("mcp__chrome-devtools__evaluate_script")) fail(`kit/workflows/${name}.yaml: the review step lacks the full browser tool set`);
    if (text.includes("worktree-preflight.sh --allow-root")) fail(`kit/workflows/${name}.yaml: the preflight step is not the strict worktree-preflight.sh`);
    if (/^\s*- id: finish$/m.test(text)) fail(`kit/workflows/${name}.yaml ends with a check step, which silences XEZ:ASK and XEZ:DONE`);
  }
  const verdictWrite = readFileSync(join(KIT, "checks/verdict-write.sh"), "utf8");
  if (!verdictWrite.includes('bash "$SCRIPT_DIR/review-run.sh" finish')) fail("kit/checks/verdict-write.sh no longer runs review-run.sh finish before a verdict packet");
  const descriptor = readFileSync(join(KIT, "pipeline/browsers/chrome-devtools.md"), "utf8");
  if (!/hold every chrome-devtools tool[\s\S]*granted by their own tool lists only/.test(descriptor)) {
    fail("kit/pipeline/browsers/chrome-devtools.md no longer says the review and QA workflows hold every tool, through their own tool lists only");
  }

  // RUN, not read: review-run.sh, the verdict-scoped labels in gh-write.sh and the unchanged-tree
  // check in verdict-write.sh, in a throwaway repository with a task worktree and a stand-in gh.
  const run = mkdtempSync(join(tmpdir(), "kit-review-run-"));
  try {
    const repo = join(run, "repo");
    const git = (cwd, ...args) => execFileSync("git", ["-C", cwd, ...args], { encoding: "utf8", stdio: "pipe" }).trim();
    execFileSync("git", ["-c", "init.defaultBranch=main", "init", "--quiet", repo], { stdio: "pipe" });
    git(repo, "config", "user.email", "t@example.com");
    git(repo, "config", "user.name", "t");
    git(repo, "remote", "add", "origin", "https://github.com/acme/widget.git");
    mkdirSync(join(repo, ".xezar"));
    cpSync(join(KIT, "checks"), join(repo, ".xezar/checks"), { recursive: true });
    writeFileSync(join(repo, ".xezar/config.json"), '{"baseBranch":"main"}\n');
    writeFileSync(join(repo, ".gitignore"), ".local/\n");
    writeFileSync(join(repo, "README.md"), "base\n");
    git(repo, "add", "-A");
    git(repo, "commit", "--quiet", "-m", "base");
    git(repo, "checkout", "--quiet", "-b", "pr-5");
    writeFileSync(join(repo, "README.md"), "change\n");
    git(repo, "commit", "--quiet", "-am", "change");
    const prHead = git(repo, "rev-parse", "HEAD");
    git(repo, "checkout", "--quiet", "main");
    const wt = join(repo, ".local/xezar/worktrees/run-1");
    git(repo, "worktree", "add", "--quiet", "--detach", wt, "main");

    const bin = join(run, "bin");
    mkdirSync(bin);
    const log = join(run, "gh.log");
    writeFileSync(join(bin, "gh"), `#!/usr/bin/env bash\ncase "$1 $2" in\n  "pr checkout") git checkout --quiet --detach ${prHead} ;;\n  "pr view") echo ${prHead} ;;\n  *) printf 'ARGS %s\\n' "$*" >>"${log}" ;;\nesac\n`);
    chmodSync(join(bin, "gh"), 0o755);
    const handoff = join(run, "handoff");
    const env = { ...process.env, PATH: `${bin}:${process.env.PATH}`, XEZ_HANDOFF_FILE: handoff, XEZ_TASK_ID: "run-1", XEZ_STEP_ID: "review" };
    const sh = (cwd, script, args = [], input = "") => {
      try {
        const out = execFileSync("bash", [`.xezar/checks/${script}`, ...args], { cwd, env, input, encoding: "utf8", stdio: "pipe" });
        return { status: 0, out };
      } catch (error) {
        return { status: error.status, out: (error.stdout ?? "") + (error.stderr ?? "") };
      }
    };
    const rr = (...args) => sh(wt, "review-run.sh", args);
    const verdictLabel = (head, add = ["qa-approved"]) =>
      sh(wt, "gh-write.sh", [], JSON.stringify({ action: "label", kind: "pr", number: 5, add, remove: ["needs-qa"], verdict: { role: "qa", head } }));
    const packet = () => sh(wt, "verdict-write.sh", [], JSON.stringify({ kind: "packet", packet: { verdict: "pass" } }));
    const ghLog = () => (existsSync(log) ? readFileSync(log, "utf8") : "");

    if (sh(repo, "review-run.sh", ["verify-unchanged"]).status !== 1) fail("review-run.sh runs in the project's main checkout");
    for (const argv of [["git", "status"], ["/usr/bin/env", "ls"], ["bash", "-c", "true"], ["gh", "pr", "merge", "5"]]) {
      if (rr("run", ...argv).status !== 1) fail(`review-run.sh runs "${argv.join(" ")}"`);
    }
    if (rr("run", "node", "-e", "").status !== 0) fail("review-run.sh refuses to run a plain project command");
    const clean = rr("verify-unchanged");
    if (clean.status !== 0 || !clean.out.includes("review-tree=unchanged")) fail(`review-run.sh fails an untouched worktree:\n${clean.out}`);
    const checkout = rr("checkout", "5");
    if (checkout.status !== 0 || git(wt, "rev-parse", "HEAD") !== prHead) fail(`review-run.sh checkout does not check the PR's head out:\n${checkout.out}`);
    if (rr("checkout", "5").status !== 1) fail("review-run.sh checks a second head out in one run");
    const started = rr("start", "srv", "sleep", "30");
    const pid = (started.out.match(/pid=(\d+)/) ?? [])[1];
    if (started.status !== 0 || !pid) fail(`review-run.sh start does not start a background command:\n${started.out}`);

    writeFileSync(join(wt, "README.md"), "edited by the review\n");
    if (rr("verify-unchanged").status !== 1) fail("review-run.sh passes a tree whose tracked file changed");
    if (verdictLabel(prHead).status !== 1 || ghLog() !== "") fail("gh-write.sh grants qa-approved after the review changed a tracked file");
    if (packet().status !== 1 || existsSync(`${handoff}.verdict.json`)) fail("verdict-write.sh writes a verdict after the review changed a tracked file");
    writeFileSync(join(wt, "README.md"), "change\n");

    if (verdictLabel("0".repeat(40)).status !== 1) fail("gh-write.sh grants qa-approved for a head that is not the PR's");
    if (verdictLabel(prHead, ["design-approved"]).status !== 1) fail("gh-write.sh lets a qa verdict add design-approved");
    const granted = verdictLabel(prHead);
    if (granted.status !== 0 || !ghLog().includes("pr edit 5 --repo acme/widget --add-label qa-approved --remove-label needs-qa"))
      fail(`gh-write.sh refuses a qa verdict's own labels on an unchanged tree:\n${granted.out}\n${ghLog()}`);
    const written = packet();
    if (written.status !== 0 || !existsSync(`${handoff}.verdict.json`)) fail(`verdict-write.sh refuses a verdict from an unchanged tree:\n${written.out}`);
    let alive = true;
    try { process.kill(Number(pid), 0); } catch { alive = false; }
    if (alive) fail("review-run.sh finish (run by verdict-write.sh) leaves a started command running");

    git(wt, "commit", "--quiet", "--allow-empty", "-m", "a review commit");
    if (rr("verify-unchanged").status !== 1) fail("review-run.sh passes a worktree whose HEAD moved");
  } catch (error) {
    fail(`the review-run fixture could not run: ${error.message}\n${error.stderr ?? ""}`);
  } finally {
    rmSync(run, { recursive: true, force: true });
  }
}
// 3.1.0-stream-D:end

// 3.1.0-stream-E:start
// 3.1.0-stream-E:end

// 3.1.0-stream-F:start
// --- #57 changelog formats: Keep a Changelog, and a base branch read from config -------------
// Every fixture is a throwaway repository whose base branch is `develop`, with a `main` that is
// older than it: a check that still falls back to `main` sees the base's own commits as this
// branch's edits, and refuses a branch that only wrote a fragment.
{
  const lab = mkdtempSync(join(tmpdir(), "kit-changelog-"));
  const env = {
    ...Object.fromEntries(Object.entries(process.env).filter(([name]) => !name.startsWith("GIT_"))),
    GIT_CONFIG_GLOBAL: "/dev/null",
    GIT_CONFIG_NOSYSTEM: "1",
  };
  delete env.GATE_BASE_SHA;
  const CHECK = join(KIT, "checks", "changelog-check.sh");
  const FRAG = join(KIT, "checks", "changelog-fragments.mjs");
  const exec = (cwd, cmd, args) => {
    try {
      return { code: 0, out: execFileSync(cmd, args, { cwd, env, encoding: "utf8", stdio: "pipe" }) };
    } catch (error) {
      return { code: error.status ?? -1, out: (error.stdout ?? "") + (error.stderr ?? "") };
    }
  };
  const expect = (label, got, code, words) => {
    if (got.code !== code || !got.out.includes(words)) {
      fail(`changelog #57: ${label} -- expected exit ${code} saying "${words}", got exit ${got.code}:\n${got.out.trim()}`);
    }
  };
  const repo = (name, changelog, config) => {
    const dir = join(lab, name);
    mkdirSync(join(dir, "changelog.d"), { recursive: true });
    mkdirSync(join(dir, ".xezar/pipeline"), { recursive: true });
    const git = (...args) => execFileSync("git", args, { cwd: dir, env, encoding: "utf8", stdio: "pipe" }).trim();
    git("init", "--quiet", "-b", "main");
    git("config", "user.name", "kit");
    git("config", "user.email", "kit@example.invalid");
    writeFileSync(join(dir, "CHANGELOG.md"), changelog);
    writeFileSync(join(dir, "changelog.d/README.md"), "Fragments go here.\n");
    writeFileSync(join(dir, ".xezar/pipeline/config.json"), `${JSON.stringify(config)}\n`);
    git("add", "-A");
    git("commit", "--quiet", "-m", "initial");
    return { dir, git, put: (file, text) => writeFileSync(join(dir, file), text), read: (file) => readFileSync(join(dir, file), "utf8") };
  };
  try {
    // Keep a Changelog, base `develop` from .xezar/pipeline/config.json.
    const KAC = "# Changelog\n\n## [Unreleased]\n\n## [1.0.0] - 2026-01-01\n\n### Added\n\n- First release.\n";
    const k = repo("kac", KAC, { baseBranch: "develop" });
    k.git("checkout", "--quiet", "-b", "develop");
    // A direct Unreleased bullet that predates fragments, on the BASE: legal there, and exactly what
    // a `main` fallback would misread as the pull request's own edit.
    k.put("CHANGELOG.md", KAC.replace("## [Unreleased]\n", "## [Unreleased]\n\n### Changed\n\n- Legacy bullet on develop.\n"));
    k.git("commit", "--quiet", "-am", "legacy unreleased bullet");
    const developSha = k.git("rev-parse", "--short=12", "HEAD");
    const check = (...args) => exec(k.dir, "bash", [CHECK, "--file", "CHANGELOG.md", ...args]);

    expect("the format is detected from a Keep a Changelog file", exec(k.dir, "node", [FRAG, "--format-of"]), 0, "format=keep-a-changelog");

    // A pull request that writes a fragment is accepted, measured from the configured `develop`.
    k.git("checkout", "--quiet", "-b", "feature-fragment");
    k.put("changelog.d/41.md", "## ✨ Features\n\n- **A house heading** maps onto Added. (#41)\n");
    k.put("changelog.d/42.md", "## Fixed\n\n- **A Keep a Changelog group** is taken as it is. (#42)\n");
    k.git("add", "-A");
    k.git("commit", "--quiet", "-m", "fragments");
    const accepted = check("--diff-base", "auto", "--fragments", "changelog.d");
    expect("a fragment-only branch is accepted against the configured base", accepted, 0, `diff base ${developSha}`);
    expect("a fragment-only branch passes in keep-a-changelog mode", accepted, 0, "(keep-a-changelog)");

    // A pull request that edits `## [Unreleased]` directly is refused.
    k.git("checkout", "--quiet", "-b", "feature-direct", "develop");
    k.put("CHANGELOG.md", k.read("CHANGELOG.md").replace("- Legacy bullet on develop.\n", "- Legacy bullet on develop.\n- A direct edit.\n"));
    k.git("commit", "--quiet", "-am", "direct edit");
    expect("a direct `## [Unreleased]` edit is refused", check("--diff-base", "auto"), 1, "the '## [Unreleased]' section of CHANGELOG.md was edited directly");

    // A fragment heading Keep a Changelog has no group for is refused, naming the groups it has.
    k.git("checkout", "--quiet", "feature-fragment");
    k.put("changelog.d/43.md", "## Highlights\n\n- Prose with no Keep a Changelog group.\n");
    expect("a fragment under `## Highlights` is refused in keep-a-changelog mode", check("--fragments", "changelog.d"), 1, "is not a Keep a Changelog group");
    rmSync(join(k.dir, "changelog.d/43.md"));

    // The fold releases `## [Unreleased]`: fragments land under Added and Fixed, the legacy bullet
    // is kept, a fresh empty Unreleased opens above, and every fragment is deleted.
    expect("the keep-a-changelog fold runs", exec(k.dir, "node", [FRAG, "--fold", "--version", "1.1.0", "--date", "2026-09-27", "--fragments", "changelog.d"]), 0, "folded 2 fragment(s)");
    const folded = k.read("CHANGELOG.md");
    const want = "# Changelog\n\n## [Unreleased]\n\n## [1.1.0] - 2026-09-27\n\n### Added\n\n- **A house heading** maps onto Added. (#41)\n\n### Changed\n\n- Legacy bullet on develop.\n\n### Fixed\n\n- **A Keep a Changelog group** is taken as it is. (#42)\n\n## [1.0.0] - 2026-01-01\n";
    if (!folded.startsWith(want)) fail(`changelog #57: the keep-a-changelog fold wrote an unexpected file:\n${folded}`);
    expect("the folded file passes --require-version", check("--require-version", "1.1.0"), 0, "one \"## [1.1.0] - \" heading");
    expect("the verify step passes on a complete fold", exec(k.dir, "node", [FRAG, "--verify", "--version", "1.1.0", "--before", "HEAD", "--fragments", "changelog.d"]), 0, "verified — 2 fragment(s)");
    // ...and catches an entry the fold lost: a fragment bullet, then a line that was there before.
    k.put("CHANGELOG.md", folded.replace("- **A house heading** maps onto Added. (#41)\n", ""));
    expect("the verify step catches a lost fragment entry", exec(k.dir, "node", [FRAG, "--verify", "--version", "1.1.0", "--before", "HEAD", "--fragments", "changelog.d"]), 1, "changelog.d/41.md is missing from the 1.1.0 section");
    k.put("CHANGELOG.md", folded.replace("- Legacy bullet on develop.\n", ""));
    expect("the verify step catches a lost changelog line", exec(k.dir, "node", [FRAG, "--verify", "--version", "1.1.0", "--before", "HEAD", "--fragments", "changelog.d"]), 1, "a line of the changelog before the fold is missing after it");
    k.put("CHANGELOG.md", folded);
    k.put("changelog.d/44.md", "## Added\n\n- Left behind.\n");
    expect("the verify step catches a fragment left behind", exec(k.dir, "node", [FRAG, "--verify", "--version", "1.1.0", "--before", "HEAD", "--fragments", "changelog.d"]), 1, "a fragment left behind");
    // Content still under Unreleased after a release is refused.
    k.put("CHANGELOG.md", folded.replace("## [Unreleased]\n", "## [Unreleased]\n\n- Stray.\n"));
    expect("--require-version refuses content left under Unreleased", check("--require-version", "1.1.0"), 1, "still has content under '## [Unreleased]'");

    // An unknown changelog.format is refused, not read as "detect".
    k.put(".xezar/pipeline/config.json", '{"baseBranch":"develop","changelog":{"format":"keepachangelog"}}\n');
    expect("an unknown changelog.format is refused", check(), 2, "changelog.format in");

    // The house format is unchanged: a direct `# Unreleased` edit refused, a fragment accepted and
    // folded, with the base read from config here too.
    const HOUSE = "# Unreleased\n\n## 🐛 Fixes\n\n- Old.\n\n# 1.0.0 (2026-01-01)\n\n## ✨ Features\n\n- First.\n\n---\n";
    const h = repo("house", HOUSE, { baseBranch: "develop" });
    h.git("checkout", "--quiet", "-b", "develop");
    h.put("CHANGELOG.md", HOUSE.replace("- Old.\n", "- Old.\n- Legacy on develop.\n"));
    h.git("commit", "--quiet", "-am", "legacy");
    h.git("checkout", "--quiet", "-b", "feature-fragment");
    h.put("changelog.d/7.md", "## 🐛 Fixes\n\n- Fragment. (#7)\n");
    h.git("add", "-A");
    h.git("commit", "--quiet", "-m", "fragment");
    const hcheck = (...args) => exec(h.dir, "bash", [CHECK, "--file", "CHANGELOG.md", ...args]);
    expect("house: a fragment-only branch is accepted against the configured base", hcheck("--diff-base", "auto", "--fragments", "changelog.d"), 0, "no direct edit of CHANGELOG.md");
    h.git("checkout", "--quiet", "-b", "feature-direct", "develop");
    h.put("CHANGELOG.md", h.read("CHANGELOG.md").replace("- Old.\n", "- Old.\n- Direct.\n"));
    h.git("commit", "--quiet", "-am", "direct");
    expect("house: a direct `# Unreleased` edit is still refused", hcheck("--diff-base", "auto"), 1, "the '# Unreleased' section of CHANGELOG.md was edited directly");
    h.git("checkout", "--quiet", "feature-fragment");
    expect("house: the fold still runs", exec(h.dir, "node", [FRAG, "--fold", "--version", "1.1.0", "--date", "2026-09-27", "--fragments", "changelog.d"]), 0, "folded 1 fragment(s)");
    if (!h.read("CHANGELOG.md").includes("# Unreleased\n\n## 🐛 Fixes\n\n- Old.\n- Legacy on develop.\n\n# 1.1.0 (2026-09-27)\n\n## 🐛 Fixes\n\n- Fragment. (#7)\n\n---\n")) {
      fail(`changelog #57: the house fold changed shape:\n${h.read("CHANGELOG.md")}`);
    }
    expect("house: the verify step passes", exec(h.dir, "node", [FRAG, "--verify", "--version", "1.1.0", "--before", "HEAD", "--fragments", "changelog.d"]), 0, "verified — 1 fragment(s)");
    expect("house: the format is house", exec(h.dir, "node", [FRAG, "--format-of"]), 0, "format=house");
  } catch (error) {
    fail(`changelog #57: the fixture could not run: ${error.message}\n${error.stderr ?? ""}`);
  } finally {
    rmSync(lab, { recursive: true, force: true });
  }
}
// 3.1.0-stream-F:end

// 3.1.0-stream-G:start
// 3.1.0-stream-G:end

// 3.1.0-stream-H:start
// 3.1.0-stream-H:end

// 3.1.0-stream-U:start
// --- U1 (#55). The manifest drift check, RUN on throwaway projects -----------------------------
// A fresh setup passes; a silent edit fails; a recorded and confirmed patch passes; `Confirmed: no`
// fails; a patch with no register entry fails; a register entry with no manifest patch fails;
// only the kit block of an owner file is hashed; a version-1 manifest is not enforced; a file that
// cannot be parsed exits 2; and the register example in the kit's own format document parses.
{
  const { createHash } = await import("node:crypto");
  const sha = (text) => createHash("sha256").update(text).digest("hex");
  const DRIFT = join(KIT, "checks/manifest-drift.mjs");
  const lab = mkdtempSync(join(tmpdir(), "kit-drift-"));
  const drift = (dir) => {
    try {
      return { code: 0, out: execFileSync("node", [DRIFT, dir], { encoding: "utf8", stdio: "pipe" }) };
    } catch (error) {
      return { code: error.status, out: (error.stdout ?? "") + (error.stderr ?? "") };
    }
  };
  const COPIED = "copied check\n";
  const OWNER = "# Owner's notes\n\n<!-- xezar:kit:start -->\nkit block\n<!-- xezar:kit:end -->\n";
  const BLOCK = "<!-- xezar:kit:start -->\nkit block\n<!-- xezar:kit:end -->";
  const entry = (text, origin, extra = {}) => ({ sha256: sha(text), origin, ...extra });
  const project = (name, { manifest, register, tree = {} } = {}) => {
    const dir = join(lab, name);
    const write = (p, text) => {
      mkdirSync(dirname(join(dir, p)), { recursive: true });
      writeFileSync(join(dir, p), text);
    };
    write(".xezar/checks/x.sh", COPIED);
    write("AGENTS.md", OWNER);
    for (const [p, text] of Object.entries(tree)) write(p, text);
    if (manifest !== undefined) write(".xezar/onboarding.json", typeof manifest === "string" ? manifest : JSON.stringify(manifest));
    if (register !== undefined) write(".xezar/LOCAL-PATCHES.md", register);
    return dir;
  };
  const v2 = (files) => ({
    manifestVersion: 2,
    version: "3.1.0",
    files: {
      ".xezar/checks/x.sh": entry(COPIED, "copied", { kitSource: "checks/x.sh", kitBlob: "0".repeat(40) }),
      "AGENTS.md": entry(BLOCK, "owner-file-appended"),
      ...files,
    },
  });
  const lp = (confirmed, files = ".xezar/checks/x.sh") =>
    `# Local patches\n\n## LP-1 – keep the local check\n- Files: ${files}\n- Reason: a test\n- Upstream: local only\n- Since: 2026-09-27\n- Confirmed: ${confirmed}\n`;
  const expect = (label, dir, code, lines) => {
    const result = drift(dir);
    if (result.code !== code) fail(`manifest-drift: ${label} exits ${result.code}, not ${code}:\n${result.out}`);
    for (const line of lines)
      if (!result.out.split("\n").includes(line)) fail(`manifest-drift: ${label} does not print "${line}":\n${result.out}`);
  };
  try {
    expect("a project with no manifest", project("none"), 0, ["drift-status=not-applicable"]);
    expect("a version-1 manifest with drift", project("v1", { manifest: { version: "3.0.3", files: { ".xezar/checks/x.sh": { sha256: "1".repeat(64), origin: "copied" } } } }), 0, ["drift-status=not-applicable"]);
    expect("a fresh setup", project("fresh", { manifest: v2({ ".xezar/config.json": entry("{}\n", "generated") }), tree: { ".xezar/config.json": "{}\n" } }), 0, ["drift-status=pass"]);
    expect("a silent edit", project("silent", { manifest: v2(), tree: { ".xezar/checks/x.sh": "patched\n" } }), 1, ["drift-status=fail", "drift=.xezar/checks/x.sh origin=copied reason=hash-mismatch"]);
    expect("a deleted file", project("deleted", { manifest: v2({ ".xezar/gone.md": entry("x", "copied") }) }), 1, ["drift=.xezar/gone.md origin=copied reason=missing"]);
    const patched = v2();
    patched.files[".xezar/checks/x.sh"].patch = "LP-1";
    expect("a recorded, confirmed patch", project("recorded", { manifest: patched, register: lp("yes"), tree: { ".xezar/checks/x.sh": "patched\n" } }), 0, ["drift-status=pass"]);
    expect("a patch with Confirmed: no", project("unconfirmed", { manifest: patched, register: lp("no"), tree: { ".xezar/checks/x.sh": "patched\n" } }), 1, ["drift=.xezar/checks/x.sh origin=copied reason=unconfirmed-patch"]);
    expect("a patch with no register", project("unregistered", { manifest: patched, tree: { ".xezar/checks/x.sh": "patched\n" } }), 1, ["drift=.xezar/checks/x.sh origin=copied reason=unregistered-patch"]);
    expect("a patch whose entry does not list the file", project("unlisted", { manifest: patched, register: lp("yes", ".xezar/other.sh") }), 1, ["drift=.xezar/checks/x.sh origin=copied reason=unregistered-patch", "drift=.xezar/other.sh origin=none reason=register-without-manifest"]);
    expect("a register entry with no manifest patch", project("orphan", { manifest: v2(), register: lp("yes") }), 1, ["drift=.xezar/checks/x.sh origin=copied reason=register-without-manifest"]);
    expect("an owner edit outside the kit block", project("owner-outside", { manifest: v2(), tree: { "AGENTS.md": OWNER.replace("# Owner's notes", "# Owner's notes, edited") } }), 0, ["drift-status=pass"]);
    expect("an edit inside the kit block", project("owner-inside", { manifest: v2(), tree: { "AGENTS.md": OWNER.replace("kit block", "kit block, edited") } }), 1, ["drift=AGENTS.md origin=owner-file-appended reason=hash-mismatch"]);
    const outside = join(lab, "outside.sh");
    writeFileSync(outside, COPIED);
    const linked = project("linked", { manifest: v2() });
    rmSync(join(linked, ".xezar/checks/x.sh"));
    symlinkSync(outside, join(linked, ".xezar/checks/x.sh"));
    expect("a tracked file replaced by a link", linked, 1, ["drift=.xezar/checks/x.sh origin=copied reason=hash-mismatch"]);
    expect("a manifest that is not JSON", project("broken", { manifest: "{" }), 2, []);
    expect("a manifest path that climbs out", project("climb", { manifest: v2({ "../x": entry("x", "copied") }) }), 2, []);
    expect("an unknown origin", project("origin", { manifest: v2({ ".xezar/y": entry("x", "patched") }), tree: { ".xezar/y": "x" } }), 2, []);
    expect("a register id used twice", project("twice", { manifest: patched, register: lp("yes") + lp("yes").replace("# Local patches\n", "") }), 2, []);
    expect("a register entry missing a field", project("field", { manifest: patched, register: lp("yes").replace("- Since: 2026-09-27\n", "") }), 2, []);
    // The kit's own format document: its example entry must be one this check accepts.
    const doc = readFileSync(join(KIT, "docs/local-patches.md"), "utf8");
    const example = /```markdown\n([\s\S]*?)```/.exec(doc);
    if (!example) fail("kit/docs/local-patches.md has no ```markdown register example");
    else {
      const files = /^- Files: (.+)$/m.exec(example[1])[1].split(",").map((p) => p.trim());
      const id = /^## (LP-[0-9]+)/m.exec(example[1])[1];
      const m = { manifestVersion: 2, version: "3.1.0", files: {} };
      const tree = {};
      for (const p of files) {
        m.files[p] = { ...entry("x", "copied"), patch: id };
        tree[p] = "patched";
      }
      expect("the register example in kit/docs/local-patches.md", project("doc-example", { manifest: m, register: example[1], tree }), 0, ["drift-status=pass"]);
    }
  } finally {
    rmSync(lab, { recursive: true, force: true });
  }
}
// 3.1.0-stream-U:end

// 3.1.0-stream-R:start
// --- #89: the DeepSeek V4 Pro lane and the DeepSeek-first rows --------------------------------
// The owner's row orders are data, so each group is pinned by its rule rather than by a copy of
// the table; the one relaxation of tool limits is checked both ways (where it lets V4 Pro in, and
// where it must not); and a machine without the model gets no V4 Pro lane from `route`.
{
  const ROUTE = join(KIT, "checks/route.mjs");
  const { check } = await import(pathToFileURL(ROUTE).href);
  const P = "pi/deepseek-api/deepseek-v4-pro";
  const F = "pi/deepseek-api/deepseek-flash";
  const byId = Object.fromEntries(routing.rows.map((r) => [r.id, r]));
  const lanesOfRow = (id) => byId[id]?.lanes ?? [];
  const toolOf = (id) => routing.lanes[id]?.tool;

  // The lane's facts, as the owner's pi config states them (images: no).
  const want = { tool: "pi", model: "deepseek-api/deepseek-v4-pro", vendor: "deepseek", tier: "strong", vision: false, imageGeneration: false, local: false, enforcesToolLimits: false, advisoryOnly: false, fullShellReviews: true };
  const lane = routing.lanes[P];
  if (!lane) fail(`${ROUTING} has no lane ${P}`);
  else for (const [k, v] of Object.entries(want)) if (lane[k] !== v) fail(`${ROUTING}: ${P}.${k} is ${JSON.stringify(lane[k])}, expected ${JSON.stringify(v)}`);

  // Screen rows: no V4 Pro (no vision); Flash is the no-Claude fallback wherever it can do the work.
  for (const id of ["design-review", "browser-qa", "ui-design", "ux-design", "ui-implementation", "ui-tests", "generated-images", "diagrams"]) {
    if (lanesOfRow(id).includes(P)) fail(`${ROUTING}: screen row ${id} lists ${P}, which cannot see a screen`);
    if (id !== "generated-images" && lanesOfRow(id).at(-1) !== F) fail(`${ROUTING}: screen row ${id} does not end with ${F}, its no-Claude fallback`);
  }
  // DeepSeek-first rows: first choice, the other DeepSeek model, then every Codex lane before any Claude lane.
  const deepseekFirst = (id, first, second) => {
    const l = lanesOfRow(id);
    if (l[0] !== first) fail(`${ROUTING}: row ${id} starts with ${l[0]}, expected ${first}`);
    if (second && l[1] !== second) fail(`${ROUTING}: row ${id} has ${l[1]} second, expected the other DeepSeek model ${second}`);
    const lastCodex = l.map(toolOf).lastIndexOf("codex");
    const firstClaude = l.map(toolOf).indexOf("claude");
    if (lastCodex !== -1 && firstClaude !== -1 && firstClaude < lastCodex) fail(`${ROUTING}: row ${id} puts a Claude lane before a Codex lane: [${l}]`);
  };
  for (const id of ["mechanical-docs", "bounded-bug-fix", "merge-chain", "dependency-maintenance"]) deepseekFirst(id, F, P);
  deepseekFirst("evidence-pass", F, null); // a strong lane is banned there
  for (const id of ["docs-writing", "unit-tests", "integration-tests", "observability", "hotfix", "review-response-one"]) deepseekFirst(id, P, F);
  // Opus-first rows keep Opus first and take V4 Pro right after their last Codex lane.
  for (const id of ["analysis-specs-research", "architecture-decision", "spike", "deprecation-plan", "multi-file-implementation", "kit-refactor", "refactor", "migration", "regression-suite", "performance", "review-response-several", "diagnose-bug"]) {
    const l = lanesOfRow(id);
    if (l[0] !== "claude/opus") fail(`${ROUTING}: row ${id} no longer starts with claude/opus`);
    if (l.indexOf(P) !== l.map(toolOf).lastIndexOf("codex") + 1) fail(`${ROUTING}: row ${id} does not take ${P} right after its Codex lanes: [${l}]`);
  }
  // Every non-screen review row ends with V4 Pro, the fallback after the Claude and Astra lanes.
  for (const id of ["scoped-recheck", "full-cold-review", "architecture-review", "acceptance-verification", "security-review", "verify-strong-claim"]) {
    if (lanesOfRow(id).at(-1) !== P) fail(`${ROUTING}: review row ${id} does not end with ${P}: [${lanesOfRow(id)}]`);
  }

  // The tool-limits relaxation, both ways: in a judging row yes, in any other reading row or a
  // security row that writes no, and never on a cheap, local or advisory-only lane.
  const refused = (mutate, expect, what) => {
    const f = structuredClone(routing);
    mutate(f);
    if (!check(f).errors.some((e) => e.includes(expect))) fail(`route check accepts ${what} (expected "${expect}")`);
  };
  refused((f) => { byIdOf(f)["business-analysis"].lanes.push(P); }, `"${P}" does not enforce a step's tool limits, and this row only reads`, "V4 Pro in a reading row that is not a review");
  refused((f) => { byIdOf(f)["release"].lanes.push(P); }, `"${P}" does not enforce a step's tool limits, and this row is security and release`, "V4 Pro in a security row that writes");
  refused((f) => { delete f.lanes[P].fullShellReviews; }, `"${P}" does not enforce a step's tool limits`, "V4 Pro in a review row without fullShellReviews");
  refused((f) => { f.lanes[F].fullShellReviews = true; }, "a lane with tier: cheap never reviews with a full shell", "fullShellReviews on a cheap lane");
  refused((f) => { f.lanes[P].fullShellReviews = "yes"; }, "fullShellReviews: must be true or false", "a fullShellReviews that is not a boolean");
  function byIdOf(f) { return Object.fromEntries(f.rows.map((r) => [r.id, r])); }

  const lab = mkdtempSync(join(tmpdir(), "kit-route-r-"));
  try {
    const project = join(lab, "project");
    mkdirSync(join(project, ".xezar"), { recursive: true });
    writeFileSync(join(project, ".xezar/workspace.json"), "{}\n");
    writeFileSync(join(project, ".xezar/agent-accounts.json"), JSON.stringify({ version: 1, accounts: [
      { id: "acct-one", provider: "claude" }, { id: "acct-three", provider: "codex" }] }));
    const copy = structuredClone(routing);
    copy.tools.claude.rotation = ["acct-one"];
    copy.tools.codex.rotation = ["acct-three"];
    writeFileSync(join(project, ".xezar/routing.json"), JSON.stringify(copy));
    const run = (tools, ...args) => execFileSync("node", [ROUTE, "--file", ".xezar/routing.json", ...args], {
      cwd: project, encoding: "utf8", stdio: "pipe", env: { ...process.env, KIT_TEST_ROUTE_TOOLS: tools } });
    const lanesOf = (out) => out.split("\n").filter((l) => l.startsWith("lane=")).map((l) => l.split(" ")[0].slice(5));
    const esc = P.replace(/[/.]/g, "\\$&");

    // A machine with pi and the model: V4 Pro is first in a mid-size row.
    if (lanesOf(run("claude,codex,pi", "unit-tests"))[0] !== P) fail(`route unit-tests does not start with ${P} on a machine that has it`);
    // A machine without pi at all: no V4 Pro lane, with the reason.
    const noPi = run("claude,codex", "unit-tests");
    if (lanesOf(noPi).includes(P) || !new RegExp(`^removed=${esc} reason=the pi program is not installed here$`, "m").test(noPi)) fail(`route gives ${P} on a machine without pi:\n${noPi}`);
    // A machine whose pi config lacks the model: the leader's lane cache, written from list_models,
    // marks it unavailable, and route drops it – the owner's off switch.
    const cacheDir = join(project, ".local/xezar/runtime");
    mkdirSync(cacheDir, { recursive: true });
    writeFileSync(join(cacheDir, "lanes.json"), JSON.stringify({ schemaVersion: 1, checkedAt: new Date().toISOString(), lanes: { [P]: { available: false, reason: "not in list_models for pi" } } }));
    const noModel = run("claude,codex,pi", "unit-tests", "full-cold-review", "security-review");
    if (lanesOf(noModel).includes(P) || !new RegExp(`^removed=${esc} reason=unavailable in the lane cache: not in list_models for pi$`, "m").test(noModel)) fail(`route gives ${P} on a machine whose pi config lacks the model:\n${noModel}`);
    writeFileSync(join(cacheDir, "lanes.json"), JSON.stringify({ schemaVersion: 1, checkedAt: new Date().toISOString(), lanes: {} }));

    // Reviews: for a Claude author V4 Pro is the first independent lane, then Astra.
    const claudeAuthor = lanesOf(run("claude,codex,pi", "full-cold-review", "--author", "claude/opus"));
    if (claudeAuthor.join(",") !== `${P},codex/gpt-6-astra`) fail(`route full-cold-review --author claude/opus gave [${claudeAuthor}], expected ${P} then codex/gpt-6-astra`);
    // For DeepSeek-written work Sonnet comes before Astra, and a security row drops V4 Pro (same vendor).
    const dsAuthor = lanesOf(run("claude,codex,pi", "scoped-recheck", "--author", F));
    if (dsAuthor[0] !== "claude/sonnet" || !dsAuthor.includes("codex/gpt-6-astra")) fail(`route scoped-recheck --author ${F} gave [${dsAuthor}], expected claude/sonnet first and codex/gpt-6-astra offered`);
    const dsSecurity = run("claude,codex,pi", "security-review", "--author", F);
    if (!new RegExp(`^removed=${esc} reason=author-chain: shared vendor with ${F.replace(/[/.]/g, "\\$&")}$`, "m").test(dsSecurity)) fail(`route security-review keeps ${P} for a DeepSeek author:\n${dsSecurity}`);
    // V4 Pro reviews in a security row when nothing of its vendor wrote the work.
    if (!lanesOf(run("claude,codex,pi", "security-review", "--author", "codex/gpt-6-sol")).includes(P)) fail(`route security-review does not offer ${P} for a Codex author`);
  } catch (error) {
    fail(`the #89 route fixture could not run: ${error.message}\n${error.stderr ?? ""}`);
  } finally {
    rmSync(lab, { recursive: true, force: true });
  }
}
// 3.1.0-stream-R:end

if (problems) {
  console.error(`\nkit catalog: ${problems} problem(s)`);
  process.exit(1);
}
console.log(
  `Kit catalog OK (${workflowFiles.length} workflows, ${skillFiles.length} skills, ` +
  `${rows.length} rows over ${classes.length} classes; every workflow routed, every count in step, both guard scripts run).`,
);
