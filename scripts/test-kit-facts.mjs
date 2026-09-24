#!/usr/bin/env node
// Pins a handful of NAMED FACTS across the two halves of a skill that carries a vendored kit.
//
// The problem this exists for. `xez-onboard-opinionated` is two things glued together:
//   - its own prose  (skills/<name>/SKILL.md, references/*.md) -- what the skill says it does;
//   - a vendored kit (skills/<name>/kit/**)                    -- ~1 MB copied verbatim into
//     every project the skill onboards.
// Every other gate reads the prose. The kit is excluded from three of them by path, on purpose:
// it is payload, not skill text, and the portability and tracker rules do not fit it. The
// consequence is that the two halves can state opposite things and every gate stays green.
//
// That is not hypothetical. Shipped on main at one point, both at once:
//   references/write.md      "campaign folders are committed"
//   kit/docs/campaign-notes.md "still runtime state ... never committed"
// and separately, prose promising `decisions.md` is never cut beside a script with an 8000-byte
// cap on it. Both were found by people reading both halves, not by a gate.
//
// What this file is, and what it is NOT. It is NOT a general prose-agreement checker -- deciding
// whether two English sentences mean the same thing is the whole problem, and a grep cannot do
// it. It is a pin board: a short list of facts that have ALREADY caused a contradiction, each
// asserted in every place that states it. Narrow and honest beats broad and fake.
//
// The cost is stated plainly in docs/coverage.md: a fact nobody pinned is still unchecked, and
// adding a fact is a deliberate act, not something this file discovers.
//
// Run: node scripts/test-kit-facts.mjs

import { readFileSync, existsSync, readdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(join(root, p), "utf8");
const has = (p) => existsSync(join(root, p));

const SKILL = "skills/xez-onboard-opinionated";
const problems = [];
const checked = [];

const fail = (fact, where, detail) =>
  problems.push(`${fact}\n    in ${where}\n    ${detail}`);

// ---------------------------------------------------------------------------
// FACT 1 -- campaign folders are COMMITTED.
//
// Everything else rests on this: the direct-push rule, branch protection without admin
// enforcement, the decisions.md authority model, and the untrusted-content boundary (records
// are only untrusted because anyone who can open a pull request can write them). A kit doc that
// still calls them runtime teaches a leader to gitignore the owner's own words.
// ---------------------------------------------------------------------------
{
  const fact = "FACT 1: campaign folders are committed";
  const saysCommitted = /campaigns[\s\S]{0,200}?\*\*committed\*\*|\*\*committed\*\*[\s\S]{0,200}?campaigns/i;
  const notes = read(`${SKILL}/kit/docs/campaign-notes.md`);
  if (!saysCommitted.test(notes))
    fail(fact, "kit/docs/campaign-notes.md", "the authority on the campaign folder never states it is committed");

  // No file in the skill may assert that a campaign folder is runtime or uncommitted.
  //
  // The patterns below are the exact shapes that shipped wrong, not a general search for the
  // word "runtime". That is deliberate: a loose search matches the sentences that say campaigns
  // are NOT gitignored, which are the correct ones, and a check that cries wolf gets relaxed.
  const WRONG = [
    [/\|\s*no\s*[—-]\s*runtime\s*\|/i, 'a table row marking a campaign file "no - runtime"'],
    [/campaign[^.\n]{0,80}\bnever committed\b/i, 'says a campaign file is never committed'],
    [/campaign[^.\n]{0,80}\b(stay|are|is|remain)s?\s+uncommitted\b/i, "says campaigns stay uncommitted"],
    [/\bboth are runtime\b/i, "calls the injected campaign files runtime"],
  ];
  for (const rel of walk(SKILL, /\.(md|sh)$/)) {
    for (const line of read(rel).split("\n")) {
      if (!/campaign|runtime/i.test(line)) continue;
      for (const [re, why] of WRONG)
        if (re.test(line)) fail(fact, rel, `${why}:\n    ${line.trim().slice(0, 140)}`);
    }
  }
  checked.push(fact);
}

// ---------------------------------------------------------------------------
// FACT 2 -- the note cap, and the one file that is exempt from it.
//
// The prose promise ("decisions.md is never cut") and the script constant are the exact pair
// that was already wrong in opposite directions. Both are pinned, and so is the exemption:
// a loader that runs decisions.md through the truncating helper would pass a value check.
// ---------------------------------------------------------------------------
{
  const fact = "FACT 2: 64 KB tail for narrative notes, decisions.md never truncated";
  const loader = read(`${SKILL}/kit/checks/leader-context.sh`);
  const m = loader.match(/^NOTE_TAIL_BYTES=(\d+)/m);
  if (!m) fail(fact, "kit/checks/leader-context.sh", "no NOTE_TAIL_BYTES constant found");
  else if (m[1] !== "65536")
    fail(fact, "kit/checks/leader-context.sh", `NOTE_TAIL_BYTES is ${m[1]}, expected 65536 (64 KB)`);

  // decisions.md must never reach the truncating helper.
  for (const line of loader.split("\n")) {
    if (/note_tail\s/.test(line) && /decisions\.md/.test(line))
      fail(fact, "kit/checks/leader-context.sh", `decisions.md passed to the truncating helper:\n    ${line.trim()}`);
  }

  // Every document that states a cap must state the same one.
  for (const rel of walk(SKILL, /\.md$/)) {
    const text = read(rel);
    if (/8\s?000 bytes|8000 bytes|last 8 KB|8 KB tail/i.test(text))
      fail(fact, rel, "still states the old 8 KB cap");
  }
  checked.push(fact);
}

// ---------------------------------------------------------------------------
// FACT 3 -- the six .local/xezar subfolders, same names in the check and in the prose.
// The check is the thing that enforces the layout; the prose is what a reader believes.
// ---------------------------------------------------------------------------
{
  const fact = "FACT 3: the six .local/xezar subfolders agree";
  const expected = ["runtime", "tasks", "worktrees", "scratch", "cache", "qa"];
  const tree = read(`${SKILL}/kit/checks/local-tree.sh`);
  const am = tree.match(/^ALLOWED="([^"]+)"/m);
  if (!am) fail(fact, "kit/checks/local-tree.sh", "no ALLOWED list found");
  else {
    const got = am[1].trim().split(/\s+/);
    if (got.join(" ") !== expected.join(" "))
      fail(fact, "kit/checks/local-tree.sh", `ALLOWED is "${got.join(" ")}", expected "${expected.join(" ")}"`);
  }
  const write = read(`${SKILL}/references/write.md`);
  for (const name of expected) {
    if (!new RegExp(`\\b${name}/`).test(write))
      fail(fact, "references/write.md", `never names the "${name}/" subfolder the check enforces`);
  }
  checked.push(fact);
}

