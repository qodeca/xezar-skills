#!/usr/bin/env node
// Reports paths that two 3.1.0 streams both own (plan §3), except those on the shared list.
// One-off planning aid for the 3.1.0 fan-out; the release PR deletes this folder.
import { readFileSync } from "node:fs";
const { shared, streams } = JSON.parse(readFileSync(new URL("./streams.json", import.meta.url), "utf8"));
const covers = (a, b) => a === b || (a.endsWith("/") && b.startsWith(a)) || (b.endsWith("/") && a.startsWith(b));
const isShared = (p) => shared.some((s) => covers(s, p));
const names = Object.keys(streams);
let clashes = 0;
for (let i = 0; i < names.length; i++)
  for (let j = i + 1; j < names.length; j++)
    for (const a of streams[names[i]])
      for (const b of streams[names[j]])
        if (covers(a, b) && !isShared(a) && !isShared(b)) {
          clashes += 1;
          console.log(`overlap ${names[i]}/${names[j]}: ${a} ~ ${b}`);
        }
console.log(clashes ? `${clashes} unplanned overlap(s)` : "no unplanned overlaps");
process.exit(clashes ? 1 : 0);
