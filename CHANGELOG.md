# Unreleased

Everything under "onboarding" below comes from one audited fresh-repository run of the bootstrap
prompt and `xez-onboard-opinionated` (kit 1.4.0, engine 0.16.0, `qodeca/8cli`, 2026-09-21): 42
minutes and about twelve question rounds against a target of twenty and six. The engine half is
`qodeca/xezar#819`.

## Changed

- **A lane is a tool plus a model.** The routing interview defined a lane as "a vendor, an account
  and a model class", and the audited run followed it into chains made of logins; one screen took
  four takes. Chains now rank `<tool>/<model>` entries and never name a login; logins are the
  rotation under a tool, one line beside the table. New: escalation-only and single-purpose lanes,
  and one question — what is each model *for* — asked before any ranking is proposed. Global
  prohibition 4 now says "a different vendor", which was always the half that mattered.
  `DECISIONS.md` → "A lane is a tool plus a model".
- **The leader guide fits its own limit.** The template's fixed part went from 186 lines to 149
  with every rule kept; the reasoning moved to the new `kit/docs/leader-guide-detail.md`. The four
  generated sections are budgeted at 12/12/15/12. `test-kit-facts.mjs` (FACT 13) adds the two up
  and fails above 200.
- **A command line is a user interface.** Analysis proposes the design gate **on** for a project
  that ships a CLI.

## Added

- **`references/engine-refusals.md` — what to do when the engine says no.** A refusal is a finding,
  not an error to retry; argument shapes are never guessed. Order: the engine's own tool, the
  person's way, then a backed-up edit of one of two named files on the owner's yes to one question
  that shows the exact change. Recorded as an accepted exception in `SECURITY.md`, because it
  reaches outside the repository. `DECISIONS.md` → "A consented edit when the engine says no".
- **A reviewable setup pull request.** The body sorts files by origin — copied unchanged (with the
  `diff -r` line that proves it), adapted, written for this project, the owner's files edited — so
  the dozen files worth reading are not lost among a hundred that are not.
- **"I will read it first" is a normal answer.** New *owner defers* branch in the report and in the
  bootstrap prompt: the run ends cleanly, says what is owed and how to resume, and does not ask
  again. New "Setup rejected" report lists what the setup made outside git, with the undo for each.
- **The clock rule.** Every time this skill or the prompt writes down is read from `date -u`. The
  audited run invented all of its timestamps.

## Fixed

- **The engine's account question is announced before its window opens**, with its real shape:
  `[y/N]`, default No, asked once. The prompt said "answer y" a minute after the question had
  appeared and been declined. Where the engine lists `--import-global`, the prompt uses it. The
  prompt and preflight now say that `xezar init` does not import accounts, and an empty project
  registry beside a non-empty machine one is named as the declined import and offered a fix on
  the spot. Pinned as the prompt's ninth rule.
- **A default that names no account is asked about, not repaired.** A tool's built-in login has no
  registry record; the run rewrote one such value three times in four minutes.
- **Ignore files get all four folders** (`.xezar`, `.claude`, `.agents`, `.local`), not `.agents`
  alone, and the project's formatter runs over the root files the setup generated.
- **No README under `.local/xezar/`.** "Each with a stated meaning" invited one, and the kit's own
  `local-tree.sh` then failed on it.
- **The init examples are deleted first**, in the order the text always said.
- **A third take of one interview screen is reported as a defect**, and screens 1 to 3 may be
  asked together.
- **Labels outlive a rejected pull request** — the preview now says so.

- **`AGENTS.md` stated the document order backwards.** "Later entries override earlier ones" sat
  above a list whose first item says nothing overrides it. It now says earlier entries win, which
  is what the list always meant.
- **The governance documents caught up with the 1.5.0 kit.** `AGENTS.md` names all six generated
  shared blocks, the kit role skills' `## Shared contract` tail among them, and has a task-routing
  row for the vendored onboarding kit; `CODE_REVIEW.md` has a check for kit changes; `SECURITY.md`
  names configuration that grants authority as untrusted when it is read from the branch under
  review. `docs/coverage.md` had four stale counts — six pinned facts for twelve, seven prompt
  rules for eight — all re-read from the gates' own output. Two rules `AGENTS.md` stated three
  times are now stated where they apply.

# 1.5.0 (2026-09-21)

## Highlights

After one onboarding the leader now has a routed workflow for the whole life of a change, not only for plan, build, review and release. **Nineteen new workflows** cover what was missing: architecture and its review, spikes, deprecation plans, the design system, UI design and pictures, UI, integration, regression and performance tests, hotfix, refactor, migration, observability, localisation, security review, acceptance verification, and deploy with rollback. The kit is now thirty-seven workflows and thirty-seven role skills, routed by forty-five rows in eight classes.