// ---------------------------------------------------------------------------
// FACT 4 -- the loop ceilings are one set of numbers, wherever they are written.
// They appear in the machine-readable block, inside L3's own prompt text (unavoidable -- the
// prompt is what the leader is given), and in the always-loaded guide. Three copies of a
// tuning knob is three chances to tune one and miss two.
// ---------------------------------------------------------------------------
{
  const fact = "FACT 4: the loop ceilings agree everywhere they are stated";
  const loops = JSON.parse(read(`${SKILL}/kit/loops.json`));
  const c = loops.ceilings ?? {};
  const want = [c.concurrentGateRuns, c.totalTasks, c.meteredToolTasks, c.machineLoad];
  if (want.some((v) => typeof v !== "number"))
    fail(fact, "kit/loops.json", "the ceilings block is missing a number");
  else {
    const l3 = (loops.loops ?? []).find((l) => l.id === "L3");
    if (!l3) fail(fact, "kit/loops.json", "no L3 loop");
    else
      for (const n of want)
        if (!new RegExp(`\\b${n}\\b`).test(l3.prompt))
          fail(fact, "kit/loops.json", `L3's prompt does not carry the ceiling ${n}`);

    const guide = read(`${SKILL}/kit/leader-guide.template.md`);
    for (const n of want)
      if (!new RegExp(`\\b${n}\\b`).test(guide))
        fail(fact, "kit/leader-guide.template.md", `the guide does not carry the ceiling ${n}`);
  }

  // Only L3 may dispatch. This is the single-writer invariant the lock-file design was
  // rejected for; a second dispatcher makes a double dispatch possible again.
  const dispatchers = (loops.loops ?? []).filter((l) => l.mayDispatch).map((l) => l.id);
  if (dispatchers.join(",") !== "L3")
    fail(fact, "kit/loops.json", `loops marked mayDispatch: ${dispatchers.join(", ") || "none"} -- only L3 may`);
  checked.push(fact);
}

// ---------------------------------------------------------------------------
// FACT 5 -- the seven campaign file kinds, and the four the loader injects.
// A file kind named in the contract and never loaded is a leader that believes it has
// context it does not have.
// ---------------------------------------------------------------------------
{
  const fact = "FACT 5: seven campaign file kinds, four of them injected";
  const kinds = ["README.md", "decisions.md", "parked.md", "merges.md", "plan.md", "timeline-", "archive-"];
  const notes = read(`${SKILL}/kit/docs/campaign-notes.md`);
  for (const k of kinds)
    if (!notes.includes(k)) fail(fact, "kit/docs/campaign-notes.md", `never names the "${k}" file kind`);

  const loader = read(`${SKILL}/kit/checks/leader-context.sh`);
  for (const k of ["README.md", "decisions.md", "parked.md", "timeline-"])
    if (!loader.includes(k)) fail(fact, "kit/checks/leader-context.sh", `does not inject "${k}"`);
  if (/note_tail[^\n]*merges\.md/.test(loader))
    fail(fact, "kit/checks/leader-context.sh", "injects merges.md, which the contract says is read on demand");
  checked.push(fact);
}

