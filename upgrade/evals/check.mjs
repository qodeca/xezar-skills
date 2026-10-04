#!/usr/bin/env node
// check.mjs – grade one run of the upgrade prompt against an eval case (plan §7, "The Claude
// merge step … an eval set … each with its expected invariants").
//
//   node upgrade/evals/check.mjs <case dir> <result dir> [--no-verify]
//
// <case dir>   upgrade/evals/cases/<name>/, holding case.json and expected.json
// <result dir> what the run left behind:
//   project/   the project after the run (the tree build.mjs made, with the run's branch)
//   origin.git its bare remote, as build.mjs made it
//   run.json   the run record, written by whoever drove the prompt:
//              { "finished": <bool>, "stops": [ { "step": <n>, "path": "<path>",
//                "rule": "<1-6 from the prompt's stop list, or the planner's stop reason>",
//                "question": "<text>" } ],
//                "answered": [ { "step": <n>, "path": "<path>", "rule": "<1-6>", "answer": "<id>" } ],
//                "skipped": [ "<step and why>" ] }
//              A stop is answered only by the case's fixed `ownerAnswers` (build.mjs), named by
//              its id; any other stop ends the run. Every result also gets an `ownerAnswers`
//              line: FAIL when an `answered` item matches no case answer by id, path and rule.
//
// The starting tree is rebuilt from the case (build.mjs) in a temporary folder, so "start" is
// the case, not whatever the run left on the base branch. "Target" is the 3.1.0-candidate kit
// in this checkout, rendered with the fixture's placeholder values.
//
// expected.json: { "invariants": [ <invariant>, … ] }. Invariant types:
//   finished                          run.json says the run finished, with no unanswered stop
//   stop        path, rules[]         run.json has a stop on path whose rule is one of rules
//   branch                            on xezar/upgrade-3.1.0, clean tree, report committed
//   baseUntouched                     the base branch still holds the case's tree; nothing pushed
//   equalsStart path                  the file is byte-equal to the case's
//   equalsTarget path                 the file is byte-equal to the 3.1.0 kit's
//   contains    path, lines[]         the file holds each text
//   notContains path, lines[]         the file holds none of them
//   sectionEqualsStart path, heading  the "## <heading>" section is byte-equal to the case's
//   jsonEqualsStart path, keys[]      each dotted key has the case's value
//   jsonEquals  path, key, value      the dotted key has this value
//   jsonAbsent  path, key             the dotted key is not set
//   jsonArrayHas path, key, field, match   the list at key has an item whose field matches the regex
//   registerKept id, confirmed        the entry is still there, same files, Confirmed as given
//   registerEntry covers, confirmed   some entry lists the path with that Confirmed value
//   reportContains text[]             the report holds each text (case-insensitive)
//   reportSection heading, contains[] the report's "## <heading>" section holds each text
//   verify      allow[]               upgrade/tools/verify.mjs on a copy passes; a red drift
//                                     check is accepted only when every drift= reason is allowed
//   anyOf       of[]                  at least one of the invariants holds
//   allOf       of[]                  all of them hold
//
// Output: one "PASS|FAIL <invariant> – <detail>" line each, then "result=pass|fail".
// Exit 0 all passed; 1 a failure; 2 cannot run. Offline: no network (gh is pointed at an empty
// config), nothing in the result is changed.

import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { build, loadCase, loadFixture, targetText, ROOT } from "./build.mjs";
import { parseRegister } from "../tools/lib/register.mjs";

/** Every invariant type grade() understands; scripts/test-kit-facts.mjs checks each case against it. */
export const INVARIANT_TYPES = [
  "finished", "stop", "branch", "baseUntouched", "equalsStart", "equalsTarget", "contains", "notContains",
  "sectionEqualsStart", "jsonEqualsStart", "jsonEquals", "jsonAbsent", "jsonArrayHas", "registerKept",
  "registerEntry", "reportContains", "reportSection", "verify", "anyOf", "allOf",
];

