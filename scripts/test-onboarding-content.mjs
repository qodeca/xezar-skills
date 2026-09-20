#!/usr/bin/env node
// Exercise the real lint boundary in an isolated copy. Onboarding names a product
// and an MCP server on purpose, so brand tokens are not checked; what must still
// fail there is what every consumer repo owns – its base branch, its package
// manager – and any credential-shaped value. The client JSON contracts are asserted
// against the shipped templates, since a wrong server entry is silent at run time.
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
    ['skills/xez-onboard/references/writes.md', '\nBranch from develop before writing any file.\n', /forbidden pattern/],
    ['skills/xez-onboard/references/clients.md', '\nInstall the client with yarn add, then register it.\n', /forbidden pattern/],
    ['skills/xez-onboard/SKILL.md', '\nBranch from develop first.\n', /forbidden pattern/],
    // Assembled at run time: the fixture copies scripts/ too, so a literal here
    // would trip the same gate on this file.
    ['skills/xez-onboard/references/clients.md', `\n    token = "gh${'p'}_0123456789abcdefghij"\n`, /credential-shaped value/],
  ];
  for (const [path, injected, expected] of cases) {
    const target = join(fixture, path);
    const original = readFileSync(target, 'utf8');
    writeFileSync(target, original + injected);
    const rejected = lint();
    assert.equal(rejected.status, 1, `unsafe fixture passed: ${path}`);
    assert.match(rejected.output, expected);
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
  console.log('Onboarding content OK: base branch, package manager and credential-shaped rejection, JSON client contracts.');
} finally {
  rmSync(fixture, { recursive: true, force: true });
}
