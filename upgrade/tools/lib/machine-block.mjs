// Upgrade-entry machine blocks (upgrade/CONTRACT.md §5) and kit version comparison.

const LINE = /^(Applies-to|Files|Actions): (.*)$/;
const ACTION = [
  /^restart-leader$/,
  /^restart-engine$/,
  /^engine-min=\d+\.\d+\.\d+$/,
  /^config-key=[A-Za-z0-9_]+(\.[A-Za-z0-9_]+)*$/,
  /^label-sync$/,
  /^env-rename=[A-Z0-9_]+:[A-Z0-9_]+$/,
  /^per-machine=(add-mcp-permission|remove-mcp-permission|enable-mcp-server|trust-codex-project|add-runner-model):\S+$/,
];

/** "3.0.2+abc" -> [3,0,2]. Anything else -> null. */
export function parseVersion(v) {
  const m = /^v?(\d+)\.(\d+)\.(\d+)(?:\+[0-9a-f]+)?$/.exec(String(v ?? "").trim());
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
}

/** Compare as tags: a pseudo-version compares as its tag (CONTRACT §5). */
export function compareVersions(a, b) {
  const x = parseVersion(a);
  const y = parseVersion(b);
  if (!x || !y) throw new Error(`not a kit version: ${!x ? a : b}`);
  for (let i = 0; i < 3; i += 1) if (x[i] !== y[i]) return x[i] < y[i] ? -1 : 1;
  return 0;
}

/** Does `version` satisfy `<X`, `>=X <Y`, `>=X` or `*`? */
export function satisfies(range, version) {
  const r = range.trim();
  if (r === "*") return true;
  const parts = r.split(/\s+/);
  return parts.every((p) => {
    const m = /^(<|<=|>=|>|=)?(\d+\.\d+\.\d+)$/.exec(p);
    if (!m) throw new Error(`Applies-to: unreadable range ${JSON.stringify(range)}`);
    const c = compareVersions(version, m[2]);
    switch (m[1] ?? "=") {
      case "<": return c < 0;
      case "<=": return c <= 0;
      case ">": return c > 0;
      case ">=": return c >= 0;
      default: return c === 0;
    }
  });
}

/**
 * Parse every ```upgrade block in a Markdown text. Unknown actions and malformed lines are
 * errors: a reader refuses them rather than skipping a step it does not understand.
 */
export function parseBlocks(text, source = "") {
  const blocks = [];
  const errors = [];
  const re = /^```upgrade\n([\s\S]*?)^```$/gm;
  let m;
  while ((m = re.exec(text))) {
    const block = { source, appliesTo: null, files: [], actions: [] };
    const seen = new Set();
    for (const raw of m[1].split("\n")) {
      if (!raw.trim()) continue;
      const l = LINE.exec(raw);
      if (!l) {
        errors.push(`${source}: unreadable line in upgrade block: ${raw}`);
        continue;
      }
      if (seen.has(l[1])) errors.push(`${source}: ${l[1]} appears twice in one block`);
      seen.add(l[1]);
      const items = l[2].split(";").map((s) => s.trim()).filter(Boolean);
      if (l[1] === "Applies-to") block.appliesTo = l[2].trim();
      else if (l[1] === "Files") {
        for (const item of items) {
          const f = /^(\S+)(?: =(merge|new|delete))?$/.exec(item);
          if (!f) errors.push(`${source}: unreadable Files item: ${item}`);
          else block.files.push({ path: f[1], mode: f[2] ?? "replace" });
        }
      } else {
        for (const item of items) {
          if (!ACTION.some((a) => a.test(item))) errors.push(`${source}: unknown action ${item}`);
          else block.actions.push(item);
        }
      }
    }
    if (!block.appliesTo) errors.push(`${source}: upgrade block without Applies-to`);
    else {
      try {
        satisfies(block.appliesTo, "0.0.0");
      } catch (e) {
        errors.push(`${source}: ${e.message}`);
      }
    }
    blocks.push(block);
  }
  return { blocks, errors };
}

/**
 * The entries of an UPGRADE_NOTES.md text, one per unit a reader applies: a `### ` step under a
 * dated `## ` heading, or the dated `## ` heading itself when it has no steps. Each unit says
 * whether it ends in an `upgrade` block. `date` is the heading's YYYY-MM-DD; `before` is X when
 * the `## ` heading reads "upgrading an onboarded project to X" (its steps apply below X).
 * Headings inside fenced code are not headings. A `## ` heading with no date is a how-to, not
 * an entry, and is skipped.
 */
export function parseEntries(text, source = "") {
  const units = [];
  let fence = false;
  let top = null;
  let unit = null;
  const close = () => {
    if (unit) units.push(unit);
    unit = null;
  };
  const lines = text.split("\n");
  for (let i = 0; i < lines.length; i += 1) {
    const l = lines[i];
    if (/^\s*```/.test(l)) {
      if (!fence && unit && /^```upgrade\s*$/.test(l)) unit.hasBlock = true;
      fence = !fence;
      continue;
    }
    if (fence) continue;
    const h2 = /^## (.*)$/.exec(l);
    const h3 = /^### (.*)$/.exec(l);
    if (h2) {
      close();
      const d = /^(\d{4}-\d{2}-\d{2}) – /.exec(h2[1]);
      const b = /upgrading an onboarded project to (\d+\.\d+\.\d+)\b/.exec(h2[1]);
      top = d ? { title: h2[1].trim(), date: d[1], before: b ? b[1] : null, line: i + 1 } : null;
      if (top) unit = { source, line: i + 1, heading: top.title, date: top.date, before: top.before, hasBlock: false, top: true };
    } else if (h3 && top) {
      // The heading's own unit held only its preamble: its steps are the units.
      if (unit?.top) unit = null;
      close();
      unit = { source, line: i + 1, heading: `${top.title} / ${h3[1].trim()}`, date: top.date, before: top.before, hasBlock: false, top: false };
    }
  }
  close();
  return units.map(({ top: _t, ...u }) => u);
}
