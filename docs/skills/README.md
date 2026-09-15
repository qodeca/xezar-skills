# Skill cards

One card per skill, with its parameters and the companion skills it works with. Each card links back to the skill's `SKILL.md` source.

**Naming convention:** the `xez-auto-*` prefix marks a skill as 🤖 **autonomous** — hand it a brief, an issue, or nothing at all and it runs end-to-end without supervision (isolated worktree, validation gate, self-review, claim locks). Every other skill is 🧑‍💻 **interactive**: it acts once, may ask you questions, reports, and hands control back.

| Skill | Type | What it does |
|---|---|---|
| [xez-auto-create-pr](xez-auto-create-pr.md) | 🤖 | Takes a free-form task brief end-to-end to a labeled, self-reviewed PR. Resumable. |
| [xez-auto-create-pr-loop](xez-auto-create-pr-loop.md) | 🤖 | Advanced create-pr for long spec builds: run folder, one commit per step, checkpoint verification. |
| [xez-auto-continue-pr](xez-auto-continue-pr.md) | 🤖 | Resumes an in-progress PR from the first unchecked step of its tracking plan. |
| [xez-auto-continue-pr-loop](xez-auto-continue-pr-loop.md) | 🤖 | Resumes a create-pr-loop run from the first non-done Tasks-table row. |
| [xez-auto-fix-issue](xez-auto-fix-issue.md) | 🤖 | The issue-to-PR entry point: classifies the issue, then drives the bug or feature route. |
| [xez-auto-fix-pr](xez-auto-fix-pr.md) | 🤖 | Drives one PR to merge-ready: base merge, review-autofix, CI stabilization, UI QA. |
| [xez-auto-write-spec](xez-auto-write-spec.md) | 🤖 | Turns a brief or feature-request issue into a finished spec on a ready PR with mockups. |
| [xez-auto-implement-spec](xez-auto-implement-spec.md) | 🤖 | Implements an existing spec and ships a reviewed, UI-verified PR. |
| [xez-auto-review-pr](xez-auto-review-pr.md) | 🤖 | Reviews or re-reviews a PR by number, with an autofix loop until merge-ready. |
| [xez-auto-qa-pr](xez-auto-qa-pr.md) | 🤖 | QAs a PR's UI in a real browser and posts screenshot evidence — no source touched. |
| [xez-auto-manage-issues](xez-auto-manage-issues.md) | 🤖 | Brings existing issues up to standard: label sync, screenshot analysis, spec-coverage checks. |
| [xez-auto-update-changelog](xez-auto-update-changelog.md) | 🤖 | Drafts a CHANGELOG release entry for merged PRs and ships it as a docs PR. |
| [xez-pr-autopilot](xez-pr-autopilot.md) | 🤖 | Diagnoses what state one open PR is really in, then runs the matching chain of the skills above. Dispatch only. |
| [xez-review-prs](xez-review-prs.md) | 🧑‍💻 | Sweeps every unreviewed open PR, newest first, through the review skill. |
| [xez-close-fixed-issues](xez-close-fixed-issues.md) | 🧑‍💻 | Post-merge housekeeping: closes issues merged PRs fixed, comments on closed-unmerged PRs. |
| [xez-merge-buddy](xez-merge-buddy.md) | 🧑‍💻 | Reports which open PRs can merge now and which are close but blocked. |
| [xez-pipeline-retro](xez-pipeline-retro.md) | 🧑‍💻 | Classifies finished runs and ranks what second passes cost, in wall-clock hours. |
| [xez-approve-merge-pr](xez-approve-merge-pr.md) | 🧑‍💻 | Approves and squash-merges a PR by number, honoring the QA gate. |
| [xez-onboard](xez-onboard.md) | 🧑‍💻 | Optional minimal project setup or update re-check for software, campaigns, research and other work. |
| [xez-setup-agent-pipeline](xez-setup-agent-pipeline.md) | 🧑‍💻 | One-per-repo configurator: writes the config, installs descriptors, generates project docs. |
| [xez-apply-upgrade-notes](xez-apply-upgrade-notes.md) | 🧑‍💻 | Applies UPGRADE_NOTES.md after an upgrade, preserving local edits. |
| [xez-check-and-commit](xez-check-and-commit.md) | 🧑‍💻 | Runs the validation gate on the branch, fixes obvious drift, commits and pushes when green. |
| [xez-discover](xez-discover.md) | 🧑‍💻 | Product-level discovery and define in three modes; leaves a product-brief.md built from real material, with tagged evidence and owned decisions. |
| [xez-brainstorm](xez-brainstorm.md) | 🧑‍💻 | Divergent conversation before any artifact exists; converges on which skill runs next, plus a handoff brief. |
| [xez-prepare-issue](xez-prepare-issue.md) | 🧑‍💻 | Files one well-formed, labeled tracker issue from a brief without implementing it. |
| [xez-spec-writing](xez-spec-writing.md) | 🧑‍💻 | Writes and reviews feature specs to staff-engineer standards. |
| [xez-ux-review-pr](xez-ux-review-pr.md) | 🧑‍💻 | Design-judgment review of a PR's UI: walks screens in a real browser, posts evidence-tagged findings with done-when criteria. |
| [xez-ux-setup](xez-ux-setup.md) | 🧑‍💻 | Extracts the repo's design contract (tokens, components, archetypes, conventions) into committed files. Once per repo. |
| [xez-ux-shape](xez-ux-shape.md) | 🧑‍💻 | Turns a vague feature idea into a decided direction: scope, interaction contract, validation plan; AI-necessity gate included. |
| [xez-followup-issue-from-pr](xez-followup-issue-from-pr.md) | 🧑‍💻 | Turns a PR or PR comment into a tracked follow-up issue. |
| [xez-prepare-test-env](xez-prepare-test-env.md) | 🧑‍💻 | Boots the app for QA and tests on any stack and provisions the browser provider. |
| [xez-integration-tests](xez-integration-tests.md) | 🧑‍💻 | Creates and runs integration/E2E tests by exploring the running app first. |
| [xez-create-skill](xez-create-skill.md) | 🧑‍💻 | Authors a new Xezar skill, or splits an oversized SKILL.md into layered references. |
| [xez-verify-in-repo](xez-verify-in-repo.md) | 🧑‍💻 | Read-only triage gate: decides whether an issue is a real, still-unfixed defect. |
| [xez-root-cause](xez-root-cause.md) | 🧑‍💻 | Read-only analysis: locates the bug and the minimal change surface. |
| [xez-fix](xez-fix.md) | 🧑‍💻 | Implements the minimal change with regression tests and runs the validation gate. |
| [xez-open-pr](xez-open-pr.md) | 🧑‍💻 | The shared PR opener: commits, pushes, opens or reuses a labeled PR, emits chain markers. |
| [xez-code-review](xez-code-review.md) | 🧑‍💻 | The review checklist behind xez-auto-review-pr: correctness, security, contract surfaces. |
