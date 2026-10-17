#!/usr/bin/env node
// Builds the committed upgrade fixtures under scripts/fixtures/upgrade/ (plan §7).
//
// A synthetic fixture is what a fresh onboarding of one kit version would have written: every
// file of that version's copy map, taken from the committed kit index and the blob contents in
// git, plus small generated owner files and a version 1 manifest. It is built once from local
// tags and commits and committed, so scripts/test-upgrade.mjs reads only committed files and
// the gate stays offline (CI's shallow checkout has no tags).
//
// Output:
//   scripts/fixtures/upgrade/<version>/fixture.json   one per source version, with its commit
//   scripts/fixtures/upgrade/blobs.json.gz.hex        { "<git blob sha>": "<text>" } for them all,
//                                                     gzipped and hex-encoded
//
// Real, sanitised installs are added by the owner by hand (see the README there); this script
// never touches them.
//
// Run: node scripts/build-upgrade-fixtures.mjs   (needs full history and tags)

import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { gitBlobSha, sha256, stableJson } from "../upgrade/tools/lib/hash.mjs";
import { render } from "../upgrade/tools/lib/rewrites.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(root, "scripts/fixtures/upgrade");

// The four majors the plan names, and one install from an untagged commit.
export const SOURCES = ["1.2.0", "2.1.1", "3.0.0", "3.0.3", "3.0.1+7140051874c0"];

// Placeholder values a synthetic onboarding filled in. Plain, made-up text.
export const RENDER_INPUTS = {
  REPO_SLUG: "example-org/widget",
  PRODUCT: "Widget",
  UI_SCOPE: "command names, flags, help text and output shapes",
  RISK_SURFACES: "the payment adapter and the export format",
  DESIGNS_DIR: "docs/designs",
};

// Descriptors a synthetic project chose (one toolchain, one browser; the rest is optional).
const CHOSEN_OPTIONAL = new Set([".xezar/pipeline/toolchains/npm.md", ".xezar/pipeline/browsers/playwright.md"]);
const OPTIONAL = (p) => /^\.xezar\/pipeline\/(toolchains|browsers)\//.test(p) && p !== ".xezar/pipeline/browsers/chrome-devtools.md";

function generatedFiles(index) {
  const f = index.files;
  const out = {};
  if (f[".xezar/config.json"]) out[".xezar/config.json"] = `${JSON.stringify({ baseBranch: "trunk" }, null, 2)}\n`;
  if (f[".xezar/pipeline/config.json"]) {
    out[".xezar/pipeline/config.json"] = `${JSON.stringify(
      {
        baseBranch: "trunk",
        validation: { commands: ["make lint", "make test"] },
        paths: { qa: ".local/xezar/qa", designs: "docs/designs" },
        qa: { enabled: true },
      },
      null,
      2,
    )}\n`;
  }
  if (f[".xezar/pipeline/labels.json"]) out[".xezar/pipeline/labels.json"] = `${JSON.stringify({ groups: {} }, null, 2)}\n`;
  if (f[".xezar/pipeline/trackers/github.md"]) out[".xezar/pipeline/trackers/github.md"] = "# Tracker: GitHub\n\nSynthetic fixture descriptor.\n";
  if (f[".xezar/docs/leader-guide.md"]) {
    out[".xezar/docs/leader-guide.md"] = "# Leader guide\n\n## Repository setup\n\nSynthetic fixture.\n\n## Owner's rules\n\n- Merge only after the owner reads the QA report.\n\n## Checklist\n\n- Read this guide.\n";
  }
  if (f[".xezar/docs/model-routing.md"]) {
    out[".xezar/docs/model-routing.md"] = "# Model routing\n\n| Row | Lane |\n|---|---|\n| implementation | claude-main |\n| review | codex-review |\n";
  }
  if (f["SDLC.md"]) out["SDLC.md"] = "# SDLC\n\n## The QA gate\n\nSynthetic fixture.\n";
  if (f["CODE_REVIEW.md"]) out["CODE_REVIEW.md"] = "# Code review\n\nSynthetic fixture.\n";
  out[".gitignore"] = "/.local/\n.claude/settings.local.json\n/.agents/skills/xez-*\n/.claude/skills/xez-*\n/skills-lock.json\n";
  return out;
}

