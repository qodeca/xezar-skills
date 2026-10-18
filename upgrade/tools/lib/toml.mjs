// A small TOML well-formedness check (no dependency). It covers the subset the kit and the
// projects write in `.codex/config.toml`: comments, [table] and [[array]] headers, and
// `key = value` with strings (basic, literal, multi-line), numbers, booleans, dates, arrays
// and inline tables, possibly spanning lines. It answers "does this still parse", which is
// what verify needs after a merge; it is not a TOML reader.
//
// "Parses" includes TOML's definition rules, because a merge that joins two sides typically breaks
// those and nothing else: a key defined twice, a [table] defined twice, a [table] or a dotted key
// reopening what the other form defined, and a header whose brackets do not pair (`[a]]`, `[[a]`).
// Keys are read by a tokenizer, so a quoted key may hold `#`, `.`, `]` or `=`; a `#` is a comment
// only outside quotes.

const BARE = /[A-Za-z0-9_-]/;

/** One basic string's content, escapes decoded as far as identity needs; the raw text otherwise. */
function decodeBasic(raw) {
  try {
    return JSON.parse(`"${raw.replace(/\\U([0-9A-Fa-f]{8})/g, (_, h) => {
      const cp = Number.parseInt(h, 16);
      return cp <= 0x10ffff ? String.fromCodePoint(cp).replace(/[\\"]/g, "\\$&") : `\\\\U${h}`;
    }).replace(/\\e/g, "\\u001b")}"`);
  } catch {
    return raw;
  }
}

/** Reads a dotted key at src[i] (leading blanks skipped). Returns { parts, end }, or throws. */
function readKey(src, i) {
  const parts = [];
  const blanks = () => {
    while (src[i] === " " || src[i] === "\t") i += 1;
  };
  for (;;) {
    blanks();
    const c = src[i];
    if (c === '"') {
      let j = i + 1;
      while (j < src.length && src[j] !== '"' && src[j] !== "\n") j += src[j] === "\\" ? 2 : 1;
      if (src[j] !== '"') throw new Error("unterminated quoted key");
      parts.push(decodeBasic(src.slice(i + 1, j)));
      i = j + 1;
    } else if (c === "'") {
      const j = src.indexOf("'", i + 1);
      if (j < 0 || src.slice(i, j).includes("\n")) throw new Error("unterminated quoted key");
      parts.push(src.slice(i + 1, j));
      i = j + 1;
    } else if (c !== undefined && BARE.test(c)) {
      let j = i;
      while (j < src.length && BARE.test(src[j])) j += 1;
      parts.push(src.slice(i, j));
      i = j;
    } else {
      throw new Error("expected a key");
    }
    blanks();
    if (src[i] !== ".") return { parts, end: i };
    i += 1;
  }
}

// A table node: { kind, keys: Map<string, node> }. kind is "implicit" (made by a header's parent
// or the root), "header" (defined by its own [header]), "dotted" (made by a dotted key), "inline"
// (an inline table value, closed), "value" (any other value), or "aot" ([[array]] – `tables`).
const table = (kind) => ({ kind, keys: new Map() });
const isTable = (n) => n.kind === "implicit" || n.kind === "header" || n.kind === "dotted";
const shown = (parts) => parts.map((p) => (/^[A-Za-z0-9_-]+$/.test(p) ? p : JSON.stringify(p))).join(".");

/** Walks a header's parent keys from the root, making implicit tables. Throws on a non-table. */
function headerParent(root, parts) {
  let t = root;
  for (let k = 0; k < parts.length - 1; k += 1) {
    let n = t.keys.get(parts[k]);
    if (!n) t.keys.set(parts[k], (n = table("implicit")));
    if (n.kind === "aot") n = n.tables[n.tables.length - 1];
    else if (!isTable(n)) throw new Error(`${shown(parts.slice(0, k + 1))} is a value, not a table`);
    t = n;
  }
  return t;
}