Three things changed how a project is set up. **Every document the setup or a workflow commits lives under `docs/`**, each folder named by a `paths.*` key. **OpenCode is switched off for a new project**, disclosed before the one approval, recorded, read back, and undone by one call. And **a deploy rests on a written record that a check step turns into a permit, at most once** — read from the remote's default branch, so a pull request cannot repoint a target, and never across a one-way migration unless the owner's words name it.

The kit was reviewed by six reviewers before release; four must-fix findings and about forty smaller ones were closed in the same pull request. A new gate, `test-kit-catalog.mjs`, proves every workflow loads and is routed, computes every count, and runs the two deploy guards for real on a throwaway repository.

**What is proved and what is not.** Every workflow is proved to load and to be routed. None of the nineteen has yet been run on a live engine, the OpenCode switch has not been exercised against one, and the onboarding has not been re-run on a fresh repository with this kit. `docs/coverage.md` row 24 states the first of these in its own words.

Forty-five skills, twenty-one gate commands, sixty deliberate defects, twelve pinned kit facts.

## Changed

- **OpenCode is switched off for a newly onboarded project.** The setup calls the engine's own
  provider switch, keeps the provider out of the lane table, and adds a fifth global routing
  prohibition written by capability: a provider that does not enforce a step's tool limits is in
  no read-only or security-and-release chain. The reasons are recorded once, in `DECISIONS.md`: it
  can stall silently after a denied permission, it ignores the tool allowlist that makes a
  read-only role read-only, a resumed session loses its role, and it cannot attach as leader. In
  single-project mode the switch lives in `.xezar/workspace.json` — git-ignored, inside the
  project, so no other project on the machine is touched. The previous state is recorded first,
  the result is read back, the preview discloses it before the one approval, and the report prints
  the call that undoes it. The record is a git-ignored file under `.local/xezar/runtime/`, never
  the committed manifest: this step runs after the merge, and a machine's state is not a fact
  for git. The other two engine settings the setup changes — the default task account and skill
  auto-update — now follow the same read, record, write, read-back rule and are named in the preview. It is **left on**, and reported, when the engine is not in
  single-project mode or when an existing routing table still uses it.
- **Every document the setup or a workflow commits lives under `docs/`.** The design system, the
  designs, architecture, spikes, runbooks, deprecations, performance notes and migration pages each have a `paths.*`
  key; the kit reads the key and never a literal folder. A project onboarded earlier keeps its
  root-level `designs/` by pointing `paths.designs` at it. The designs index is now written
  always — `write.md` said "only when the design gate is on" while `analysis.md` said the design
  half installs regardless.
- **The security-sensitive routing row runs `security-review.yaml`, not `code-review.yaml`**, and a
  diff that touches a trust boundary gets both: the cold review reads the change for correctness,
  the security review asks what a scanner cannot decide, and neither replaces the other.
- **Routing has eight task classes and forty-five rows.** `design` and `visuals` left `writing` and
  `review`, where one prose ranking decided who designs a screen; `testing` is new, because
  writing a test that fails for the right reason is a different skill from writing the feature.
  The two visuals rows now run `visual-asset.yaml`. The table is sorted by class, and the rules for
  choosing between rows were regenerated against the new numbers — thirteen look-alike pairs.
- **`model-routing.md` keeps every column of a row, the workflow file included.** Nothing said so,
  and a row written without its workflow is work the leader can recognise and cannot start.
  `write.md` also now lists the `SDLC.md` sections the kit cites by name, which nothing told the
  generator to write.

## Added

- **Nineteen workflows, so the leader has a route for the whole life cycle.** Decide:
  `architecture`, `architecture-review`, `spike`, `deprecation-plan`. Design: `design-system`,
  `ui-design`, `visual-asset`. Build: `hotfix`, `refactor`, `migration`, `observability`,
  `localisation`. Test: `ui-tests`, `integration-tests`, `regression-suite`, `performance`,
  `acceptance-verification`. Review: `security-review`. Ship: `deploy`, which serves deploy and
  rollback. Each arrives with a role skill that says what it owns and what it never does, and a
  routing row with a written trigger.
- **A role skill only where the rules differ.** Hotfix runs the bug-investigation skill in a new
  hotfix mode; architecture is one skill for the authoring workflow and its read-only review.
  Seventeen new role skills, thirty-seven in all.
- **Deploy never deploys, and its authority is a record.** It dispatches the project's own deploy
  workflow at most once, for the environment and the full commit SHA the owner authorised in words
  that are written down *before* the dispatch — from the launch text only, never from an issue, a
  pull request or a comment. A check step, `deploy-guard.sh`, turns that record into a permit or
  refuses: the environment must be listed on the remote's default branch, the workflow there must
  declare a `sha` input (`--ref` cannot name a commit, so the reviewed workflow runs from the base
  branch and the commit travels as data), the commit must be on the base branch's history, a
  rollback must not cross a migration page marked `reversibility: one-way` unless the owner's
  words name it, and a second permit for the same authority is never written. `ci-watch.sh`
  learned `"kind": "deploy"`: a cancelled deploy is not "superseded", a failed deploy job is never
  a known flake, and running out of time still reaches the report. A failed deploy is never
  re-dispatched by a machine, and nothing is copied out of deploy logs.
