#!/usr/bin/env node
// The upgrade tool, tested offline against committed fixtures (plan §7).
//
// What it proves, in order:
//   1. the building blocks: path containment, the register and machine-block grammars, the
//      TOML check, placeholder recovery;
//   2. the kit index is well formed, and – once package.json's version has its own index file
//      as the newest entry (the release PR) – that file equals the tree ("release check");
//   3. every synthetic install (scripts/fixtures/upgrade/<version>/) gets the class and base
//      confidence this file derives INDEPENDENTLY from the index, applies cleanly, applies twice
//      with no further change, and – after the obvious owner answers are given – equals a
//      fresh install of the tree: copied files byte-equal, owner files equal by key;
//   4. the customised fixture keeps exactly its customisations;
//   5. the hard cases: a drifted v1 manifest, a partly applied old upgrade, an untagged
//      install, a renamed kit file, pre-3.0 routing, unknown placeholder values, #49 files
//      carried as a local patch, a project hook, unsafe paths, a weakened safety check,
//      and a plan that went stale; then the prompt eval findings (upgrade/evals/RESULTS.md):
//      the target's unreleased development line is no base, an inferred base equal to the
//      target never keeps the file, `exit "$rc"` -> `exit 0` and an added `|| true` stop, safety
//      files kept or both-changed are flagged for reading, a routing field both sides changed
//      stops, and an entry already covering a file gets no second draft;
//   6. each 3.1.0 upgrade block's `Files:` matches the kit-index diff;
//   7. the drift check (stream U1's kit/checks/manifest-drift.mjs) on upgraded fixtures and
//      its own cases – skipped, and said so, while the kit does not ship it yet;
//   8. real-install snapshots under scripts/fixtures/upgrade/real/, when the owner adds them;
//   9. verify's repository check runs against the project, not the clone it is run from; each
//      tool answers --help; engine-min actions are evaluated against the engine version.
//
// It reads only committed files: no tags, no network.
//
// Run: node scripts/test-upgrade.mjs

