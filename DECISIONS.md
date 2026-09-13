# Decisions

Engineering decisions behind this repository. Read this before proposing a structural change. Each section states the rule that is in force today; the reasoning is kept short on purpose.

## Why a separate repository

The skills are the team collection [Xezar](https://github.com/qodeca/xezar) loads by default, but they are not part of Xezar. They are plain Markdown playbooks that install into any repository and run under any coding agent that reads skills, so they live in their own repository, versioned and released on their own. Xezar pins the source (`qodeca/xezar-skills`) and updates from it; nothing in the skills depends on Xezar being present.

## Layout

`skills/<name>/SKILL.md`, with optional `references/` and `scripts/` per skill. This is the layout the [skills.sh](https://skills.sh) CLI scans and installs into `.claude/skills/` and the equivalent directories of other coding agents. Frontmatter contract: `name` equals the directory name and `description` is present – `scripts/lint.sh` enforces both in CI. One card per skill lives under `docs/skills/`.

## Naming: `xez-`, not `xezar-`

Every skill carries the `xez-` prefix (`xez-auto-create-pr`, `xez-fix`, …). It matches Xezar's own short form (`XEZ_*` environment variables, `xez/<id>` task branches) and it is deliberately not `xezar-`: Xezar's project kit keeps its own skills under `.xezar/skills/xezar-*`, and the engine hides a team skill that shares a name with a kit skill. A distinct prefix keeps the two collections visible side by side. `scripts/lint.sh` reads the prefix from one variable so a rename is a one-line change – and a rename is a breaking change (see `BACKWARD_COMPATIBILITY.md` §1).

The `xez-auto-*` sub-prefix marks a skill as autonomous: it takes a brief, an issue or nothing and runs end-to-end without supervision. Every other skill is interactive. Two carve-outs are recorded rather than re-litigated: `xez-pr-autopilot` is autonomous without the prefix (it takes a PR number and dispatches), and `xez-review-prs` / `xez-close-fixed-issues` are sweeps that ask nothing.

## Product-agnosticism gate

The skills must run unchanged in any consumer repository, so `skills/**` is brand-free. `scripts/lint.sh` strips the collection's own tokens (the source slug, the `.xezar/pipeline/` directory, the `xez-` prefix) from every line and then fails on any remaining `Qodeca` or `Xezar`, on a hard-coded base branch or package manager, and on upstream helper names. README, this file and LICENSE may name Qodeca and Xezar; skills may not.

A second, permanent ban covers the predecessor collection's brand, its skill prefix and its old pipeline directory across every maintained source. Lineage is recorded in `LICENSE` and in the one migration entry in `UPGRADE_NOTES.md`, nowhere else.

## Standalone installability over DRY

Each skill's repeatable procedures live in per-skill `references/<step>.md` files under standard names (`agentic-setup.md`, `worktree-setup.md`, `claim-pr.md`, `pr-finalize.md`, `review-report.md`, `rules.md`, `report-templates.md`). They are duplicated inside every skill that uses them, never shared through cross-skill pointers, so a skill cherry-picked with `--skill <one>` runs on its own; `xez-auto-create-pr` holds the canonical copy. The cost is drift, so the contributor rule is: when you change a standard file in one skill, ask whether to sync the others. Shipped executables live under `references/` too, because the lint resolves every `references/…` pointer and would catch a broken one.

## Configuration: one file, `.xezar/pipeline/config.json`

All skills read a single per-repo config written once by `xez-setup-agent-pipeline`: base branch, validation commands, label taxonomy, QA gate, engine thresholds and working paths. Nothing is hard-coded. A skill invoked in a repo without the config runs the setup itself – interactively when a person is present, with `--defaults` when unattended. New keys always ship with a default in the loading snippet, so committed configs keep working across upgrades.

## Why `.xezar/pipeline/`, and why overrides are not under `.xezar/skills/`

Everything the skills write into a consumer repository sits under `.xezar/pipeline/` (config, tracker and browser descriptors, overrides, runs, specs, analysis, scripts) so one directory holds the whole pipeline state next to Xezar's own `.xezar/` kit. Runtime-only QA state goes to `.local/qa`, which is gitignored. Repo-local overrides are flat files at `.xezar/pipeline/overrides/<skill-name>.md`, not skills: Xezar discovers `.xezar/skills/` as real skills, so an override placed there would shadow the installed skill instead of extending it. An override `@`-imports or references the installed skill and adds rules on top; local rules win on repo specifics, and an override can never relax a safety rule (no skipping tests, no `--no-verify`, no force-push).

## Tracker abstraction

No skill calls `gh` or any tracker CLI directly. Skills name tracker operations (**get-issue**, **create-pr**, **comment-pr**, **merge-pr**, …) and one committed descriptor, `.xezar/pipeline/trackers/<tracker>.md`, defines how each executes. The descriptor is Markdown rather than code so it behaves identically across agents and so the repo's committed copy is the override point. GitHub ships end-to-end; Linear and Jira Cloud ship as split providers that own issues and delegate PR, review, CI and PR-label operations to the GitHub companion. The lint rejects `gh` commands inside `skills/**` outside the shipped descriptors.

## Browser-provider abstraction

Browser automation uses the same descriptor pattern under `.xezar/pipeline/browsers/<provider>.md`, selected by `browser.provider`. Fresh setups get agent-browser, which provisions its own binary and Chrome for Testing; Playwright stays shipped, and an absent key or a legacy `test-env.json` still means Playwright. Repository-native E2E suites remain authoritative; the provider only drives exploration, assertions and screenshots.

## Behavioural rules in force

- One PR per unit of work: skills reuse a PR a previous skill opened and never open a second one; implementation of a spec ships on its own PR, and the spec PR stays design-only.
- Every PR-producing skill ends with a `PR: #<n> (link: <url>)` line the next skill parses; `Issue:`, `Spec:` and `xez-brainstorm`'s `Next:` lines follow the same rule.
- Claims are handed off, never dropped and re-acquired: the driving skill of a chain releases the lock exactly once, and a downstream skill treats an inherited same-user lock as re-entry.
- The QA gate is human: `needs-qa` blocks merge until a person adds `qa-approved`; automation requests QA and never grants it. `xez-auto-fix-pr` and `xez-pr-autopilot` stop short of merging unless told otherwise.
- Review autofix is opt-in on foreign PRs: the loop runs only for the automation identity's own PRs or with `--autofix`.
- One label-rationale comment per skill per PR or issue, rewritten in place; a missing label is a logged skip, never an error.
- `xez-code-review` keeps a complete agent artifact and posts a bounded projection to the PR; every blocker and major finding always appears.
- PR and issue bodies own the explanation (what changes for whom, why, how far it reaches); comments report new findings, state changes or hand-offs and link existing detail.
- Executor placement and model tier are plan-time data in the loop engines' Tasks table; tiers are abstract (`cheap`, `standard`, `capable`), never vendor model names.
- `engine.loopStepThreshold` routes a plain run to the loop engine; `engine.stepReview` sets review granularity (`final`, `checkpoint`, `per-step`).
- Bugs and feature requests are triaged differently: `xez-auto-fix-issue` classifies first, sends bugs down verify → root-cause → fix → open-pr, and takes features through spec-then-implement with autonomous, reversible defaults for open questions.
- Definition of Ready is a gate at Intake in two tiers: ticket-level gaps stop a run with `NOT_READY`; spec-level gaps author a spec.
- When `product-brief.md` exists, its non-goals, business rules and decisions are a protected contract: a change that contradicts one without a superseding entry in the same diff is a review blocker.
- Discovery questions are written for the person answering: one concrete thing per question, no skill vocabulary, and a hand-off to the next skill instead of a list of commands.
- Reporting never waits for CI: a run reports, swaps `in-progress` for `ci-monitoring` and bounds the wait with `ci.maxWaitMinutes`; `ci-monitoring` is never a lock signal.
- Test-env credentials are references (`credentialsFile` + `passwordEnv`); password values never enter the agent's context.
