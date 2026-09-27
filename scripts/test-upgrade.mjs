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
//      and a plan that went stale;
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
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { sha256 } from "../upgrade/tools/lib/hash.mjs";
import { readPack } from "../upgrade/tools/lib/blobs.mjs";
import { render, extractInputs, placeholdersIn } from "../upgrade/tools/lib/rewrites.mjs";
import { assertRepoRelative, resolveInside, PathRefused } from "../upgrade/tools/lib/paths.mjs";
import { parseRegister } from "../upgrade/tools/lib/register.mjs";
import { parseBlocks, satisfies } from "../upgrade/tools/lib/machine-block.mjs";
import { tomlError } from "../upgrade/tools/lib/toml.mjs";
import { lineDistance } from "../upgrade/tools/lib/diff.mjs";
import { diffIndexes, indexFromTree, loadIndexes, SKILL_DIR } from "../upgrade/tools/lib/kit-index.mjs";
import { loadContext } from "../upgrade/tools/lib/context.mjs";
import { OWNER_SHAPED } from "../upgrade/tools/lib/policy.mjs";
import { detect } from "../upgrade/tools/detect.mjs";
import { buildPlan, engineChecks, engineVersion } from "../upgrade/tools/plan.mjs";
import { applyPlan } from "../upgrade/tools/apply.mjs";
import { verify, manifestV2, projectChecks } from "../upgrade/tools/verify.mjs";

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

// ---------------------------------------------------------------------------------------
// 6. Each 3.1.0 machine block's Files: matches the kit-index diff
// ---------------------------------------------------------------------------------------
{
  const lastTag = [...history].reverse().find((v) => v.tag);
  const d = diffIndexes(lastTag, tree.index);
  const changed = [...d.added, ...d.removed, ...d.changed].filter((p) => tree.index.files[p]?.rewrite !== "generated" && lastTag.files[p]?.rewrite !== "generated");
  const notesDir = join(root, "docs/plans/3.1.0/notes");
  const sources = [];
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

// detect() is exercised through buildPlan; keep one direct call so its export stays honest.
expect(Array.isArray(detect(ctxFor(upgraded.get("3.0.3"))).files), "detect() no longer returns a file list");
expect(typeof manifestV2 === "function", "verify.mjs no longer exports manifestV2");

if (problems) {
  console.error(`\nupgrade: ${problems} problem(s) in ${checks} checks`);
  process.exit(1);
}
console.log(`Upgrade tool OK (${checks} checks; ${SYNTHETIC.length} synthetic installs${HAS_DRIFT ? "" : "; drift cases skipped until stream U1 lands"}).`);