import { execFileSync } from "node:child_process";
import {
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { gzipSync } from "node:zlib";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { sha256 } from "../upgrade/tools/lib/hash.mjs";
import { readPack } from "../upgrade/tools/lib/blobs.mjs";
import { render, extractInputs, normalisedMatch, placeholdersIn, RENDERED_REGIONS } from "../upgrade/tools/lib/rewrites.mjs";
import { assertRepoRelative, resolveInside, PathRefused } from "../upgrade/tools/lib/paths.mjs";
import { parseRegister } from "../upgrade/tools/lib/register.mjs";
import { parseBlocks, satisfies } from "../upgrade/tools/lib/machine-block.mjs";
import { tomlError } from "../upgrade/tools/lib/toml.mjs";
import { lineDistance } from "../upgrade/tools/lib/diff.mjs";
import { diffIndexes, indexFromTree, loadIndexes, SKILL_DIR } from "../upgrade/tools/lib/kit-index.mjs";
import { loadContext } from "../upgrade/tools/lib/context.mjs";
import { NOT_RECORDED, OWNER_CONFIG, OWNER_SHAPED } from "../upgrade/tools/lib/policy.mjs";
import { detect } from "../upgrade/tools/detect.mjs";
import { buildPlan, engineChecks, engineVersion, summary, upgradeEntries } from "../upgrade/tools/plan.mjs";
import * as planTool from "../upgrade/tools/plan.mjs";
import { applyPlan } from "../upgrade/tools/apply.mjs";
import { invariants, verify, manifestV2, projectChecks } from "../upgrade/tools/verify.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const FIX = join(root, "scripts/fixtures/upgrade");
const PACK = join(FIX, "blobs.json.gz.hex");
const KIT_SKILL = join(root, SKILL_DIR);
const TARGET = "3.1.0";
const pack = readPack(PACK);
const history = loadIndexes(join(root, "upgrade/kit-index"));
const tree = indexFromTree(KIT_SKILL, { version: TARGET });
const DRIFT = join(KIT_SKILL, "kit/checks/manifest-drift.mjs");
const HAS_DRIFT = existsSync(DRIFT);

let problems = 0;
let checks = 0;
const fail = (message) => {
  problems += 1;
  console.error(`FAIL  ${message}`);
};
const expect = (cond, message) => {
  checks += 1;
  if (!cond) fail(message);
};

const labs = [];
process.on("exit", () => {
  for (const d of labs) rmSync(d, { recursive: true, force: true });
});
const lab = (name) => {
  const d = mkdtempSync(join(tmpdir(), `upgrade-${name}-`));
  labs.push(d);
  return d;
};

// Checks run by verify.mjs must not reach the network: route.mjs asks `gh` for a login.
process.env.GH_CONFIG_DIR = lab("gh");
process.env.GH_TOKEN = "";
process.env.GITHUB_TOKEN = "";

const git = (dir, ...args) => execFileSync("git", args, { cwd: dir, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
const write = (dir, rel, text) => {
  mkdirSync(dirname(join(dir, rel)), { recursive: true });
  writeFileSync(join(dir, rel), text);
};
const read = (dir, rel) => (existsSync(join(dir, rel)) ? readFileSync(join(dir, rel), "utf8") : null);

function loadFixture(version) {
  return JSON.parse(readFileSync(join(FIX, version, "fixture.json"), "utf8"));
}

/** Write a fixture into a new git repository and commit it. */
function materialize(fx, { name = fx.version, edit = null } = {}) {
  const dir = lab(name.replace(/[^a-z0-9.-]/gi, "_"));
  const idx = history.find((v) => v.version === fx.version);
  for (const [p, blob] of Object.entries(fx.files)) {
    const text = pack[blob];
    if (text === undefined) throw new Error(`fixture ${fx.version}: blob ${blob} missing from the pack`);
    write(dir, p, idx.files[p].rewrite === "adapted" ? render(text, fx.renderInputs).text : text);
  }
  for (const [p, text] of Object.entries(fx.generated)) write(dir, p, text);
  write(dir, ".xezar/onboarding.json", `${JSON.stringify(fx.manifest, null, 2)}\n`);
  if (edit) edit(dir);
  git(dir, "init", "-q");
  git(dir, "add", "-A");
  git(dir, "-c", "user.name=fixture", "-c", "user.email=fixture@example.invalid", "commit", "-qm", "fixture");
  return dir;
}

const ctxFor = (dir, extra = {}) => loadContext({ project: dir, target: TARGET, blobRepo: null, blobPacks: [PACK], ...extra });

/** Every file under dir except .git and .local, as path -> sha256. */
function snapshot(dir) {
  const out = {};
  const walk = (d, prefix) => {
    for (const name of readdirSync(d).sort()) {
      if (prefix === "" && (name === ".git" || name === ".local")) continue;
      const full = join(d, name);
      const rel = `${prefix}${name}`;
      const st = lstatSync(full);
      if (st.isSymbolicLink()) out[rel] = "symlink";
      else if (st.isDirectory()) walk(full, `${rel}/`);
      else out[rel] = sha256(readFileSync(full));
    }
  };
  walk(dir, "");
  return out;
}
const sameSnapshot = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const byPath = (plan) => new Map(plan.files.map((f) => [f.path, f]));

const OPTIONAL = (p) => /^\.xezar\/pipeline\/(toolchains|browsers)\//.test(p) && p !== ".xezar/pipeline/browsers/chrome-devtools.md";

/** The target kit text for a path, rendered with the fixture's placeholder values. */
function fresh(p, inputs) {
  const e = tree.index.files[p];
  const raw = tree.kitFiles.get(`kit/${e.kitSource}`).toString("utf8");
  return e.rewrite === "adapted" ? render(raw, inputs).text : raw;
}

// ---------------------------------------------------------------------------------------
// 1. Building blocks
// ---------------------------------------------------------------------------------------
{
  for (const bad of ["../x", "a/../../x", "/etc/passwd", "C:\\x", "a\\b", "./a", "a//b", "", "a/./b"]) {
    let refused = false;
    try {
      assertRepoRelative(bad);
    } catch (e) {
      refused = e instanceof PathRefused;
    }
    expect(refused, `containment accepts the unsafe path ${JSON.stringify(bad)}`);
  }
  expect((() => { try { assertRepoRelative(".xezar/checks/route.mjs"); return true; } catch { return false; } })(), "containment refuses a clean path");

  const reg = parseRegister(
    "# Local patches\n\n## LP-3 – skip ci-watch for conflict repairs\n- Files: .xezar/checks/ci-watch.sh, .xezar/workflows/a.yaml\n- Reason: r\n- Upstream: qodeca/xezar-skills#54\n- Since: 2026-09-25\n- Confirmed: yes\n\n## LP-4 - second\n- Files: x\n- Reason: r\n- Upstream: local only\n- Since: 2026-09-26\n- Confirmed: no\n\n## LP-5 – broken\n- Files: y\n",
  );
  expect(reg.entries.length === 3 && reg.entries[0].files.length === 2 && reg.entries[0].confirmed && !reg.entries[1].confirmed, "register grammar: entries, files and Confirmed are not read");
  expect(reg.errors.some((e) => e.startsWith("LP-5: missing field Reason")), "register grammar: a missing required field is not reported");

  const blocks = parseBlocks("x\n```upgrade\nApplies-to: <3.1.0\nFiles: .xezar/a; .xezar/b =merge; .xezar/c =delete\nActions: restart-leader; per-machine=add-mcp-permission:mcp__chrome-devtools__emulate\n```\n", "t");
  expect(blocks.errors.length === 0 && blocks.blocks[0].files[1].mode === "merge" && blocks.blocks[0].actions.length === 2, "machine block: a valid block is not read");
  expect(parseBlocks("```upgrade\nApplies-to: <3.1.0\nActions: reboot-the-world\n```\n", "t").errors.some((e) => e.includes("unknown action")), "machine block: an unknown action is not refused");
  expect(parseBlocks("```upgrade\nFiles: a\n```\n", "t").errors.some((e) => e.includes("without Applies-to")), "machine block: a block without Applies-to is not refused");
  expect(satisfies("<3.1.0", "3.0.2+7140051874c0") && !satisfies("<3.0.0", "3.0.2") && satisfies(">=2.0.0 <3.0.0", "2.1.1") && satisfies("*", "1.2.0"), "machine block: version ranges or pseudo-versions compare wrongly");

  expect(tomlError(readFileSync(join(KIT_SKILL, "kit/codex/config.toml"), "utf8")) === null, "TOML check refuses the kit's own codex config");
  expect(tomlError("[a]\nb = [1,\n") !== null && tomlError("<<<<<<< mine\n") !== null, "TOML check accepts a broken file");

  const t = "Repo {{REPO_SLUG}} ships {{PRODUCT}}; again {{PRODUCT}}.\n";
  const inputs = extractInputs(t, "Repo acme/w ships Widget; again Widget.\n");
  expect(inputs && inputs.REPO_SLUG === "acme/w" && inputs.PRODUCT === "Widget", "placeholder values are not recovered from an adapted file");
  expect(extractInputs(t, "Repo acme/w ships Widget; again Gadget.\n") === null, "a placeholder filled two ways is accepted");
  expect(extractInputs("{{A}}{{B}}", "xy") === null, "adjacent placeholders (ambiguous) are accepted");
  expect(lineDistance("a\nb\nc", "a\nx\nc") === 2 && lineDistance("a", "a") === 0, "line distance is wrong");
}

// ---------------------------------------------------------------------------------------
// 2. The kit index
// ---------------------------------------------------------------------------------------
{
  expect(history.length > 0 && history[0].version === "1.2.0", "the kit index does not start at 1.2.0");
  for (const v of history) {
    expect(v.tag === null ? /\+[0-9a-f]{12}$/.test(v.version) : v.tag === `v${v.version}`, `kit index ${v.version}: tag and version disagree`);
    for (const [p, e] of Object.entries(v.files)) {
      try {
        assertRepoRelative(p);
      } catch {
        fail(`kit index ${v.version}: unsafe installed path ${p}`);
      }
      if (e.rewrite !== "generated" && !(/^[0-9a-f]{40}$/.test(e.kitBlob) && /^[0-9a-f]{64}$/.test(e.sha256) && e.kitSource)) {
        fail(`kit index ${v.version}: ${p} lacks kitSource, kitBlob or sha256`);
      }
    }
  }
  expect(Object.keys(tree.index.files).some((p) => p.startsWith(".xezar/skills/xezar-")), "the copy map of the tree installs no role skill under .xezar/skills/xezar-*");
  expect(tree.unmapped.length === 0, `kit files with no installed path in the tree's copy map: ${tree.unmapped.join(", ")}`);
  // The release check: quiet until package.json's version is the newest indexed version.
  const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8")).version;
  const newest = history[history.length - 1];
  if (newest.version === pkg) {
    const d = diffIndexes(newest, tree.index);
    const stale = [...d.added, ...d.removed, ...d.changed];
    expect(stale.length === 0, `kit index for ${pkg} is stale: re-run scripts/build-kit-index.mjs (differs in ${stale.slice(0, 5).join(", ")}${stale.length > 5 ? ", …" : ""})`);
  }
}

// ---------------------------------------------------------------------------------------
// 3. Synthetic installs
// ---------------------------------------------------------------------------------------
const SYNTHETIC = readdirSync(FIX).filter((n) => existsSync(join(FIX, n, "fixture.json"))).sort();
expect(["1.2.0", "2.1.1", "3.0.0", "3.0.3"].every((v) => SYNTHETIC.includes(v)), "a synthetic fixture the plan names (1.2.0, 2.1.1, 3.0.0, 3.0.3) is missing");
expect(SYNTHETIC.some((v) => v.includes("+")), "no fixture installs from an untagged commit");

/** The class this test expects, derived from the index alone (not from the tool). */
function expectedClass(fx, p) {
  const idx = history.find((v) => v.version === fx.version);
  const te = tree.index.files[p];
  const blob = fx.files[p];
  if (OWNER_SHAPED.has(p) || te?.rewrite === "generated" || idx.files[p]?.rewrite === "generated") return null;
  if (p === ".claude/settings.local.json") return "per-machine";
  if (p === ".xezar/routing.json" && !blob && fx.generated[".xezar/docs/model-routing.md"]) return "routing-pre-3.0";
  if (!te) return blob ? "removed-from-kit" : null;
  if (!blob) return "new-in-kit";
  if (blob === te.kitBlob) return "unchanged-upstream";
  if (te.rewrite === "adapted") {
    const have = new Set(placeholdersIn(pack[blob]));
    const need = placeholdersIn(tree.kitFiles.get(`kit/${te.kitSource}`).toString("utf8"));
    if (need.some((k) => !have.has(k))) return "both-changed";
  }
  return "clean-update";
}

/** The obvious owner answers for an uncustomised install (the stand-in for Claude's step). */
function answerTrivially(dir, plan, fx) {
  for (const f of plan.files) {
    const te = tree.index.files[f.path];
    if (f.class === "routing-pre-3.0" && f.path === ".xezar/docs/model-routing.md") {
      unlinkSync(join(dir, f.path));
      continue;
    }
    if (!te || te.rewrite === "generated" || f.action === "skip-optional") continue;
    const approve =
      f.stops.every((s) => s === "permission-change") &&
      ["clean-update", "new-in-kit", "both-changed", "owner-shaped", "per-machine"].includes(f.class);
    if (!approve) continue;
    const want = fresh(f.path, fx.renderInputs);
    if (read(dir, f.path) !== want) write(dir, f.path, want);
  }
}

const upgraded = new Map(); // version -> dir after upgrade + answers (reused by later sections)

for (const version of SYNTHETIC) {
  const fx = loadFixture(version);
  const dir = materialize(fx);
  const ctx = ctxFor(dir);
  const plan = buildPlan(ctx);
  const files = byPath(plan);
  const hasPerFile = Boolean(fx.manifest.files);

  expect(plan.errors.length === 0, `${version}: plan errors: ${plan.errors.join("; ")}`);
  // class and confidence of every file
  const paths = new Set([...Object.keys(fx.files), ...Object.keys(tree.index.files)]);
  for (const p of paths) {
    const want = expectedClass(fx, p);
    const got = files.get(p);
    if (want === null) {
      if (got && !["owner-shaped", "per-machine", "routing-pre-3.0"].includes(got.class)) fail(`${version}: owner file ${p} classed ${got.class}`);
      continue;
    }
    if (want === "new-in-kit" && OPTIONAL(p)) {
      expect(got?.class === "new-in-kit" && got.action === "skip-optional", `${version}: optional descriptor ${p} not skipped (${got?.class}/${got?.action})`);
      continue;
    }
    expect(got?.class === want, `${version}: ${p} classed ${got?.class}, expected ${want}`);
    if (fx.files[p] && want !== "per-machine") {
      const conf = hasPerFile || fx.manifest.descriptors?.[p] ? "high" : "medium";
      expect(got?.base.confidence === conf, `${version}: ${p} base confidence ${got?.base.confidence}, expected ${conf}`);
    }
    if (want === "both-changed") expect(got?.missingKeys?.length > 0 && got.action !== "write-theirs", `${version}: ${p} has unknown placeholder values but is not held back`);
  }
  if (fx.generated[".xezar/docs/model-routing.md"]) {
    expect(files.get(".xezar/docs/model-routing.md")?.class === "routing-pre-3.0", `${version}: a pre-3.0 model-routing.md is not classed routing-pre-3.0`);
  }
  if (version.startsWith("3.")) {
    for (const f of plan.files) {
      expect(!["both-changed", "base-unknown", "unexplained-local-change"].includes(f.class) && !f.unexplained, `${version}: an uncustomised 3.x install has ${f.class} for ${f.path}`);
    }
  }

  // apply
  const ownerBefore = Object.fromEntries([...OWNER_SHAPED].map((p) => [p, read(dir, p)]));
  const r1 = applyPlan(ctx, plan);
  expect(r1.status === "ok", `${version}: apply refused: ${JSON.stringify(r1.refused)}`);
  for (const p of OWNER_SHAPED) {
    if (p === ".xezar/routing.json" && files.get(p)?.class === "routing-pre-3.0") continue; // written on purpose
    expect(read(dir, p) === ownerBefore[p], `${version}: apply wrote the owner-shaped file ${p}`);
  }
  for (const f of plan.files) {
    if (f.stops.length) continue;
    if (f.action === "write-theirs") expect(read(dir, f.path) === fresh(f.path, fx.renderInputs), `${version}: ${f.path} was not written with the target kit text`);
    if (f.action === "delete") expect(!existsSync(join(dir, f.path)), `${version}: ${f.path} was not deleted`);
  }
  for (const f of plan.files) {
    if (f.stops.length && f.action === "write-theirs") expect(read(dir, f.path) === null || f.mineSha256 === sha256(read(dir, f.path)), `${version}: ${f.path} has a stop but was written`);
  }

  // idempotent: apply the same plan again, and plan again
  const snap1 = snapshot(dir);
  const r2 = applyPlan(ctxFor(dir), plan);
  expect(r2.status === "ok" && sameSnapshot(snapshot(dir), snap1), `${version}: a second apply changed the tree`);
  const plan2 = buildPlan(ctxFor(dir));
  const again = plan2.files.filter((f) => ["write-theirs", "delete"].includes(f.action) && !f.stops.length);
  expect(again.length === 0, `${version}: after apply, a new plan still writes ${again.map((f) => f.path).join(", ")}`);

  // the obvious owner answers, then: equal to a fresh install
  answerTrivially(dir, plan, fx);
  for (const [p, e] of Object.entries(tree.index.files)) {
    if (e.rewrite === "generated") continue;
    if (OPTIONAL(p) && !fx.files[p]) {
      expect(!existsSync(join(dir, p)), `${version}: optional ${p} was installed`);
      continue;
    }
    expect(read(dir, p) === fresh(p, fx.renderInputs), `${version}: after the upgrade ${p} differs from a fresh ${TARGET} install`);
  }
  for (const p of Object.keys(fx.files)) {
    if (!tree.index.files[p]) expect(!existsSync(join(dir, p)), `${version}: ${p}, removed from the kit, is still installed`);
  }
  for (const [p, text] of Object.entries(fx.generated)) {
    if (p === ".xezar/docs/model-routing.md") continue;
    if (p.endsWith(".json")) {
      expect(JSON.stringify(JSON.parse(read(dir, p))) === JSON.stringify(JSON.parse(text)), `${version}: owner file ${p} is not equal by key`);
    } else expect(read(dir, p) === text, `${version}: owner file ${p} changed`);
  }

  // verify: the invariants, manifest v2, and the target kit's own checks
  const vctx = ctxFor(dir);
  const v = verify(vctx, plan, { checks: ["drift", "catalog", "route"] });
  expect(v.problems.length === 0, `${version}: verify invariants fail: ${JSON.stringify(v.problems)}`);
  for (const c of v.checks) {
    if (c.status === "skipped") continue;
    expect(c.status === "pass", `${version}: ${c.name} check fails on the upgraded install:\n${c.out.split("\n").slice(0, 6).join("\n")}`);
  }
  const m = JSON.parse(read(dir, ".xezar/onboarding.json"));
  expect(m.manifestVersion === 2 && m.version === TARGET && Object.keys(m.files).length > 100, `${version}: verify did not write a v2 manifest`);
  for (const [p, e] of Object.entries(m.files)) {
    if (["copied", "adapted"].includes(e.origin) && !(e.kitSource && e.kitBlob)) fail(`${version}: manifest v2 entry ${p} lacks kitSource or kitBlob`);
    if (e.sha256 !== sha256(readFileSync(join(dir, p)))) fail(`${version}: manifest v2 sha256 for ${p} does not match the file`);
  }
  expect(!(".claude/settings.local.json" in m.files), `${version}: a per-machine file is recorded in the manifest`);
  upgraded.set(version, dir);
}

// ---------------------------------------------------------------------------------------
// 4. The customised fixture: the diff from a fresh upgrade is exactly its customisations
// ---------------------------------------------------------------------------------------
{
  const spec = JSON.parse(readFileSync(join(FIX, "customised/customisations.json"), "utf8"));
  const want = JSON.parse(readFileSync(join(FIX, "customised/expected.json"), "utf8"));
  const fx = loadFixture(spec.base);
  const base = history.find((v) => v.version === spec.base);
  // A check the target kit did not change, so a local patch on it stays local-only.
  const untouchedCheck = Object.keys(fx.files)
    .filter((p) => /^\.xezar\/checks\/[^/]+\.sh$/.test(p) && tree.index.files[p]?.kitBlob === base.files[p]?.kitBlob)
    .sort()[0];
  const resolvePath = (p) => (p === "auto:untouched-check" ? untouchedCheck : p);
  const applyEdit = (dir, c) => {
    const p = resolvePath(c.path);
    const text = read(dir, p) ?? "";
    if (c.edit.append) write(dir, p, text + c.edit.append);
    else if (c.edit.jsonSet) {
      const j = JSON.parse(text);
      let o = j;
      const keys = c.edit.jsonSet.key;
      for (const k of keys.slice(0, -1)) o = o[k];
      o[keys[keys.length - 1]] = c.edit.jsonSet.value;
      write(dir, p, `${JSON.stringify(j, null, 2)}\n`);
    } else if (c.edit.after) {
      expect(text.includes(c.edit.after), `customisation ${c.id}: anchor not found in ${p}`);
      write(dir, p, text.replace(c.edit.after, c.edit.after + c.edit.insert));
    } else if (c.edit.create !== undefined) write(dir, p, c.edit.create);
  };
  const dir = materialize(fx, {
    name: "customised",
    edit: (d) => {
      for (const c of spec.customisations) applyEdit(d, c);
      write(d, ".xezar/LOCAL-PATCHES.md", spec.register.replaceAll("auto:untouched-check", untouchedCheck));
    },
  });
  const ctx = ctxFor(dir);
  const plan = buildPlan(ctx);
  const files = byPath(plan);
  for (const [id, cls] of Object.entries(want.classes)) {
    const c = spec.customisations.find((x) => x.id === id);
    if (!c) {
      fail(`customised: expected.json names customisation "${id}", which customisations.json no longer makes`);
      continue;
    }
    const p = resolvePath(c.path);
    const got = files.get(p);
    if (cls === "not-listed") expect(!got, `customised: ${p} (${id}) is in the plan; overrides are never touched`);
    else expect(got?.class === cls, `customised: ${p} (${id}) classed ${got?.class}, expected ${cls}`);
  }
  expect(applyPlan(ctx, plan).status === "ok", "customised: apply refused");
  const customised = new Set(spec.customisations.map((c) => resolvePath(c.path)));
  answerTrivially(dir, { files: plan.files.filter((f) => !customised.has(f.path)) }, fx);
  const clean = upgraded.get(spec.base);
  const a = snapshot(clean);
  const b = snapshot(dir);
  const differ = [...new Set([...Object.keys(a), ...Object.keys(b)])]
    .filter((p) => a[p] !== b[p] && p !== ".xezar/onboarding.json")
    .sort();
  const expected = want.diff.map(resolvePath).sort();
  expect(JSON.stringify(differ) === JSON.stringify(expected), `customised: the diff from a fresh upgrade is not exactly the customisations\n      differs:  ${differ.join(", ")}\n      expected: ${expected.join(", ")}`);
  const v = verify(ctxFor(dir), plan, { checks: ["catalog", "route"] });
  expect(v.status === "pass", `customised: verify fails: ${JSON.stringify(v.problems)} ${v.checks.filter((c) => c.status === "fail").map((c) => c.out).join("\n")}`);
  const m = JSON.parse(read(dir, ".xezar/onboarding.json"));
  expect(m.files[untouchedCheck]?.patch === "LP-1", "customised: the v2 manifest does not link the patched check to its register entry");
}

// ---------------------------------------------------------------------------------------
// 5. Hard cases
// ---------------------------------------------------------------------------------------
const fx303 = loadFixture("3.0.3");
const base303 = history.find((v) => v.version === "3.0.3");
const changedSince303 = Object.keys(fx303.files).filter((p) => tree.index.files[p] && tree.index.files[p].kitBlob !== fx303.files[p]).sort();
const unchangedChecks = Object.keys(fx303.files)
  .filter((p) => /^\.xezar\/checks\/[^/]+\.sh$/.test(p) && tree.index.files[p]?.kitBlob === fx303.files[p])
  .sort();

// 5a. A v1 manifest with drift: files edited after install, nothing recorded (#55: 7 of 172).
{
  const drifted = [".xezar/pipeline/config.json", ".claude/settings.json", unchangedChecks[0], ".xezar/docs/routing.md", changedSince303[0]];
  const dir = materialize(fx303, {
    name: "drift",
    edit: (d) => {
      for (const p of drifted) {
        const t = read(d, p);
        write(d, p, p.endsWith(".json") ? `${JSON.stringify({ ...JSON.parse(t), localNote: "edited" }, null, 2)}\n` : `${t}\n# edited locally\n`);
      }
    },
  });
  const plan = buildPlan(ctxFor(dir));
  const files = byPath(plan);
  expect(files.get(unchangedChecks[0])?.class === "unexplained-local-change", `drift: a silently edited check is ${files.get(unchangedChecks[0])?.class}, not unexplained`);
  expect(files.get(unchangedChecks[0])?.stops.includes("unexplained-safety-file"), "drift: an unexplained edit to a check does not stop and ask");
  expect(files.get(changedSince303[0])?.class === "both-changed" && files.get(changedSince303[0])?.unexplained, `drift: an edited file the kit also changed is ${files.get(changedSince303[0])?.class}`);
  expect(plan.unexplained.includes(unchangedChecks[0]) && plan.registerDrafts.add.some((d) => d.files.includes(unchangedChecks[0])), "drift: no register entry is drafted for the unexplained change");
  for (const p of [".xezar/pipeline/config.json", ".claude/settings.json"]) expect(files.get(p)?.class === "owner-shaped", `drift: ${p} is not owner-shaped`);
  const r = applyPlan(ctxFor(dir), plan);
  expect(r.status === "ok" && read(dir, unchangedChecks[0]).includes("# edited locally"), "drift: apply overwrote a drifted file");
  const staged = join(dir, ".local/xezar/scratch/upgrade/staged", `${changedSince303[0]}.merged`);
  expect(existsSync(staged) && readFileSync(staged, "utf8").includes("# edited locally"), "drift: the both-changed file was not merged into the staging folder");
}

// 5b. A partly applied old upgrade: a 3.0.0 install with some files already at 3.0.3.
{
  const fx300 = loadFixture("3.0.0");
  const moved = Object.keys(fx300.files).filter((p) => fx303.files[p] && fx303.files[p] !== fx300.files[p] && !OWNER_SHAPED.has(p) && p !== ".claude/settings.local.json").sort().slice(0, 3);
  expect(moved.length === 3, "partial: the 3.0.0 and 3.0.3 fixtures share too few changed files for this case");
  const dir = materialize(fx300, { name: "partial", edit: (d) => { for (const p of moved) write(d, p, pack[fx303.files[p]]); } });
  const files = byPath(buildPlan(ctxFor(dir)));
  for (const p of moved) {
    const f = files.get(p);
    expect(f && ["unchanged-upstream", "clean-update", "already-upstream"].includes(f.class) && f.base.version !== "3.0.0", `partial: ${p} (hand-applied 3.0.3) got base ${f?.base.version} and class ${f?.class}`);
  }
}

// 5c. A renamed kit file: the target moves a doc; the old install merges into the new path.
{
  const kitCopy = lab("renamed-kit");
  cpSync(join(KIT_SKILL, "kit"), join(kitCopy, "kit"), { recursive: true });
  mkdirSync(join(kitCopy, "references"));
  cpSync(join(KIT_SKILL, "references/write.md"), join(kitCopy, "references/write.md"));
  renameSync(join(kitCopy, "kit/docs/routing.md"), join(kitCopy, "kit/docs/routing-guide.md"));
  const theirs = indexFromTree(kitCopy, { version: TARGET }).index;
  theirs.files[".xezar/docs/routing-guide.md"].renamedFrom = ".xezar/docs/routing.md";
  const dir = materialize(fx303, { name: "renamed" });
  const ctx = ctxFor(dir, { kitSkillDir: kitCopy, theirsIndex: theirs });
  const plan = buildPlan(ctx);
  const f = byPath(plan).get(".xezar/docs/routing-guide.md");
  expect(f?.class === "moved-in-kit" && f.action === "stage-merge" && f.renamedFrom === ".xezar/docs/routing.md", `renamed: the moved file is ${f?.class}/${f?.action}`);
  expect(!byPath(plan).has(".xezar/docs/routing.md"), "renamed: the old path is listed on its own as well");
  expect(applyPlan(ctx, plan).status === "ok", "renamed: apply refused");
  const merged = join(dir, ".local/xezar/scratch/upgrade/staged/.xezar/docs/routing-guide.md.merged");
  expect(existsSync(merged) && readFileSync(merged, "utf8") === readFileSync(join(kitCopy, "kit/docs/routing-guide.md"), "utf8"), "renamed: the merge into the new path is not the new kit text");
}

// 5d. Unknown placeholder values are never a clean update (target adds a placeholder).
{
  const kitCopy = lab("placeholder-kit");
  cpSync(join(KIT_SKILL, "kit"), join(kitCopy, "kit"), { recursive: true });
  mkdirSync(join(kitCopy, "references"));
  cpSync(join(KIT_SKILL, "references/write.md"), join(kitCopy, "references/write.md"));
  const prt = join(kitCopy, "kit/github/pull_request_template.md");
  writeFileSync(prt, `${readFileSync(prt, "utf8")}\nSupport: {{SUPPORT_CHANNEL}}\n`);
  const dir = materialize(fx303, { name: "placeholder" });
  const plan = buildPlan(ctxFor(dir, { kitSkillDir: kitCopy }));
  const f = byPath(plan).get(".github/pull_request_template.md");
  expect(f && f.class !== "clean-update" && f.action !== "write-theirs" && f.missingKeys?.includes("SUPPORT_CHANNEL"), `placeholder: a new unknown placeholder is ${f?.class}/${f?.action}`);
}

// 5e. #49's files carried as a local patch, recorded `adapted`: already upstream.
{
  const pr49 = changedSince303.filter((p) => /^\.xezar\/(skills|workflows)\//.test(p));
  const dir = materialize(fx303, {
    name: "pr49",
    edit: (d) => {
      for (const p of pr49) write(d, p, fresh(p, fx303.renderInputs));
      const m = JSON.parse(read(d, ".xezar/onboarding.json"));
      for (const p of pr49) m.files[p].origin = "adapted";
      write(d, ".xezar/onboarding.json", `${JSON.stringify(m, null, 2)}\n`);
      write(d, ".xezar/LOCAL-PATCHES.md", `# Local patches\n\n## LP-1 – design-system modules\n- Files: ${pr49.join(", ")}\n- Reason: modules before upstream had them\n- Upstream: qodeca/xezar-skills#49\n- Since: 2026-09-20\n- Confirmed: yes\n`);
    },
  });
  const plan = buildPlan(ctxFor(dir));
  const files = byPath(plan);
  expect(pr49.length > 0, "pr49: no #49 file differs between 3.0.3 and the tree");
  for (const p of pr49) expect(files.get(p)?.class === "already-upstream", `pr49: ${p} carried as a local patch is ${files.get(p)?.class}, not already-upstream`);
  expect(plan.registerDrafts.remove.includes("LP-1"), "pr49: the now-obsolete register entry is not proposed for removal");
}

// One register entry, LP-1, naming `files`.
const lp1 = (files, confirmed) =>
  `# Local patches\n\n## LP-1 – local change\n- Files: ${files}\n- Reason: r\n- Upstream: local only\n- Since: 2026-09-01\n- Confirmed: ${confirmed}\n`;

// 5f. A project hook in .claude/settings.json (#69) is kept.
{
  const dir = materialize(fx303, {
    name: "hook",
    edit: (d) => {
      const s = JSON.parse(read(d, ".claude/settings.json"));
      s.hooks = s.hooks ?? {};
      s.hooks.SessionStart = [...(s.hooks.SessionStart ?? []), { hooks: [{ type: "command", command: "bash scripts/project-context.sh" }] }];
      write(d, ".claude/settings.json", `${JSON.stringify(s, null, 2)}\n`);
    },
  });
  const before = read(dir, ".claude/settings.json");
  const ctx = ctxFor(dir);
  const plan = buildPlan(ctx);
  expect(byPath(plan).get(".claude/settings.json")?.class === "owner-shaped", "hook: .claude/settings.json is not owner-shaped");
  applyPlan(ctx, plan);
  expect(read(dir, ".claude/settings.json") === before, "hook: apply changed .claude/settings.json and could lose the project hook");
  // The manifest tracks .claude/settings.json, so the kept hook needs a register entry (step
  // 5.7): without one verify refuses, and its detail never tells the agent to restore the kit's
  // file, which would drop the hook. With one, verify passes.
  const unreg = invariants(ctxFor(dir), plan).filter((x) => x.kind === "unregistered-local-change" && x.path === ".claude/settings.json");
  expect(unreg.length === 1, `hook: verify accepts the kept hook with no register entry: ${JSON.stringify(unreg)}`);
  expect(unreg.every((x) => !/or restore the kit's file/.test(x.detail) && /do not restore/.test(x.detail)), `hook: verify's detail still suggests restoring the kit's settings: ${JSON.stringify(unreg)}`);
  write(dir, ".xezar/LOCAL-PATCHES.md", lp1(".claude/settings.json", "no"));
  const v = verify(ctxFor(dir), plan, { checks: [] });
  expect(v.status !== "fail" && !v.problems.length, `hook: verify refuses the kept hook with its register entry: ${JSON.stringify(v.problems)}`);
}

// 5g. Unsafe paths: `../`, absolute, a symlinked kit file and a symlinked folder, all refused.
{
  const outside = lab("outside");
  writeFileSync(join(outside, "secret.md"), "outside the project\n");
  mkdirSync(join(outside, "lib"));
  const dir = materialize(fx303, {
    name: "unsafe",
    edit: (d) => {
      const m = JSON.parse(read(d, ".xezar/onboarding.json"));
      m.files["../outside.md"] = { sha256: "0".repeat(64), origin: "copied" };
      m.files["/etc/hosts"] = { sha256: "0".repeat(64), origin: "copied" };
      write(d, ".xezar/onboarding.json", `${JSON.stringify(m, null, 2)}\n`);
      unlinkSync(join(d, ".xezar/docs/routing.md"));
      symlinkSync(join(outside, "secret.md"), join(d, ".xezar/docs/routing.md"));
      rmSync(join(d, ".xezar/checks/lib"), { recursive: true });
      symlinkSync(join(outside, "lib"), join(d, ".xezar/checks/lib"));
    },
  });
  const ctx = ctxFor(dir);
  const plan = buildPlan(ctx);
  const files = byPath(plan);
  expect(plan.stops.some((s) => s.path === "../outside.md") && plan.stops.some((s) => s.path === "/etc/hosts"), "unsafe: a manifest path with ../ or an absolute path is not refused");
  expect(files.get(".xezar/docs/routing.md")?.class === "refused", `unsafe: a symlinked kit file is ${files.get(".xezar/docs/routing.md")?.class}`);
  const libFile = Object.keys(tree.index.files).find((p) => p.startsWith(".xezar/checks/lib/"));
  expect(files.get(libFile)?.class === "refused", `unsafe: a file under a symlinked folder is ${files.get(libFile)?.class}`);
  // A plan forged to write through the link is refused whole, and nothing is written.
  const forged = { ...plan, files: [...plan.files.filter((f) => f.path !== libFile), { path: libFile, class: "new-in-kit", action: "write-theirs", mineSha256: null, stops: [], register: [] }] };
  const snap = snapshot(dir);
  const r = applyPlan(ctx, forged);
  expect(r.status === "refused" && r.refused.some((x) => x.path === libFile), "unsafe: apply writes through a symlinked folder");
  expect(readdirSync(join(outside, "lib")).length === 0 && sameSnapshot(snapshot(dir), snap), "unsafe: a refused apply still changed files");
  let escaped = false;
  try {
    resolveInside(dir, "../x");
  } catch {
    escaped = true;
  }
  expect(escaped, "unsafe: resolveInside accepts ../");
}

// 5h. A local change that weakens a safety check in a file the target did not touch: stop.
{
  const check = unchangedChecks.find((p) => /exit 1/.test(pack[fx303.files[p]]));
  const dir = materialize(fx303, {
    name: "weaken",
    edit: (d) => {
      const t = read(d, check);
      const lines = t.split("\n");
      const i = lines.findIndex((l) => /exit 1/.test(l));
      lines.splice(i, 1);
      write(d, check, lines.join("\n"));
      write(d, ".xezar/LOCAL-PATCHES.md", `## LP-1 – quieter check\n- Files: ${check}\n- Reason: too strict for us\n- Upstream: local only\n- Since: 2026-09-01\n- Confirmed: yes\n`);
    },
  });
  const f = byPath(buildPlan(ctxFor(dir))).get(check);
  expect(f?.class === "local-only" && f.stops.includes("weakens-safety-check"), `weaken: a removed refusal in ${check} is ${f?.class} with stops ${f?.stops}`);
}

// 5i. A stale plan is refused cleanly; an interrupted apply resumes.
{
  const dir = materialize(loadFixture("3.0.0"), { name: "stale" });
  const ctx = ctxFor(dir);
  const plan = buildPlan(ctx);
  const target = plan.files.find((f) => f.action === "write-theirs" && !f.stops.length && f.mineSha256);
  write(dir, target.path, `${read(dir, target.path)}\n# changed after planning\n`);
  const snap = snapshot(dir);
  const r = applyPlan(ctxFor(dir), plan);
  expect(r.status === "refused" && r.refused.some((x) => x.path === target.path), "stale: apply did not refuse a file changed after planning");
  expect(sameSnapshot(snapshot(dir), snap), "stale: a refused apply wrote files");

  const dir2 = materialize(loadFixture("3.0.0"), { name: "resume" });
  const plan2 = buildPlan(ctxFor(dir2));
  const writes = plan2.files.filter((f) => f.action === "write-theirs" && !f.stops.length);
  const half = { ...plan2, files: plan2.files.filter((f) => !writes.slice(writes.length / 2).includes(f)) };
  applyPlan(ctxFor(dir2), half); // "interrupted" after half the writes
  const r2 = applyPlan(ctxFor(dir2), plan2);
  expect(r2.status === "ok", "resume: apply of the full plan after an interrupted one is refused");
  const dir3 = materialize(loadFixture("3.0.0"), { name: "straight" });
  applyPlan(ctxFor(dir3), buildPlan(ctxFor(dir3)));
  expect(sameSnapshot(snapshot(dir2), snapshot(dir3)), "resume: an interrupted then resumed apply differs from a straight one");
}

// The prompt eval findings (upgrade/evals/RESULTS.md, F1–F7): each one the planner now settles.

// 5j. F1: the target's own unreleased development line is never a base. A pre-release copy of
// a file new in the target, matched to a development commit that already has the target's
// text, was read as "local only" and the stale copy kept.
{
  const p = ".xezar/docs/local-patches.md";
  expect(tree.index.files[p] && !base303.files[p], `dev-line: ${p} is no longer new in the target; re-aim this case`);
  const devLine = { version: "3.0.3+00000000de01", commit: null, tag: null, files: tree.index.files };
  const indexes = [...history.slice(0, history.indexOf(base303) + 1), devLine];
  const paragraphs = fresh(p, fx303.renderInputs).split("\n\n");
  paragraphs.splice(Math.floor(paragraphs.length / 2), 1);
  const draft = `${paragraphs.join("\n\n")}\n## This project\n\nOur own rule.\n`;
  const edit = (version) => (d) => {
    write(d, p, draft);
    write(d, ".xezar/LOCAL-PATCHES.md", lp1(p, "yes"));
    if (version) write(d, ".xezar/onboarding.json", `${JSON.stringify({ ...fx303.manifest, version }, null, 2)}\n`);
  };
  const ctx = (dir) => ctxFor(dir, { indexes, blobRepo: root });
  const f = byPath(buildPlan(ctx(materialize(fx303, { name: "dev-line", edit: edit(null) })))).get(p);
  expect(f?.class === "base-unknown" && f.action === "stage-theirs" && f.base.version === null, `dev-line: a pre-release copy of a new file is ${f?.class}/${f?.action} with base ${f?.base.version}, not base-unknown`);
  // A project the manifest says was installed from that development commit keeps it as a base,
  // and its inferred base still never keeps the copy unread.
  const g = byPath(buildPlan(ctx(materialize(fx303, { name: "dev-install", edit: edit(devLine.version) })))).get(p);
  expect(g?.base.version === devLine.version && g.action === "stage-theirs", `dev-line: an install recorded at ${devLine.version} got base ${g?.base.version} and action ${g?.action}`);
}

// 5k. F1: an inferred (low-confidence) base equal to the target is not proof the file is only
// locally changed: stage theirs and judge, never keep.
{
  const p = unchangedChecks[0];
  const dir = materialize(fx303, {
    name: "low-base",
    edit: (d) => {
      write(d, p, `${read(d, p)}\n# local: one\n# local: two\n# local: three\n`);
      const m = JSON.parse(read(d, ".xezar/onboarding.json"));
      delete m.files[p];
      write(d, ".xezar/onboarding.json", `${JSON.stringify(m, null, 2)}\n`);
      write(d, ".xezar/LOCAL-PATCHES.md", lp1(p, "yes"));
    },
  });
  const f = byPath(buildPlan(ctxFor(dir))).get(p);
  expect(f?.base.confidence === "low", `low-base: ${p} got base confidence ${f?.base.confidence}; re-aim this case`);
  expect(f?.class === "both-changed" && f.action === "stage-theirs", `low-base: a low-confidence base equal to the target gives ${f?.class}/${f?.action}, not both-changed/stage-theirs`);
}

// 5l. F2: a confirmed local patch that drops `exit "$rc"`, or adds `|| true`, in a file the
// target did not touch, stops – and every kept local change to a safety file is on the
// read-and-judge list. (The eval case does both at once: `exit "$rc"` -> `exit 0`.)
{
  const p = ".xezar/checks/security-scan.sh";
  expect(unchangedChecks.includes(p) && pack[fx303.files[p]].includes('exit "$rc"\n'), `weaken-rc: ${p} changed in the target or lost its exit "$rc"; re-aim this case`);
  const dir = materialize(fx303, {
    name: "weaken-rc",
    edit: (d) => {
      write(d, p, read(d, p).replace('exit "$rc"\n', ""));
      write(d, ".xezar/LOCAL-PATCHES.md", lp1(p, "yes"));
    },
  });
  const f = byPath(buildPlan(ctxFor(dir))).get(p);
  expect(f?.class === "local-only" && f.stops.includes("weakens-safety-check"), `weaken-rc: a dropped exit "$rc" is ${f?.class} with stops ${f?.stops}`);
  expect(f?.reviews?.includes("safety-local-change"), `weaken-rc: a kept local change to a safety file is not on the read-and-judge list (${f?.reviews})`);
  const q = unchangedChecks.find((x) => x !== p);
  const dir2 = materialize(fx303, {
    name: "weaken-true",
    edit: (d) => {
      write(d, q, `${read(d, q)}\nfalse || true\n`);
      write(d, ".xezar/LOCAL-PATCHES.md", lp1(q, "yes"));
    },
  });
  const g = byPath(buildPlan(ctxFor(dir2))).get(q);
  expect(g?.stops.includes("weakens-safety-check"), `weaken-true: an added "|| true" in ${q} does not stop (${g?.class}, ${g?.stops})`);
}

// 5m. F3: a safety file both sides changed is on the read-and-judge list, however cleanly it merges.
{
  const p = changedSince303.find((x) => x.startsWith(".xezar/checks/") && x.endsWith(".sh"));
  const dir = materialize(fx303, {
    name: "semantic",
    edit: (d) => {
      write(d, p, `${read(d, p)}\n# local: trust our cache\n`);
      write(d, ".xezar/LOCAL-PATCHES.md", lp1(p, "yes"));
    },
  });
  const f = byPath(buildPlan(ctxFor(dir))).get(p);
  expect(f?.class === "both-changed" && f.reviews?.includes("safety-both-changed"), `semantic: a both-changed safety file ${p} is ${f?.class} with reviews ${f?.reviews}`);
}

// 5n. F4: the owner and the target changed the same routing field: a stop, naming the field. A
// field only the owner changed is not a clash.
{
  const p = ".xezar/routing.json";
  const withRouting = (name, change) =>
    byPath(buildPlan(ctxFor(materialize(fx303, {
      name,
      edit: (d) => write(d, p, `${JSON.stringify(change(JSON.parse(read(d, p))), null, 2)}\n`),
    })))).get(p);
  const clash = withRouting("routing-clash", (r) => ({ ...r, vendorExclusions: [{ vendor: "openai", why: "ours" }] }));
  expect(clash?.stops.includes("routing-clash") && clash.notes.some((n) => /both changed vendorExclusions/.test(n)), `routing-clash: both sides setting vendorExclusions gives stops ${clash?.stops}`);
  const own = withRouting("routing-own", (r) => ({ ...r, tieRule: `${r.tieRule} (ours)` }));
  expect(own && !own.stops.includes("routing-clash"), `routing-own: an owner-only routing change is reported as a clash (${own?.notes})`);
}

// 5o. F7: a local change an existing, unconfirmed register entry already covers gets no second draft.
{
  const p = ".github/ISSUE_TEMPLATE/config.yml";
  const dir = materialize(fx303, {
    name: "draft-dup",
    edit: (d) => {
      write(d, p, `${read(d, p)}# local note\n`);
      write(d, ".xezar/LOCAL-PATCHES.md", lp1(p, "no"));
    },
  });
  const plan = buildPlan(ctxFor(dir));
  expect(plan.unexplained.includes(p), `draft-dup: ${p} is no longer unexplained; re-aim this case`);
  expect(!plan.registerDrafts.add.some((d) => d.files.includes(p)), `draft-dup: a second register entry is drafted for ${p}, which LP-1 already covers`);
}

// ---------------------------------------------------------------------------------------
// 6. Each 3.1.0 machine block's Files: matches the kit-index diff
// ---------------------------------------------------------------------------------------
{
  // The base is the last release OLDER than the target. Once the release PR indexes the target
  // itself (tag v3.1.0), "the last tagged entry" is the target, and the diff against the tree is
  // empty: neither direction below could ever fire.
  const lastTag = [...history].reverse().find((v) => v.tag && satisfies(`<${TARGET}`, v.version));
  expect(lastTag && lastTag.version !== TARGET, `machine blocks: no tagged release older than ${TARGET} in the kit index`);
  const d = diffIndexes(lastTag, tree.index);
  const changed = [...d.added, ...d.removed, ...d.changed].filter((p) => tree.index.files[p]?.rewrite !== "generated" && lastTag.files[p]?.rewrite !== "generated");
  const notesDir = join(root, "docs/plans/3.1.0/notes");
  // The release PR folds the fragments into UPGRADE_NOTES.md and deletes the folder.
  const sources = [["UPGRADE_NOTES.md", readFileSync(join(root, "UPGRADE_NOTES.md"), "utf8")]];
  if (existsSync(notesDir)) for (const n of readdirSync(notesDir)) if (n.endsWith(".md") && n !== "README.md") sources.push([`docs/plans/3.1.0/notes/${n}`, readFileSync(join(notesDir, n), "utf8")]);
  const listed = new Map();
  for (const [src, text] of sources) {
    const { blocks, errors } = parseBlocks(text, src);
    for (const e of errors) fail(`machine block: ${e}`);
    for (const b of blocks) {
      if (!b.appliesTo || !satisfies(b.appliesTo, lastTag.version)) continue;
      for (const f of b.files) listed.set(f.path, { mode: f.mode, src });
    }
  }
  for (const p of changed) expect(listed.has(p), `machine blocks: ${p} changed since ${lastTag.version} but no 3.1.0 upgrade block lists it`);
  for (const [p, { mode, src }] of listed) {
    if (mode === "delete") expect(!tree.index.files[p], `machine blocks: ${src} deletes ${p}, which the kit still ships`);
    else if (tree.index.files[p]?.rewrite !== "generated" && !OWNER_SHAPED.has(p)) {
      expect(changed.includes(p), `machine blocks: ${src} lists ${p}, which did not change since ${lastTag.version}`);
    }
  }
}

// 6b. Every 3.1.0 entry that copies role skills needs entry 2, which carries the new
// `## Shared contract` tail to all of them: catalog-check refuses a mix of old and new tails.
{
  const text = readFileSync(join(root, "UPGRADE_NOTES.md"), "utf8");
  const start = text.indexOf("## 2026-09-27 – upgrading an onboarded project to 3.1.0");
  const section = start < 0 ? "" : text.slice(start, text.indexOf("\n## ", start + 1));
  expect(section, "needs: UPGRADE_NOTES.md has no 3.1.0 section; re-aim this case");
  const needsOf = new Map();
  for (const m of section.matchAll(/^- Entr(?:y|ies) ([0-9, and]+?) needs? ([^:]+):/gm)) {
    const needed = [...m[2].matchAll(/\d+/g)].map((x) => Number(x[0]));
    for (const n of m[1].match(/\d+/g)) needsOf.set(Number(n), [...(needsOf.get(Number(n)) ?? []), ...needed]);
  }
  for (const m of section.matchAll(/^### (\d+)\. [\s\S]*?^```upgrade\n([\s\S]*?)^```$/gm)) {
    const n = Number(m[1]);
    if (n === 2 || !/^Files: .*\.xezar\/skills\/xezar-/m.test(m[2])) continue;
    expect((needsOf.get(n) ?? []).includes(2), `needs: 3.1.0 entry ${n} copies role skills but its Needs line does not name entry 2 (the shared-contract tail)`);
  }
}

// ---------------------------------------------------------------------------------------
// 7. The drift check (stream U1): on upgraded fixtures, and its own cases
// ---------------------------------------------------------------------------------------
function drift(dir) {
  try {
    return { code: 0, out: execFileSync("node", [DRIFT, dir], { cwd: dir, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }) };
  } catch (e) {
    return { code: e.status ?? -1, out: `${e.stdout ?? ""}${e.stderr ?? ""}` };
  }
}
if (!HAS_DRIFT) {
  console.log("skip  drift-check cases: the kit does not ship checks/manifest-drift.mjs yet (stream U1)");
} else {
  const status = (r) => /^drift-status=(\S+)$/m.exec(r.out)?.[1];
  // v1 manifest: not-applicable, exit 0
  const v1 = materialize(fx303, { name: "drift-v1" });
  const r1 = drift(v1);
  expect(r1.code === 0 && status(r1) === "not-applicable", `drift: a v1 manifest is not not-applicable (exit ${r1.code}): ${r1.out.trim()}`);
  // Fresh v2 install passes
  const fresh2 = upgraded.get("3.0.3");
  const ok = drift(fresh2);
  expect(ok.code === 0 && status(ok) === "pass", `drift: a freshly upgraded install does not pass: ${ok.out.trim()}`);
  const withEdit = (name, fn) => {
    const d = lab(name);
    cpSync(fresh2, d, { recursive: true });
    fn(d);
    return drift(d);
  };
  const check = unchangedChecks[0];
  const silent = withEdit("drift-silent", (d) => write(d, check, `${read(d, check)}# silent\n`));
  expect(silent.code === 1 && status(silent) === "fail" && silent.out.includes(check), `drift: a silent edit does not fail: ${silent.out.trim()}`);
  const recorded = (confirmed) => (d) => {
    write(d, check, `${read(d, check)}# recorded\n`);
    const m = JSON.parse(read(d, ".xezar/onboarding.json"));
    m.files[check].sha256 = sha256(read(d, check));
    m.files[check].patch = "LP-1";
    write(d, ".xezar/onboarding.json", JSON.stringify(m, null, 2));
    write(d, ".xezar/LOCAL-PATCHES.md", `## LP-1 – recorded\n- Files: ${check}\n- Reason: r\n- Upstream: local only\n- Since: 2026-09-01\n- Confirmed: ${confirmed}\n`);
  };
  const conf = withEdit("drift-confirmed", recorded("yes"));
  expect(conf.code === 0 && status(conf) === "pass", `drift: a recorded, confirmed edit does not pass: ${conf.out.trim()}`);
  const unconf = withEdit("drift-unconfirmed", recorded("no"));
  expect(unconf.code === 1 && /unconfirmed-patch/.test(unconf.out), `drift: Confirmed: no does not fail: ${unconf.out.trim()}`);
  const orphan = withEdit("drift-orphan", (d) => write(d, ".xezar/LOCAL-PATCHES.md", `## LP-2 – orphan\n- Files: ${check}\n- Reason: r\n- Upstream: local only\n- Since: 2026-09-01\n- Confirmed: yes\n`));
  expect(orphan.code === 1 && /register-without-manifest|unregistered-patch/.test(orphan.out), `drift: a register entry with no manifest link does not fail: ${orphan.out.trim()}`);
  const missingLp = withEdit("drift-missing-lp", (d) => {
    const m = JSON.parse(read(d, ".xezar/onboarding.json"));
    m.files[check].patch = "LP-9";
    write(d, ".xezar/onboarding.json", JSON.stringify(m, null, 2));
  });
  expect(missingLp.code === 1 && /unregistered-patch/.test(missingLp.out), `drift: a patch naming a missing LP id does not fail: ${missingLp.out.trim()}`);
  const gates = withEdit("drift-gates", (d) => {
    // A generated gate list recorded at install time: the recorded hash is of the generated file.
    const p = ".xezar/checks/repo-gates.sh";
    write(d, p, read(d, p).replace(/^GATE_COMMANDS=\(/m, "GATE_COMMANDS=(\n  \"make lint\""));
    const m = JSON.parse(read(d, ".xezar/onboarding.json"));
    m.files[p].sha256 = sha256(read(d, p));
    write(d, ".xezar/onboarding.json", JSON.stringify(m, null, 2));
  });
  expect(gates.code === 0 && status(gates) === "pass", `drift: generated gate arrays recorded at install fail: ${gates.out.trim()}`);
  // The tracker descriptor has no kit source (origin generated), so the upgrade prompt only lists
  // it; xez-apply-upgrade-notes and the UPGRADE_NOTES how-to update it and move its recorded
  // digest in the same change (round-10 review). A plain copy fails the drift check; the copy
  // with the digest moved passes.
  const tracker = ".xezar/pipeline/trackers/github.md";
  const newerTracker = (d) => write(d, tracker, `${read(d, tracker)}\n#### a-later-operation\n\nShipped by a later release.\n`);
  const trackerEntry = JSON.parse(read(fresh2, ".xezar/onboarding.json")).files?.[tracker];
  expect(trackerEntry?.origin === "generated" && !trackerEntry.kitSource && trackerEntry.sha256 === sha256(read(fresh2, tracker)), `drift: the tracker descriptor is not recorded as a generated file matching its digest; re-aim this case: ${JSON.stringify(trackerEntry)}`);
  const plainCopy = withEdit("drift-tracker-copy", newerTracker);
  expect(plainCopy.code === 1 && plainCopy.out.includes(`drift=${tracker}`), `drift: a re-synced tracker descriptor with its old digest passes: ${plainCopy.out.trim()}`);
  const resynced = withEdit("drift-tracker-resynced", (d) => {
    newerTracker(d);
    const m = JSON.parse(read(d, ".xezar/onboarding.json"));
    m.files[tracker].sha256 = sha256(read(d, tracker));
    if (m.descriptors && tracker in m.descriptors) m.descriptors[tracker] = m.files[tracker].sha256;
    write(d, ".xezar/onboarding.json", `${JSON.stringify(m, null, 2)}\n`);
  });
  expect(resynced.code === 0 && status(resynced) === "pass", `drift: a re-synced tracker descriptor with its digest moved fails: ${resynced.out.trim()}`);
  const applyNotes = readFileSync(join(root, "skills/xez-apply-upgrade-notes/SKILL.md"), "utf8");
  expect(/\*\*The tracker descriptor\*\*[\s\S]*?write the SHA-256 of the updated file into that entry's\s+`sha256`/.test(applyNotes), "drift: xez-apply-upgrade-notes no longer moves the tracker descriptor's recorded digest with the file, so an onboarded project has no path to a tracker fix");
  const howTo = readFileSync(join(root, "UPGRADE_NOTES.md"), "utf8").split("## Re-syncing the tracker descriptor")[1]?.split(/\n## /)[0] ?? "";
  expect(/\.xezar\/onboarding\.json/.test(howTo) && /manifest-drift\.mjs/.test(howTo), "drift: UPGRADE_NOTES.md 'Re-syncing the tracker descriptor' does not tell an onboarded project to move the recorded digest");
  const appended = withEdit("drift-appended", (d) => {
    const block = "<!-- xezar:kit:start -->\nkit block\n<!-- xezar:kit:end -->";
    write(d, "CLAUDE.md", `# Owner text\n\n${block}\n`);
    const m = JSON.parse(read(d, ".xezar/onboarding.json"));
    m.files["CLAUDE.md"] = { sha256: sha256(block), origin: "owner-file-appended" };
    write(d, ".xezar/onboarding.json", JSON.stringify(m, null, 2));
    write(d, "CLAUDE.md", `# Owner text, edited by the owner\n\n${block}\n`);
  });
  expect(appended.code === 0 && status(appended) === "pass", `drift: an owner edit outside the appended block fails: ${appended.out.trim()}`);
  for (const [version, dir] of upgraded) {
    const r = drift(dir);
    expect(r.code === 0 && status(r) === "pass", `drift: the upgraded ${version} fixture does not pass: ${r.out.trim()}`);
  }
}

// ---------------------------------------------------------------------------------------
// 8. Real-install snapshots (added by the owner; see scripts/fixtures/upgrade/README.md)
// ---------------------------------------------------------------------------------------
{
  const realDir = join(FIX, "real");
  const reals = existsSync(realDir) ? readdirSync(realDir).filter((n) => existsSync(join(realDir, n, "expected.json"))) : [];
  if (!reals.length) console.log("note  no real-install snapshots under scripts/fixtures/upgrade/real/ yet");
  for (const name of reals) {
    const want = JSON.parse(readFileSync(join(realDir, name, "expected.json"), "utf8"));
    const dir = lab(`real-${name}`);
    cpSync(join(realDir, name, "tree"), dir, { recursive: true });
    git(dir, "init", "-q");
    git(dir, "add", "-A");
    git(dir, "-c", "user.name=fixture", "-c", "user.email=fixture@example.invalid", "commit", "-qm", "snapshot");
    const plan = buildPlan(ctxFor(dir, { target: want.target ?? TARGET }));
    for (const [cls, n] of Object.entries(want.counts ?? {})) {
      expect(plan.counts[cls] === n, `real ${name}: ${cls} count ${plan.counts[cls]}, expected ${n}`);
    }
    for (const [p, cls] of Object.entries(want.classes ?? {})) {
      expect(byPath(plan).get(p)?.class === cls, `real ${name}: ${p} classed ${byPath(plan).get(p)?.class}, expected ${cls}`);
    }
  }
}

// ---------------------------------------------------------------------------------------
// 9. The repository check runs in the project; --help; engine-min
// ---------------------------------------------------------------------------------------
{
  // Run from the clone, repository-checks.sh once took two folders up from itself – the clone's
  // skill folder – as the repository. A loose file in the PROJECT's .local/xezar/ must now fail
  // the check and be named; the same project without it must not be reported for one.
  const base = upgraded.get("3.0.3");
  const loose = lab("verify-repo-loose");
  cpSync(base, loose, { recursive: true });
  write(loose, ".local/xezar/verify-probe-loose.txt", "loose\n");
  const bad = projectChecks(ctxFor(loose), ["repository"])[0];
  expect(bad.status === "fail" && bad.out.includes("verify-probe-loose.txt"), `verify: the repository check did not run in the project (a loose file there went unreported):\n${bad.out.split("\n").slice(0, 8).join("\n")}`);
  expect(!bad.out.includes("linked worktree - skipped"), "verify: the repository check inspected the clone's checkout, not the project's");
  const clean = lab("verify-repo-clean");
  cpSync(base, clean, { recursive: true });
  const good = projectChecks(ctxFor(clean), ["repository"])[0];
  expect(!good.out.includes("verify-probe-loose.txt") && !/loose entries/.test(good.out), `verify: the repository check reports a loose entry in a project that has none:\n${good.out.split("\n").slice(0, 8).join("\n")}`);

  // A drift failure must not hide the checks after it (step 7.4 reads every result): with a silent
  // edit AND a broken routing file, both are reported and the check still fails.
  const tidy = (d) => { for (const sub of ["runtime", "tasks", "worktrees", "cache", "qa"]) mkdirSync(join(d, ".local/xezar", sub), { recursive: true }); };
  const both = lab("verify-repo-drift-and-route");
  cpSync(base, both, { recursive: true });
  tidy(both);
  write(both, unchangedChecks[0], `${read(both, unchangedChecks[0])}# silent\n`);
  write(both, ".xezar/routing.json", "{ not json\n");
  const r2 = projectChecks(ctxFor(both), ["repository"])[0];
  expect(r2.status === "fail" && /drift-status=fail/.test(r2.out), `verify: the repository check does not report the drift failure:\n${r2.out.split("\n").slice(0, 8).join("\n")}`);
  expect(/routing\.json/.test(r2.out.replace(/^drift=.*$/gm, "")), `repository-checks: a drift failure stops the checks after it (the broken routing.json went unreported):\n${r2.out.split("\n").slice(0, 12).join("\n")}`);
  // With every other check passing, a drift failure still fails the script at the end. The other
  // checks are stubs here: the fixture cannot pass config-guard without a remote.
  const stubs = lab("repo-checks-stubs");
  const checksDir = join(stubs, ".xezar/checks");
  mkdirSync(checksDir, { recursive: true });
  cpSync(join(KIT_SKILL, "kit/checks/repository-checks.sh"), join(checksDir, "repository-checks.sh"));
  writeFileSync(join(checksDir, "config-guard.sh"), "exit 0\n");
  for (const f of ["catalog-check.mjs", "fenced-quotes.mjs"]) writeFileSync(join(checksDir, f), "process.exit(0);\n");
  // The last check prints a marker, so a run that stopped early is visible.
  writeFileSync(join(checksDir, "documented-output.mjs"), 'console.log("stub-documented-output-ran");\n');
  const runStub = (driftCode, localTreeCode = 0) => {
    writeFileSync(join(checksDir, "manifest-drift.mjs"), `process.exit(${driftCode});\n`);
    writeFileSync(join(checksDir, "local-tree.sh"), `exit ${localTreeCode}\n`);
    try {
      return { code: 0, out: execFileSync("bash", [join(checksDir, "repository-checks.sh"), stubs], { cwd: stubs, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }) };
    } catch (e) {
      return { code: e.status ?? -1, out: `${e.stdout ?? ""}${e.stderr ?? ""}` };
    }
  };
  const driftOnly = runStub(1);
  expect(driftOnly.code === 1 && /manifest-drift failed/.test(driftOnly.out), `repository-checks: a drift failure alone does not fail the script at the end (exit ${driftOnly.code}): ${driftOnly.out.trim()}`);
  expect(runStub(0).code === 0, "repository-checks: the stubbed checks do not pass with no drift");
  // A local-tree failure (missing per-machine folders) gets the same keep-going treatment (step
  // 7.4): every later check still runs, and the script fails at the end.
  const treeOnly = runStub(0, 1);
  expect(treeOnly.code === 1 && /local-tree failed/.test(treeOnly.out), `repository-checks: a local-tree failure alone does not fail the script at the end (exit ${treeOnly.code}): ${treeOnly.out.trim()}`);
  expect(/stub-documented-output-ran/.test(treeOnly.out), `repository-checks: a local-tree failure stops the checks after it: ${treeOnly.out.trim()}`);
  const treeAndDrift = runStub(1, 1);
  expect(treeAndDrift.code !== 0 && /local-tree failed/.test(treeAndDrift.out) && /manifest-drift failed/.test(treeAndDrift.out), `repository-checks: a local-tree and a drift failure are not both reported: ${treeAndDrift.out.trim()}`);

  for (const tool of ["detect", "plan", "apply", "verify"]) {
    let out = "";
    let code = 0;
    try {
      out = execFileSync("node", [join(root, `upgrade/tools/${tool}.mjs`), "--help"], { cwd: tmpdir(), encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    } catch (e) {
      code = e.status ?? -1;
      out = `${e.stdout ?? ""}${e.stderr ?? ""}`;
    }
    expect(code === 0 && out.includes(`node upgrade/tools/${tool}.mjs --project <dir>`), `${tool}.mjs --help does not print its usage and exit 0 (exit ${code}): ${out.slice(0, 200)}`);
  }

  const e = (version) => ({ version, source: "test" });
  expect(engineChecks(["restart-leader"], () => { throw new Error("read"); }) === null, "engine-min: the engine is read when no block asks for a minimum");
  expect(engineChecks(["engine-min=0.19.0"], e("0.19.0")).checks[0].status === "met", "engine-min: an equal engine version is not met");
  expect(engineChecks(["engine-min=0.19.0"], e("0.18.9")).checks[0].status === "unmet", "engine-min: an older engine version is not unmet");
  expect(engineChecks(["engine-min=0.19.0"], e(null)).checks[0].status === "unknown", "engine-min: no engine version is not unknown");
  const pinned = lab("engine-pinned");
  cpSync(base, pinned, { recursive: true });
  write(pinned, "node_modules/@qodeca/xezar/package.json", JSON.stringify({ name: "@qodeca/xezar", version: "0.21.3" }));
  const ev = engineVersion(ctxFor(pinned));
  expect(ev.version === "0.21.3" && ev.source === "node_modules/@qodeca/xezar", `engine-min: the project's pinned engine is not read: ${JSON.stringify(ev)}`);
}

// 3.1.0-stream-OC:start
// Onboarding no longer writes `version: "unknown"` (owner decision): it stops instead. A manifest an
// older kit wrote with "unknown" must still upgrade: no version means every upgrade entry applies,
// and the manifest the upgrade writes names the target, never "unknown".
{
  const dir = materialize({ ...fx303, manifest: { ...fx303.manifest, version: "unknown" } }, { name: "unknown-version" });
  const ctx = ctxFor(dir);
  const plan = buildPlan(ctx);
  const known = buildPlan(ctxFor(materialize(fx303, { name: "known-version" })));
  expect(plan.projectVersion === "unknown" && plan.files.length > 0, `unknown version: an old manifest saying "unknown" does not plan (${plan.projectVersion}, ${plan.files.length} files)`);
  expect(plan.upgradeEntries.length >= known.upgradeEntries.length, `unknown version: fewer upgrade entries apply (${plan.upgradeEntries.length}) than for a known 3.0.3 (${known.upgradeEntries.length}); with no version every entry must apply`);
  expect(manifestV2(ctx).version === TARGET, "unknown version: the manifest the upgrade writes does not name the target version");
}
// 3.1.0-stream-OC:end

// ---------------------------------------------------------------------------------------
// 10. Dry-run findings (a real v1 project, upgraded on a throwaway clone)
// ---------------------------------------------------------------------------------------
// 10a. A file the manifest records but no kit version ever shipped is not "removed from the
// kit" (that class needs the base index): it is the project's own, kept as it is.
{
  const own = { "SECURITY.md": "# Security\n\nReport to us.\n", ".gitignore": null, "checks/repair-target.sh": "#!/bin/sh\necho repair\n" };
  const dir = materialize(fx303, {
    name: "not-kit",
    edit: (d) => {
      const m = JSON.parse(read(d, ".xezar/onboarding.json"));
      for (const [p, text] of Object.entries(own)) {
        if (text !== null) write(d, p, text);
        m.files[p] = { sha256: sha256(read(d, p)), origin: "generated" };
      }
      write(d, ".xezar/onboarding.json", `${JSON.stringify(m, null, 2)}\n`);
    },
  });
  const ctx = ctxFor(dir);
  const plan = buildPlan(ctx);
  const files = byPath(plan);
  for (const p of Object.keys(own)) {
    expect(!history.some((v) => v.files[p]), `not-kit: ${p} is in a kit index; re-aim this case`);
    const f = files.get(p);
    expect(f?.class === "local-only" && f.action === "keep", `not-kit: ${p}, in no kit index, is ${f?.class}/${f?.action}, not local-only/keep`);
    expect(!plan.unexplained.includes(p), `not-kit: ${p}, in no kit index, is listed as an unexplained local change`);
  }
  const before = snapshot(dir);
  expect(applyPlan(ctx, plan).status === "ok", "not-kit: apply refused");
  const after = snapshot(dir);
  for (const p of Object.keys(own)) expect(after[p] === before[p], `not-kit: apply changed ${p}`);
}

// 10b. Campaign notes are never touched: not planned, not recorded in the v2 manifest.
{
  const p = ".xezar/campaigns/launch.md";
  const block = "<!-- xezar:kit:start -->\nnotes\n<!-- xezar:kit:end -->";
  const dir = materialize(fx303, {
    name: "campaigns",
    edit: (d) => {
      write(d, p, `# Launch\n\n${block}\n`);
      const m = JSON.parse(read(d, ".xezar/onboarding.json"));
      m.files[p] = { sha256: sha256(block), origin: "owner-file-appended" };
      write(d, ".xezar/onboarding.json", `${JSON.stringify(m, null, 2)}\n`);
      write(d, ".xezar/LOCAL-PATCHES.md", lp1(p, "yes"));
    },
  });
  const ctx = ctxFor(dir);
  expect(!detect(ctx).files.some((f) => f.path === p), `campaigns: detect reads ${p}`);
  expect(!byPath(buildPlan(ctx)).has(p), `campaigns: ${p} is in the plan`);
  expect(!(p in manifestV2(ctx).files), `campaigns: ${p} is recorded in the v2 manifest`);
}

// 10c. A write held back by a stop is reported and staged, never written.
{
  const dir = materialize(fx303, { name: "held" });
  const ctx = ctxFor(dir);
  const plan = buildPlan(ctx);
  const item = plan.files.find((f) => f.class === "clean-update" && f.action === "write-theirs" && !f.stops.length && f.mineSha256);
  const forged = { ...plan, files: plan.files.map((f) => (f === item ? { ...f, stops: ["permission-change"] } : f)) };
  const before = read(dir, item.path);
  const r = applyPlan(ctx, forged);
  const held = (r.results ?? []).find((x) => x.path === item.path);
  expect(r.status === "ok" && held?.op === "held" && held.reason === "permission-change", `held: a stopped write-theirs is not reported as held (${JSON.stringify(held)})`);
  expect(read(dir, item.path) === before, `held: ${item.path} has a stop but was written`);
  const staged = `.local/xezar/scratch/upgrade/staged/${item.path}`;
  expect(read(dir, `${staged}.theirs`) === fresh(item.path, fx303.renderInputs) && read(dir, `${staged}.mine`) === before, `held: ${item.path} has no staged .mine and .theirs`);
  // The command line prints it in the NAME=value grammar the prompt reads.
  const planFile = join(lab("held-plan"), "plan.json");
  writeFileSync(planFile, JSON.stringify(forged));
  let out = "";
  try {
    out = execFileSync("node", [join(root, "upgrade/tools/apply.mjs"), "--project", dir, "--target", TARGET, "--plan", planFile, "--blob-pack", PACK], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  } catch (e) {
    out = `${e.stdout ?? ""}${e.stderr ?? ""}`;
  }
  expect(out.split("\n").includes(`held=${item.path} reason=permission-change`) && /^apply-status=ok$/m.test(out), `held: apply.mjs does not print a held= line:\n${out.split("\n").slice(-5).join("\n")}`);
}

// 10d. The printed plan shows what step 3 of the prompt tells the agent to show.
{
  const plan = buildPlan(ctxFor(materialize(fx303, { name: "summary" })));
  const md = summary({ ...plan, perMachine: [".claude/settings.local.json"], errors: [], engine: { version: "0.19.0", source: "xezar", checks: [{ min: "0.19.0", status: "met" }] } });
  expect(/^## Engine minimum$/m.test(md) && md.includes("0.19.0: met"), `summary: plan.md does not show the engine minimum:\n${md}`);
  expect(/^## Per-machine files$/m.test(md) && md.includes("- .claude/settings.local.json"), "summary: plan.md does not list the per-machine files");
  expect(/^## Errors$/m.test(md), "summary: plan.md has no errors section when there are none");
  const none = summary({ ...plan, perMachine: [], errors: [], engine: null });
  expect(/^## Engine minimum\n\nNone: this range sets no engine minimum\.$/m.test(none), "summary: plan.md does not say when the range sets no engine minimum");
}

// 10e. Upgrade entries come from UPGRADE_NOTES.md only, never from a release's working folder.
{
  const fake = lab("notes-root");
  const block = "```upgrade\nApplies-to: <3.1.0\nActions: restart-leader\n```\n";
  write(fake, "UPGRADE_NOTES.md", `# Notes\n\n${block}`);
  write(fake, "docs/plans/3.1.0/notes/X.md", `# X\n\n${block}`);
  const { entries } = upgradeEntries(fake, "3.0.3");
  expect(entries.length === 1 && entries[0].source === "UPGRADE_NOTES.md", `notes: upgrade entries are read from outside UPGRADE_NOTES.md (${entries.map((e) => e.source).join(", ")})`);
}

// ---------------------------------------------------------------------------------------
// 11. What manifest v2 records (3.1.0 review findings)
// ---------------------------------------------------------------------------------------
// 11a. The project's own documents and configuration, and merged owner files, are never
// recorded, even though the kit index lists them (`.xezar/docs/local-patches.md`, "What the
// manifest tracks"): recording them turned every ordinary edit – a routing pull request, a
// config key the upgrade checklist asks for, a label – into drift. The tracker descriptor and
// the leader guide stay recorded: an edit to either must show.
{
  const dir = upgraded.get("3.0.3");
  const m = JSON.parse(read(dir, ".xezar/onboarding.json"));
  const owner = ["SDLC.md", "CODE_REVIEW.md", ".mcp.json", ".codex/config.toml", ".gitignore", ...OWNER_CONFIG];
  for (const p of owner) {
    expect(existsSync(join(dir, p)), `not-recorded: the upgraded 3.0.3 fixture has no ${p}; re-aim this case`);
    expect(!(p in m.files), `not-recorded: the v2 manifest records ${p}, a file the project edits in normal work`);
  }
  for (const p of [".xezar/pipeline/trackers/github.md", ".xezar/docs/leader-guide.md"]) {
    expect(p in m.files, `not-recorded: the v2 manifest no longer records ${p}, which it must track`);
  }
  if (HAS_DRIFT) {
    const d = lab("not-recorded-drift");
    cpSync(dir, d, { recursive: true });
    write(d, "SDLC.md", `${read(d, "SDLC.md")}\n## A section the team added\n`);
    const mcp = JSON.parse(read(d, ".mcp.json"));
    mcp.mcpServers = { ...(mcp.mcpServers ?? {}), "team-tool": { command: "team-tool" } };
    write(d, ".mcp.json", `${JSON.stringify(mcp, null, 2)}\n`);
    const r = drift(d);
    expect(r.code === 0 && /^drift-status=pass$/m.test(r.out), `not-recorded: an ordinary edit to SDLC.md or .mcp.json fails the drift check: ${r.out.trim()}`);
    // The owner answers a checklist key and changes routing and labels after the manifest is
    // written – and a manifest from an earlier 3.1.0 build still lists the config files.
    const c = lab("not-recorded-config");
    cpSync(dir, c, { recursive: true });
    const cfg = JSON.parse(read(c, ".xezar/pipeline/config.json"));
    cfg.security = { ...(cfg.security ?? {}), trustBoundaries: [{ pattern: "deploy/**", why: "deploys" }] };
    write(c, ".xezar/pipeline/config.json", `${JSON.stringify(cfg, null, 2)}\n`);
    for (const p of OWNER_CONFIG) if (existsSync(join(c, p)) && p !== ".xezar/pipeline/config.json") write(c, p, `${read(c, p).trimEnd()}\n\n`);
    const old = JSON.parse(read(c, ".xezar/onboarding.json"));
    for (const p of OWNER_CONFIG) old.files[p] = { sha256: "0".repeat(64), origin: "generated" };
    write(c, ".xezar/onboarding.json", `${JSON.stringify(old, null, 2)}\n`);
    const rc = drift(c);
    expect(rc.code === 0 && /^drift-status=pass$/m.test(rc.out), `not-recorded: an owner edit to the project's configuration, listed by an older v2 manifest, fails the drift check: ${rc.out.trim()}`);
    // The kit's check runs in projects and cannot import lib/policy.mjs: its own list must equal
    // the upgrade tool's, or a manifest an earlier 3.1.0 build wrote fails on an ordinary edit.
    const driftText = readFileSync(DRIFT, "utf8");
    const listed = /^const NOT_RECORDED = (\[[\s\S]*?\]);$/m.exec(driftText);
    let kitList = null;
    try {
      kitList = listed ? JSON.parse(listed[1].replace(/,\s*\]$/, "]")) : null;
    } catch {
      kitList = null;
    }
    expect(
      Array.isArray(kitList) && JSON.stringify([...kitList].sort()) === JSON.stringify([...NOT_RECORDED].sort()),
      `not-recorded: manifest-drift.mjs's NOT_RECORDED (${JSON.stringify(kitList)}) differs from lib/policy.mjs's (${JSON.stringify(NOT_RECORDED)})`,
    );
    // An earlier 3.1.0 onboarding recorded the project's documents as generated: an edit to one
    // of them is ordinary work, never drift. An owner-file-appended entry is still checked.
    const g = lab("not-recorded-docs");
    cpSync(dir, g, { recursive: true });
    const oldDocs = JSON.parse(read(g, ".xezar/onboarding.json"));
    for (const p of [...NOT_RECORDED, "CLAUDE.md", "docs/CLAUDE.md"]) {
      if (!existsSync(join(g, p))) write(g, p, "# placeholder\n");
      write(g, p, `${read(g, p)}\nan ordinary edit\n`);
      oldDocs.files[p] = { sha256: "0".repeat(64), origin: "generated" };
    }
    write(g, ".xezar/onboarding.json", `${JSON.stringify(oldDocs, null, 2)}\n`);
    const rg = drift(g);
    expect(rg.code === 0 && /^drift-status=pass$/m.test(rg.out), `not-recorded: an edit to a project document an earlier v2 manifest lists fails the drift check: ${rg.out.trim()}`);
    write(g, "CLAUDE.md", "# mine\n<!-- xezar:kit:start -->\nkit text\n<!-- xezar:kit:end -->\n");
    oldDocs.files["CLAUDE.md"] = { sha256: "0".repeat(64), origin: "owner-file-appended" };
    write(g, ".xezar/onboarding.json", `${JSON.stringify(oldDocs, null, 2)}\n`);
    const ra = drift(g);
    expect(ra.code === 1 && /^drift=CLAUDE\.md origin=owner-file-appended reason=hash-mismatch$/m.test(ra.out), `not-recorded: an owner-file-appended CLAUDE.md whose kit block changed passes the drift check: ${ra.out.trim()}`);
  }
}

// 11b. Each entry records the kit copy the file actually sits on – the base the next upgrade
// merges from – not the target's copy for every file.
{
  const p = ".xezar/checks/changelog-check.sh";
  const oldE = base303.files[p];
  const newE = tree.index.files[p];
  expect(oldE && newE && oldE.kitBlob !== newE.kitBlob && newE.rewrite === "copied", `installed-base: ${p} is not a copied file the target changed; re-aim this case`);
  const oldText = pack[oldE.kitBlob];
  const manifestAfter = (name, text, patched) => {
    const dir = materialize(fx303, {
      name,
      edit: (d) => {
        write(d, p, text);
        if (patched) write(d, ".xezar/LOCAL-PATCHES.md", lp1(p, "yes"));
      },
    });
    return manifestV2(ctxFor(dir)).files[p];
  };
  // Kept at its old version (a stop the owner declined): the old copy, whole.
  const kept = manifestAfter("installed-kept", oldText, false);
  expect(kept?.kitBlob === oldE.kitBlob && kept.kitSource === oldE.kitSource && kept.sha256 === oldE.sha256, `installed-base: a file kept at 3.0.3 is recorded as ${kept?.kitBlob}, not its 3.0.3 blob ${oldE.kitBlob}`);
  // Both changed, resolved to the owner's side: the old copy plus the patch.
  const mine = manifestAfter("installed-mine", `${oldText}# local: kept by the owner\n`, true);
  expect(mine?.kitBlob === oldE.kitBlob && mine.patch === "LP-1", `installed-base: a both-changed file resolved to mine is recorded on ${mine?.kitBlob}, not its 3.0.3 blob ${oldE.kitBlob}`);
  expect(mine?.sha256 === oldE.sha256, "installed-base: a patched file's sha256 is not the digest of the copy it was installed from");
  // Merged: the target's text plus the patch sits on the target.
  const merged = manifestAfter("installed-merged", `${fresh(p, fx303.renderInputs)}# local: kept by the owner\n`, true);
  expect(merged?.kitBlob === newE.kitBlob && merged.sha256 === newE.sha256, `installed-base: a file merged onto the target is recorded on ${merged?.kitBlob}, not the target blob ${newE.kitBlob}`);
  // Written with the target's text: the target.
  const written = manifestAfter("installed-written", fresh(p, fx303.renderInputs), false);
  expect(written?.kitBlob === newE.kitBlob && written.sha256 === newE.sha256, `installed-base: a file written with the target text is recorded on ${written?.kitBlob}`);
}

// ---------------------------------------------------------------------------------------
// 12. A kit file the project removed on purpose (3.1.0 review findings)
// ---------------------------------------------------------------------------------------
// 12a. A deleted adapted file, whose v1 digest is of the rendered text and so names no base, is
// a local removal, not "new in kit": it was once written back without a word.
{
  const p = ".github/ISSUE_TEMPLATE/config.yml";
  const dir = materialize(fx303, { name: "removed-adapted", edit: (d) => unlinkSync(join(d, p)) });
  const plan = buildPlan(ctxFor(dir));
  const f = byPath(plan).get(p);
  expect(f?.class === "unexplained-local-change" && f.action === "keep", `removed: a deleted adapted file with a manifest record is ${f?.class}/${f?.action}, not unexplained-local-change/keep`);
  expect(plan.registerDrafts.add.some((x) => x.files.includes(p)), `removed: no register entry is drafted for the deleted ${p}`);
  applyPlan(ctxFor(dir), plan);
  expect(!existsSync(join(dir, p)), `removed: apply wrote the deleted ${p} back`);
}

// 12b. A removal the register records is kept through the upgrade: the plan keeps it removed
// with no stop, verify accepts the entry, manifest v2 keeps the file's entry with its patch, and
// the drift check passes. Without the entry the drift check still fails the missing file.
{
  const p = ".xezar/workflows/localisation.yaml";
  const removedWith = (name, confirmed) =>
    materialize(fx303, {
      name,
      edit: (d) => {
        unlinkSync(join(d, p));
        if (confirmed !== null) write(d, ".xezar/LOCAL-PATCHES.md", lp1(p, confirmed));
      },
    });
  const bareCtx = ctxFor(removedWith("removed-bare", null));
  const bare = byPath(buildPlan(bareCtx)).get(p);
  expect(bare?.class === "unexplained-local-change" && bare.stops.includes("unexplained-safety-file"), `removed: an unexplained deletion of the safety file ${p} is ${bare?.class} with stops ${bare?.stops}`);
  // With no register entry, manifest v2 leaves the removed file out, and the next upgrade would
  // read it as new in the kit and write it back. So verify refuses the removal until it is
  // registered or the kit's file restored, and no manifest is written.
  const unregRemoval = invariants(bareCtx, null).filter((x) => x.kind === "unregistered-local-change" && x.path === p);
  expect(unregRemoval.length === 1 && /removed with no register entry/.test(unregRemoval[0].detail), `removed: verify accepts a kit file removed with no register entry: ${JSON.stringify(unregRemoval)}`);
  // A file this project never had (no manifest record, no detected base) is new in the kit, not removed.
  const neverHad = invariants(ctxFor(materialize(fx303, { name: "removed-never-had" })), null).filter((x) => x.kind === "unregistered-local-change" && /removed with no register entry/.test(x.detail));
  expect(neverHad.every((x) => fx303.manifest.files[x.path] !== undefined), `removed: verify reports files new in the kit as removals: ${JSON.stringify(neverHad.map((x) => x.path))}`);
  const dir = removedWith("removed-kept", "yes");
  const ctx = ctxFor(dir);
  const f = byPath(buildPlan(ctx)).get(p);
  expect(f?.class === "local-only" && f.action === "keep" && !f.stops.length, `removed: a deletion the register confirms is ${f?.class}/${f?.action} with stops ${f?.stops}, not local-only/keep`);
  const binding = invariants(ctx, null).filter((x) => x.kind === "register-binding");
  expect(!binding.length, `removed: verify refuses a register entry for a deliberately removed kit file: ${JSON.stringify(binding)}`);
  const entry = manifestV2(ctx).files[p];
  expect(entry?.patch === "LP-1" && entry.sha256 === fx303.manifest.files[p].sha256 && entry.kitBlob === base303.files[p].kitBlob, `removed: manifest v2 does not keep the removed file's installed entry with its patch: ${JSON.stringify(entry)}`);
  const typo = materialize(fx303, { name: "removed-typo", edit: (d) => write(d, ".xezar/LOCAL-PATCHES.md", lp1(".xezar/workflows/no-such-file.yaml", "yes")) });
  expect(invariants(ctxFor(typo), null).some((x) => x.kind === "register-binding"), "removed: a register entry naming a path the kit never shipped is accepted");
  // A register entry binds only to a file manifest v2 records. `.mcp.json` is merged into without
  // a kit block, so it is never recorded: an entry for it would fail the drift check as
  // register-without-manifest, and verify must say so first, naming the file. An entry for a
  // present, recorded kit file is accepted.
  const untracked = materialize(fx303, { name: "register-untracked", edit: (d) => write(d, ".xezar/LOCAL-PATCHES.md", lp1(".mcp.json", "no")) });
  expect(
    invariants(ctxFor(untracked), null).some((x) => x.kind === "register-binding" && x.path === ".mcp.json" && /does not track/.test(x.detail)),
    "register-untracked: a register entry naming .mcp.json, which the manifest does not track, is accepted",
  );
  const kitFile = ".github/ISSUE_TEMPLATE/config.yml";
  const trackedDir = materialize(fx303, { name: "register-tracked", edit: (d) => write(d, ".xezar/LOCAL-PATCHES.md", lp1(kitFile, "no")) });
  const trackedBinding = invariants(ctxFor(trackedDir), null).filter((x) => x.kind === "register-binding");
  expect(!trackedBinding.length, `register-tracked: verify refuses a register entry for the recorded kit file ${kitFile}: ${JSON.stringify(trackedBinding)}`);
  if (HAS_DRIFT) {
    const up = lab("removed-drift");
    cpSync(upgraded.get("3.0.3"), up, { recursive: true });
    unlinkSync(join(up, p));
    const miss = drift(up);
    expect(miss.code === 1 && miss.out.includes(`drift=${p} origin=copied reason=missing`), `removed: an unrecorded deletion does not fail the drift check: ${miss.out.trim()}`);
    const m = JSON.parse(read(up, ".xezar/onboarding.json"));
    m.files[p].patch = "LP-1";
    write(up, ".xezar/onboarding.json", `${JSON.stringify(m, null, 2)}\n`);
    write(up, ".xezar/LOCAL-PATCHES.md", lp1(p, "yes"));
    const kept = drift(up);
    expect(kept.code === 0 && /^drift-status=pass$/m.test(kept.out), `removed: a deletion recorded as a confirmed local patch fails the drift check: ${kept.out.trim()}`);
  }
}

// 12b2. A kept local change must be in the register before the manifest records it. An edited
// check the kit did not change is kept by the plan (unexplained-local-change); if the register
// draft is dropped, verify must fail unregistered-local-change and write no manifest, or the
// edit becomes the recorded installed state and no drift check sees it again.
{
  const p = unchangedChecks[0];
  const edited = (name, register) =>
    materialize(fx303, {
      name,
      edit: (d) => {
        write(d, p, `${read(d, p)}# edited locally\n`);
        if (register) write(d, ".xezar/LOCAL-PATCHES.md", lp1(p, "no"));
      },
    });
  const bare = edited("unregistered-edit", false);
  const plan = buildPlan(ctxFor(bare));
  expect(byPath(plan).get(p)?.action === "keep", `unregistered: the plan does not keep the local edit to ${p} (${byPath(plan).get(p)?.action})`);
  applyPlan(ctxFor(bare), plan);
  const manifestBefore = read(bare, ".xezar/onboarding.json");
  const v = verify(ctxFor(bare), plan, { checks: [] });
  expect(v.status === "fail" && v.problems.some((x) => x.kind === "unregistered-local-change" && x.path === p), `unregistered: verify accepts a kept edit to ${p} with no register entry: ${JSON.stringify(v.problems)}`);
  expect(read(bare, ".xezar/onboarding.json") === manifestBefore, "unregistered: verify wrote the manifest although a kept edit has no register entry");
  expect(!invariants(ctxFor(bare), plan).some((x) => x.kind === "unregistered-local-change" && x.path !== p), `unregistered: an untouched kit file is reported: ${JSON.stringify(invariants(ctxFor(bare), plan).filter((x) => x.kind === "unregistered-local-change" && x.path !== p))}`);
  const withEntry = edited("registered-edit", true);
  const plan2 = buildPlan(ctxFor(withEntry));
  applyPlan(ctxFor(withEntry), plan2);
  const inv = invariants(ctxFor(withEntry), plan2).filter((x) => x.kind === "unregistered-local-change");
  expect(!inv.length, `unregistered: a kept edit the register names is refused: ${JSON.stringify(inv)}`);
}

// 12b3. A project's own gate list is a filled-in value, not a local change. Onboarding writes the
// project's gates into repo-gates.sh's GATE_NAMES, GATE_COMMANDS and GATE_APPLICATION_LANES with no
// placeholder, so they are rendered regions (lib/rewrites.mjs, RENDERED_REGIONS): masked for
// comparison, recovered as renderInputs, and put back into the new kit text. The kit's drift check
// reads the same regions from renderInputs, so a later change to the gate list is not drift either.
{
  const p = ".xezar/checks/repo-gates.sh";
  const list = '(\n  "yarn install --immutable"\n  ".xezar/checks/security-scan.sh"\n  "yarn typecheck"\n  "yarn test"\n  ".xezar/checks/repository-checks.sh"\n)';
  const ownGates = (text) =>
    text
      .replace(/^GATE_NAMES=\([\s\S]*?^\)$/m, () => `GATE_NAMES=${list}`)
      .replace(/^GATE_COMMANDS=\([\s\S]*?^\)$/m, () => `GATE_COMMANDS=${list}`)
      .replace(/^GATE_APPLICATION_LANES=.*$/m, () => 'GATE_APPLICATION_LANES="${GATE_APPLICATION_LANES-3;4}"');
  expect(ownGates(fresh(p, fx303.renderInputs)) !== fresh(p, fx303.renderInputs), "own-gates: the gate list rewrite matched nothing in the kit's repo-gates.sh; re-aim this case");
  const dir = materialize(fx303, {
    name: "own-gates",
    edit: (d) => {
      write(d, p, ownGates(read(d, p)));
      const m = JSON.parse(read(d, ".xezar/onboarding.json"));
      m.files[p].sha256 = sha256(read(d, p)); // onboarding recorded the file it wrote
      write(d, ".xezar/onboarding.json", `${JSON.stringify(m, null, 2)}\n`);
    },
  });
  const plan = buildPlan(ctxFor(dir));
  const item = byPath(plan).get(p);
  expect(item?.class === "clean-update" && item.action === "write-theirs", `own-gates: a project's own gate list makes ${p} ${item?.class}/${item?.action}, not a clean update`);
  expect(item && !item.stops.length && !item.unexplained, `own-gates: ${p} stops (${item?.stops}) or is unexplained (${item?.unexplained})`);
  expect(!plan.registerDrafts.add.some((d) => d.files.includes(p)), `own-gates: a register entry is drafted for ${p}`);
  const r = applyPlan(ctxFor(dir), plan);
  expect(r.status === "ok", `own-gates: apply refused: ${JSON.stringify(r.refused)}`);
  expect(read(dir, p) === ownGates(fresh(p, fx303.renderInputs)), `own-gates: after apply ${p} is not the ${TARGET} kit text with the project's gate list`);
  const unreg = invariants(ctxFor(dir), plan).filter((x) => x.kind === "unregistered-local-change" && x.path === p);
  expect(!unreg.length, `own-gates: verify reports the project's gate list as a local change: ${JSON.stringify(unreg)}`);
  const v = verify(ctxFor(dir), plan, { checks: [] });
  expect(!v.problems.some((x) => x.path === p), `own-gates: verify fails ${p}: ${JSON.stringify(v.problems.filter((x) => x.path === p))}`);
  const entry = JSON.parse(read(dir, ".xezar/onboarding.json")).files?.[p];
  expect(entry && !entry.patch && /yarn typecheck/.test(entry.renderInputs?.GATE_COMMANDS ?? ""), `own-gates: the manifest does not record the gate list as renderInputs: ${JSON.stringify(entry)}`);
  // The next upgrade, from the version-2 manifest just written (round-10 review): the recorded
  // copy is found by its kitBlob, and the gate list changed since must be read from the file,
  // not from the recorded renderInputs, or the owner's own gates look like a local change to a
  // safety file (a stop, and a register draft that ends the drift check on the gate runner).
  {
    git(dir, "add", "-A");
    git(dir, "-c", "user.name=fixture", "-c", "user.email=fixture@example.invalid", "commit", "-qm", "upgrade");
    const before = read(dir, p);
    write(dir, p, before.replaceAll('  "yarn test"\n', '  "yarn test"\n  "yarn lint"\n'));
    expect(read(dir, p) !== before, "own-gates next: the gate-list edit matched nothing; re-aim this case");
    git(dir, "-c", "user.name=fixture", "-c", "user.email=fixture@example.invalid", "commit", "-qam", "a new gate");
    const treeBlobs = {};
    for (const e of Object.values(tree.index.files)) if (e.kitSource) treeBlobs[e.kitBlob] = tree.kitFiles.get(`kit/${e.kitSource}`).toString("utf8");
    const treePack = join(lab("tree-pack"), "blobs.json.gz");
    writeFileSync(treePack, gzipSync(JSON.stringify(treeBlobs)));
    const nextCtx = () =>
      ctxFor(dir, { target: "3.1.1", indexes: [...history.filter((v) => v.version !== TARGET), { ...tree.index, version: TARGET }], blobPacks: [PACK, treePack] });
    const next = buildPlan(nextCtx());
    const nextItem = byPath(next).get(p);
    expect(nextItem?.base?.via === "manifest-kitBlob", `own-gates next: ${p} did not find its base from the version-2 manifest's kitBlob (${nextItem?.base?.via}); re-aim this case`);
    expect(["unchanged-upstream", "already-upstream"].includes(nextItem?.class) && !nextItem.stops.length && !nextItem.unexplained, `own-gates next: a gate list changed after a version-2 manifest makes ${p} ${nextItem?.class} (stops ${nextItem?.stops}, unexplained ${nextItem?.unexplained})`);
    expect(!next.registerDrafts.add.some((d) => d.files.includes(p)), `own-gates next: a register entry is drafted for ${p}`);
    const nextUnreg = invariants(nextCtx(), next).filter((x) => x.kind === "unregistered-local-change" && x.path === p);
    expect(!nextUnreg.length, `own-gates next: verify reports the changed gate list as a local change: ${JSON.stringify(nextUnreg)}`);
  }
  // A fresh-onboarding shape too: the unchanged kit file with the same list is a normalised match.
  expect(normalisedMatch(fresh(p, fx303.renderInputs), read(dir, p)).exact, "own-gates: the kit text and the project's gate runner are not an exact normalised match");
  if (HAS_DRIFT) {
    const st = (x) => /^drift-status=(\S+)$/m.exec(x.out)?.[1];
    const passed = drift(dir);
    expect(passed.code === 0 && st(passed) === "pass", `own-gates: the drift check fails the upgraded gate runner: ${passed.out.trim()}`);
    const edited = lab("own-gates-edited");
    cpSync(dir, edited, { recursive: true });
    const before = read(edited, p);
    write(edited, p, before.replaceAll('  "yarn test"\n', '  "yarn test"\n  "yarn lint"\n'));
    expect(read(edited, p) !== before, "own-gates: the later gate-list edit matched nothing; re-aim this case");
    const later = drift(edited);
    expect(later.code === 0 && st(later) === "pass", `own-gates: the drift check fails a later change to the gate list: ${later.out.trim()}`);
    write(edited, p, `${read(edited, p)}# silent\n`);
    const silent = drift(edited);
    expect(silent.code === 1 && silent.out.includes(`drift=${p}`), `own-gates: the drift check accepts an edit outside the gate list: ${silent.out.trim()}`);
    // The two copies of the region rules agree: the tool's and the drift check's.
    const driftText = readFileSync(DRIFT, "utf8");
    for (const { key, re } of RENDERED_REGIONS) {
      expect(driftText.includes(`{ key: "${key}", re: ${re} }`), `own-gates: manifest-drift.mjs GATE_REGIONS and lib/rewrites.mjs RENDERED_REGIONS disagree on ${key}`);
    }
    expect((driftText.match(/\{ key: "GATE_[A-Z_]+", re: /g) ?? []).length === RENDERED_REGIONS.length, "own-gates: manifest-drift.mjs GATE_REGIONS and lib/rewrites.mjs RENDERED_REGIONS disagree on the number of regions");
  }
}

// 12b4. The project's own role skills and workflows reach the plan (round-9 review). No kit
// version ships them, so detection never saw them, yet the target's catalog check judges them:
// each is a local-only item with the own-file-kit-contract review, and apply leaves it alone.
{
  const skill = ".xezar/skills/xezar-mobile-release.md";
  const current = ".xezar/skills/xezar-mobile-current.md";
  const plain = ".xezar/skills/xezar-mobile-notes.md";
  const wf = ".xezar/workflows/nightly-audit.yaml";
  const tailOf = (text) => `## Shared contract\n${text.split("## Shared contract\n")[1]}`;
  const dir = materialize(fx303, {
    name: "own-files",
    edit: (d) => {
      const oldTail = tailOf(read(d, ".xezar/skills/xezar-docs-maintenance.md"));
      const newTail = tailOf(fresh(".xezar/skills/xezar-docs-maintenance.md", fx303.renderInputs));
      write(d, skill, `---\nname: xezar-mobile-release\ndescription: Ship the mobile app.\n---\n\n# Mobile release\n\nOwner text.\n\n${oldTail}`);
      write(d, current, `---\nname: xezar-mobile-current\ndescription: Already current.\n---\n\n# Current\n\n${newTail}`);
      write(d, plain, "---\nname: xezar-mobile-notes\ndescription: No shared contract.\n---\n\n# Notes\n");
      write(d, wf, "name: nightly-audit\ndescription: \"A nightly audit.\"\nsteps:\n  - id: audit\n    name: Audit\n    prompt: \"Audit: {{task}}\"\n");
    },
  });
  const before = Object.fromEntries([skill, current, plain, wf].map((p) => [p, read(dir, p)]));
  const plan = buildPlan(ctxFor(dir));
  const files = byPath(plan);
  for (const p of [skill, current, wf]) {
    const f = files.get(p);
    expect(f?.class === "local-only" && f.action === "keep" && f.reviews.includes("own-file-kit-contract"), `own-files: ${p} is ${f?.class}/${f?.action} with reviews ${f?.reviews}, not a local-only own-file-kit-contract review`);
    expect(plan.reviews.some((r) => r.path === p && r.reason === "own-file-kit-contract"), `own-files: ${p} is not on the plan's reviews list`);
    expect(!f?.stops.length && !f?.unexplained, `own-files: ${p} stops (${f?.stops}) or is unexplained`);
  }
  expect(/replace everything from its `## Shared contract` heading/.test(files.get(skill)?.notes.join("\n") ?? ""), `own-files: the old-tail role skill's notes do not say to take the target's tail: ${files.get(skill)?.notes}`);
  expect(/already equals the target's/.test(files.get(current)?.notes.join("\n") ?? ""), `own-files: a role skill with the target's tail is not said to be current: ${files.get(current)?.notes}`);
  expect(/timeout/.test(files.get(wf)?.notes.join("\n") ?? "") && /permission change/.test(files.get(wf)?.notes.join("\n") ?? ""), `own-files: the workflow's notes do not quote the timeout and grant rules: ${files.get(wf)?.notes}`);
  expect(!files.has(plain), `own-files: a role skill with no shared contract is in the plan (${files.get(plain)?.class})`);
  expect(!plan.files.some((f) => f.path.startsWith(".xezar/skills/xezar-docs-maintenance") && f.reviews.includes("own-file-kit-contract")), "own-files: a kit role skill is flagged as the project's own");
  expect(!plan.registerDrafts.add.some((d) => d.files.some((p) => [skill, current, wf].includes(p))), "own-files: a register entry is drafted for a file the manifest does not track");
  applyPlan(ctxFor(dir), plan);
  for (const [p, text] of Object.entries(before)) expect(read(dir, p) === text, `own-files: apply changed the project's own ${p}`);
}

// 12c. The leader guide is generated from a kit template: its plan item points at that template,
// so the merge has a theirs to read, and says whether it changed since the project's version.
{
  const p = ".xezar/docs/leader-guide.md";
  const f = byPath(buildPlan(ctxFor(materialize(fx303, { name: "leader-template" }), { blobRepo: root }))).get(p);
  expect(f?.class === "owner-shaped" && f.theirs?.kitSource === "leader-guide.template.md", `leader-template: the leader guide's plan item names no kit template (${JSON.stringify(f?.theirs)})`);
  expect(f?.notes.some((n) => /template (changed|unchanged)|could not tell whether the template changed/.test(n)), `leader-template: the leader guide's notes do not say whether its template changed (${f?.notes})`);
  // A shallow CI checkout has no 3.0.3 commit, so the planner cannot tell; a full clone must.
  let hasHistory = false;
  try {
    hasHistory = /^[0-9a-f]{40}$/.test(git(root, "rev-parse", "--verify", "-q", `${base303.commit}^{commit}`).trim());
  } catch {
    hasHistory = false;
  }
  if (hasHistory) expect(f?.notes.includes("template changed in the kit since the project's version: merge its changes in"), `leader-template: the 3.1.0 template changes are not reported against 3.0.3 (${f?.notes})`);
}

// ---------------------------------------------------------------------------------------
// 13. Steps the tool never performs still reach the owner (3.1.0 review 4)
// ---------------------------------------------------------------------------------------
// 13a. 3.1.0 entries 4 and 11 name their per-machine steps as actions, so a 3.0.3 project's
// owner checklist carries them.
{
  const plan = buildPlan(ctxFor(materialize(fx303, { name: "per-machine-310" })));
  for (const a of [
    "per-machine=remove-mcp-permission:mcp__chrome-devtools__*",
    "per-machine=remove-mcp-permission:mcp__chrome-devtools",
    "per-machine=add-runner-model:pi/deepseek-api/deepseek-v4-pro",
  ]) {
    expect(plan.actions.includes(a), `per-machine: a 3.0.3 project's plan does not carry ${a} (${plan.actions.join(", ")})`);
  }
  const ok = parseBlocks("```upgrade\nApplies-to: *\nActions: per-machine=add-runner-model:pi/x/y\n```\n", "t");
  expect(!ok.errors.length, `machine block: per-machine=add-runner-model is refused: ${ok.errors}`);
}

// 13b. A 3.0.0 project: 3.0.2's per-machine steps are actions; an in-range entry with no block is
// listed for reading, never dropped; and a new owner-shaped permission file (.codex/config.toml,
// first shipped at 3.0.2) stops for the owner like every other permission change.
{
  const plan = buildPlan(ctxFor(materialize(loadFixture("3.0.0"), { name: "per-machine-300" })));
  for (const a of [
    "per-machine=trust-codex-project:<absolute-project-path>",
    "per-machine=enable-mcp-server:chrome-devtools",
    "per-machine=add-mcp-permission:mcp__chrome-devtools__take_screenshot",
  ]) {
    expect(plan.actions.includes(a), `3.0.0: the plan does not carry 3.0.2's ${a} (${plan.actions.join(", ")})`);
  }
  const listed = (plan.unblockedEntries ?? []).map((e) => e.heading);
  expect(listed.some((h) => h.includes("upgrading an onboarded project to 3.0.2") && h.includes("6. Workflow dispatch")), `3.0.0: 3.0.2 entry 6, which has no block, is not listed for reading (${listed.join(" | ")})`);
  expect(listed.some((h) => h.includes("my routing still sends Codex work")), `3.0.0: a 2026-09-23 entry with no block is not listed for reading (${listed.join(" | ")})`);
  expect(!listed.some((h) => h.includes("4. Browser config")), "3.0.0: 3.0.2 entry 4 has a block but is listed as having none");
  expect(/^## Upgrade entries with no machine block$/m.test(summary(plan)), "summary: plan.md does not list the upgrade entries with no machine block");
  const codex = byPath(plan).get(".codex/config.toml");
  expect(
    codex?.class === "owner-shaped" && codex.stops.includes("permission-change") && codex.notes.some((n) => n.startsWith("grant: ")),
    `3.0.0: the new .codex/config.toml carries no permission-change stop (${JSON.stringify({ class: codex?.class, stops: codex?.stops, notes: codex?.notes })})`,
  );
}

// 13c. The range: a 3.0.3 project is not sent back to 3.0.2's entries, and a dated entry older
// than the project's version is left out once that version's date is known.
{
  const plan = buildPlan(ctxFor(materialize(fx303, { name: "unblocked-303" })));
  const listed = (plan.unblockedEntries ?? []).map((e) => e.heading);
  expect(Array.isArray(plan.unblockedEntries), "plan: no unblockedEntries list");
  expect(!listed.some((h) => h.includes("to 3.0.2")), `3.0.3: 3.0.2 entries are listed for reading (${listed.join(" | ")})`);
  const dated = planTool.unblockedEntries?.(root, "3.0.0", "2026-09-23")?.entries.map((e) => e.heading) ?? [];
  expect(dated.some((h) => h.includes("my routing still sends Codex work")) && !dated.some((h) => h.startsWith("2026-09-22")), `range: entries dated before the project's version are listed, or same-day ones dropped (${dated.join(" | ")})`);
}

// 14a. A tracked owner-shaped file (.claude/settings.json) whose kept content differs from the
// kit's copy at its base and at the target: the verifier requires a register entry for it, so
// the plan drafts one and lists it as unexplained and for reading (cmplus dry run).
{
  const p = ".claude/settings.json";
  const dir = materialize(fx303, {
    name: "owner-shaped-hook",
    edit: (d) => {
      const j = JSON.parse(read(d, p));
      j.hooks = { ...j.hooks, PostToolUse: [{ matcher: "Edit", hooks: [{ type: "command", command: "bash scripts/format.sh" }] }] };
      write(d, p, `${JSON.stringify(j, null, 2)}\n`);
    },
  });
  const plan = buildPlan(ctxFor(dir));
  const item = byPath(plan).get(p);
  expect(item?.class === "owner-shaped", `owner-hook: ${p} is ${item?.class}, not owner-shaped; re-aim this case`);
  expect(plan.unexplained.includes(p), `owner-hook: a tracked owner-shaped file with a kept local change is not listed as unexplained (${plan.unexplained.join(", ")})`);
  expect(plan.registerDrafts.add.some((d) => d.files.includes(p)), "owner-hook: no register entry is drafted for a tracked owner-shaped file the verifier will require one for");
  expect(plan.reviews.some((r) => r.path === p && r.reason === "safety-local-change"), "owner-hook: the kept change in a safety file is not on the reviews list");
  // Untouched, it needs nothing; an untracked owner-shaped file (SDLC.md) never gets a draft.
  const clean = buildPlan(ctxFor(materialize(fx303, { name: "owner-hook-clean", edit: (d) => write(d, "SDLC.md", `${read(d, "SDLC.md") ?? ""}\nOur rule.\n`) })));
  expect(!clean.unexplained.includes(p) && !clean.registerDrafts.add.some((d) => d.files.includes(p)), "owner-hook: an untouched .claude/settings.json is drafted a register entry");
  expect(!clean.registerDrafts.add.some((d) => d.files.includes("SDLC.md")), "owner-hook: SDLC.md, which the manifest never tracks, is drafted a register entry");
}

// 14b. A manifest that names no kit version (`version: 1`): the entry range comes from the
// files' sure bases, not from every entry back to the first. With no such evidence it stays
// "every entry", and plan.md says which.
{
  const withVersion = buildPlan(ctxFor(materialize(fx303, { name: "range-known" })));
  const unnamed = buildPlan(
    ctxFor(materialize(fx303, { name: "range-evidence", edit: (d) => write(d, ".xezar/onboarding.json", `${JSON.stringify({ ...fx303.manifest, version: 1 }, null, 2)}\n`) })),
  );
  const heads = (plan) => plan.upgradeEntries.map((e) => `${e.line}:${e.appliesTo}`).join(" | ");
  const every = upgradeEntries(root, null).entries;
  expect(unnamed.versionEvidence?.version === "3.0.3", `range: a 3.0.3 install whose manifest names no version shows ${JSON.stringify(unnamed.versionEvidence)}, not 3.0.3`);
  expect(unnamed.versionEvidence && unnamed.versionEvidence.support * 2 > unnamed.versionEvidence.total, "range: the evidence is not a majority of the sure files");
  expect(heads(unnamed) === heads(withVersion), `range: with no manifest version the entries are not those for 3.0.3 (${unnamed.upgradeEntries.length} vs ${withVersion.upgradeEntries.length})`);
  expect(unnamed.upgradeEntries.length < every.length, `range: the evidence did not narrow the entries (${unnamed.upgradeEntries.length} of ${every.length})`);
  expect(!(unnamed.unblockedEntries ?? []).some((e) => e.heading.includes("to 3.0.2")), "range: with the files at 3.0.3, 3.0.2 entries are still listed for reading");
  expect(summary(unnamed).includes("Upgrade entries are chosen as for 3.0.3"), "range: plan.md does not say the range came from the files");
  const bare = buildPlan(
    ctxFor(materialize(fx303, { name: "range-none", edit: (d) => write(d, ".xezar/onboarding.json", `${JSON.stringify({ version: 1, date: fx303.manifest.date }, null, 2)}\n`) })),
  );
  expect(bare.versionEvidence === null && bare.upgradeEntries.length === every.length, `range: with no evidence at all the plan does not list every entry (${bare.upgradeEntries.length} of ${every.length})`);
  expect(summary(bare).includes("every upgrade entry is listed"), "range: plan.md does not say every entry is listed when nothing names a version");
}

// 14c. Each upgrade entry in the plan names its UPGRADE_NOTES.md heading and line, and plan.md
// lists each entry's actions under that heading.
{
  const plan = buildPlan(ctxFor(materialize(fx303, { name: "entry-headings" })));
  const notes = readFileSync(join(root, "UPGRADE_NOTES.md"), "utf8").split("\n");
  for (const e of plan.upgradeEntries) {
    const at = notes[e.line - 1] ?? "";
    expect(typeof e.heading === "string" && /^#{2,3} /.test(at) && e.heading.endsWith(at.replace(/^#{2,3} /, "").trim()), `entries: an upgrade entry's line ${e.line} is not its heading ${JSON.stringify(e.heading)} (${JSON.stringify(at)})`);
  }
  const design = plan.upgradeEntries.find((e) => e.actions.includes("config-key=designSystem.modules"));
  expect(design && design.heading.includes("1. Design-system modules"), `entries: the designSystem.modules action is not under entry 1's heading (${design?.heading})`);
  const md = summary(plan);
  expect(design && md.includes(`- ${design.source}:${design.line} ${design.heading}\n  - config-key=designSystem.modules`), "entries: plan.md does not list an entry's actions under its heading");
}

// detect() is exercised through buildPlan; keep one direct call so its export stays honest.
expect(Array.isArray(detect(ctxFor(upgraded.get("3.0.3"))).files), "detect() no longer returns a file list");
expect(typeof manifestV2 === "function", "verify.mjs no longer exports manifestV2");

if (problems) {
  console.error(`\nupgrade: ${problems} problem(s) in ${checks} checks`);
  process.exit(1);
}
console.log(`Upgrade tool OK (${checks} checks; ${SYNTHETIC.length} synthetic installs${HAS_DRIFT ? "" : "; drift cases skipped until stream U1 lands"}).`);
