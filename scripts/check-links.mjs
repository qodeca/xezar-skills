#!/usr/bin/env node
// Offline cross-reference checker for every Markdown document this repository ships.
//
// Why. The collection is 39 skills plus their reference files, and the skills point at
// each other constantly: a body says "follow `references/pr-finalize.md`", a document
// says "see [DECISIONS.md](DECISIONS.md) -> Naming". A rename moves the file and leaves
// the pointer behind. Nothing at run time notices: the agent simply does not find the
// file, and the step it described silently does not happen. That is the same failure
// shape as a label that was never created -- a promise with nothing behind it.
//
// What it checks, all without network access:
//   1. Markdown links `[text](path)` and `[text](path#anchor)` that are relative --
//      the target file must exist.
//   2. The `#anchor` half -- the target document must contain a heading that slugifies
//      to it.
//   3. Backtick-quoted reference paths inside skills (`references/<name>.md`) -- the
//      file must exist next to that skill.
//
// What it deliberately does NOT check: absolute URLs (that needs the network, and this
// gate must stay runnable with no credentials and no connection), and `mailto:`.
//
// Run: node scripts/check-links.mjs

import { readFileSync, existsSync, statSync, globSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, relative, resolve, posix } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

// `skills/<name>/kit/**` is excluded: a kit is vendored payload a skill copies into a
// consumer project, and its relative links resolve at the INSTALL location, not here.
// `../../AGENTS.md` from a kit doc is correct once installed and necessarily broken in
// this tree. Checking it here would only teach contributors to rewrite the payload so a
// checker passes, which is the one thing a vendored copy must not do.
const isKit = (p) => /^skills\/[^/]+\/kit\//.test(p);

const FILES = [
  ...globSync("*.md", { cwd: root }),
  ...globSync("docs/**/*.md", { cwd: root }),
  ...globSync("skills/**/*.md", { cwd: root }),
  ...globSync(".xezar/**/*.md", { cwd: root }),
].filter((p) => !isKit(p.split("\\").join("/"))).sort();

/** GitHub's heading slug: lowercase, drop punctuation, spaces to hyphens. */
function slug(heading) {
  // Deliberately does NOT collapse runs of spaces and does NOT trim after stripping
  // punctuation. GitHub does neither, so "## Tier 1 -- do first" becomes
  // "tier-1--do-first" (two hyphens) and a heading starting with an emoji gets a
  // leading hyphen. Collapsing here would reject anchors that actually work.
  return heading
    .trim()
    .toLowerCase()
    .replace(/[`*_~]/g, "")
    .replace(/[^\p{L}\p{N} -]/gu, "")
    .replace(/ /g, "-");
}

const anchorCache = new Map();
function anchorsOf(absPath) {
  if (anchorCache.has(absPath)) return anchorCache.get(absPath);
  const set = new Set();
  try {
    let inFence = false;
    for (const line of readFileSync(absPath, "utf8").split("\n")) {
      if (/^\s*```/.test(line)) { inFence = !inFence; continue; }
      if (inFence) continue;
      const m = /^#{1,6}\s+(.*?)\s*$/.exec(line);
      if (m) set.add(slug(m[1]));
      // Explicit HTML anchors are a legitimate target too.
      for (const a of line.matchAll(/<a\s+(?:id|name)="([^"]+)"/g)) set.add(a[1]);
    }
  } catch { /* unreadable target is reported by the existence check */ }
  anchorCache.set(absPath, set);
  return set;
}

const problems = [];
let links = 0;
let refs = 0;

function lineOf(text, index) {
  return text.slice(0, index).split("\n").length;
}

for (const rel of FILES) {
  const abs = join(root, rel);
  const text = readFileSync(abs, "utf8");
  const dir = dirname(abs);
  const isExample = /<!--\s*example\s*-->/.test(text);

  // Link syntax inside a code fence or a code span is an ILLUSTRATION -- every skill
  // shows report templates containing `[#123](url)`. Blank those regions out (keeping
  // the byte offsets, so line numbers stay right) before looking for real links.
  const prose = text
    .replace(/```[\s\S]*?```/g, (b) => b.replace(/[^\n]/g, " "))
    .replace(/`[^`\n]*`/g, (b) => " ".repeat(b.length));

  // --- 1 and 2: markdown links ------------------------------------------------
  for (const m of prose.matchAll(/\[[^\]\n]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g)) {
    const target = m[1];
    if (/^(https?:|mailto:|#|tel:|data:)/.test(target)) {
      // A bare `#anchor` still has to resolve inside this same document.
      if (target.startsWith("#")) {
        links += 1;
        const want = decodeURIComponent(target.slice(1));
        if (want && !anchorsOf(abs).has(want)) {
          problems.push(`${rel}:${lineOf(text, m.index)}: anchor "#${want}" has no matching heading in this file`);
        }
      }
      continue;
    }
    if (/^\{|\<|\$/.test(target)) continue;   // a template placeholder, not a path
    links += 1;

    const [pathPart, anchorPart] = target.split("#");
    const resolved = resolve(dir, decodeURIComponent(pathPart));
    if (!existsSync(resolved)) {
      problems.push(`${rel}:${lineOf(text, m.index)}: link target does not exist -> ${pathPart}`);
      continue;
    }
    if (anchorPart && statSync(resolved).isFile() && resolved.endsWith(".md")) {
      const want = decodeURIComponent(anchorPart);
      if (!anchorsOf(resolved).has(want)) {
        problems.push(
          `${rel}:${lineOf(text, m.index)}: "${pathPart}" exists but has no heading "#${want}"`,
        );
      }
    }
  }

  // --- 3: backticked reference paths inside skills ----------------------------
  // A skill body points at its own step files in prose: `references/claim-pr.md`.
  // Those are not markdown links, so the link pass above never sees them -- and they
  // are the pointers that matter most, because an agent follows them literally.
  if (rel.startsWith("skills/") && !isExample) {
    const skillDir = join(root, rel.split("/").slice(0, 2).join("/"));
    for (const m of text.matchAll(/`(references\/[A-Za-z0-9._/-]+\.md)`/g)) {
      refs += 1;
      const candidates = [join(skillDir, m[1]), resolve(dir, m[1])];
      if (!candidates.some((c) => existsSync(c))) {
        problems.push(
          `${rel}:${lineOf(text, m.index)}: references "${m[1]}", which this skill does not ship`,
        );
      }
    }
  }
}

if (problems.length) {
  for (const p of problems) console.error(p);
  console.error(`\nlinks: ${problems.length} broken reference(s) across ${FILES.length} documents`);
  process.exit(1);
}

console.log(
  `Cross-references OK (${FILES.length} documents, ${links} links and ${refs} reference paths resolved).`,
);
