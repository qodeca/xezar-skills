#!/usr/bin/env node
// Enforces the shape of every gate exception, and binds each list to the code that uses it.
//
// An allowlist is a gate someone turned off. The danger is not that it exists -- some
// exceptions are correct -- it is that it stops being a decision and becomes furniture.
// So each entry carries four fields (why, who, expires, and the key itself), and an entry
// past its expiry date fails the gate until someone renews it or deletes it.
//
// Run: node scripts/check-allowlists.mjs

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const data = JSON.parse(readFileSync(join(root, "scripts", "allowlists.json"), "utf8"));
const problems = [];
const today = new Date().toISOString().slice(0, 10);

let count = 0;
for (const [list, spec] of Object.entries(data)) {
  if (list.startsWith("$")) continue;
  for (const [key, entry] of Object.entries(spec.entries ?? {})) {
    count += 1;
    const at = `${list}.${key}`;
    if (!entry.why || entry.why.length < 40 || !/[.!?]$/.test(entry.why)) {
      problems.push(`${at}: "why" must be a full sentence someone who was not there can read`);
    }
    if (!entry.who) problems.push(`${at}: "who" must name an owner to ask before removing it`);
    if (entry.expires === "never") {
      if (!/permanent/i.test(entry.why ?? "")) {
        problems.push(`${at}: "expires": "never" is only allowed when "why" says why it is permanent`);
      }
    } else if (!/^\d{4}-\d{2}-\d{2}$/.test(entry.expires ?? "")) {
      problems.push(`${at}: "expires" must be an ISO date (YYYY-MM-DD) or "never"`);
    } else if (entry.expires < today) {
      problems.push(
        `${at}: expired on ${entry.expires}. Renew it with a fresh date and a re-stated reason, ` +
        "or delete it and let the gate apply.",
      );
    }
  }
}

// --- the lists are bound to the code that consumes them ----------------------
// scripts/check-gate-list.mjs imports this file directly, so nothing can drift there.
// scripts/lint.sh cannot: it is POSIX sh and must run without node. Its literal is bound
// here instead, the same way the gate list binds SDLC.md.
const lint = readFileSync(join(root, "scripts", "lint.sh"), "utf8");
const line = /^name_allow="([^"]*)"/m.exec(lint);
if (!line) {
  problems.push("scripts/lint.sh no longer defines name_allow -- this binding needs updating");
} else {
  const inShell = line[1]
    .replace(/\$\{PREFIX\}/g, "xez")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .sort();
  const inJson = Object.keys(data.skillNames?.entries ?? {}).sort();
  if (JSON.stringify(inShell) !== JSON.stringify(inJson)) {
    problems.push(
      "scripts/lint.sh name_allow does not match allowlists.json skillNames.\n" +
      `  lint.sh:        ${JSON.stringify(inShell)}\n` +
      `  allowlists.json ${JSON.stringify(inJson)}`,
    );
  }
}

const yarnLine = /^yarn_allow="([^"]*)"/m.exec(lint);
if (!yarnLine) {
  problems.push("scripts/lint.sh no longer defines yarn_allow -- this binding needs updating");
} else {
  const inShell = yarnLine[1].trim().split(/\s+/).filter(Boolean).sort();
  const inJson = Object.keys(data.yarnLiteral?.entries ?? {}).sort();
  if (JSON.stringify(inShell) !== JSON.stringify(inJson)) {
    problems.push(
      "scripts/lint.sh yarn_allow does not match allowlists.json yarnLiteral.\n" +
      `  lint.sh:        ${JSON.stringify(inShell)}\n` +
      `  allowlists.json ${JSON.stringify(inJson)}`,
    );
  }
}

if (problems.length) {
  for (const p of problems) console.error(p);
  console.error(`\nallowlists: ${problems.length} problem(s)`);
  process.exit(1);
}

console.log(`Allowlists OK (${count} entries, each with why/who/expires, none expired as of ${today}).`);