function main() {
  const list = JSON.parse(readFileSync(join(root, "upgrade/kit-index/index.json"), "utf8")).versions;
  const blobs = new Map();
  const need = new Set();
  const fixtures = [];
  for (const version of SOURCES) {
    const meta = list.find((v) => v.version === version);
    if (!meta) throw new Error(`kit index has no version ${version}: run scripts/build-kit-index.mjs first`);
    const index = JSON.parse(readFileSync(join(root, "upgrade/kit-index", `${version}.json`), "utf8"));
    const files = {};
    for (const [p, e] of Object.entries(index.files)) {
      if (e.rewrite === "generated") continue;
      if (OPTIONAL(p) && !CHOSEN_OPTIONAL.has(p)) continue;
      files[p] = e.kitBlob;
      need.add(e.kitBlob);
    }
    fixtures.push({ version, meta, index, files });
  }
  const shas = [...need].sort();
  const batch = execFileSync("git", ["cat-file", "--batch"], { cwd: root, input: `${shas.join("\n")}\n`, maxBuffer: 512 * 1024 * 1024 });
  let pos = 0;
  for (const sha of shas) {
    const nl = batch.indexOf(10, pos);
    const [got, , size] = batch.subarray(pos, nl).toString().split(" ");
    if (got !== sha) throw new Error(`cat-file returned ${got} for ${sha}`);
    const content = batch.subarray(nl + 1, nl + 1 + Number(size));
    const text = content.toString("utf8");
    if (gitBlobSha(text) !== sha) throw new Error(`blob ${sha} is not UTF-8 text; the pack stores text only`);
    blobs.set(sha, text);
    pos = nl + 1 + Number(size) + 1;
  }

  for (const { version, meta, index, files } of fixtures) {
    const generated = generatedFiles(index);
    // A version 1 manifest as that version's onboarding wrote it. Per-file digests appear
    // from 3.0.0 on in these fixtures; older ones record only the descriptors.
    const manifest = { version, date: "2026-01-01T00:00:00Z", stack: { language: "synthetic" }, descriptors: {} };
    const perFile = {};
    for (const [p, blob] of Object.entries(files)) {
      const e = index.files[p];
      const text = e.rewrite === "adapted" ? render(blobs.get(blob), RENDER_INPUTS).text : blobs.get(blob);
      if (p.startsWith(".xezar/pipeline/")) manifest.descriptors[p] = sha256(text);
      perFile[p] = { sha256: sha256(text), origin: e.rewrite };
    }
    for (const [p, text] of Object.entries(generated)) {
      if (index.files[p]) perFile[p] = { sha256: sha256(text), origin: "generated" };
    }
    if (version.startsWith("3.")) manifest.files = perFile;
    const dir = join(OUT, version);
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      join(dir, "fixture.json"),
      stableJson({
        note: "Synthetic install built by scripts/build-upgrade-fixtures.mjs. Do not edit by hand.",
        version,
        commit: meta.commit,
        tag: meta.tag,
        renderInputs: RENDER_INPUTS,
        files,
        generated,
        manifest,
      }),
    );
  }
  const pack = Object.fromEntries([...blobs].sort(([a], [b]) => (a < b ? -1 : 1)));
  // Hex, not raw gzip: the repository's text greps (lint.sh) must never match inside binary.
  const hex = gzipSync(Buffer.from(JSON.stringify(pack)), { level: 9 }).toString("hex");
  writeFileSync(join(OUT, "blobs.json.gz.hex"), `${hex.replace(/(.{120})/g, "$1\n")}\n`);
  console.log(`upgrade fixtures written: ${fixtures.length} versions, ${blobs.size} blobs`);
  if (!existsSync(join(OUT, "README.md"))) console.log("note: scripts/fixtures/upgrade/README.md is missing");
}

main();
