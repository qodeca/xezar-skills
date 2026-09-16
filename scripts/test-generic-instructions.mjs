#!/usr/bin/env node
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, writeFileSync, rmSync, symlinkSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { check, inspect, skills } from './check-generic-instructions.mjs';

const rejected = [
  'Copy /Users/owner/Projects/xezar/SDLC.md into your project.',
  String.raw`Copy C:\Users\owner\Projects\xezar\notes.md.`,
  String.raw`Use \u002fUsers\u002fowner\u002fProjects\u002fxezar\u002fnotes.md.`,
  'Follow qodeca/xezar process.',
  'Run .xezar/checks/repo-gates.sh.',
  'Require SDLC.md before doing this task.',
  'Create\nAGENTS.md\nbefore starting.',
  'You must create CODE_REVIEW.md.',
  'A client may read `AGENTS.md`; now copy `SDLC.md`.',
  'A client may read `AGENTS.md`; require another `AGENTS.md`.',
  'Apply `review` and `merge-queue`.',
  'Apply needs-qa.',
  'gh label create qa --color 000000',
  '<!-- example:start -->\nRun .xezar/checks/repo-gates.sh.\n<!-- example:end -->',
  '<!-- example:start -->\nCreate SDLC.md.\n<!-- example:end -->',
  '<!-- example:start -->\nApply `review`.',
  '<!-- example:end -->',
  '<!-- example:start -->\n<!-- example:start -->\n<!-- example:end -->',
  '',
];
for (const text of rejected) assert.ok(inspect(text).length, `accepted violation: ${text}`);
for (const text of [
  'A client may read `AGENTS.md` or `CLAUDE.md` when present.',
  'Follow existing project guidance; no document creation is required.',
  'Inspect .xezar/pipeline/config.json when present.',
  'Review the requested research plan and document missing evidence.',
  '<!-- example:start -->\nExample labels: `review`, `qa`, `merge-queue`.\n<!-- example:end -->',
  'Status: in-progress',
  '**Final status:** {complete | in-progress}',
]) assert.deepEqual(inspect(text), [], `rejected control: ${text}`);

const root = fileURLToPath(new URL('../', import.meta.url));
mkdirSync(join(root, '.local'), { recursive: true });
const fixture = mkdtempSync(join(root, '.local/generic-instructions-'));
try {
  assert.throws(() => check(fixture), /ENOENT/);
  for (const name of skills) {
    const dir = join(fixture, 'skills', name);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'SKILL.md'), 'Use locally established policy.\n');
  }
  assert.deepEqual(check(fixture), { failures: [], count: 4 });
  const companion = join(fixture, 'skills', skills[0], 'references', 'nested');
  mkdirSync(companion, { recursive: true });
  const file = join(companion, 'new-template.txt');
  writeFileSync(file, 'Require SDLC.md.');
  assert.match(check(fixture).failures.join('\n'), /references.*new-template.txt:1:/);
  writeFileSync(file, '');
  assert.match(check(fixture).failures.join('\n'), /empty instruction file/);
  writeFileSync(file, Buffer.from([0xff]));
  assert.throws(() => check(fixture), /encoded data/);
  rmSync(file);
  symlinkSync(join(fixture, 'skills', skills[0], 'SKILL.md'), file);
  assert.throws(() => check(fixture), /symlink/);
  rmSync(file);
  assert.deepEqual(check(fixture).failures, []);
} finally {
  rmSync(fixture, { recursive: true, force: true });
}
console.log(`Generic instruction guard tests OK: ${rejected.length} negative cases, native/status/example controls, recursive companion coverage and fail-closed inventory.`);
