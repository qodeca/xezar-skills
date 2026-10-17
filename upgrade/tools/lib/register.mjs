// The local-patch register, `.xezar/LOCAL-PATCHES.md` (upgrade/CONTRACT.md §2).

const HEADING = /^## (LP-[0-9]+) [–-] (.+)$/;
const FIELD = /^- (Files|Reason|Upstream|Since|Confirmed): (.+)$/;
const REQUIRED = ["Files", "Reason", "Upstream", "Since", "Confirmed"];

/**
 * Parse the register. Returns { entries: [{ id, title, files, reason, upstream, since,
 * confirmed }], errors: [string] }. A missing register is an empty one.
 */
export function parseRegister(text) {
  const entries = [];
  const errors = [];
  if (text == null) return { entries, errors };
  let current = null;
  const finish = () => {
    if (!current) return;
    for (const f of REQUIRED) if (!(f in current.fields)) errors.push(`${current.id}: missing field ${f}`);
    const confirmed = current.fields.Confirmed;
    if (confirmed !== undefined && confirmed !== "yes" && confirmed !== "no") {
      errors.push(`${current.id}: Confirmed must be yes or no`);
    }
    if (current.fields.Since !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(current.fields.Since)) {
      errors.push(`${current.id}: Since must be YYYY-MM-DD`);
    }
    entries.push({
      id: current.id,
      title: current.title,
      files: (current.fields.Files ?? "").split(",").map((s) => s.trim()).filter(Boolean),
      reason: current.fields.Reason ?? "",
      upstream: current.fields.Upstream ?? "",
      since: current.fields.Since ?? "",
      confirmed: current.fields.Confirmed === "yes",
    });
    current = null;
  };
  const seen = new Set();
  for (const line of text.split("\n")) {
    const h = HEADING.exec(line);
    if (h) {
      finish();
      if (seen.has(h[1])) errors.push(`${h[1]}: duplicate id`);
      seen.add(h[1]);
      current = { id: h[1], title: h[2], fields: {} };
      continue;
    }
    if (/^## /.test(line)) {
      finish();
      continue;
    }
    if (!current) continue;
    const f = FIELD.exec(line);
    if (f) current.fields[f[1]] = f[2].trim();
  }
  finish();
  return { entries, errors };
}

/** path -> entry, for the entries that list it. */
export function registerByPath(entries) {
  const map = new Map();
  for (const e of entries) for (const f of e.files) {
    if (!map.has(f)) map.set(f, []);
    map.get(f).push(e);
  }
  return map;
}
