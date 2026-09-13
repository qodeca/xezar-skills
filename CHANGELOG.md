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
