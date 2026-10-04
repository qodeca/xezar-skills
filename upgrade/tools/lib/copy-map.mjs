// The kit -> installed path map for one kit version, derived from that version's own
// `references/write.md` copy table ("## 1. Copy what is copied") and the prose rules of its
// "## 2. Generate what is generated" section.
//
// Why derive it instead of hard-coding it: the table changed three times between v1.2.0 and
// 3.0.3 (the MCP file, the routing files, the Codex config and the leader settings were added
// one release at a time). An old install must be mapped with the table it was installed with,
// or a file the old kit never shipped is mistaken for a removed one.
//
// Output entry per installed path:
//   { kitSource: "checks/route.mjs" | null, rewrite: "copied"|"adapted"|"generated",
//     optional: bool, perMachine: bool }
// `kitSource` is relative to `kit/`. `generated` entries have no kitSource.

const KIT_PREFIX = "kit/";

/** Destinations whose copy is rewritten at install time (placeholders, arrays, merges). */
const ADAPTED = [
  (p) => p.startsWith(".github/"), // five placeholders, and source-project paths dropped
  (p) => p === ".xezar/routing.json", // edited in place by the routing interview
  (p) => p === ".mcp.json", // merged into an existing file
  (p) => p === ".codex/config.toml", // one table merged into an existing file
  (p) => p === ".xezar/checks/repo-gates.sh", // command arrays generated from the gate answers
];

/**
 * Files written for the project with no kit source file. Each is listed for a version only
 * when that version's write.md names it, so an old version does not claim a file it never wrote.
 */
const GENERATED = [
  { path: ".xezar/config.json", needle: /`\.xezar\/config\.json`/ },
  { path: ".xezar/pipeline/config.json", needle: /`\.xezar\/pipeline\/config\.json`/ },
  { path: ".xezar/pipeline/labels.json", needle: /`\.xezar\/pipeline\/config\.json`\*\* and \*\*`labels\.json`|`\.xezar\/pipeline\/labels\.json`/ },
  { path: ".xezar/pipeline/trackers/github.md", needle: /`\.xezar\/pipeline\/trackers\/github\.md`/ },
  { path: ".xezar/docs/leader-guide.md", needle: /`\.xezar\/docs\/leader-guide\.md`/ },
  {
    path: ".xezar/docs/model-routing.md",
    needle: /^- \*\*`\.xezar\/docs\/model-routing\.md`\*\*/m,
  },
  { path: "SDLC.md", needle: /`SDLC\.md`/ },
  { path: "CODE_REVIEW.md", needle: /`CODE_REVIEW\.md`/ },
];

/** Parse the `| from | to |` table. Returns [{ from, to, note }] with backticks removed. */
export function parseCopyTable(writeMd) {
  const lines = writeMd.split("\n");
  const start = lines.findIndex((l) => /^\|\s*from\s*\|\s*to\s*\|/.test(l));
  if (start < 0) return [];
  const rows = [];
  for (let i = start + 2; i < lines.length && lines[i].startsWith("|"); i += 1) {
    const cells = lines[i].split("|").slice(1, -1).map((c) => c.trim());
    if (cells.length < 2) continue;
    const from = /`([^`]+)`/.exec(cells[0])?.[1];
    const to = /`([^`]+)`/.exec(cells[1])?.[1];
    if (!from || !to) continue;
    rows.push({ from, to, note: cells[1] });
  }
  return rows;
}

function globToRegExp(glob) {
  let re = "";
  for (let i = 0; i < glob.length; i += 1) {
    const c = glob[i];
    if (c === "*" && glob[i + 1] === "*") {
      re += ".+";
      i += 1;
    } else if (c === "*") re += "[^/]+";
    else re += c.replace(/[.+?^${}()|[\]\\]/g, "\\$&");
  }
  return new RegExp(`^${re}$`);
}

function rewriteFor(installed) {
  return ADAPTED.some((test) => test(installed)) ? "adapted" : "copied";
}

/**
 * Build the copy map.
 * @param {string[]} kitFiles paths relative to the skill folder, e.g. "kit/checks/route.mjs"
 * @param {string} writeMd that version's references/write.md
 * @returns {{ entries: Map<string, object>, unmapped: string[] }}
 */
export function buildCopyMap(kitFiles, writeMd) {
  const entries = new Map();
  const rows = parseCopyTable(writeMd);
  const mapped = new Set();

  for (const row of rows) {
    const perMachine = /gitignored/i.test(row.note);
    if (row.from.includes("*")) {
      const re = globToRegExp(row.from);
      const base = row.from.slice(0, row.from.lastIndexOf("/", row.from.indexOf("*")) + 1);
      for (const file of kitFiles) {
        if (!re.test(file)) continue;
        const rel = file.slice(base.length);
        const installed = row.to.endsWith("/") ? `${row.to}${rel}` : row.to;
        entries.set(installed, {
          kitSource: file.slice(KIT_PREFIX.length),
          rewrite: rewriteFor(installed),
          optional: false,
          perMachine,
        });
        mapped.add(file);
      }
    } else if (kitFiles.includes(row.from)) {
      entries.set(row.to, {
        kitSource: row.from.slice(KIT_PREFIX.length),
        rewrite: rewriteFor(row.to),
        optional: false,
        perMachine,
      });
      mapped.add(row.from);
    }
  }

  // Descriptors: copied by the prose rules of §2, one per family, chosen per project.
  for (const family of ["toolchains", "browsers", "security"]) {
    if (!writeMd.includes(`kit/pipeline/${family}/`)) continue;
    for (const file of kitFiles) {
      const m = new RegExp(`^kit/pipeline/${family}/([^/]+\\.md)$`).exec(file);
      if (!m) continue;
      const always =
        family === "security" ||
        (family === "browsers" && m[1] === "chrome-devtools.md" && /Copy\s+`chrome-devtools\.md`\s+as well, always/.test(writeMd));
      entries.set(`.xezar/pipeline/${family}/${m[1]}`, {
        kitSource: file.slice(KIT_PREFIX.length),
        rewrite: "copied",
        optional: !always,
        perMachine: false,
      });
      mapped.add(file);
    }
  }

  for (const g of GENERATED) {
    if (entries.has(g.path)) continue;
    if (g.needle.test(writeMd)) {
      entries.set(g.path, { kitSource: null, rewrite: "generated", optional: false, perMachine: false });
    }
  }

  // The leader-guide template is the source of a generated file, not a copied one.
  if (entries.has(".xezar/docs/leader-guide.md")) mapped.add("kit/leader-guide.template.md");

  const unmapped = kitFiles.filter((f) => !mapped.has(f)).sort();
  return { entries, unmapped };
}
