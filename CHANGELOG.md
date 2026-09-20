# Unreleased

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