const TARGET = "3.1.0";
const BRANCH = `xezar/upgrade-${TARGET}`;
const REPORT = `.xezar/upgrade-reports/${TARGET}.md`;

const git = (cwd, ...args) => execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
const tryGit = (cwd, ...args) => {
  try {
    return git(cwd, ...args);
  } catch {
    return null;
  }
};
const readOr = (dir, rel) => (existsSync(join(dir, rel)) ? readFileSync(join(dir, rel), "utf8") : null);
const dotted = (obj, key) => key.split(".").reduce((o, k) => (o && typeof o === "object" && k in o ? o[k] : undefined), obj);
const json = (dir, rel) => {
  const t = readOr(dir, rel);
  return t == null ? undefined : JSON.parse(t);
};
const section = (text, heading) => {
  if (text == null) return null;
  const lines = text.split("\n");
  const i = lines.findIndex((l) => l.trim() === `## ${heading}`);
  if (i < 0) return null;
  let j = i + 1;
  while (j < lines.length && !/^## /.test(lines[j])) j += 1;
  return lines.slice(i, j).join("\n");
};

export function grade(caseDir, resultDir, { runVerify = true } = {}) {
  const spec = loadCase(caseDir);
  const fx = loadFixture(spec.base);
  const expected = JSON.parse(readFileSync(join(caseDir, "expected.json"), "utf8"));
  const project = join(resultDir, "project");
  const origin = join(resultDir, "origin.git");
  if (!existsSync(project)) throw new Error(`${resultDir} has no project/`);
  const run = existsSync(join(resultDir, "run.json")) ? JSON.parse(readFileSync(join(resultDir, "run.json"), "utf8")) : null;

  const scratch = mkdtempSync(join(tmpdir(), "upgrade-eval-"));
  const cleanup = () => rmSync(scratch, { recursive: true, force: true });
  try {
    const start = build(caseDir, join(scratch, "start")).project;
    const startBase = git(start, "rev-parse", "--abbrev-ref", "HEAD");
    const report = readOr(project, REPORT);
    const reg = () => parseRegister(readOr(project, ".xezar/LOCAL-PATCHES.md")).entries;
    const startReg = parseRegister(readOr(start, ".xezar/LOCAL-PATCHES.md")).entries;

    const check = (inv) => {
      switch (inv.type) {
        case "finished":
          if (!run) return [false, "no run.json"];
          {
            // A stop the case's ownerAnswers answered (run.json `answered`) no longer blocks.
            const open = (run.stops ?? []).filter((st) => !(run.answered ?? []).some((a) => a.path === st.path && String(a.rule) === String(st.rule)));
            return [run.finished === true && !open.length, `finished=${run.finished} unanswered stops=${open.length}`];
          }
        case "stop": {
          const hit = (run?.stops ?? []).find((s) => s.path === inv.path && inv.rules.map(String).includes(String(s.rule)));
          const seen = (run?.stops ?? []).map((s) => `${s.path}:${s.rule}`).join(", ") || "none";
          return [Boolean(hit), `stop on ${inv.path} with rule ${inv.rules.join("|")}; run stops: ${seen}`];
        }
        case "branch": {
          const head = tryGit(project, "rev-parse", "--abbrev-ref", "HEAD");
          const dirty = tryGit(project, "status", "--porcelain");
          const committed = tryGit(project, "cat-file", "-e", `HEAD:${REPORT}`) !== null;
          return [head === BRANCH && dirty === "" && committed, `branch=${head} clean=${dirty === ""} report-committed=${committed}`];
        }
        case "baseUntouched": {
          const want = git(start, "rev-parse", "HEAD^{tree}");
          const got = tryGit(project, "rev-parse", `${startBase}^{tree}`);
          const pushed = tryGit(origin, "branch", "--list", BRANCH);
          return [got === want && !pushed, `base tree ${got === want ? "unchanged" : "CHANGED"}; pushed upgrade branch: ${pushed ? "yes" : "no"}`];
        }
        case "equalsStart":
          return [readOr(project, inv.path) === readOr(start, inv.path), inv.path];
        case "equalsTarget": {
          const t = targetText(inv.path, fx.renderInputs);
          return [t !== null && readOr(project, inv.path) === t, inv.path];
        }
        case "contains":
        case "notContains": {
          const t = readOr(project, inv.path) ?? "";
          const bad = inv.lines.filter((l) => t.includes(l) !== (inv.type === "contains"));
          return [bad.length === 0, `${inv.path}${bad.length ? `: ${inv.type === "contains" ? "missing" : "still has"} ${JSON.stringify(bad)}` : ""}`];
        }
        case "sectionEqualsStart": {
          const a = section(readOr(project, inv.path), inv.heading);
          const b = section(readOr(start, inv.path), inv.heading);
          return [a !== null && a === b, `${inv.path} "## ${inv.heading}"`];
        }
        case "jsonEqualsStart": {
          const a = json(project, inv.path);
          const b = json(start, inv.path);
          const bad = inv.keys.filter((k) => JSON.stringify(dotted(a, k)) !== JSON.stringify(dotted(b, k)));
          return [bad.length === 0, `${inv.path}${bad.length ? `: changed ${bad.join(", ")}` : ""}`];
        }
        case "jsonEquals": {
          const v = dotted(json(project, inv.path), inv.key);
          return [JSON.stringify(v) === JSON.stringify(inv.value), `${inv.path} ${inv.key}=${JSON.stringify(v)}`];
        }
        case "jsonAbsent": {
          const v = dotted(json(project, inv.path), inv.key);
          return [v === undefined, `${inv.path} ${inv.key}${v === undefined ? " unset" : `=${JSON.stringify(v)}`}`];
        }
        case "jsonArrayHas": {
          const list = dotted(json(project, inv.path), inv.key);
          const re = new RegExp(inv.match);
          const ok = Array.isArray(list) && list.some((x) => typeof x?.[inv.field] === "string" && re.test(x[inv.field]));
          return [ok, `${inv.path} ${inv.key}[].${inv.field} ~ /${inv.match}/`];
        }
        case "registerKept": {
          const before = startReg.find((e) => e.id === inv.id);
          const now = reg().find((e) => e.id === inv.id);
          const ok = before && now && JSON.stringify(now.files) === JSON.stringify(before.files) && now.confirmed === (inv.confirmed === "yes");
          return [Boolean(ok), `${inv.id} ${now ? `files=${now.files.join(",")} confirmed=${now.confirmed ? "yes" : "no"}` : "missing"}`];
        }
        case "registerEntry": {
          const hit = reg().find((e) => e.files.includes(inv.covers) && e.confirmed === (inv.confirmed === "yes"));
          return [Boolean(hit), `an entry covering ${inv.covers} with Confirmed: ${inv.confirmed}${hit ? ` (${hit.id})` : ""}`];
        }
        case "reportContains": {
          const low = (report ?? "").toLowerCase();
          const bad = inv.text.filter((t) => !low.includes(t.toLowerCase()));
          return [report != null && bad.length === 0, report == null ? "no report" : bad.length ? `missing ${JSON.stringify(bad)}` : inv.text.join(", ")];
        }
        case "reportSection": {
          const s = section(report, inv.heading);
          const low = (s ?? "").toLowerCase();
          const bad = (inv.contains ?? []).filter((t) => !low.includes(t.toLowerCase()));
          return [s !== null && bad.length === 0, s === null ? `no "## ${inv.heading}" section` : bad.length ? `"${inv.heading}" lacks ${JSON.stringify(bad)}` : `"${inv.heading}"`];
        }
        case "verify": {
          if (!runVerify) return [true, "skipped (--no-verify)"];
          const copy = join(scratch, "verify");
          rmSync(copy, { recursive: true, force: true });
          cpSync(project, copy, { recursive: true });
          const plan = join(copy, ".local/xezar/scratch/upgrade/plan.json");
          if (!existsSync(plan)) return [false, "no plan.json in the result"];
          let out;
          try {
            out = execFileSync("node", [join(ROOT, "upgrade/tools/verify.mjs"), "--project", copy, "--target", TARGET, "--plan", plan, "--checks", "drift,catalog,route"], {
              encoding: "utf8",
              stdio: ["ignore", "pipe", "pipe"],
              env: { ...process.env, GH_CONFIG_DIR: join(scratch, "gh"), GH_TOKEN: "", GITHUB_TOKEN: "" },
            });
          } catch (e) {
            out = `${e.stdout ?? ""}${e.stderr ?? ""}`;
          }
          const problems = out.split("\n").filter((l) => l.startsWith("problem="));
          const failed = [...out.matchAll(/^check=(\S+) status=fail/gm)].map((m) => m[1]);
          const reasons = [...out.matchAll(/^\s*drift=.* reason=(\S+)/gm)].map((m) => m[1]);
          const allow = new Set(inv.allow ?? []);
          const badChecks = failed.filter((c) => !(c === "drift" && reasons.length && reasons.every((r) => allow.has(r))));
          const ok = problems.length === 0 && badChecks.length === 0 && /verify-status=(pass|fail)/.test(out);
          const detail = ok
            ? `verify-status=${/verify-status=(\S+)/.exec(out)?.[1]}${failed.length ? ` (drift red only for ${[...new Set(reasons)].join(", ")})` : ""}`
            : `${problems.join("; ")} ${badChecks.map((c) => `check=${c} fail`).join("; ")}`.trim() || out.trim().split("\n").slice(-3).join(" | ");
          return [ok, detail];
        }
        case "anyOf":
        case "allOf": {
          const rs = inv.of.map(check);
          const ok = inv.type === "anyOf" ? rs.some((r) => r[0]) : rs.every((r) => r[0]);
          return [ok, rs.map((r, i) => `${inv.of[i].type}:${r[0] ? "ok" : "no"}`).join(" ")];
        }
        default:
          return [false, `unknown invariant type ${inv.type}`];
      }
    };

    const results = expected.invariants.map((inv) => {
      let r;
      try {
        r = check(inv);
      } catch (e) {
        r = [false, `error: ${e.message}`];
      }
      return { inv, pass: r[0], detail: r[1] };
    });
    const given = spec.ownerAnswers ?? [];
    const invented = (run?.answered ?? []).filter(
      (a) => !given.some((g) => g.id === a.answer && g.paths.includes(a.path) && String(g.rule) === String(a.rule)),
    );
    results.push({
      inv: { type: "ownerAnswers" },
      pass: invented.length === 0,
      detail: invented.length
        ? `answered with no matching case answer: ${invented.map((a) => `${a.path}:${a.rule}=${a.answer}`).join(", ")}`
        : `${(run?.answered ?? []).length} answered, each from the case's ownerAnswers`,
    });
    return results;
  } finally {
    cleanup();
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const runVerify = !args.includes("--no-verify");
  const [caseDir, resultDir] = args.filter((a) => !a.startsWith("--"));
  if (!caseDir || !resultDir) {
    console.error("usage: node upgrade/evals/check.mjs <case dir> <result dir> [--no-verify]");
    process.exit(2);
  }
  let results;
  try {
    results = grade(resolve(caseDir), resolve(resultDir), { runVerify });
  } catch (e) {
    console.error(`check: ${e.message}`);
    process.exit(2);
  }
  for (const r of results) console.log(`${r.pass ? "PASS" : "FAIL"} ${r.inv.type} – ${r.detail}`);
  const ok = results.every((r) => r.pass);
  console.log(`result=${ok ? "pass" : "fail"}`);
  process.exit(ok ? 0 : 1);
}