- **`config-guard.sh` — a guarded workflow refuses before the dependency install.** Deploy,
  rollback, performance and localisation are installed everywhere and run only where a list says
  so. The guard tells an honest `[]` from an absent key from a typo, because for these keys an
  empty list means "do not run" and a misspelt one must never read that way. `deploy.*` is read
  from the remote's default branch — not from the branch the checkout's own config names, which a
  branch under review controls — so a deploy target cannot be repointed from a pull request. The
  kit's security scan now names both config files as trust boundaries.
- **The kit ships browser and security descriptors**, byte-identical to the collection's and
  pinned by SHA-256, and the write step records the installed digests. The design skill pointed at
  a browser descriptor folder no run ever installed.
- 🧪 **A twenty-first gate, `test-kit-catalog.mjs`.** Nothing in this repository ran the kit's own
  validator against the kit, and no check anywhere caught a workflow that is installed, valid and
  named by no routing row. The gate stages the kit and runs `catalog-check`, holds the validator's
  maintained-skill list equal to the skill directory, binds workflows to routing rows, checks every
  row and class count written in prose against the table, and checks the config grammar. It proves
  a workflow loads and can be selected — **not** that it runs, and `docs/coverage.md` says so.
- **The role skills' shared contract is generated.** `sync-shared-blocks.mjs` gained tail blocks,
  so thirty-seven copies of one text are written from one canonical copy instead of by hand.
- A twelfth pinned kit fact (the OpenCode switch, its disclosure, its undo and its routing ban
  agree), and nineteen more deliberate-break cases — sixty in all. The catalog gate also runs the two guard scripts for real, on a throwaway repository: twenty-two cases.

## Fixed

- **The two files `xezar init` writes are deleted, not left behind.** `references/preflight.md` said
  they "are replaced". Nothing replaced them: no workflow and no skill in the kit carries either
  name, so `.xezar/workflows/fix-and-verify.yaml` and `.xezar/skills/project-conventions.md`
  survived into the project. One is a workflow the leader can legitimately dispatch, generated
  before any gate command was confirmed; the other is a stray skill among twenty named pipeline
  roles. `references/write.md` §1 now removes both by path, and only while their content is still
  the generated content preflight recognised — an edited one is somebody's configuration and a
  preflight stop.
- **The preview has a fourth group, `delete`.** A deletion is the one preview entry an owner cannot
  infer from the others, so it is listed by path and reason instead of being folded into "replaced".

# 1.4.0 (2026-09-21)

## Highlights

The opinionated onboarding was tested a second time, on a project cleaned back to nothing. It was a clean single pass: **17 minutes 38 seconds**, one session, one setup pull request, no restarts, one `/mcp` reconnect, 121 correct files, 31 labels, green CI. Against the first test — three invocations, sixteen questions, four pull requests, two restarts, about fifty minutes — the shape is fixed.

What it did not do is **finish**. It stopped at "merge it yourself", so protection was never read back, the smoke test never ran, and the default task account still named a login the account registry did not contain. This release is about the distance between a run that works and a run that is done: the skill now offers the merge the moment the checks are green and carries straight on into verification in the same session.

Two faults reached every project the skill had ever onboarded. The gate script the leader guide tells you to run **exited 1 in all of them**, because it demanded an engine run id the primary checkout never has. And twenty-three strings in the vendored kit named the engine's own repository — module paths, CI job names, a commit hash, a design-system tree — two of which silently changed behaviour in somebody else's repo. Both are fixed, and both have an `UPGRADE_NOTES.md` entry, because a file already installed into a project never updates itself.

The interview is on a diet: eighteen separate asks became **five screens**, by confirming detected facts together instead of one at a time, and by deleting two questions — one that nothing read, one that can be inferred and shown.

Forty-five skills, twenty gate commands, forty-one deliberate defects, eleven pinned kit facts.


## Changed

- **The interview is five screens, not eighteen asks.** It said "seven sections", which hid four
  asks inside `lanes` and six inside `routing`; a real run answered fourteen of them one at a time,
  most of them confirming facts the analysis had already read off the repository. Now: one screen
  confirming every detected fact with its evidence, the gate commands alone (the most-consumed
  answer, and the one most likely wrong on an untested stack), one lane table, the five routing
  classes together, and the expanded rows. `--section` takes `facts`, `gates`, `lanes`, `routing`,
  `table`; the old names resolve or explain themselves.