// ---------------------------------------------------------------------------
// FACT 6 -- the guide has the section xez-add-rule writes into.
// xez-add-rule puts every owner rule under "## Owner's rules", found BY NAME. A reworded or
// missing heading in the template makes every new project create it on the first rule instead.
// ---------------------------------------------------------------------------
{
  const fact = "FACT 6: guide carries the Owner's rules section xez-add-rule writes into";
  const sectionsFile = "skills/xez-add-rule/references/sections.md";
  if (!has(sectionsFile)) fail(fact, sectionsFile, "missing -- xez-add-rule cannot place a rule");
  else {
    const names = [...read(sectionsFile).matchAll(/^\|\s*\*\*(.+?)\*\*\s*\|/gm)].map((m) => m[1].trim());
    if (names.length !== 1 || names[0] !== "Owner's rules")
      fail(fact, sectionsFile, "the table must name exactly one section, Owner's rules");
    const guide = read(`${SKILL}/kit/leader-guide.template.md`);
    const headings = [...guide.matchAll(/^##\s+(.+)$/gm)].map((m) => m[1].trim());
    for (const n of names)
      if (!headings.includes(n))
        fail(fact, "kit/leader-guide.template.md", `has no "## ${n}" heading, so a rule for it lands nowhere`);
  }
  checked.push(fact);
}

// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// FACT 7 -- only the launcher's session is the leader.
//
// The hook fires in every Claude Code session in the checkout. Ungated, a second session opened
// to finish an onboarding was handed the leader guide and started leading the project. The gate
// has two halves in two files, and either one alone does nothing: the hook must test the
// variable, and the launcher must export it. The prose that explains it is the third place.
// ---------------------------------------------------------------------------
{
  const fact = "FACT 7: only the launcher's session gets the leader guide";
  const loader = read(`${SKILL}/kit/checks/leader-context.sh`);
  if (!/\[ "\$\{XEZAR_LEADER:-\}" = "1" \] \|\| silent/.test(loader))
    fail(fact, "kit/checks/leader-context.sh", "the hook does not stay silent when XEZAR_LEADER is not 1");
  const launcher = read(`${SKILL}/kit/scripts/xezar-leader.sh`);
  if (!/^export XEZAR_LEADER=1$/m.test(launcher))
    fail(fact, "kit/scripts/xezar-leader.sh", "the launcher does not export XEZAR_LEADER=1, so its own session gets no guide");
  if (!read(`${SKILL}/references/write.md`).includes("XEZAR_LEADER=1"))
    fail(fact, "references/write.md", "never says what makes a session the leader");
  // The session is told it IS the leader, before the guide, so the project's own "only the
  // launcher starts the leader" never reads as "not you".
  const IDENTITY = "printf '%s\\n\\n' 'This session was started with XEZAR_LEADER=1";
  const at = loader.indexOf(IDENTITY);
  const gate = loader.indexOf('[ "${XEZAR_LEADER:-}" = "1" ] || silent');
  const guide = loader.indexOf("=== .xezar/docs/leader-guide.md");
  if (at < 0 || !(gate < at && at < guide))
    fail(fact, "kit/checks/leader-context.sh", "does not tell the leader session it is the leader, after the XEZAR_LEADER check and before the guide");
  checked.push(fact);
}

// ---------------------------------------------------------------------------
// FACT 8 -- tracker-facing templates name no repository but the consumer's own.
//
// The kit began as another project's files. Copied verbatim, its issue-template config sent a
// consumer's SECURITY REPORTS to that other project's advisory page. A template names the
// repository only through {{REPO_SLUG}}, and the write step must say the placeholder is filled.
// ---------------------------------------------------------------------------
{
  const fact = "FACT 8: kit tracker templates name no foreign repository";
  for (const file of walk(`${SKILL}/kit/github`, /\.(ya?ml|md)$/)) {
    for (const m of read(file).matchAll(/github\.com\/([^\s)"'>]+)/g)) {
      if (!m[1].startsWith("{{REPO_SLUG}}"))
        fail(fact, file.replace(`${SKILL}/`, ""), `links github.com/${m[1]} -- a consumer's template must point at the consumer's repository`);
    }
  }
  if (!read(`${SKILL}/references/write.md`).includes("{{REPO_SLUG}}"))
    fail(fact, "references/write.md", "never says the {{REPO_SLUG}} placeholder must be filled");
  checked.push(fact);
}

// ---------------------------------------------------------------------------
// FACT 9 -- the skill's own tracker descriptor IS the collection's.
//
// A skill never reads another skill's references, so this one carries its own copy of the GitHub
// descriptor to install. The first version did not, and the run went looking on the machine and
// found one only because another skill happened to be installed globally. A private copy that
// drifts installs last year's contract into a new project, so the copy is held byte-identical.
// ---------------------------------------------------------------------------
{
  const fact = "FACT 9: the skill's tracker descriptor is the canonical one";
  const own = `${SKILL}/references/trackers/github.md`;
  const canonical = "skills/xez-setup-agent-pipeline/references/trackers/github.md";
  if (!has(own)) fail(fact, own, "the skill ships no descriptor of its own to install");
  else if (read(own) !== read(canonical))
    fail(fact, own, `differs from ${canonical} -- copy the canonical file over it`);

  // The same argument, for the toolchain descriptors. A run that found none in the kit copied one
  // out of `xez-setup-agent-pipeline/references/`, which Cross-skill contract 4-5 forbids: it
  // works only where that skill happens to be installed, and it installs whichever version is on
  // the machine rather than the one this release ships.
  //
  // Then the browser and security descriptors, for the same reason and a sharper one: the design
  // review and the browser-test role both read `.xezar/pipeline/browsers/`, which no run ever
  // installed, and a descriptor is literal shell whose exit status becomes a gate result.
  //
  // The list is the directory, not a list kept here: a descriptor added to the kit and left out
  // of a hand-written array would be installed into every project and held to nothing.
  const kitPipeline = `${SKILL}/kit/pipeline`;
  const descriptors = walk(kitPipeline, /\.md$/).map((file) => file.slice(kitPipeline.length + 1)).sort();
  if (descriptors.length === 0) fail(fact, kitPipeline, "holds no descriptor at all, so a run must reach into another skill for one");
  for (const family of ["toolchains", "browsers", "security"]) {
    if (!descriptors.some((name) => name.startsWith(`${family}/`)))
      fail(fact, `${kitPipeline}/${family}`, "the kit ships no descriptor of this family, and a role in the kit reads one");
  }
  // Byte-identity proves two copies agree. The digest pin adds CHANGE VISIBILITY and nothing
  // more: a descriptor cannot change without a second, deliberate edit to the pin file, so the
  // change shows up in a diff under its own name. It does not prove anybody reviewed it -- a
  // bump script moves the pin in the same commit -- and nothing here claims that it does.
  const lockPath = `${SKILL}/references/descriptor-digests.json`;
  const pinned = has(lockPath) ? JSON.parse(read(lockPath)).digests ?? {} : {};
  if (!has(lockPath)) fail(fact, lockPath, "the descriptor digests are not recorded");
  for (const name of descriptors) {
    const kit = `${SKILL}/kit/pipeline/${name}`;
    const src = `skills/xez-setup-agent-pipeline/references/${name}`;
    if (!has(src)) { fail(fact, kit, `has no canonical sibling at ${src} -- a kit descriptor is a copy of the collection's, never an original`); continue; }
    if (read(kit) !== read(src)) fail(fact, kit, `differs from ${src} -- copy the canonical file over it`);
    const digest = createHash("sha256").update(readFileSync(join(root, kit))).digest("hex");
    if (pinned[`kit/pipeline/${name}`] !== digest)
      fail(fact, lockPath, `pins ${pinned[`kit/pipeline/${name}`] ?? "nothing"} for kit/pipeline/${name}, and the file is ${digest} -- review the change, then update the pin`);
    if (!/^[0-9a-f]{64}$/.test(pinned[`kit/pipeline/${name}`] ?? ""))
      fail(fact, lockPath, `has no SHA-256 digest for kit/pipeline/${name}`);
  }
  for (const key of Object.keys(pinned)) {
    if (!descriptors.includes(key.replace("kit/pipeline/", ""))) fail(fact, lockPath, `pins ${key}, and the kit ships no such descriptor`);
  }
  if (!/descriptor-digests\.json/.test(read(`${SKILL}/references/write.md`)))
    fail(fact, `${SKILL}/references/write.md`, "never tells the write step to record the installed descriptor digests");
  checked.push(fact);
}

// ---------------------------------------------------------------------------
// FACT 10 -- the taxonomy the skill installs has the labels its kit enforces.
//
// The kit's design gate reads five labels. The taxonomy template the first run found had two of
// them, and the run added the other three by hand. A label the policy reads and the taxonomy
// never creates is a gate that logs a skip forever.
// ---------------------------------------------------------------------------
{
  const fact = "FACT 10: the installed taxonomy carries the design labels the kit reads";
  const taxonomy = JSON.parse(read(`${SKILL}/references/labels.json`));
  for (const name of ["needs-design", "design-approved", "skip-design", "design", "design-failed"]) {
    if (!taxonomy.labels?.[name]) fail(fact, "references/labels.json", `has no "${name}" label`);
  }
  for (const [name, l] of Object.entries(taxonomy.labels ?? {})) {
    if (!taxonomy.colors?.[l.group]) fail(fact, "references/labels.json", `"${name}" is in group "${l.group}", which has no colour`);
    if (!l.description || !/[.!?]$/.test(l.description.trim())) fail(fact, "references/labels.json", `"${name}" has no full-sentence description`);
  }
  checked.push(fact);
}

// ---------------------------------------------------------------------------
// FACT 11 -- the gates run by hand, and a hand run is never evidence.
//
// The kit's role skills say "in a standalone run with no `gates` step, run it once at the end",
// and the skill's own smoke test runs `.xezar/checks/repo-gates.sh` as a plain command. For one
// release neither was possible: `gate_attempt_begin` refused without an engine run id, so the
// one command the owner is told to run always exited 1 in every onboarded project, and tier 2 of
// the documented smoke test could not pass. The fix is a throwaway attempt under
// `.local/xezar/scratch/`, which must stay OUTSIDE the evidence roots -- a hand run that could be
// sealed would be a tree proving itself. Both halves of that are pinned here: it runs, and it
// cannot certify.
// ---------------------------------------------------------------------------
{
  const fact = "FACT 11: the gates run standalone, and a standalone attempt cannot be certified";
  const common = read(`${SKILL}/kit/checks/lib/common.sh`);
  const record = read(`${SKILL}/kit/checks/lib/gate-record.sh`);
  const smoke = read(`${SKILL}/references/smoke-test.md`);

  if (!/standalone_gates_dir\(\)\s*\{/.test(common))
    fail(fact, "kit/checks/lib/common.sh", "has no standalone_gates_dir -- a hand gate run has nowhere to write");
  else if (!/standalone_gates_dir\(\)\s*\{[^}]*\.local\/xezar\/scratch\//.test(common))
    fail(fact, "kit/checks/lib/common.sh", "standalone_gates_dir does not point under .local/xezar/scratch/, so a hand run could land in an evidence root");

  if (/no run id — cannot locate the evidence directory/.test(record))
    fail(fact, "kit/checks/lib/gate-record.sh", "still refuses an attempt without a run id -- `repo-gates.sh` run by hand exits 1");
  if (!/standalone_gates_dir/.test(record))
    fail(fact, "kit/checks/lib/gate-record.sh", "never reaches standalone_gates_dir, so there is no standalone attempt");
  if (!/never sealable evidence/.test(record))
    fail(fact, "kit/checks/lib/gate-record.sh", "does not tell the reader a standalone attempt is not evidence");

  if (!/repo-gates\.sh/.test(smoke))
    fail(fact, "references/smoke-test.md", "no longer runs repo-gates.sh, so nothing proves the standalone path");
  // Engine 0.19.0 refuses a step-list start that carries agentProfile, worktree or autonomous;
  // the step runs on the project's selected login, and every other login is checked for free.
  const REFUSED = "the engine refuses `agentProfile`, `worktree` and `autonomous`";
  if (!smoke.includes(REFUSED) || /agentProfile|`worktree`|`autonomous`/.test(smoke.replace(REFUSED, "")))
    fail(fact, "references/smoke-test.md", "sends agentProfile, worktree or autonomous with inline steps, which engine 0.19.0 refuses");
  for (const word of ["profileId", "check_account_status", "`connected`"])
    if (!smoke.includes(word)) fail(fact, "references/smoke-test.md", `does not name ${word}, so a login nobody signed in to passes tier 1`);
  checked.push(fact);
}

// ---------------------------------------------------------------------------
// FACT 12 -- OpenCode is switched off the same way everywhere it is mentioned.
//
// The setup changes one engine setting on the owner's behalf. That is only acceptable while four
// places say the same thing: the step that does it, the preview that discloses it before approval,
// the report that tells the owner how to undo it, and the routing rules that keep the provider
// out of every chain. A preview that discloses less than the step does is a consent the owner
// never gave. This is a STATIC pin: it proves the prose agrees. That the engine honours the call
// is proved on a live engine, and `docs/coverage.md` says so.
// ---------------------------------------------------------------------------
{
  const fact = "FACT 12: the OpenCode switch, its disclosure, its undo and its routing ban agree";
  // Each pattern is looked for in the SECTION it is a claim about. Over the whole file, the word
  // `get_capabilities` in an unrelated step, or "OpenCode" in a changelog-style aside, would keep
  // this green after the section that matters lost it.
  // A `#` line inside a code fence is a shell comment or a template's own heading, not the end
  // of the section, so fences are tracked while looking for the next heading.
  const sectionOf = (file, heading) => {
    const lines = read(`${SKILL}/references/${file}`).split("\n");
    let start = -1;
    let fenced = false;
    for (let i = 0; i < lines.length && start === -1; i += 1) {
      if (/^\s*```/.test(lines[i])) fenced = !fenced;
      else if (!fenced && heading.test(lines[i])) start = i;
    }
    if (start === -1) { fail(fact, `references/${file}`, `has no section matching ${heading} -- this fact reads that section and nothing else`); return ""; }
    const level = /^#+/.exec(lines[start])[0].length;
    const next = new RegExp(`^#{1,${level}} `);
    let end = lines.length;
    fenced = false;
    for (let i = start + 1; i < lines.length; i += 1) {
      if (/^\s*```/.test(lines[i])) fenced = !fenced;
      else if (!fenced && next.test(lines[i])) { end = i; break; }
    }
    return lines.slice(start, end).join("\n");
  };
  const verify = sectionOf("verify.md", /^## 3\. /);
  const preview = sectionOf("preview.md", /^## Say what the preview does not cover/);
  const report = sectionOf("report-templates.md", /^## Setup complete/);
  const interview = sectionOf("interview.md", /^### 3\. `lanes`/);

  const callRx = /set_provider_enabled/;
  if (!callRx.test(verify)) fail(fact, "references/verify.md", "no longer switches the provider off through set_provider_enabled");
  if (!/get_capabilities[\s\S]*set_provider_enabled[\s\S]*get_capabilities/.test(verify))
    fail(fact, "references/verify.md", "does not read the state before the switch and read it back after");
  // Prose wraps, so a phrase is matched across any whitespace.
  if (!/"previous"|previousEnabled/.test(verify)) fail(fact, "references/verify.md", "does not record what the setting was before changing it");
  // The record is a fact about one machine, written after the merge. In a committed file it
  // dirties a tree the same step requires to be clean, and puts that machine into git.
  if (!/\.local\/xezar\/runtime\//.test(verify))
    fail(fact, "references/verify.md", "does not keep the record of the switch under the git-ignored .local/xezar/runtime/");
  if (!/leave\s+it\s+on/i.test(verify)) fail(fact, "references/verify.md", "has no case in which the provider is left on -- an older routing table that uses it would start refusing dispatches");
  for (const [name, text] of [["verify.md", verify], ["preview.md", preview], ["report-templates.md", report]]) {
    if (!/\.xezar\/workspace\.json/.test(text)) fail(fact, `references/${name}`, "does not name .xezar/workspace.json as the file the switch lives in");
  }
  for (const [name, text] of [["verify.md", verify], ["report-templates.md", report]]) {
    if (!/enabled: true/.test(text)) fail(fact, `references/${name}`, "does not give the call that turns the provider back on");
  }
  if (!/OpenCode is switched off/.test(preview)) fail(fact, "references/preview.md", "does not disclose the switch before the one approval");
  const toolLimits = JSON.parse(read(`${SKILL}/kit/routing.json`)).globalBans.find((ban) => ban.id === "tool-limits");
  if (!toolLimits || toolLimits.checkedAt !== "file" || !/enforcesToolLimits: false is in no reading row[\s\S]*security-and-release/.test(toolLimits.rule))
    fail(fact, "kit/routing.json", "lost the global prohibition that keeps such a provider out of reading and release rows");
  if (!/OpenCode logins are not offered as task logins/.test(interview)) fail(fact, "references/interview.md", "offers OpenCode logins as task logins again");
  if (!/^## OpenCode is off by default/m.test(read("DECISIONS.md")))
    fail(fact, "DECISIONS.md", "has no \"OpenCode is off by default\" entry, which references/verify.md cites for the reasons");
  checked.push(fact);
}

function walk(rel, match) {
  const out = [];
  const rec = (d) => {
    for (const e of readdirSync(join(root, d), { withFileTypes: true })) {
      const p = `${d}/${e.name}`;
      if (e.isDirectory()) rec(p);
      else if (match.test(e.name)) out.push(p);
    }
  };
  rec(rel);
  return out;
}

// ---------------------------------------------------------------------------
// FACT 13 -- the leader guide's line limit can actually be met.
// write.md tells the agent to keep the generated guide at or under 200 lines. For one release the
// template's fixed part (186) plus the four section budgets (65) made that impossible, and the
// first audited run reported a 227-line guide as a cross it could do nothing about. So the two
// numbers are added up here: fixed lines of the template + the budgets stated in write.md.
// ---------------------------------------------------------------------------
{
  const fact = "FACT 13: the leader guide's fixed lines plus its section budgets fit the stated limit";
  const LIMIT = 200;
  const tpl = read(`${SKILL}/kit/leader-guide.template.md`)
    .replace(/<!--[\s\S]*?-->\n*/g, "")          // the comments the write step deletes
    .replace(/^---\n+/m, "");                       // and the rule above the generated half
  const fixed = tpl.replace(/\n+$/, "").split("\n").filter((l) => !/^\{\{[A-Z_]+\}\}$/.test(l)).length;
  const write = read(`${SKILL}/references/write.md`);
  const budgets = [...write.matchAll(/^\s*\| `\{\{[A-Z_]+\}\}` \|.*\| ≤ (\d+) \|\s*$/gm)].map((m) => Number(m[1]));
  if (budgets.length !== 4)
    fail(fact, "references/write.md", `expected four placeholder budgets ("≤ N"), found ${budgets.length}`);
  else {
    const total = fixed + budgets.reduce((a, b) => a + b, 0);
    if (total > LIMIT)
      fail(fact, "kit/leader-guide.template.md", `${fixed} fixed lines + ${budgets.join(" + ")} budgeted = ${total}, over the ${LIMIT}-line limit write.md states -- no run can comply`);
  }
  if (!new RegExp(`\\*\\*${LIMIT} lines\\*\\*`).test(write))
    fail(fact, "references/write.md", `no longer states the **${LIMIT} lines** limit this fact adds up to`);
  checked.push(fact);
}

// ---------------------------------------------------------------------------
// FACT 14 -- the kit carries no practice that belongs to one project only.
//
// Two concepts were removed from the kit on 2026-09-21 by owner decision: the dogfooding
// fragment ledger (this project's own record-keeping habit, which AGENTS.md forbids a skill
// from assuming) and the known-load-flake list (a register of CI jobs allowed one automatic
// rerun, which the owner's rule forbids outright).
//
// This fact exists because NOTHING ELSE CATCHES THEM COMING BACK. lint.sh's reference gate
// matches only tokens containing the literal segment `references/`, so a kit pointer at
// `.xezar/docs/dogfooding.md` never matched it -- which is exactly why that dead pointer
// shipped in 46 files and survived every gate for four releases. catalog-check.mjs never
// parses repository-checks.sh, so half a removal passes too. A grep in a plan document is
// not a gate; this is.
//
// Scope: the vendored kit only. CHANGELOG.md, DECISIONS.md, BACKWARD_COMPATIBILITY.md and
// UPGRADE_NOTES.md are records of what was true then and MUST keep naming both, or the
// upgrade note cannot tell a reader what to look for.
{
  const fact = "FACT 14: the vendored kit carries no dogfooding ledger and no known-flake register";
  const banned = [
    ["dogfood", "the dogfooding ledger -- one project's record-keeping habit"],
    ["knownLoadFlakes", "the known-load-flake register -- a list of CI jobs allowed a rerun"],
    ["failedJobsAreKnownLoadFlakes", "the record field the one-rerun rule read"],
  ];
  // The identifiers above are not the concept. A pin that greps only identifiers lets the idea
  // back in as English, and it did: after the removal `xezar-deploy.md` still told a reader "a
  // failed job is never rerun as a known flake" -- the third clause of a three-way contrast whose
  // premise had been deleted, so it now taught that the integration path DOES excuse jobs by name.
  // Every gate was green.
  //
  // So these patterns reject the EXCUSING SENSE only, never the word. The kit must stay free to
  // say the true things it says today: "flaky is not PASS" (xezar-ui-tests.md), "never excused by
  // a list of names" (xezar-integration.md), "there is no permanent known-flake allowance"
  // (xezar-release-publish.md). Those are the opposite of the removed idea and are load-bearing.
  // The limit is honest and worth stating: this catches the two phrasings that shipped, not the
  // idea. Deciding whether a sentence excuses a red build is not something a grep can do.
  const bannedPhrases = [
    [/known[ -]load[ -]flakes?/i, 'the phrase "known load flake" -- the register, named in prose'],
    [/rerun[^.\n]{0,40}as a known flake/i, '"rerun ... as a known flake" -- excusing a red job by name'],
  ];
  const walk = (rel) => {
    const out = [];
    for (const e of readdirSync(join(root, rel), { withFileTypes: true })) {
      const p = `${rel}/${e.name}`;
      if (e.isDirectory()) out.push(...walk(p));
      else out.push(p);
    }
    return out;
  };
  const kit = `${SKILL}/kit`;
  for (const file of has(kit) ? walk(kit) : []) {
    const raw = read(file);
    const text = raw.toLowerCase();
    for (const [needle, what] of banned) {
      if (text.includes(needle.toLowerCase()))
        fail(fact, file, `names "${needle}" -- ${what}. It was removed from the kit on 2026-09-21; see DECISIONS.md. A project onboarded tomorrow must not learn it exists.`);
    }
    for (const [pattern, what] of bannedPhrases) {
      if (pattern.test(raw))
        fail(fact, file, `carries ${what}. The identifiers are gone but the idea is back in prose; see DECISIONS.md. A project onboarded tomorrow must not learn it exists.`);
    }
  }
  // The skill's own generator must not write the key back into a new project's config either.
  const write = read(`${SKILL}/references/write.md`);
  if (write.includes("knownLoadFlakes"))
    fail(fact, `${SKILL}/references/write.md`, `still generates ci.knownLoadFlakes into a new project's .xezar/pipeline/config.json`);
  checked.push(fact);
}

// ---------------------------------------------------------------------------
// FACT 15 -- the gate lease cannot become a way for a working gate to fail.
//
// The lease re-executes repo-gates.sh under `xezar lease gates`. Three properties make that
// safe, and each fails QUIETLY if broken -- the gates still run, so nothing goes red:
//
//   * the re-entry guard. Without it the script re-executes itself forever.
//   * `--list` exits BEFORE the lease. It runs nothing and must stay instant; leasing it would
//     make the command-list id wait behind somebody else's test suite.
//   * never `npx`. It would fetch an arbitrary build from the registry and lease against a
//     different build's idea of the slots -- the one mistake the engine's own wrapper calls out.
//   * the PROBE runs before the `exec`, and `execfail` is set. These two are what make the
//     block's "fail open, always" promise true rather than decorative. `exec` replaces the
//     script, so after it there is no code of ours left: without the probe, a fork engine that
//     lacks the verb, an engine too old for `--status-file` (the engine's parseArgs is strict, so
//     an unknown option throws) and an engine that dies during boot each arrive at the caller AS
//     THE GATE VERDICT -- zero gates run, exit code indistinguishable from a real failure.
//     Measured, not assumed: `set -uo pipefail` plus a failed `exec` exits at rc=126 and never
//     reaches the next line, so `shopt -s execfail` is load-bearing too.
{
  const fact = "FACT 15: the gate lease re-exec is guarded, skips --list, probes before it commits, and never resolves through npx";
  const where = `${SKILL}/kit/checks/repo-gates.sh`;
  const gates = read(where);
  const listExit = gates.indexOf('if [ "$LIST" -eq 1 ]');
  const leaseAt = gates.indexOf('if [ -z "${XEZ_GATE_LEASE:-}" ]');
  if (leaseAt === -1)
    fail(fact, where, "no lease block guarded by XEZ_GATE_LEASE -- an unguarded re-exec loops forever");
  else if (listExit === -1)
    fail(fact, where, "no --list early exit found, so the lease's position relative to it cannot be checked");
  else if (leaseAt < listExit)
    fail(fact, where, "the lease block runs BEFORE the --list exit -- `--list` runs nothing and must never wait for a slot");
  // Code lines only: the block's own comment says "NEVER `npx`", and banning the warning along
  // with the thing it warns about is how a pin teaches people to delete the explanation.
  const code = gates.split("\n").filter((l) => !/^\s*#/.test(l)).join("\n");
  if (/\bnpx\b/.test(code))
    fail(fact, where, "resolves the engine through npx -- that fetches another build and leases against a different build's idea of the slots");
  if (leaseAt !== -1 && !gates.includes("lease gates --"))
    fail(fact, where, "the lease block no longer invokes `lease gates --`");
  // The probe must come BEFORE the exec, and execfail must be set. Order is the whole point: a
  // probe after the exec is not a probe, it is dead code.
  const execAt = gates.indexOf('exec "$lease_bin"');
  // Both probe forms are pinned, not just the presence of a probe. From engine 0.19.0 the check is
  // the engine's PUBLISHED one (`lease gates --probe`, exit 0 with `lease.gates === true`, xezar
  // #866); for 0.17 and 0.18 it is the refusal carrying `nothing to run`, the one string in it the
  // engine's own suite asserts. Matching the `usage:` text instead would look identical at run time
  // and lose both protections -- the engine declares that wording not a contract.
  // `code` (comments stripped, above) is what carries the call: the comment block explains both
  // probes, so searching the whole file would pass on the explanation alone.
  const publishedAt = code.indexOf("lease gates --probe") === -1 ? -1 : gates.indexOf('"$lease_bin" lease gates --probe');
  const legacyAt = gates.indexOf("grep -qF 'nothing to run'");
  const probeAt = publishedAt === -1 || legacyAt === -1 ? -1 : Math.min(publishedAt, legacyAt);
  if (publishedAt !== -1 && !gates.includes("answer.lease.gates === true"))
    fail(fact, where, "the published probe's answer is no longer read -- exit 0 alone does not say the engine can lease");
  if (execAt === -1)
    fail(fact, where, "no `exec \"$lease_bin\"` found -- the lease no longer re-executes, so its release-on-any-exit property is gone");
  else if (probeAt === -1)
    fail(fact, where, "the probe no longer carries BOTH `lease gates --probe` (engine 0.19.0 and later) and `nothing to run` (0.17, 0.18) before the exec -- each is the check its engines assert, and any other match leaves a fork or a too-old engine reaching the caller as the gate verdict, with no gates run");
  else if (probeAt > execAt)
    fail(fact, where, "the engine probe sits AFTER the exec, where no code of ours ever runs -- fail-open is decorative");
  if (execAt !== -1 && !gates.includes("shopt -s execfail"))
    fail(fact, where, "no `shopt -s execfail` before the exec -- a failed exec exits this shell at rc=126 and the fail-open line below is unreachable");
  checked.push(fact);
}

// ---------------------------------------------------------------------------
// FACT 16 -- a reading step is read-only because of its shell, not its tool list.
// No backend made a step without Edit and Write read-only (xezar #849): the shell was still open.
// The fix is three pieces that only work together, so each is pinned: the five reading workflows
// carry a bashAllowlist; git-read.sh refuses the flag that makes git write; and the security scan
// flags a pull request that loosens either, because it would otherwise pass as an ordinary edit.
// ---------------------------------------------------------------------------
{
  const fact = "FACT 16: reading steps are limited by their shell, and loosening that is a trust-boundary change";
  for (const wf of ["architecture-review", "business-analysis", "code-review", "issue-triage", "security-review"]) {
    const text = read(`${SKILL}/kit/workflows/${wf}.yaml`);
    if (!/^\s+bashAllowlist: \[.*"bash \.xezar\/checks\/verdict-write\.sh".*\]$/m.test(text))
      fail(fact, `kit/workflows/${wf}.yaml`, "the reading step has no bashAllowlist naming verdict-write.sh -- its shell can write anywhere");
  }
  const gitRead = read(`${SKILL}/kit/checks/git-read.sh`);
  if (!/^BLOCKED_LONG=".*\boutput\b.*"$/m.test(gitRead))
    fail(fact, "kit/checks/git-read.sh", "it no longer refuses --output, so an allowed `git diff` can write a file");
  const scan = read(`${SKILL}/kit/checks/lib/security-scan.mjs`);
  if (!scan.includes("/^\\.xezar\\/(workflows|checks)\\//"))
    fail(fact, "kit/checks/lib/security-scan.mjs", "TRUST_BOUNDARIES no longer names .xezar/workflows/ and .xezar/checks/ -- a PR that loosens a reading step passes as an ordinary edit");
  if (!scan.includes("/^\\.claude\\/settings(\\.local)?\\.json$/"))
    fail(fact, "kit/checks/lib/security-scan.mjs", "TRUST_BOUNDARIES no longer names .claude/settings.json -- a PR could widen every reading step's shell as an ordinary edit");
  if (!scan.includes("/^\\.codex\\//"))
    fail(fact, "kit/checks/lib/security-scan.mjs", "TRUST_BOUNDARIES no longer names .codex/ -- a PR could add a Codex allow rule, config or hook as an ordinary edit");
  const ghWrite = read(`${SKILL}/kit/checks/gh-write.sh`);
  if (!/^NEVER_ADD=".*qa-approved.*design-approved.*"$/m.test(ghWrite) || !/^NEVER_REMOVE=".*blocked.*do-not-merge.*"$/m.test(ghWrite))
    fail(fact, "kit/checks/gh-write.sh", "it no longer refuses an approval label or the removal of a blocking one -- a reviewer could pass the merge gate on its own word");
  const checker = read(`${SKILL}/kit/checks/catalog-check.mjs`);
  for (const gone of ['"gh pr comment"', '"gh pr edit"', '"gh issue comment"', '"gh issue edit"', '"bash .xezar/checks/security-scan.sh"'])
    if (checker.includes(`  ${gone},`))
      fail(fact, "kit/checks/catalog-check.mjs", `READER_BASH_PREFIXES has ${gone} again -- that prefix can write to any repository or any path`);
  checked.push(fact);
}

// ---------------------------------------------------------------------------
// FACT 17 -- routing decides which model may review or ship a change, so the file and the script
// hold the floor together. The shipped rows state the security minimums, the owner's reserved
// lane stays reserved, the route script enforces the minimums whatever a project's file says, and
// a pull request that edits the routing file is a trust-boundary change.
// ---------------------------------------------------------------------------
{
  const fact = "FACT 17: security rows keep their minimums, reserved lanes stay reserved, and routing is a trust boundary";
  const routing = JSON.parse(read(`${SKILL}/kit/routing.json`));
  for (const row of routing.rows.filter((r) => r.class === "security-and-release")) {
    const bans = (row.never ?? []).map((n) => JSON.stringify(Object.fromEntries(Object.entries(n).filter(([k]) => k !== "why"))));
    const missing = ['{"tier":"cheap"}', '{"local":true}', '{"advisoryOnly":true}'].filter((b) => !bans.includes(b));
    if (row.neverAuthor !== true || row.handledBy || missing.length)
      fail(fact, "kit/routing.json", `row ${row.id} lost a security minimum (neverAuthor, no handledBy, bans ${missing.join(" ") || "all present"})`);
  }
  const reserved = routing.reservedLanes ?? {};
  if (reserved["codex/gpt-6-astra"]?.escalation !== true || JSON.stringify(reserved["codex/gpt-6-astra"]?.rows) !== '["generated-images","diagrams","security-review"]')
    fail(fact, "kit/routing.json", "codex/gpt-6-astra is no longer reserved to generated-images, diagrams and security-review, plus escalation");
  const route = read(`${SKILL}/kit/checks/route.mjs`);
  if (!/const FILE_BANS = \["local-never-writes", "tool-limits"\];/.test(route) || !/out\.push\(\["security-minimum", `"\$\{id\}" is a cheap lane`\]\)/.test(route) || !/^const ENFORCING_RUNNERS = new Set\(\["claude", "codex"\]\);$/m.test(route))
    fail(fact, "kit/checks/route.mjs", "no longer enforces the file bans, the security minimums and the enforcing-runner list itself -- a project's file could drop them");
  if (!read(`${SKILL}/kit/checks/lib/security-scan.mjs`).includes("/^\\.xezar\\/routing(\\.schema)?\\.json$/"))
    fail(fact, "kit/checks/lib/security-scan.mjs", "TRUST_BOUNDARIES no longer names .xezar/routing.json -- a PR could reroute its own review as an ordinary edit");
  checked.push(fact);
}

// ---------------------------------------------------------------------------
// FACT 18 -- the engine's machine files stay out of git, siblings included.
//
// Every engine settings write leaves `.bak`, `.lock`, `.lock.takeover` and `<pid>.<hex>.tmp`
// files beside workspace.json and agent-accounts.json. Ignoring only the files themselves put
// those siblings -- this machine's paths and accounts -- into the first `git status`.
// ---------------------------------------------------------------------------
{
  const fact = "FACT 18: the engine's machine files and their siblings are ignored";
  const ignore = read(`${SKILL}/kit/xezar.gitignore`).split("\n");
  const exclude = read("docs/bootstrap-prompt.md").split("\n").map((l) => l.trim());
  for (const name of ["workspace.json", "workspace-ui.json", "agent-accounts.json"]) {
    if (!ignore.includes(`/${name}.*`)) fail(fact, "kit/xezar.gitignore", `does not ignore /${name}.*, the engine's backup, lock and temp files`);
    if (!exclude.includes(`/.xezar/${name}.*`)) fail(fact, "docs/bootstrap-prompt.md", `the exclude list does not hold /.xezar/${name}.*`);
  }
  checked.push(fact);
}

// ---------------------------------------------------------------------------
// FACT 19 -- verdict ids are stamped by the script, never typed by a reviewer.
//
// A reading step is denied any command holding a `$`, so a skill that told the reviewer to read
// `$XEZ_TASK_ID` or `$XEZ_STEP_ID` was a skill the reviewer could not follow. `verdict-write.sh` stamps
// both from the environment and refuses a packet that names another task or step.
// ---------------------------------------------------------------------------
{
  const fact = "FACT 19: verdict packets are stamped with taskId and stepId by verdict-write.sh, and no kit skill asks for them";
  for (const f of readdirSync(join(root, SKILL, "kit/skills")).filter((n) => n.endsWith(".md"))) {
    const text = read(`${SKILL}/kit/skills/${f}`);
    for (const bad of ["$XEZ_TASK_ID", "$XEZ_STEP_ID", "verdict.json.tmp"])
      if (text.includes(bad)) fail(fact, `kit/skills/${f}`, `holds ${bad} -- the packet ids come from verdict-write.sh, and a reading step cannot run a command with a $ or an mv`);
  }
  const vw = read(`${SKILL}/kit/checks/verdict-write.sh`);
  if (!vw.includes('[ -n "${XEZ_TASK_ID:-}" ] && [ -n "${XEZ_STEP_ID:-}" ] || refuse') || !vw.includes("JSON.stringify({ ...p, taskId, stepId })"))
    fail(fact, "kit/checks/verdict-write.sh", "no longer refuses an unset XEZ_TASK_ID or XEZ_STEP_ID, or no longer stamps both into the packet");
  checked.push(fact);
}

// ---------------------------------------------------------------------------
// FACT 20 -- the leader's merge permission cannot bypass the checks or leave the repository.
// `Bash(gh pr merge *)` also matches `--admin`, which merges over red checks while admin
// enforcement is off, and `--repo` / `-R`, which merges somewhere else.
// ---------------------------------------------------------------------------
{
  const fact = "FACT 20: the leader settings deny gh pr merge with --admin, --repo or -R";
  const deny = JSON.parse(read(`${SKILL}/kit/scripts/xezar-leader-settings.json`)).permissions?.deny ?? [];
  for (const rule of ["Bash(gh pr merge *--admin*)", "Bash(gh pr merge *--repo*)", "Bash(gh pr merge *-R *)"])
    if (!deny.includes(rule)) fail(fact, "kit/scripts/xezar-leader-settings.json", `permissions.deny lacks ${rule}`);
  checked.push(fact);
}

// ---------------------------------------------------------------------------
// FACT 21 -- every standing loop is a cron job. A self-paced wake-up is not a job the leader can
// list, so it cannot be compared against loops.json at session start; a cron job can.
// ---------------------------------------------------------------------------
{
  const fact = "FACT 21: every standing loop is cron with a five-field schedule";
  for (const loop of JSON.parse(read(`${SKILL}/kit/loops.json`)).loops)
    if (loop.mechanism !== "cron" || String(loop.schedule).trim().split(/\s+/).length !== 5)
      fail(fact, "kit/loops.json", `${loop.id} is ${loop.mechanism} "${loop.schedule}", not cron with a five-field schedule`);
  checked.push(fact);
}

// ---------------------------------------------------------------------------
// FACT 22 -- conflict repair pushes to the PR branch and never merges. Routed to
// integration.yaml, it ran the merge-and-watch steps on a PR whose conflict it was sent to fix.
// ---------------------------------------------------------------------------
{
  const fact = "FACT 22: conflict-repair routes to no workflow that merges or watches the base branch";
  const row = JSON.parse(read(`${SKILL}/kit/routing.json`)).rows.find((r) => r.id === "conflict-repair");
  for (const wf of row?.workflows ?? []) {
    const text = has(`${SKILL}/kit/workflows/${wf}`) ? read(`${SKILL}/kit/workflows/${wf}`) : "";
    if (!text || /ci-watch\.sh|skill: xezar-integration\b/.test(text))
      fail(fact, "kit/routing.json", `conflict-repair routes to ${wf}, which is missing or has a merge-target step (ci-watch.sh or xezar-integration)`);
  }
  if (!row?.workflows?.length) fail(fact, "kit/routing.json", "conflict-repair names no workflow");
  checked.push(fact);
}

// ---------------------------------------------------------------------------
// FACT 23 -- the ad-hoc browser is one pinned server with one exact tool list. Its MCP server runs
// outside every runner sandbox, so the tool names, the pin and the config guard are the limits: no
// wildcard, no banned tool, no `@latest`, the same pin for Claude and Codex, and never in the e2e
// workflows, which keep the project's own tooling.
// ---------------------------------------------------------------------------
{
  const fact = "FACT 23: chrome-devtools is pinned, listed by exact tool name, and kept out of e2e";
  const ALLOWED = ["navigate_page", "new_page", "list_pages", "select_page", "close_page", "take_snapshot", "take_screenshot",
    "list_console_messages", "get_console_message", "list_network_requests", "get_network_request", "click", "fill", "fill_form",
    "hover", "press_key", "type_text", "wait_for", "handle_dialog", "resize_page", "get_css_styles"];
  const DEBUG = new Set(["list_console_messages", "get_console_message", "list_network_requests", "get_network_request", "get_css_styles"]);
  const WANT = Object.fromEntries(["qa", "design-review", "acceptance-verification", "design", "ui-design", "design-system"].map((w) => [w, ALLOWED]));
  WANT.research = ALLOWED.filter((t) => !DEBUG.has(t));
  const same = (a, b) => a.length === b.length && [...a].sort().join() === [...b].sort().join();
  const wfDir = `${SKILL}/kit/workflows`;
  for (const rel of walk(wfDir, /\.ya?ml$/)) {
    const name = rel.slice(wfDir.length + 1).replace(/\.ya?ml$/, "");
    const listed = [...read(rel).matchAll(/^\s*allowedTools: \[(.*)\]$/gm)].flatMap((m) => m[1].split(",").map((t) => t.trim()))
      .filter((t) => t.startsWith("mcp__chrome-devtools"));
    const tools = listed.map((t) => t.replace(/^mcp__chrome-devtools__/, ""));
    if (listed.some((t) => !/^mcp__chrome-devtools__[a-z_]+$/.test(t))) fail(fact, rel, `lists a chrome-devtools wildcard or server-wide entry: ${listed.filter((t) => !/^mcp__chrome-devtools__[a-z_]+$/.test(t)).join(", ")}`);
    if (!WANT[name]) { if (listed.length) fail(fact, rel, `lists chrome-devtools tools, and only the browser workflows may (never ui-tests or regression-suite)`); continue; }
    if (!same(tools, WANT[name])) fail(fact, rel, `lists chrome-devtools tools [${tools.join(", ")}], expected exactly [${WANT[name].join(", ")}]`);
  }
  const local = JSON.parse(read(`${SKILL}/kit/claude/settings.local.json`));
  const allow = (local.permissions?.allow ?? []).filter((t) => t.startsWith("mcp__chrome-devtools"));
  if (!same(allow, ALLOWED.map((t) => `mcp__chrome-devtools__${t}`))) fail(fact, "kit/claude/settings.local.json", "permissions.allow must name exactly the allowed chrome-devtools tools, never the whole server");
  if (!(local.enabledMcpjsonServers ?? []).includes("chrome-devtools")) fail(fact, "kit/claude/settings.local.json", "enabledMcpjsonServers lacks chrome-devtools");
  const codexRel = `${SKILL}/kit/codex/config.toml`;
  const codex = has(codexRel) ? read(codexRel) : "";
  if (!codex) fail(fact, codexRel, "is missing, so Codex runs get no browser and no tool limit is written down");
  const enabled = [...(/^enabled_tools = \[([\s\S]*?)\]/m.exec(codex)?.[1] ?? "").matchAll(/"([^"]+)"/g)].map((m) => m[1]);
  if (codex && !same(enabled, ALLOWED)) fail(fact, codexRel, `enabled_tools is [${enabled.join(", ")}], expected exactly the allowed set`);
  if (codex && !/^default_tools_approval_mode = "approve"$/m.test(codex))
    fail(fact, codexRel, "has no default_tools_approval_mode = \"approve\"; the engine runs Codex with approvals set to never, so every browser call would fail");
  const mcpArgs = JSON.parse(read(`${SKILL}/kit/mcp.json`)).mcpServers?.["chrome-devtools"]?.args ?? [];
  const codexArgs = JSON.parse(/^args = (\[.*\])$/m.exec(codex)?.[1] ?? "[]");
  for (const [where, args] of [["kit/mcp.json", mcpArgs], [codexRel, codexArgs]]) {
    if (!args.some((a) => /^chrome-devtools-mcp@\d+\.\d+\.\d+$/.test(a)) || !args.includes("--isolated") || !args.includes("--headless") || args.some((a) => /@latest/.test(a)))
      fail(fact, where, `chrome-devtools args ${JSON.stringify(args)} must pin an exact version with --isolated --headless, never @latest`);
  }
  if (JSON.stringify(mcpArgs) !== JSON.stringify(codexArgs)) fail(fact, codexRel, `args ${JSON.stringify(codexArgs)} differ from kit/mcp.json ${JSON.stringify(mcpArgs)}`);
  if (!/^\| `kit\/codex\/config\.toml` \| `\.codex\/config\.toml`/m.test(read(`${SKILL}/references/write.md`))) fail(fact, "references/write.md", "does not map kit/codex/config.toml to .codex/config.toml");
  if (!/^bash "\$SCRIPT_DIR\/config-guard\.sh" browser --from-base$/m.test(read(`${SKILL}/kit/checks/repository-checks.sh`))) fail(fact, "kit/checks/repository-checks.sh", "no longer runs config-guard.sh browser --from-base, so a changed browser entry passes the gate");
  checked.push(fact);
}

if (problems.length) {
  console.error(`Kit facts: ${problems.length} contradiction(s) between a skill's prose and its vendored kit.\n`);
  for (const p of problems) console.error(`  - ${p}\n`);
  console.error("Each fact above is pinned because it already caused a contradiction that every");
  console.error("other gate passed. Fix the half that is wrong -- do not relax the pin.");
  process.exit(1);
}
console.log(`Kit facts OK (${checked.length} pinned facts, prose and vendored kit agree).`);
