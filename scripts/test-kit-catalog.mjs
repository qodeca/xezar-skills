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
//   3. every workflow has a routing row, and every workflow a row names exists;
//   4. every count of rows and classes written in prose equals the table it describes;
//   5. the grammar of the guarded workflows' config keys tells a typo from an honest empty list;
//   6. a guard step sits where it is worth something: before the install it exists to save, and
//      in `deploy`, between the agent that writes the authority and the agent that dispatches;
//   7. the two guard scripts, RUN, in a throwaway repository with a remote -- a shell script
//      nothing executes is a description of a guard, and every refusal below was once only that.
//
// Run: node scripts/test-kit-catalog.mjs

import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const SKILL = "skills/xez-onboard-opinionated";
const KIT = join(root, SKILL, "kit");
const ROWS = `${SKILL}/references/routing-rows.md`;

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
// A row is a table line opening with its number. Columns: #, task kind, workflow, trigger,
// class, never. A workflow cell may name more than one file.
// A pipe inside a code span, or escaped as `\|`, is text and not a column edge. Splitting on
// every `|` would shift the cells of the first row whose trigger quotes a shell pipeline, and the
// class would then be read out of the wrong column without anything failing.
const splitRow = (line) => {
  const cells = [];
  let cell = "";
  let inCode = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === "\\" && line[i + 1] === "|") { cell += "|"; i += 1; continue; }
    if (ch === "`") inCode = !inCode;
    if (ch === "|" && !inCode) { cells.push(cell.trim()); cell = ""; continue; }
    cell += ch;
  }
  cells.push(cell.trim());
  return cells;
};
{
  const probe = splitRow("| 1 | a \\| b | `x | y` | c |");
  if (probe.length !== 6 || probe[2] !== "a | b" || probe[3] !== "`x | y`" || probe[4] !== "c") {
    fail(`the routing row splitter no longer keeps an escaped or backticked pipe inside its cell: ${JSON.stringify(probe)}`);
  }
}
const rowsText = readFileSync(join(root, ROWS), "utf8");
const rows = rowsText
  .split("\n")
  .filter((line) => /^\| \d+ \|/.test(line))
  .map((line) => {
    const cells = splitRow(line);
    return {
      number: Number(cells[1]),
      workflows: [...cells[3].matchAll(/`([a-z0-9-]+\.yaml)`/g)].map((m) => m[1]),
      cls: cells[5],
    };
  });
const workflowFiles = readdirSync(join(KIT, "workflows")).filter((name) => name.endsWith(".yaml")).sort();
const routed = new Set(rows.flatMap((row) => row.workflows));

if (rows.length === 0) fail(`${ROWS} has no table rows this test can read`);
rows.forEach((row, index) => {
  if (row.number !== index + 1) fail(`${ROWS}: row ${index + 1} is numbered ${row.number} -- the precedence rules cite rows by number`);
  if (row.workflows.length === 0) fail(`${ROWS}: row ${row.number} names no workflow`);
  if (!row.cls) fail(`${ROWS}: row ${row.number} has no class`);
});
for (const name of workflowFiles) {
  if (!routed.has(name)) fail(`kit/workflows/${name} is named by no routing row -- installed, valid, and unreachable`);
}
for (const name of routed) {
  if (!workflowFiles.includes(name)) fail(`${ROWS} routes to ${name}, and kit/workflows/ has no such file`);
}

// --- 4. Counts written in prose ------------------------------------------------------------------
// A number standing directly before "rows" or "classes" in these files is a claim about the
// table, and it has to be the table's number. Spelled or in digits; a placeholder is not a claim.
// For ROWS a number under five is not one either -- "when two rows are equally specific" talks
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
  `${SKILL}/references/routing-rows.md`,
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

if (problems) {
  console.error(`\nkit catalog: ${problems} problem(s)`);
  process.exit(1);
}
console.log(
  `Kit catalog OK (${workflowFiles.length} workflows, ${skillFiles.length} skills, ` +
  `${rows.length} rows over ${classes.length} classes; every workflow routed, every count in step, both guard scripts run).`,
);
