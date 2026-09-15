#!/usr/bin/env node
// Exercise the real lint boundary in an isolated copy. Native identifiers are
// allowed only on their declared surfaces; neighbouring project prose still fails.
import assert from 'node:assert/strict';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = fileURLToPath(new URL('../', import.meta.url));
mkdirSync(join(root, '.local'), { recursive: true });
const fixture = mkdtempSync(join(root, '.local/onboarding-content-'));
try {
  for (const name of ['skills', 'scripts', 'docs', 'package.json', 'README.md', 'AGENTS.md', 'SDLC.md', 'CODE_REVIEW.md', 'BACKWARD_COMPATIBILITY.md', 'DECISIONS.md']) {
    cpSync(join(root, name), join(fixture, name), { recursive: true });
  }
  const lint = () => {
    const result = spawnSync('bash', ['scripts/lint.sh'], { cwd: fixture, encoding: 'utf8', timeout: 120000 });
    assert.ifError(result.error);
    return { status: result.status, output: result.stdout + result.stderr };
  };
  const valid = lint();
  assert.equal(valid.status, 0, valid.output);

  const cases = [
    ['skills/xez-onboard/references/writes.md', '\nUse `.xezar/config.json` and follow Xezar project policy.\n'],
    ['skills/xez-onboard/references/clients.md', '\nUse `@qodeca/xezar` and copy Qodeca working instructions.\n'],
    ['skills/xez-onboard/references/clients.md', '\nUse `@qodeca/xezar-private` here.\n'],
    ['skills/xez-onboard/SKILL.md', '\nUse `@qodeca/xezar` here.\n'],
  ];
  for (const [path, injected] of cases) {
    const target = join(fixture, path);
    const original = readFileSync(target, 'utf8');
    writeFileSync(target, original + injected);
    const rejected = lint();
    assert.equal(rejected.status, 1, `unsafe fixture passed: ${path}`);
    assert.match(rejected.output, /forbidden pattern/);
    assert.ok(rejected.output.includes(path), rejected.output);
    writeFileSync(target, original);
  }
  const templates = join(root, 'skills/xez-onboard/templates');
  for (const name of ['claude-mcp.json', 'pi-mcp.json']) {
    const parsed = JSON.parse(readFileSync(join(templates, name), 'utf8'));
    assert.deepEqual(parsed.mcpServers.xezar.args, ['-y', '@qodeca/xezar', 'mcp']);
    assert.equal(parsed.mcpServers.xezar.command, 'npx');
    assert.equal(Object.keys(parsed.mcpServers).length, 1);
    assert.equal(parsed.mcpServers.xezar.env, undefined);
  }
  const pi = JSON.parse(readFileSync(join(templates, 'pi-mcp.json'), 'utf8'));
  assert.equal(pi.settings.directTools, true);
  assert.equal(pi.mcpServers.xezar.lifecycle, 'keep-alive');
  console.log('Onboarding content OK: valid native tokens, adjacent contamination and undeclared-surface rejection, JSON client contracts.');
} finally {
  rmSync(fixture, { recursive: true, force: true });
}