- **Two questions are gone.** `seeding` was asked and read by nothing at all. The branching *model*
  is inferred from the branch set and shown as an inference — the case the old "ask, do not infer"
  rule guarded against was reading a policy out of a workflow file, which this is not.

## Added

- **The run now offers the merge instead of stopping at it.** With the engine's tools loaded and
  every required check green, the skill asks once — merge and finish here, or read the diff first?
  On yes it merges, pulls, and goes straight into `references/verify.md` in the same session. On a
  red or pending check it does not offer at all: it names the check and hands back. This is what
  made a 17-minute test end with protection unread, the smoke test unrun and the default task
  account still pointing at an account the registry did not contain.
- **The bootstrap prompt covers a project Xezar was removed from.** Step 0 knew only "onboarded" and
  "clean", so a repository whose setup had just been reverted produced an unscripted "install it
  again?" question. It now names three states, including a stale `.xezar/onboarding.json` with no
  `.xezar/checks/` beside it.
- **The account import is proved, not assumed.** The prompt and preflight read
  `.xezar/agent-accounts.json` and report the count, so "answer y in that window" is checked rather
  than narrated. None or one is reported with what it probably means.
- **`--verify` states the previous default task account before changing it.** A default naming an
  account the registry does not hold is a finding, not something to overwrite in silence.

## Changed

- **The `/mcp` reconnect is an instruction, never a question.** The prompt now says so, and says not
  to poll `health` before reconnecting — a real run called it three times, then wrapped the
  reconnect in a question the owner had to dismiss.
- **"Show me each command before you run it" is narrowed to what matters** — anything global,
  anything that writes to GitHub, anything that deletes, and the command that opens a terminal
  window — and is now one of the pinned prompt rules (eight, was seven). A run honoured the broad
  version for three of about forty-eight commands, so the broad version was not a promise.

- **The kit no longer ships the engine repository's own facts into your project.** Twenty-three
  strings named its module paths, its CI job names, one of its commit hashes, its mutation-test
  config and its design-system tree. Three of them were behaviour, not prose, and are now config:
  `ci.requiredChecks`, `ci.knownLoadFlakes` and `paths.designSystem` in
  `.xezar/pipeline/config.json`, each defaulting to empty. The rest name the engine's symbol
  instead of a path you cannot follow. The portability gate bans them coming back.
- **The kit carries its own toolchain descriptors** (`kit/pipeline/toolchains/`). A run that found
  none copied one out of `xez-setup-agent-pipeline/references/`, which the cross-skill contract
  forbids and which installs whatever version happens to be on the machine.
- **`references/write.md` forbids two shortcuts a real run took**: restoring a generated file from
  the repository's git history instead of generating it, and patching the copied gate script in
  place instead of filling its arrays. Both worked only because that project had been onboarded
  before.

## Fixed

- **The gates can be run by hand again.** `.xezar/checks/repo-gates.sh` refused to start without
  an engine run id, so the one command the leader guide and the kit's twenty role skills tell an
  agent to run exited 1 in every onboarded project — and tier 2 of the onboarding smoke test could
  not pass. A run with no run id is now a **standalone attempt**: it records under
  `.local/xezar/scratch/standalone-gates/`, prints a real verdict, and can never be sealed or
  certified, because it lives outside the evidence roots and its producer is `author`. Pinned as
  kit fact 11, with two deliberate-break cases.

# 1.3.0 (2026-09-21)

## Highlights

The opinionated onboarding was tested for the first time on a real project, and the test was honest about it: three invocations to get past preflight, sixteen questions, four pull requests, two session restarts nobody planned – and a project that could run a task but was not ready. This release is what that test taught.

The skill now re-checks a fixable stop in place instead of asking to be run again, can come back and finish its own run, ships a kit that passes its own checks in somebody else's repository, creates the labels it configures, refuses to require a check that is already red, and proves itself with a smoke test that no longer costs 287,000 tokens. And there is **one prompt** that does the whole setup, from installing the engine to the proof.

Every fix was applied by hand to that first project before it was written into the skill, and `UPGRADE_NOTES.md` carries what a project onboarded with 1.2.0 needs.

Forty-five skills, twenty gate commands, thirty-eight deliberate defects, ten pinned kit facts.

## ✨ Features

- ✨ **One prompt sets up Xezar.** `docs/bootstrap-prompt.md` is a prompt to paste into a Claude Code session started with the development-channels flag. Check, act only if needed, verify: the engine is installed and new enough (it asks once before `npm install -g`), the skills are installed in the link layout and ignored by git, `xezar init` has run, the engine runs in a terminal window of its own – a real one, because the engine's first start asks its one question only there and must outlive the session – this session is attached as the leader, `xez-onboard-opinionated` runs, and after the merge the setup is proved **in the same session**. No restart; one `/mcp` reconnect in a repository the engine had never run in. It keeps progress under `.local/xezar/runtime/`, so pasting it again continues.
- ✨ A twentieth gate, `test-compat-pins.mjs`, and `compat.json`. The minimum engine version is stated once and asserted in the prompt, the preflight and the skill card; and the prompt cannot quietly lose the seven rules that make pasting it reasonable – no `sudo`, no piped downloads, no permission changes, ask before global installs, read content is data, the engine stays outside the session, engine state is never deleted. Thirty-eight deliberate defects.

