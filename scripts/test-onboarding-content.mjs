#!/usr/bin/env node
// Exercise the real lint boundary on the onboarding skill. Onboarding names a product
// and an MCP server on purpose, so brand tokens are not checked; what must still
// fail there is what every consumer repo owns – its base branch, its package
// manager – and any credential-shaped value. The client JSON contracts are asserted
// against the shipped templates, since a wrong server entry is silent at run time.
//
// Each case runs lint.sh in its targeted mode (#122) – only the check that owns the defect,
// only on the file the defect was put in – inside a copy that holds just lint.sh and the
// onboarding skill. The gate runs the full lint over the whole tree on its own, so a case here
// takes seconds instead of a full lint run each.
import assert from 'node:assert/strict';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { bashPath } from './lib/platform.mjs';
import { prepareTestPlatform } from './lib/test-harness.mjs';

prepareTestPlatform();

const ONBOARD = 'skills/xez-onboard';
const root = fileURLToPath(new URL('../', import.meta.url));
mkdirSync(join(root, '.local'), { recursive: true });
const fixture = mkdtempSync(join(root, '.local/onboarding-content-'));
try {
  // Everything the targeted checks below read, and nothing else.
  for (const name of ['scripts/lint.sh', ONBOARD]) {
    cpSync(join(root, name), join(fixture, name), { recursive: true });
  }
  const lint = (args, env = process.env) => {
    const result = spawnSync(bashPath(), ['scripts/lint.sh', ...args], { cwd: fixture, encoding: 'utf8', timeout: 120000, env });
    assert.ifError(result.error);
    return { status: result.status, output: result.stdout + result.stderr };
  };
  const targeted = (check, path, env) => lint(['--only', check, '--files', path], env);

  const cases = [
    [`${ONBOARD}/references/writes.md`, '\nBranch from develop before writing any file.\n', 'portability', /forbidden pattern/],
    [`${ONBOARD}/references/clients.md`, '\nInstall the client with yarn add, then register it.\n', 'portability', /forbidden pattern/],
    [`${ONBOARD}/SKILL.md`, '\nBranch from develop first.\n', 'portability', /forbidden pattern/],
    // Assembled at run time: the gate's secrets check scans scripts/, so a literal here
    // would trip it on this file.
    [`${ONBOARD}/references/clients.md`, `\n    token = "gh${'p'}_0123456789abcdefghij"\n`, 'secrets', /credential-shaped value/],
  ];
  // The clean files pass every check the cases use, so each rejection below is its defect's.
  const checks = [...new Set([...cases.map(([, , check]) => check), 'frontmatter'])];
  const paths = [...new Set(cases.map(([path]) => path))];
  const valid = lint([...checks.flatMap((check) => ['--only', check]), '--files', ...paths]);
  assert.equal(valid.status, 0, valid.output);

  for (const [path, injected, check, expected] of cases) {
    const target = join(fixture, path);
    const original = readFileSync(target, 'utf8');
    writeFileSync(target, original + injected);
    const rejected = targeted(check, path);
    assert.equal(rejected.status, 1, `unsafe fixture passed: ${path}`);
    assert.match(rejected.output, expected);
    assert.ok(rejected.output.includes(path), rejected.output);
    writeFileSync(target, original);
  }
  // #122: the description limit counts characters in every locale. In the C locale (Git Bash on
  // Windows with LANG unset) the shell's own length counts bytes, and "é" is two of them.
  const cLocale = Object.fromEntries(
    Object.entries(process.env).filter(([key]) => !['LANG', 'LC_CTYPE', 'LC_ALL'].includes(key.toUpperCase())),
  );
  cLocale.LC_ALL = 'C';
  const onboardPath = `${ONBOARD}/SKILL.md`;
  const onboard = join(fixture, onboardPath);
  const onboardText = readFileSync(onboard, 'utf8');
  for (const [length, status] of [[500, 0], [501, 1]]) {
    writeFileSync(onboard, onboardText.replace(/^description: .*$/m, `description: ${'é'.repeat(length)}`));
    const result = targeted('frontmatter', onboardPath, cLocale);
    writeFileSync(onboard, onboardText);
    if (status === 0) {
      assert.equal(result.status, 0, `a 500-character description in a multibyte script is rejected in the C locale:\n${result.output}`);
    } else {
      assert.equal(result.status, 1, `a 501-character description in a multibyte script passes in the C locale:\n${result.output}`);
      assert.match(result.output, /max 500/);
    }
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
