#!/usr/bin/env node
// P6 scope is explicit: no claim to certify the other installed skills.
import { readdirSync, readFileSync, lstatSync } from 'node:fs';
import { resolve, relative, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const skills = [
  'xez-setup-agent-pipeline', 'xez-auto-create-pr',
  'xez-spec-writing', 'xez-prepare-issue',
];
const root = fileURLToPath(new URL('../', import.meta.url));
const specialLabels = /\b(?:changes-requested|qa-failed|merge-queue|do-not-merge|needs-qa|skip-qa|qa-approved|qa-self-verified|in-progress|ci-monitoring|do-not-close|priority-(?:low|medium|high|extreme)|risk-(?:low|medium|high))\b/i;
const quotedLabels = /[`"'](?:review|qa|blocked)[`"']|\b(?:apply|add|label create)\s+(?:review|qa|blocked)(?![\w-])/i;

function normalize(text) {
  return text.replace(/\\u([0-9a-f]{4})/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/\\x([0-9a-f]{2})/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/\\+/g, '/');
}

export function inspect(text, file = '<text>') {
  const failures = [];
  const fail = (line, rule) => failures.push(`${file}:${line}: ${rule}`);
  let example = false;
  if (!text.trim()) fail(1, 'empty instruction file');
  normalize(text).split(/\r?\n/).forEach((line, index) => {
    const n = index + 1;
    if (line.trim() === '<!-- example:start -->') {
      if (example) fail(n, 'nested example marker');
      example = true;
      return;
    }
    if (line.trim() === '<!-- example:end -->') {
      if (!example) fail(n, 'unmatched example marker');
      example = false;
      return;
    }
    // Examples exempt only taxonomy literals, never project paths or required docs.
    if (/\/Users\/|(?:[A-Z]:)?\/home\/[^/\s]+\/|qodeca\/xezar(?!-skills)(?:\b|\/)|packages\/xezar\/|\.xezar\/(?:checks|skills|docs|workflows)\/|\.local\/xezar(?:-tasks|-campaigns)?\/|\brepo-gates(?:\.sh)?\b/i.test(line)) {
      fail(n, 'project-specific path or working command');
    }
    // Exact client-capability phrases remove only the native filename token.
    // Adjacent adoption instructions still fail; there is no whole-line exemption.
    const docs = line.replace(/(a client may (?:read|discover) )`AGENTS\.md`/gi, '$1<native filename>');
    if (/\b(?:SDLC|CODE_REVIEW|AGENTS)\.md\b/i.test(docs)) {
      fail(n, 'process filename outside an exact native-client capability reference');
    }
    const labels = line
      .replace(/\bStatus: in-progress\b/g, 'Status: <state>')
      .replace(/\{complete \| in-progress\}/g, '{complete | <state>}');
    if (!example && (specialLabels.test(labels) || quotedLabels.test(labels))) {
      fail(n, 'prescribed label outside <!-- example:start --> / <!-- example:end -->');
    }
  });
  if (example) fail(text.split('\n').length, 'unclosed example marker');
  return failures;
}

export function check(base = root) {
  const failures = [];
  let count = 0;
  function walk(dir) {
    const entries = readdirSync(dir).sort();
    for (const name of entries) {
      const path = join(dir, name);
      const stat = lstatSync(path);
      if (stat.isSymbolicLink()) throw new Error(`symlink cannot be certified: ${relative(base, path)}`);
      if (stat.isDirectory()) walk(path);
      else if (stat.isFile()) {
        // All delivered companions are text today. Unknown/binary content fails
        // closed so adding another format requires an explicit coverage decision.
        const text = new TextDecoder('utf-8', { fatal: true }).decode(readFileSync(path));
        if (text.includes('\0')) throw new Error(`non-text instruction: ${relative(base, path)}`);
        count++;
        failures.push(...inspect(text, relative(base, path)));
      } else throw new Error(`unsupported instruction entry: ${relative(base, path)}`);
    }
  }
  for (const skill of skills) {
    const dir = join(base, 'skills', skill);
    if (!lstatSync(join(dir, 'SKILL.md')).isFile()) throw new Error(`missing entrypoint: ${skill}`);
    if (lstatSync(dir).isSymbolicLink()) throw new Error(`symlink skill: ${skill}`);
    walk(dir);
  }
  if (count < skills.length) throw new Error('instruction inventory is empty or incomplete');
  return { failures, count };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (process.argv.length !== 2) throw new Error('no scope overrides: run the checked-in P6 inventory');
    const { failures, count } = check();
    if (failures.length) {
      console.error(failures.join('\n'));
      process.exitCode = 1;
    } else console.log(`Generic instruction guard OK: ${count} files in ${skills.length} P6 skills (including all companions). Other skills are not certified.`);
  } catch (error) {
    console.error(`Generic instruction guard could not inspect input: ${error.message}`);
    process.exitCode = 1;
  }
}