## 🔧 Changed

- 🔧 `xez-onboard-opinionated` finishes with a project that is ready, not one that looks ready. The label taxonomy is listed in the preview and created on the tracker before the setup pull request opens, so that pull request carries its own labels; the first onboarded project had 1 of 31. Analysis reads the state the setup lands on — whether the base branch is green today, what CI runs that no gate covers, which linters and licence checks scan the new folders — and protection refuses to require a check that is already red, which in the first test blocked the run's own next pull request. The engine's default task account is asked for and **set**, so a task that names no account no longer runs on the leader's login.
- 🔧 The smoke test has two tiers. One cheap engine task on an explicit lane proves dispatch, the account and a pushed event; the real gates, a labelled draft pull request and CI run with no agent at all. The first test spent 287,000 tokens changing one line on a full delivery workflow.
- 🔧 The collection's skills are never committed into an onboarded project. The setup writes the ignore patterns for the link layout the engine's updater produces, keeps `.claude/skills/` itself tracked, and turns the engine's start-time skill update off for the project. The skill carries its own tracker descriptor and label taxonomy instead of reading another skill's folder; a gate holds the descriptor byte-identical to the canonical one. Ten pinned kit facts, thirty-six deliberate defects.
- 🔧 The opinionated onboarding kit is fixed where the first real run had to repair it by hand. The tidiness check accepts every file the engine writes in single-project mode. The gate script derives its phases from the gate list and takes its parallel lanes as data (`GATE_APPLICATION_LANES`), so a project with six application gates needs no renumbering in two files. The changelog-fragment check is skipped, loudly, where a project has no `changelog.d/`. Workflow step names say "the base branch", not `main`. The release role skills read `package.json` at the root. The fenced quote of the context loader matches its source again.
- 🔧 The kit now ships the wiring it used to describe in prose: the launcher, the MCP registration (unpinned, with the reason written down) and the gitignored permission file — copied, one file per command, because a harness that screens shell commands refuses a command that *types* a script carrying a `--dangerously…` flag. The launcher exports `XEZAR_LEADER=1` and the `SessionStart` hook loads the leader guide only then: every other Claude Code session in the checkout gets nothing, and while an onboarding is unfinished every session gets one fixed line instead. `UPGRADE_NOTES.md` has the entry for projects already onboarded.
- 🔧 The kit's GitHub templates are neutral and placeholdered. The issue-template config used to send a consumer's security reports to the engine project's advisory page. An existing issue template is never overwritten; root-level files a project already has get one stated rule per kind in the preview.
- 🔧 `DECISIONS.md` supersedes "a vendored kit is copied verbatim" in part: the kit is an adapted copy, fixed in this repository. Two new pinned kit facts — only the launcher's session is the leader; kit tracker templates name no foreign repository — each with a deliberate-break case. Eight pinned facts, thirty-four deliberate defects.
- 🔧 `xez-onboard-opinionated` can finish its own run. The smoke test needs the engine's MCP tools, which Claude Code loads only at session start, and the registration is written mid-run — so the writing session could never prove the setup, and the next one was refused as "already onboarded". The write step now leaves a pending marker under `.local/xezar/runtime/`; a run that finds it, or `--verify`, goes to the new `references/verify.md`: connection state by name (files prepared, connected, attached, delivery verified — or "polling mode" when channels are off for the organisation), protection, the smoke test, the gates, a clean tree, and a checklist with evidence per line. A finished onboarding still stops. Recorded in `DECISIONS.md` as a reversal.
- 🔧 Preflight has eight checks, not six, and two kinds of stop. What the owner can fix in a minute — engine missing, too old or never run, tracker login, a dirty tree — is reported with the literal command and **re-checked in place**; the first test of the skill cost three invocations there. The files the engine writes on its first single-project start count as clean, which ends a contradiction between the clean-project and engine checks. Root-level files the setup would overwrite are found now, not at the preview. It says at the start what changes the promise: no CI, a base branch that needs a second approver, a single agent account, Windows, a monorepo.
- 🔧 `UPGRADE_NOTES.md` gains the entry for projects onboarded with 1.2.0: skills out of git and into the link layout, and the label taxonomy created on the tracker. Applied to the first onboarded project word for word before it was written down — including the correction that a link layout needs two `--agent` values, since one produces copies.
- 🔧 Documentation brought back in line with the skills after 1.2.0. The README no longer promises that `xez-setup-agent-pipeline` generates `SDLC.md`, `CODE_REVIEW.md`, `BACKWARD_COMPATIBILITY.md` and an `AGENTS.md` starter whenever they are missing, that a missing config makes a pipeline skill run setup on its own, or that setup creates missing labels for you — the skill stopped doing all three unasked, and the README had not caught up. Three `xez-auto-*` skills were listed under "Interactive"; they are under "Autonomous" now, and the three recorded exceptions to the naming rule are stated where the tables are. Cards corrected: `xez-open-pr` (one consolidated label comment, not one per label), `xez-spec-writing` (the `--autonomous` flag exists), `xez-auto-fix-issue` (brief mode), `xez-code-review`, `xez-ux-setup` (the pinned version), and the badges on the two sweeps.
- 🔧 `SECURITY.md` now counts committed repository content that a privileged session loads as untrusted input, and names the one accepted gate bypass — branch protection without admin enforcement in the opinionated onboarding setup — as recorded rather than found.
- 🔧 Stale counts corrected in `docs/coverage.md`, `DECISIONS.md` and `AGENTS.md`; `docs/style.md` re-measured, with a skill's vendored `kit/` left out of the counts and two rules that outlived the brand gate reworded. `AGENTS.md` loses its closing "Process documents" section, which repeated the top of the same file.
- 🔧 Every pin in `test-kit-facts.mjs` now has a deliberate-break case. Two of the six — the `.local/xezar/` subfolder list and the campaign file kinds — had none, so nothing proved they still fired. The guard suite breaks thirty-two guards on purpose. `xez-add-rule`'s section list is headed "six sections" over its six rows, not "five".