/** Defines `parts = value` in table t, by TOML's dotted-key rules. Throws on a redefinition. */
function assign(t, parts, node) {
  for (let k = 0; k < parts.length - 1; k += 1) {
    let n = t.keys.get(parts[k]);
    if (!n) t.keys.set(parts[k], (n = table("dotted")));
    else if (n.kind !== "dotted") throw new Error(`key ${shown(parts.slice(0, k + 1))} is already defined`);
    t = n;
  }
  const last = parts[parts.length - 1];
  if (t.keys.has(last)) throw new Error(`key ${shown(parts)} is defined twice`);
  t.keys.set(last, node);
}

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
    const inline = table("implicit");
    i += 1;
    skip();
    if (src[i] === "}") return i + 1;
    for (;;) {
      skip();
      const key = readKey(src, i);
      if (src[key.end] !== "=") throw new Error("inline table: expected key =");
      assign(inline, key.parts, { kind: "value" });
      i = scanValue(src, key.end + 1);
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

/** The rest of the line from src[i] is blank or a comment. */
function restIsBlank(src, i) {
  const nl = src.indexOf("\n", i);
  const tail = src.slice(i, nl < 0 ? src.length : nl).trim();
  return tail === "" || tail.startsWith("#");
}

/** Reads a [table] or [[array]] header at src[i]. Returns { parts, array, end }, or throws. */
function readHeader(src, i) {
  const array = src.startsWith("[[", i);
  const key = readKey(src, i + (array ? 2 : 1));
  const close = array ? "]]" : "]";
  if (!src.startsWith(close, key.end)) throw new Error(`bad table header: expected ${close}`);
  const end = key.end + close.length;
  if (src[end] === "]" || !restIsBlank(src, end)) throw new Error("bad table header: text after the header");
  return { parts: key.parts, array, end };
}

/** Returns null when the text is well-formed, else a message with a line number. */
export function tomlError(text) {
  let i = 0;
  const lineOf = (pos) => text.slice(0, pos).split("\n").length;
  const root = table("implicit");
  let current = root;
  while (i < text.length) {
    const nl = text.indexOf("\n", i);
    const lineEnd = nl < 0 ? text.length : nl;
    const line = text.slice(i, lineEnd).trim();
    if (line === "" || line.startsWith("#")) {
      i = lineEnd + 1;
      continue;
    }
    const lead = text.slice(i).match(/^[ \t]*/)[0].length;
    const start = i + lead;
    if (text[start] === "[") {
      try {
        const h = readHeader(text, start);
        const parent = headerParent(root, h.parts);
        const last = h.parts[h.parts.length - 1];
        const n = parent.keys.get(last);
        if (h.array) {
          if (n && n.kind !== "aot") throw new Error(`[[${shown(h.parts)}]] reopens ${shown(h.parts)}, which is not an array of tables`);
          const node = n ?? { kind: "aot", tables: [] };
          parent.keys.set(last, node);
          node.tables.push((current = table("header")));
        } else {
          if (n && n.kind !== "implicit") throw new Error(`table [${shown(h.parts)}] is defined twice`);
          if (n) n.kind = "header";
          else parent.keys.set(last, table("header"));
          current = parent.keys.get(last);
        }
      } catch (e) {
        return `line ${lineOf(i)}: ${e.message}`;
      }
      i = lineEnd + 1;
      continue;
    }
    let end;
    try {
      const key = readKey(text, start);
      if (text[key.end] !== "=") return `line ${lineOf(i)}: expected key = value`;
      end = scanValue(text, key.end + 1);
      assign(current, key.parts, { kind: "value" });
    } catch (e) {
      return `line ${lineOf(i)}: ${e.message === "expected a key" ? "expected key = value" : e.message}`;
    }
    if (!restIsBlank(text, end)) return `line ${lineOf(end)}: text after value`;
    const next = text.indexOf("\n", end);
    i = next < 0 ? text.length : next + 1;
  }
  return null;
}
