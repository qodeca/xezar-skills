/**
 * Named sections of a test script, so a caller can run some of them (#123).
 *
 * A script declares its section ids once, gates each block with `if (S.section("<id>")) {`, and
 * accepts `--only <id>` (repeatable; the ids a selected section needs run too) and `--sections`
 * (prints the declarations as one JSON line and exits before any section runs). A targeted run is
 * never a gate result: only the full run is. Every check stays reachable by a filter: `section()`
 * throws on an undeclared id, a full run fails when a declared id never ran, a targeted run fails
 * when a selected id ran nothing, and `require()` throws when a section reads the state of a
 * section that did not run (its `needs` entry is missing). A script that gives `count` also fails
 * a targeted run in which a selected section made no check, unless `mayBeEmpty` names that section
 * with the reason it may legitimately check nothing.
 *
 * XEZ_SECTIONS_TRACE=<file> is a mapping and proof aid only – it changes no result: each failure
 * the script reports through `trace()` is appended as one JSON line naming its section, and when
 * the script gives a `count`, `finish()` appends the number of checks each section made.
 *
 * Users: test-kit-facts.mjs, test-kit-catalog.mjs, test-upgrade.mjs, test-deps-units.mjs; the
 * guard suite (test-guards.mjs) names sections in its break cases. Imports node:fs only.
 */
import { appendFileSync } from "node:fs";

const OPTIONS = "the options are --only <check> and --sections";

/**
 * Parses argv. Pure. `selected` is null without `--only`; otherwise the named ids plus every id
 * they need, transitively, in declaration order. `error` is a usage message without the script
 * name, or null.
 */
export function parseOnly(argv, ids, needs = {}) {
  const named = [];
  let list = false;
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--sections") list = true;
    else if (arg === "--only") {
      if (i + 1 >= argv.length) return { selected: null, list, error: `--only needs a check id; the checks are: ${ids.join(" ")}` };
      const id = argv[(i += 1)];
      if (!ids.includes(id)) return { selected: null, list, error: `unknown check '${id}'; the checks are: ${ids.join(" ")}` };
      named.push(id);
    } else return { selected: null, list, error: `unknown option '${arg}'; ${OPTIONS}` };
  }
  if (named.length === 0) return { selected: null, list, error: null };
  const closure = new Set();
  const visit = (id) => {
    if (closure.has(id)) return;
    closure.add(id);
    for (const dep of needs[id] ?? []) visit(dep);
  };
  named.forEach(visit);
  return { selected: ids.filter((id) => closure.has(id)), list, error: null };
}

/** Throws when the declarations themselves are wrong: that is a bug in the script, not a usage error. */
function checkDeclarations(script, ids, needs, exclusive, mayBeEmpty) {
  const bug = (what) => { throw new Error(`${script}: ${what}`); };
  if (!Array.isArray(ids) || ids.length === 0) bug("sections() needs a non-empty list of ids");
  for (const id of ids) if (typeof id !== "string" || id === "") bug(`section ids are non-empty strings, not ${JSON.stringify(id)}`);
  if (new Set(ids).size !== ids.length) bug(`section ids must be unique: ${ids.join(" ")}`);
  const declared = (id, where) => { if (!ids.includes(id)) bug(`${where} names section '${id}', which is not declared`); };
  for (const [id, deps] of Object.entries(needs)) {
    declared(id, "needs");
    if (!Array.isArray(deps)) bug(`needs['${id}'] must be a list of ids`);
    for (const dep of deps) declared(dep, `needs['${id}']`);
  }
  for (const [where, reasons] of [["exclusive", exclusive], ["mayBeEmpty", mayBeEmpty]]) {
    for (const [id, why] of Object.entries(reasons)) {
      declared(id, where);
      if (typeof why !== "string" || why.trim() === "") bug(`${where}['${id}'] needs a one-line reason`);
    }
  }
}

/**
 * Declares a script's sections and reads its argv. Call it right after the imports: a usage error
 * exits 2 and `--sections` exits 0 before anything runs. `needs` maps an id to the ids whose state
 * it reads; `exclusive` maps an id to the reason it must not run beside other work; `count`, when
 * given, returns the script's running check count; `mayBeEmpty` maps an id to the reason it may
 * make no check (only read when `count` is given).
 */
export function sections(script, ids, { needs = {}, exclusive = {}, mayBeEmpty = {}, count = null, argv = process.argv.slice(2) } = {}) {
  checkDeclarations(script, ids, needs, exclusive, mayBeEmpty);
  const parsed = parseOnly(argv, ids, needs);
  if (parsed.error) {
    console.error(`${script}: ${parsed.error}`);
    process.exit(2);
  }
  if (parsed.list) {
    console.log(JSON.stringify({ script, ids, needs, exclusive }));
    process.exit(0);
  }
  const traceFile = process.env.XEZ_SECTIONS_TRACE || "";
  const targeted = parsed.selected !== null;
  const selected = parsed.selected ?? [...ids];
  const entered = new Set();
  let current = null; // the section whose block runs now; null before the first and after a skipped one
  const counts = {};
  let mark = 0; // every counter starts at 0
  const settle = () => { // credits the checks made since the last call to the section that made them
    if (!count) return;
    const key = current ?? "(outside)";
    counts[key] = (counts[key] ?? 0) + count() - mark;
    mark = count();
  };
  const known = (id) => {
    if (!ids.includes(id)) throw new Error(`${script}: section '${id}' is not declared`);
  };
  return {
    targeted,
    selected,
    section(id) {
      known(id);
      settle();
      const on = selected.includes(id);
      if (on) entered.add(id);
      current = on ? id : null;
      return on;
    },
    require(id) {
      known(id);
      if (!entered.has(id)) throw new Error(`${script}: this section needs section '${id}', which did not run – add it to needs`);
    },
    trace(message) {
      if (traceFile) appendFileSync(traceFile, `${JSON.stringify({ script, section: current, message: String(message) })}\n`);
    },
    finish() {
      settle();
      if (traceFile && count) appendFileSync(traceFile, `${JSON.stringify({ script, targeted, counts })}\n`);
      if (!targeted) return ids.filter((id) => !entered.has(id)).map((id) => `section ${id} never ran in a full run – its block is missing or gated by another id`);
      const notEntered = selected.filter((id) => !entered.has(id))
        .map((id) => `the filter selected ${id}, which ran no check – its block is missing or gated by another id`);
      const empty = count ? selected.filter((id) => entered.has(id) && !(id in mayBeEmpty) && !counts[id]) : [];
      return [...notEntered, ...empty.map((id) => `the filter selected ${id}, which made no check – a section that may check nothing says why in mayBeEmpty`)];
    },
    targetedLine(what) {
      return `${what} OK for a targeted run (checks: ${selected.join(", ")}) – only the full run is a gate result.`;
    },
  };
}
