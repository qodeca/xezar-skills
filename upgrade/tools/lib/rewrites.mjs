// Copy-time rewrites, undone and redone.
//
// An `adapted` file is the kit file after onboarding filled its `{{PLACEHOLDER}}`s and turned
// source-project absolute paths into the new project's. To compare such a file with a kit
// version (plan §6.2 step 2) the tool masks exactly those regions; to write the new version
// (§6.4 "clean update") it re-renders the new kit text with the same values.
//
// Values extracted here are plain text from the project's own committed files. They stay in
// memory: plan.json and the report name placeholder keys, never values.

export const PLACEHOLDER = /\{\{([A-Z][A-Z0-9_]*)\}\}/g;

export function placeholdersIn(text) {
  return [...new Set([...text.matchAll(PLACEHOLDER)].map((m) => m[1]))].sort();
}

/** Fill placeholders. Unknown keys stay as they are and are returned in `missing`. */
export function render(text, inputs = {}) {
  const missing = new Set();
  const out = text.replace(PLACEHOLDER, (whole, key) => {
    if (Object.prototype.hasOwnProperty.call(inputs, key)) return inputs[key];
    missing.add(key);
    return whole;
  });
  return { text: out, missing: [...missing].sort() };
}

const ABS_PATH = /(?:\/(?:Users|home|private|tmp|var|opt|srv|workspace|workspaces)\/[^\s"'`)\]]+|[A-Za-z]:\\[^\s"'`)\]]+)/g;

/** Mask absolute paths, the second copy-time rewrite. */
export function maskAbsolutePaths(text) {
  return text.replace(ABS_PATH, "<abs-path>");
}

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Does `installed` equal `template` with its placeholders filled in some way?
 * Returns the extracted inputs, or null. Absolute paths are masked on both sides first.
 * A placeholder used twice must get the same value both times; two placeholders with no
 * literal text between them cannot be told apart, so that shape never matches.
 */
export function extractInputs(template, installed) {
  const t = maskAbsolutePaths(template);
  const inst = maskAbsolutePaths(installed);
  const keys = [];
  const parts = t.split(/\{\{([A-Z][A-Z0-9_]*)\}\}/);
  if (parts.length === 1) return t === inst ? {} : null;
  let re = "^";
  const seen = new Map();
  for (let i = 0; i < parts.length; i += 1) {
    if (i % 2 === 0) {
      re += escapeRe(parts[i]);
      continue;
    }
    const key = parts[i];
    if (i > 1 && parts[i - 1] === "") return null; // adjacent placeholders: ambiguous
    if (seen.has(key)) {
      re += `\\k<p${seen.get(key)}>`;
    } else {
      seen.set(key, keys.length);
      re += `(?<p${keys.length}>[\\s\\S]*?)`;
      keys.push(key);
    }
  }
  re += "$";
  let match;
  try {
    match = new RegExp(re).exec(inst);
  } catch {
    return null;
  }
  if (!match) return null;
  const inputs = {};
  keys.forEach((key, i) => {
    inputs[key] = match.groups[`p${i}`];
  });
  return inputs;
}

/**
 * Normalised comparison (plan §6.2 step 2): masked absolute paths, placeholder regions
 * treated as wildcards. Returns { match, inputs, exact } where `exact` means the file is
 * byte-equal to the template rendered with the extracted inputs (so a re-render of a newer
 * kit version with the same inputs is a faithful clean update).
 */
export function normalisedMatch(template, installed) {
  const inputs = extractInputs(template, installed);
  if (!inputs) return { match: false, inputs: null, exact: false };
  const rendered = render(template, inputs).text;
  return { match: true, inputs, exact: rendered === installed };
}