## 🏷️ Notes

- **The bootstrap prompt has not been run end to end yet.** Its parts were read from the engine's source at 0.16.0 and its rules are held by a gate, but three things are unproved until the first real run: pushed events arriving in a session launched with the development-channels flag and a local-scope registration; the terminal window for the engine passing the harness and macOS automation consent; and the engine tool calls `references/verify.md` names. A re-test on a fresh repository is the next step, and its targets are written down: one skill start, about six questions, one pull request, no restart, one `/mcp` reconnect, about twenty minutes.
- Two new symptom-keyed `UPGRADE_NOTES.md` entries for a project onboarded with 1.2.0: the skills out of git and the labels on the tracker; and the leader hook and tidiness check. Neither reaches an existing install by upgrading the skills.
- The kit is now an **adapted copy** of the engine project's files, fixed in this repository by the owner's decision. `DECISIONS.md` supersedes the earlier "copied verbatim" rule in part and records the cost: a manual merge when the kit is refreshed.
- The interview still asks more than it needs to. Trimming it waits for the re-test, so the cut is made on a second measurement and not on one.
- `main` carries no branch protection, so no check on it is *required*. Every pull request in this release passed the full gate in CI before it merged, and so did the release commit.

# 1.2.0 (2026-09-20)

## Highlights

The collection could set up a pull-request pipeline, but not the thing that *runs* one: a leader session that dispatches work, reads what comes back, and keeps going while nobody is watching. This release adds that — one skill that installs the whole setup into a clean project, and three small ones the owner drives it with.

It also closes two security defects found in review before they reached a release, and adds the first gate that reads a skill's vendored payload at all.

Forty-five skills, nineteen gate commands.

## ✨ Features

- ✨ `xez-onboard-opinionated` — analyses a clean GitHub project, interviews the owner, and writes a complete leader setup: workflows, checks, role skills, the leader guide, the session-start hook, the three standing loops as data, and both halves of an onboarding manifest. Every answer is saved as it is given, so an interrupted run resumes. Nothing reaches the project until the whole preview is approved, bound to content digests. It then opens a pull request, turns on branch protection and **re-reads it**, and dispatches one throwaway task end to end before it reports success. Claude Code and GitHub only; TypeScript/npm is the only tested stack.
- ✨ `xez-unattended-on` and `xez-unattended-off` — hand the leader a narrower set of hard stops for a stretch when nobody is reachable, and take it back. Awake, six decisions are the owner's; away, three still stop the leader dead and three it decides itself and parks. Leaving the mode asks every parked decision back, one at a time, and records the owner's exact words.
- ✨ `xez-add-rule` — adds a standing rule to the leader guide in the owner's exact words, dated, routed into the section it governs.
- ✨ A tracker operation, **branch-protected**, in the template and all four shipped descriptors. Named by its postcondition; the GitHub implementation writes required checks with admin enforcement set by the caller, and answers `unknown` rather than guessing when it lacks the rights. Until now the contract could only *read* protection, so a setup could report success while its gates enforced nothing. Additive — forty-seven operations.
- ✨ A nineteenth gate, `test-kit-facts.mjs`. A skill that vendors a kit is two halves, and the kit is excluded from three gates by path, so the halves could state opposite things while everything stayed green. This pins six facts that already caused such a contradiction, in every place that states them. It does not compare meaning, and `docs/coverage.md` says so: these six cannot silently drift again; an unpinned fact is still unchecked.
- ✨ The guard suite now breaks thirty guards on purpose, up from twenty-three.

