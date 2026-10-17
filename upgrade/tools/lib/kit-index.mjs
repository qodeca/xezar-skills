// The kit index (upgrade/CONTRACT.md §3): one file per kit version, mapping every installed
// path to its kit source, raw blob sha, sha256 and rewrite class.
//
// Two producers share `buildVersionIndex`: `scripts/build-kit-index.mjs` reads each version
// out of git history, and `indexFromTree` reads a checked-out kit (the verified release clone,
// or a test's temporary copy). Keeping one builder is what makes "the committed index for this
// release equals the tree" a meaningful check.

import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join } from "node:path";
import { buildCopyMap } from "./copy-map.mjs";
import { gitBlobSha, lfText, sha256 } from "./hash.mjs";

export const SKILL_DIR = "skills/xez-onboard-opinionated";

/**
 * @param {{ kitFiles: Map<string, Buffer>, writeMd: string, version: string, commit: string|null, tag: string|null }} input
 *   kitFiles keys are skill-relative ("kit/checks/route.mjs").
 */
export function buildVersionIndex({ kitFiles, writeMd, version, commit, tag }) {
  const { entries, unmapped } = buildCopyMap([...kitFiles.keys()], writeMd);
  const files = {};
  for (const [installed, entry] of [...entries].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) {
    if (entry.rewrite === "generated") {
      files[installed] = { rewrite: "generated" };
      continue;
    }
    const content = kitFiles.get(`kit/${entry.kitSource}`);
    files[installed] = {
      kitSource: entry.kitSource,
      kitBlob: gitBlobSha(content),
      sha256: sha256(content),
      rewrite: entry.rewrite,
    };
  }
  return { index: { version, commit, tag, files }, unmapped, copyMap: entries };
}

function walk(dir, prefix, out) {
  for (const name of readdirSync(dir).sort()) {
    const full = join(dir, name);
    const rel = `${prefix}${name}`;
    const st = statSync(full);
    if (st.isDirectory()) walk(full, `${rel}/`, out);
    else if (st.isFile()) out.set(rel, lfText(readFileSync(full))); // a CRLF checkout indexes like LF (#122)
  }
  return out;
}

/** Read a kit from disk: `skillDir` is the folder holding `kit/` and `references/write.md`. */
export function readKitTree(skillDir) {
  const kitFiles = walk(join(skillDir, "kit"), "kit/", new Map());
  const writeMd = readFileSync(join(skillDir, "references/write.md"), "utf8");
  return { kitFiles, writeMd };
}

export function indexFromTree(skillDir, { version, commit = null, tag = null } = {}) {
  const { kitFiles, writeMd } = readKitTree(skillDir);
  const built = buildVersionIndex({ kitFiles, writeMd, version, commit, tag });
  return { ...built, kitFiles };
}

/** Load `upgrade/kit-index/index.json` and every version file it lists, in commit order. */
export function loadIndexes(indexDir) {
  const listPath = join(indexDir, "index.json");
  if (!existsSync(listPath)) return [];
  const list = JSON.parse(readFileSync(listPath, "utf8"));
  return list.versions.map((v) => {
    const data = JSON.parse(readFileSync(join(indexDir, `${v.version}.json`), "utf8"));
    if (data.version !== v.version) throw new Error(`kit index ${v.version}.json names version ${data.version}`);
    return data;
  });
}

/** The fields that define an index entry's identity, for comparisons. */
export function entryKey(entry) {
  if (!entry) return null;
  return `${entry.rewrite}|${entry.kitSource ?? ""}|${entry.kitBlob ?? ""}|${entry.sha256 ?? ""}`;
}

/** Compare two version indexes by installed path. */
export function diffIndexes(a, b) {
  const added = [];
  const removed = [];
  const changed = [];
  const af = a?.files ?? {};
  const bf = b?.files ?? {};
  for (const p of Object.keys(bf)) {
    if (!(p in af)) added.push(p);
    else if (entryKey(af[p]) !== entryKey(bf[p])) changed.push(p);
  }
  for (const p of Object.keys(af)) if (!(p in bf)) removed.push(p);
  return { added: added.sort(), removed: removed.sort(), changed: changed.sort() };
}
