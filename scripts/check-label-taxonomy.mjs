#!/usr/bin/env node
// Keeps the label taxonomy reproducible: every label a pipeline names must have a colour
// and a description recorded as data, and nothing may be recorded that the pipeline does
// not name.
//
// Why. `ensure-label-taxonomy` creates labels in a consumer repository. Until now the
// names lived in config.json and the colours and descriptions lived in whoever ran it --
// so two repositories that installed the same collection ended up with the same label
// names meaning subtly different things, and a reader could not tell what `qa-self-verified`
// was for without finding the skill that applies it.
//
// Run: node scripts/check-label-taxonomy.mjs

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => JSON.parse(readFileSync(join(root, p), "utf8"));

const config = read(".xezar/pipeline/config.json");
const data = read(".xezar/pipeline/labels.json");
const problems = [];

const groups = ["pipeline", "category", "meta", "priority", "risk"];
const named = new Map();
for (const group of groups) {
  for (const name of config.labels?.[group] ?? []) named.set(name, group);
}

for (const [name, group] of named) {
  const entry = data.labels?.[name];
  if (!entry) {
    problems.push(`config.json names label "${name}" (${group}) with no entry in labels.json`);
    continue;
  }
  if (entry.group !== group) {
    problems.push(`"${name}" is ${group} in config.json but ${entry.group} in labels.json`);
  }
  // A description is the whole point: it is what a reader of the repository's label list
  // sees, long after the skill that applies the label is out of mind.
  if (!entry.description || !/[.!?]$/.test(entry.description) || entry.description.length < 15) {
    problems.push(`"${name}" needs a full-sentence description in labels.json`);
  }
}

for (const name of Object.keys(data.labels ?? {})) {
  if (!named.has(name)) {
    problems.push(`labels.json records "${name}", which config.json does not name -- remove it or add it to the taxonomy`);
  }
}

for (const group of groups) {
  const colour = data.colors?.[group];
  if (!/^[0-9a-f]{6}$/.test(colour ?? "")) {
    problems.push(`group "${group}" needs a six-digit lower-case hex colour (no leading #); got ${JSON.stringify(colour)}`);
  }
}

if (problems.length) {
  for (const p of problems) console.error(p);
  console.error(`\nlabel taxonomy: ${problems.length} problem(s)`);
  process.exit(1);
}

console.log(`Label taxonomy OK (${named.size} labels across ${groups.length} groups, each with a colour and a description).`);
