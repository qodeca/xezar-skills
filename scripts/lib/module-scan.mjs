/**
 * Reads a JavaScript module's string literals and import specifiers without running it (#123).
 * User: check-gate-map.mjs, which follows what the gate's scripts import and fails when any of them
 * names the T0 selection.
 *
 * A small tokenizer, not a parser: it skips comments (so a comment may name anything), reads
 * '…', "…" and `…` (the text around each ${…}, and the code inside it, which it reads in turn) and
 * regular-expression literals, which it tells from a division by the token before the `/`. It fails
 * closed: an unterminated string, template, regex, comment or ${…} – the sign that it misread the
 * file – is returned as `error`, and the caller treats the module as unreadable rather than clean.
 *
 * No imports.
 */

// A `/` after one of these starts a regex; after anything else (a name, a number, `)`, `]`) it divides.
const REGEX_AFTER = /(^|[(,=:[!&|?{};+\-*%<>~^]|\b(?:return|typeof|case|do|else|in|of|new|delete|void|throw|yield|await))$/;

/**
 * { strings, specifiers, error }: every string literal (template text and regex bodies too), the
 * literal module specifiers of `import … from`, `export … from`, `import "…"` and `import("…")`,
 * and null – or, when the source could not be read as written, a message naming the first place.
 */
export function scanModule(source) {
  const strings = [];
  let out = ""; // the code, comments dropped and each literal replaced by \u0001<index>\u0001
  let pos = 0;
  if (source.startsWith("#!")) pos = source.includes("\n") ? source.indexOf("\n") : source.length; // a hashbang line
  let error = null;
  const fail = (what, at) => {
    if (error === null) error = `an unterminated ${what} at line ${source.slice(0, at).split("\n").length}`;
  };
  const literal = (value) => {
    strings.push(value);
    out += `\u0001${strings.length - 1}\u0001`;
  };
  const quoted = (quote) => {
    const start = pos;
    let value = "";
    for (pos += 1; pos < source.length && source[pos] !== quote && source[pos] !== "\n"; pos += 1) {
      if (source[pos] === "\\") value += source[pos++];
      value += source[pos];
    }
    if (source[pos] !== quote) fail("string", start);
    pos += 1;
    literal(value);
  };
  const regex = () => {
    const start = pos;
    let value = "";
    let inClass = false;
    for (pos += 1; pos < source.length && source[pos] !== "\n"; pos += 1) {
      const ch = source[pos];
      if (ch === "\\") { value += ch + source[++pos]; continue; }
      if (ch === "[") inClass = true;
      else if (ch === "]") inClass = false;
      else if (ch === "/" && !inClass) break;
      value += ch;
    }
    if (source[pos] !== "/") fail("regular expression", start);
    pos += 1;
    while (/[a-z]/i.test(source[pos] ?? "")) pos += 1;
    literal(value);
  };
  const template = () => {
    const start = pos;
    let value = "";
    for (pos += 1; pos < source.length && source[pos] !== "`"; pos += 1) {
      if (source[pos] === "\\") { value += source[pos++] + source[pos]; continue; }
      if (source[pos] === "$" && source[pos + 1] === "{") {
        literal(value);
        value = "";
        pos += 2;
        code(true);
        pos -= 1;
        continue;
      }
      value += source[pos];
    }
    if (source[pos] !== "`") fail("template", start);
    pos += 1;
    literal(value);
  };
  function code(untilBrace) {
    const start = pos;
    let depth = 0;
    while (pos < source.length) {
      const ch = source[pos];
      const next = source[pos + 1];
      if (ch === "/" && next === "/") { pos = source.indexOf("\n", pos); if (pos === -1) pos = source.length; continue; }
      if (ch === "/" && next === "*") {
        const end = source.indexOf("*/", pos + 2);
        if (end === -1) fail("comment", pos);
        pos = end === -1 ? source.length : end + 2;
        out += " ";
        continue;
      }
      if (ch === '"' || ch === "'") { quoted(ch); continue; }
      if (ch === "`") { template(); continue; }
      if (ch === "/" && REGEX_AFTER.test(out.slice(-12).trimEnd())) { regex(); continue; }
      if (ch === "{") depth += 1;
      if (ch === "}") {
        if (untilBrace && depth === 0) { pos += 1; return; }
        depth -= 1;
      }
      out += ch;
      pos += 1;
    }
    if (untilBrace) fail("${…}", start);
  }
  code(false);
  const specifiers = [
    ...out.matchAll(/\b(?:from|import)\s*\u0001(\d+)\u0001/g),
    ...out.matchAll(/\bimport\s*\(\s*\u0001(\d+)\u0001\s*\)/g),
  ].map((match) => strings[Number(match[1])]);
  return { strings, specifiers, error };
}