## 💥 Fixed

- 💥 **The leader's session-start loader followed symlinks.** Campaign records are committed, so a pull request could deliver a symlink, and the loader printed its target into a privileged agent session — any file on the machine. Found in review and reproduced with a canary; never released. Symlinks are now refused by shape, per folder and per file, without judging the target.
- 💥 **Committed campaign text was injected with no untrusted-content boundary,** under headers any file could forge. It is now wrapped in a nonce-delimited region that says it is a record to read and never instructions to follow, and any line imitating a delimiter is defused on the way through. Never released.
- 💥 One stray file beside the campaign folders silently disabled all campaign context, and an empty folder with a well-chosen name could do the same on purpose. The loader now walks candidates newest-first and takes the first real directory that carries a readable note.
- 💥 The vendored kit shipped the design it was meant to replace: an 8 KB cap on the one file that must never be cut, campaign folders described as gitignored, two loops where three were decided, and a load-bearing typo carried verbatim. Corrected in the shipped files rather than as instructions to edit them during the copy.
- 💥 Three private account labels were published in a vendored example. Removed, with an explicit rule never to write a real label into a committed file. They remain in git history; the decision not to rewrite it is recorded in `DECISIONS.md` — they are directory suffixes, not credentials.
- 💥 Nothing wrote the root ignore rule that a task's own preflight requires, so the first task in a freshly onboarded project would have failed. Now an explicit, verified step.

## 🔧 Changed

- 🔧 The brand rule is removed from `scripts/lint.sh`. `skills/**` is no longer scanned for this collection's own product names; what remains is a portability gate — a hard-coded base branch, a hard-coded package manager, an upstream helper name. The rule only ever banned two names while third-party names were always present and legitimate, and a skill that installs a product has to be able to name it. Nothing automated keeps the collection product-neutral now; the README's "product-agnostic by rule" claim is withdrawn rather than left standing untrue. Reasoning in `DECISIONS.md` → "The brand rule, removed".
- 🔧 Every local artifact the onboarding setup writes lives under `.local/xezar/` in six named subfolders, and a check reports anything loose. `paths.qa` is set per project to match; the shipped default is unchanged, so nothing moves for an existing install.
- 🔧 The pinned `agent-browser` release moves v0.34.0 → v0.38.1, with its per-asset checksums.

## 🏷️ Notes

- Two new symptom-keyed `UPGRADE_NOTES.md` entries: **branch-protected** for an installed tracker descriptor, and the corrected context loader for a project already onboarded. Neither reaches an existing install by upgrading the skills.
- **Five of the six pull requests in this release merged without a changelog line.** The entries above for them were written at release time from the merged pull requests and their commit messages, not invented — but the release skill's own rule is that an entry is written with the change, and this release did not follow it.
- `main` carries no branch protection, so no check on it is *required*. The release commit passed the full nineteen-command gate in CI; the release skill's rule that an empty required set stops a release was met in substance and not in letter, by the owner's decision.

# 1.1.0 (2026-09-20)

## Highlights

The collection used to ship instructions, which are promises. A repository that installed them had no way to check a promise was kept — and seven of them were not being kept. This release makes the pipeline produce **evidence**: a few facts, each tied to one commit, re-derived from the authenticated tracker API rather than read back from something a previous run wrote.

Eighteen gate commands enforce it, all offline, all runnable with no credentials and no network.

## 💥 Fixed, and why each fix lives where it does

- 💥 A merge could land a commit no gate saw. The gate now binds to `headRefOid` and the merge pins it with the tracker's head-commit parameter. Re-deriving at the head and then merging whatever is current is check-then-act.
- 💥 The merge skill skipped two gates it claimed to check. `reviewDecision` is tested, and required checks are verified through **get-required-checks** with a set-shrink rule — an empty required set is `unknown`, not a pass over nothing.
- 💥 The QA gate failed open when the label did not exist. The merge gate now calls `label_exists` itself and treats an absent label as `unknown`. **Fixed in the skill, not the descriptor**, deliberately: skills auto-update and the files a skill installed never do, so a descriptor fix reaches nobody who already installed it.
- 💥 The evidence store was read through an unpaginated call. **list-issue-comments** paginates.
- 💥 The retry cap was documented as 3 in one file and 5 in another, and the self-review loop had no bound at all. One number, and the bound sits in the body where it outranks a reference.
- 💥 A generated skill failed lint, because the skeleton lacked the override preflight line.
- 💥 `paths.analysis` was declared, created, committed and read by nothing. Deprecated in place and marked reserved — removing a `paths` key is breaking, and a key that costs one line of loader code is cheaper than a migration every consumer performs.

