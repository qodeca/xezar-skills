/**
 * T0 selection (#123): which gate commands a change can affect. Users: gate-changed.mjs and
 * check-gate-map.mjs – never run-gate.mjs or gate-runner.mjs, which run every command in full
 * (check-gate-map.mjs holds that).
 *
 * The map, scripts/gate-map.json, names three lists: `everything` – globs whose change alters how
 * every command runs; `always` – the commands cheap enough to run on any change; `rules` – path
 * globs, each with the commands that read those paths. A change set selects `always` plus the
 * commands of every rule one of its paths matches, and everything when the change set could not
 * be computed, when the map cannot be used, when a path matches `everything`, holds a control
 * character, or is mapped by no rule. A deleted path selects like any other. Globs are the kit's
 * trust patterns – literals, `?`, `*` within a segment, `**` as a whole segment, anchored at both
 * ends – matched by the kit's own matcher. A path is printed only through shown(), so a control
 * character in a file name never reaches a terminal or a CI log as itself.
 *
 * node:* imports and the kit's config-grammar.mjs only.
 */
import { execFileSync } from "node:child_process";
import { lstatSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { matchTrustPattern, parseTrustPattern } from "../../skills/xez-onboard-opinionated/kit/checks/lib/config-grammar.mjs";

export const MAP_FILE = "scripts/gate-map.json";
export const FULL_LINT = "bash scripts/lint.sh";
// The characters the changed-file arguments to lint may take: a Windows command line holds 32,767.
const LINT_ARGS_BUDGET = 24000;
// A name lint gets as an argument: letters, digits, . _ @ + / - and space. Anything else – a shell
// metacharacter, a backslash, a quote, a control character – gets the whole of lint instead.
const SAFE_NAME = /^[A-Za-z0-9._@+/ -]+$/;
const CONTROL = /[\u0000-\u001f\u007f]/;
const STATUS = /^[ADMTUX]$/; // git diff --name-status --no-renames: one letter, one path

const parsedGlobs = new Map();

/** Does `path` match `glob`, the whole path? Throws, naming the glob, when the kit's grammar refuses it. */
export function matches(glob, path) {
  let tokens = parsedGlobs.get(glob);
  if (!tokens) {
    const parsed = parseTrustPattern(glob);
    if (parsed.error) throw new Error(`the map's glob ${glob} is not valid: ${parsed.error}`);
    tokens = parsed.tokens;
    parsedGlobs.set(glob, tokens);
  }
  return matchTrustPattern(tokens, path);
}

/** `text` with every control character written as \uXXXX: safe to print on one line. Pure. */
export function shown(text) {
  return String(text).replace(/[\u0000-\u001f\u007f]/g, (ch) => `\\u${ch.charCodeAt(0).toString(16).padStart(4, "0")}`);
}

/** The map at <root>/scripts/gate-map.json. Throws, naming the problem, when it does not have the map's shape. */
export function readMap(root) {
  let map;
  try {
    map = JSON.parse(readFileSync(join(root, MAP_FILE), "utf8"));
  } catch (error) {
    throw new Error(`${MAP_FILE} could not be read: ${error.message}`);
  }
  const strings = (value) => Array.isArray(value) && value.length > 0 && value.every((item) => typeof item === "string" && item !== "");
  for (const key of ["everything", "always"]) {
    if (!strings(map?.[key])) throw new Error(`${MAP_FILE}: ${key} must be a non-empty list of strings`);
  }
  if (!Array.isArray(map.rules)) throw new Error(`${MAP_FILE}: rules must be a list`);
  map.rules.forEach((rule, index) => {
    if (!strings(rule?.paths) || !strings(rule?.commands)) {
      throw new Error(`${MAP_FILE}: rule ${index + 1} needs a non-empty list of paths and a non-empty list of commands`);
    }
  });
  return map;
}

/**
 * The records of `git diff --name-status --no-renames -z`: [{ status, path }]. Throws on anything
 * else – a rename or copy record (R100, C75) included, so a call that lost --no-renames, and would
 * hide a rename's old path, fails and selects everything. Pure.
 */
export function parseNameStatus(output) {
  const fields = output.split("\0");
  if (fields.at(-1) === "") fields.pop();
  if (fields.length % 2 !== 0) throw new Error("a git diff record without its path");
  const changes = [];
  for (let i = 0; i < fields.length; i += 2) {
    if (!STATUS.test(fields[i])) throw new Error(`unexpected status '${shown(fields[i])}'`);
    changes.push({ status: fields[i], path: fields[i + 1] });
  }
  return changes;
}

/**
 * The files changed since the merge-base of HEAD and origin/<baseBranch>: committed, staged and
 * unstaged (`git diff --no-renames`, so a rename is a delete plus an add), and untracked files
 * that are not ignored (status A). Returns { changes: [{ status, path }], error: null }, or
 * { changes: null, error } when any step fails. Every git call is an argv, never a shell line.
 */
export function changedFiles(root, baseBranch) {
  const git = (args) => execFileSync("git", ["--no-optional-locks", ...args], {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    maxBuffer: 64 * 1024 * 1024,
  });
  if (typeof baseBranch !== "string" || baseBranch === "") return { changes: null, error: ".xezar/pipeline/config.json names no baseBranch" };
  const base = `origin/${baseBranch}`;
  try {
    git(["rev-parse", "--verify", "-q", `${base}^{commit}`]);
  } catch {
    return { changes: null, error: `${base} is not here (a fresh clone or a fork: git fetch origin ${baseBranch})` };
  }
  let step = `find the merge-base of HEAD and ${base}`;
  try {
    const mergeBase = git(["merge-base", "HEAD", base]).trim();
    step = `list the changes since ${mergeBase}`;
    const changes = parseNameStatus(git(["diff", "--name-status", "--no-renames", "-z", mergeBase, "--"]));
    step = "list the untracked files";
    const seen = new Set(changes.map((change) => change.path));
    for (const path of git(["ls-files", "-o", "--exclude-standard", "-z"]).split("\0")) {
      if (path !== "" && !seen.has(path)) changes.push({ status: "A", path });
    }
    return { changes, error: null };
  } catch (error) {
    const detail = String(error.stderr ?? "").trim().split("\n")[0] || error.message;
    return { changes: null, error: `git could not ${step}: ${shown(detail)}` };
  }
}

/**
 * The commands a change set selects, in `commands` (validation.commands) order:
 * { commands, everything, reasons }. `changes` null means the change set could not be
 * computed, `why` says why; then, and for any path that matches `everything`, holds a control
 * character or is mapped by no rule, every command is selected. Throws when a glob is invalid
 * (selectSafely turns that into everything). Pure.
 */
export function selectCommands(changes, map, commands, why = "no change set") {
  const all = (reasons) => ({ commands: [...commands], everything: true, reasons });
  if (changes === null) return all([`the changed files could not be computed: ${shown(why)}`]);
  if (changes.length === 0) return { commands: commands.filter((command) => map.always.includes(command)), everything: false, reasons: ["nothing changed"] };
  const reasons = [];
  let everything = false;
  const selected = new Set(map.always);
  const firstPath = new Map(); // a selected command that is not in `always` → the first path that selected it
  for (const { path } of changes) {
    if (CONTROL.test(path)) {
      reasons.push(`a changed path holds a control character: ${shown(path)}`);
      everything = true;
      continue;
    }
    if (map.everything.some((glob) => matches(glob, path))) {
      reasons.push(`${shown(path)} changes how every command runs`);
      everything = true;
      continue;
    }
    const hits = map.rules.filter((rule) => rule.paths.some((glob) => matches(glob, path)));
    if (hits.length === 0) {
      reasons.push(`no rule maps ${shown(path)}`);
      everything = true;
      continue;
    }
    for (const command of hits.flatMap((rule) => rule.commands)) {
      selected.add(command);
      if (!map.always.includes(command) && !firstPath.has(command)) firstPath.set(command, path);
    }
  }
  if (everything) return all(reasons);
  const chosen = commands.filter((command) => selected.has(command));
  const byPath = new Map();
  for (const command of chosen) {
    const path = firstPath.get(command);
    if (path !== undefined) byPath.set(path, [...(byPath.get(path) ?? []), command]);
  }
  for (const [path, list] of byPath) reasons.push(`${shown(path)} selects ${list.join(", ")}`);
  if (reasons.length === 0) reasons.push("no changed path selects more than the always list");
  return { commands: chosen, everything: false, reasons };
}

/**
 * selectCommands with the map from `loadMap()`; when the map cannot be read or used (a shape
 * error, a glob the grammar refuses), every command, with the reason. Pure but for `loadMap`.
 */
export function selectSafely(changes, loadMap, commands, why) {
  try {
    return selectCommands(changes, loadMap(), commands, why);
  } catch (error) {
    return { commands: [...commands], everything: true, reasons: [`the map could not be used: ${shown(error.message)}`] };
  }
}

/** Whether `path` under `root` is a regular file itself – a link to one is not, so lint never reads outside the tree. */
export function isPlainFile(root, path) {
  try {
    return lstatSync(join(root, path)).isFile();
  } catch {
    return false;
  }
}

/**
 * The lint task for T0. The whole of lint – the plain command – when everything is selected,
 * when any change is a deletion (the old side of a rename too: with --files, the references and
 * names checks read only the listed files, so a pointer to the deleted file would go unseen),
 * when no changed file still exists, when a name is not a plain one (SAFE_NAME: no shell
 * metacharacter, backslash, quote or control character), when a path starts with `-` (lint would
 * read it as an option), or when the names outgrow a Windows command line. Otherwise lint on the
 * changed files that exist, each path its own argument – never a shell string. `exists(path)` says
 * whether a path is a file. Pure.
 */
export function lintTask(changes, exists, { everything = false } = {}) {
  if (everything || changes === null) return FULL_LINT;
  if (changes.some((change) => change.status === "D")) return FULL_LINT;
  const paths = [...new Set(changes.map((change) => change.path))].filter((path) => exists(path));
  if (paths.length === 0) return FULL_LINT;
  if (paths.some((path) => !SAFE_NAME.test(path))) return FULL_LINT;
  if (paths.some((path) => path.startsWith("-"))) return FULL_LINT;
  if (paths.reduce((sum, path) => sum + path.length + 3, 0) > LINT_ARGS_BUDGET) return FULL_LINT;
  const label = `${FULL_LINT} --files (${paths.length} changed file${paths.length === 1 ? "" : "s"})`;
  return { label, argv: ["scripts/lint.sh", "--files", ...paths] };
}
