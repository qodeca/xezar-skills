# Unreleased

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