## ✨ Features

- ✨ Two skills, bringing the collection to forty-one: `xez-maintain-deps` (a bill of materials, what is behind, what is vulnerable, one PR per update group) and `xez-release` (folds the changelog, writes the version, tags a commit that **already merged** — and holds no publishing credential).
- ✨ Two descriptor families: `toolchain.providers` (a **list**, because one repository often has two ecosystems) with `npm` and `cargo`, and `security.provider` (no default, permanently) with `osv-scanner`. Every operation is defined by its postcondition, never by a verb.
- ✨ Ten new gates, including a **guard suite** that breaks each guard on purpose to prove it still fires, a merge-gate contract, a five-status decision script, a chaining-line grammar, a link checker, and a gate-list binding that found real drift on its first run.
- ✨ `Head:` on every verdict, so a verdict names the commit it certifies. Absence is legacy permanently, keyed to the artifact rather than to a release.
- ✨ Verification records as two tracker operations — a **published record, never an authority**, since anyone who can comment can write text that looks like one.
- ✨ Three gate switches, all `false`, all read from the base branch: `gates.failClosed`, `gates.requireVerdictHead`, `gates.designGate`. An upgrade is a no-op until somebody opts in.
- ✨ The label taxonomy as data (`.xezar/pipeline/labels.json`), so two repositories on the same pipeline get labels that mean the same things.
- ✨ Changelog fragments, detected and never imposed: one file per PR in `changelog.d/`, folded and deleted in the same commit.
- ✨ `SECURITY.md`, `docs/coverage.md`, `docs/style.md`, a document-precedence order and an adding-a-new-skill checklist in `AGENTS.md`.

## 🏷️ Notes

- Six symptom-keyed `UPGRADE_NOTES.md` entries cover the descriptor-side halves, which never auto-update. All six are optional: without them you lose a written trail or a convenience, never a check.
- `docs/coverage.md` states the honest limit: nineteen of the twenty checks read what the skills *say*; the one that runs a skill and watches what it *does* cannot run in CI, because it needs a full-access sandbox.

---

# 1.0.0 (2026-09-13)

## Highlights

Initial release of the Xezar team skills collection: thirty-seven `xez-*` skills that run a full PR pipeline in any repository, under any coding agent.

## ✨ Features
- ✨ Thirty-seven skills under the `xez-` prefix: the autonomous `xez-auto-*` engines (create, continue, fix, review, QA, spec, changelog), the interactive helpers (`xez-setup-agent-pipeline`, `xez-discover`, `xez-brainstorm`, `xez-spec-writing`, `xez-prepare-issue`, `xez-pr-autopilot`, …), the UX layer (`xez-ux-shape`, `xez-ux-setup`, `xez-ux-review-pr`) and the building blocks the chains compose (`xez-verify-in-repo`, `xez-root-cause`, `xez-fix`, `xez-open-pr`, `xez-code-review`, `xez-prepare-test-env`).
- ✨ One committed pipeline directory per consumer repository, `.xezar/pipeline/`: `config.json`, `trackers/`, `browsers/`, `overrides/<skill>.md` and the `runs`, `specs`, `analysis` and `scripts` working directories, all defaults of the config's `paths` block.
- ✨ A gitignored runtime directory, `.local/`: the test-env descriptor and per-run QA artifacts live in `.local/qa`, generated worktrees under `.local/tmp/`.
- ✨ Tracker providers behind one operations contract: `github` end-to-end, `linear` and `jira` as split providers that own issues and delegate PR, review, CI and label operations to the GitHub companion. A `TEMPLATE.md` documents the contract for custom trackers.
- ✨ Browser providers behind one operations contract: `agent-browser` (default, self-provisioning) and `playwright`, plus a `TEMPLATE.md` for custom providers.
- ✨ Repo-local overrides as flat files at `.xezar/pipeline/overrides/<skill>.md`, applied by every installed skill after loading the config; safety rules always win.

## 🛠️ Improvements
- 🛠️ Lint gate (`scripts/lint.sh`): frontmatter and roster checks, reference resolution, the mandatory override preflight line in every skill, the product-agnosticism gate over `skills/**`, the tracker-abstraction gate and a permanent ban on the predecessor collection's brand and layout.
- 🛠️ Five contract test scripts (`scripts/test-*.mjs`) pin the browser and tracker descriptors, run classification, close keywords and the discovery contracts.

## 📝 Specs & Documentation
- 📝 `DECISIONS.md`, `BACKWARD_COMPATIBILITY.md`, `UPGRADE_NOTES.md` and one card per skill under `docs/skills/`.
