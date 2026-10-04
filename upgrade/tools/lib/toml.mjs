// A small TOML well-formedness check (no dependency). It covers the subset the kit and the
// projects write in `.codex/config.toml`: comments, [table] and [[array]] headers, and
// `key = value` with strings (basic, literal, multi-line), numbers, booleans, dates, arrays
// and inline tables, possibly spanning lines. It answers "does this still parse", which is
// what verify needs after a merge; it is not a TOML reader.

const KEY = String.raw`(?:[A-Za-z0-9_-]+|"(?:[^"\\]|\\.)*"|'[^']*')`;
const DOTTED = `${KEY}(?:\\s*\\.\\s*${KEY})*`;
const HEADER = new RegExp(`^\\[\\[?\\s*${DOTTED}\\s*\\]\\]?$`);
const ASSIGN = new RegExp(`^(${DOTTED})\\s*=\\s*(.*)$`, "s");

function scanValue(src, i) {
  // Returns index after one value starting at src[i] (whitespace skipped), or throws.
  const skip = () => {
    for (;;) {
      while (i < src.length && /[ \t\r\n]/.test(src[i])) i += 1;
      if (src[i] === "#") {
        while (i < src.length && src[i] !== "\n") i += 1;
        continue;
      }
      return;
    }
  };
  skip();
  const c = src[i];
  if (src.startsWith('"""', i)) {
    const end = src.indexOf('"""', i + 3);
    if (end < 0) throw new Error("unterminated multi-line string");
    let j = end + 3;
    while (src[j] === '"') j += 1;
    return j;
  }
  if (src.startsWith("'''", i)) {
    const end = src.indexOf("'''", i + 3);
    if (end < 0) throw new Error("unterminated multi-line literal string");
    return end + 3;
  }
  if (c === '"') {
    let j = i + 1;
    while (j < src.length && src[j] !== '"' && src[j] !== "\n") j += src[j] === "\\" ? 2 : 1;
    if (src[j] !== '"') throw new Error("unterminated string");
    return j + 1;
  }
  if (c === "'") {
    const j = src.indexOf("'", i + 1);
    if (j < 0 || src.slice(i, j).includes("\n")) throw new Error("unterminated literal string");
    return j + 1;
  }
  if (c === "[") {
    i += 1;
    for (;;) {
      skip();
      if (src[i] === "]") return i + 1;
      i = scanValue(src, i);
      skip();
      if (src[i] === ",") {
        i += 1;
        continue;
      }
      if (src[i] === "]") return i + 1;
      throw new Error("array: expected , or ]");
    }
  }
  if (c === "{") {
    i += 1;
    skip();
    if (src[i] === "}") return i + 1;
    for (;;) {
      skip();
      const m = new RegExp(`^${DOTTED}\\s*=`).exec(src.slice(i));
      if (!m) throw new Error("inline table: expected key =");
      i = scanValue(src, i + m[0].length);
      skip();
      if (src[i] === ",") {
        i += 1;
        continue;
      }
      if (src[i] === "}") return i + 1;
      throw new Error("inline table: expected , or }");
    }
  }
  const m = /^(true|false|[+-]?(?:inf|nan)|[+-]?[0-9_]+(?:\.[0-9_]+)?(?:[eE][+-]?[0-9_]+)?|0x[0-9A-Fa-f_]+|0o[0-7_]+|0b[01_]+|\d{4}-\d{2}-\d{2}(?:[Tt ][0-9:.]+(?:Z|[+-]\d{2}:\d{2})?)?|\d{2}:\d{2}:\d{2}(?:\.\d+)?)/.exec(src.slice(i));
  if (!m) throw new Error(`unreadable value near ${JSON.stringify(src.slice(i, i + 20))}`);
  return i + m[0].length;
}

/** Returns null when the text is well-formed, else a message with a line number. */
export function tomlError(text) {
  let i = 0;
  const lineOf = (pos) => text.slice(0, pos).split("\n").length;
  while (i < text.length) {
    const nl = text.indexOf("\n", i);
    const lineEnd = nl < 0 ? text.length : nl;
    const line = text.slice(i, lineEnd).trim();
    if (line === "" || line.startsWith("#")) {
      i = lineEnd + 1;
      continue;
    }
    const noComment = line.replace(/\s+#.*$/, "");
    if (noComment.startsWith("[")) {
      if (!HEADER.test(noComment)) return `line ${lineOf(i)}: bad table header`;
      i = lineEnd + 1;
      continue;
    }
    const lead = text.slice(i).match(/^\s*/)[0].length;
    const rest = text.slice(i + lead);
    const m = ASSIGN.exec(rest);
    if (!m) return `line ${lineOf(i)}: expected key = value`;
    const valueStart = i + lead + rest.indexOf("=", m[1].length) + 1;
    let end;
    try {
      end = scanValue(text, valueStart);
    } catch (e) {
      return `line ${lineOf(i)}: ${e.message}`;
    }
    const tail = text.slice(end, text.indexOf("\n", end) < 0 ? text.length : text.indexOf("\n", end)).trim();
    if (tail && !tail.startsWith("#")) return `line ${lineOf(end)}: text after value`;
    const next = text.indexOf("\n", end);
    i = next < 0 ? text.length : next + 1;
  }
  return null;
}
