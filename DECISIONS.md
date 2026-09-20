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

Each skill's repeatable procedures live in per-skill `references/<step>.md` files under standard names (`agentic-setup.md`, `worktree-setup.md`, `claim-pr.md`, `pr-finalize.md`, `review-report.md`, `rules.md`, `report-templates.md`). They are duplicated inside every skill that uses them, never shared through cross-skill pointers, so a skill cherry-picked with `--skill <one>` runs on its own; `xez-auto-create-pr` holds the canonical copy. The cost is drift, handled in two layers. The genuinely invariant part of a standard file — today the untrusted-content boundary — sits between `<!-- shared:<id>:start -->` markers and is **generated** from `xez-auto-create-pr` by `scripts/sync-shared-blocks.mjs`; CI re-runs the generator and fails on a drifted copy, so the fix is a command rather than 37 manual edits, and a clause floor stops anyone making the check pass by emptying the block. Everything outside the markers is legitimately per-skill, and there the contributor rule still holds: when you change a standard file in one skill, ask whether to sync the others. Shipped executables live under `references/` too, because the lint resolves every `references/…` pointer and would catch a broken one.

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
- A skill never kills a process by command-line pattern match. It starts the process, saves the PID, and kills that PID. A skill runs in somebody else's checkout: the pattern that matches their dev server also matches their editor and their other checkout of the same project. `scripts/lint.sh` rejects `pkill`, `killall` and `kill $(pgrep …)` inside `skills/`.
- The committed pipeline config carries no machine-specific values. Worker counts, memory limits and absolute paths are true of one machine and wrong on every other, and a teammate inherits them silently. They live in the environment; `.env.example` names them and `scripts/lint.sh` rejects them in `config.json`.
- Every safety rule that can be checked, is checked. "Never commit a secret" is worth what its gate is worth, so the lint fails on credential-shaped **values** — key names such as `passwordEnv` are how the collection refers to a secret without holding one.

## Optional onboarding boundary

`xez-onboard` is a generic, interactive entry point and does not require pipeline
configuration. Its engine config and project MCP snippets are an explicit exception
to the pipeline-only configuration rule. Software pipeline setup stays opt-in and
is reused by name within onboarding's narrower file and authority scope. The existing
pipeline skills retain their contracts. The content gate permits only the exact native
engine paths, package identifier and MCP server identifiers needed by onboarding;
this is not permission to include this project's working instructions or branding prose.

## Standalone issue creation

`xez-issue-create` is an additive create-only path. It reads existing config and overrides but requires no pipeline setup, and carries its own tracker mapping plus local fallback. Its explicit bounded filing mode permits unattended creation without changing the autonomous contract of other skills. It neither claims nor comments on existing issues; label rationale stays in the approved body or receipt. Existing `xez-prepare-issue` behavior is unchanged.

## Generic applicability for setup, PR delivery, specs and issue preparation

For the four skills changed by issue 466 P6, domain, capability and actual task
authority precede pipeline setup. General work has a local deliverable path; no
process filename or label taxonomy is required. Software setup requires Git and
a package manager, derives guidance and labels from local evidence, and retains
existing consumer config defaults and quality gates. The former blanket
auto-setup rule is superseded for these four entry points only.

The targeted companion copies change together. Other installed skills can still
assume the legacy taxonomy, so these entry points must verify compatibility
before delegation and cannot use delegation to bypass the local policy. Shared
references outside the four directories intentionally remain unchanged under the
P6 scope. No cross-skill parser format, operation name, or existing consumer label
is renamed.

`npm run check:generic-instructions` certifies all files under those four skill
directories, including references, templates and tracker descriptors. It is not
a catalog-wide certificate; the other 35 skills are outside this P6 change.
Missing/empty/unreadable inputs and symlinks fail. Taxonomy literals belong only
in balanced `<!-- example:start -->` / `<!-- example:end -->` blocks; those
markers never exempt project paths or process-filename requirements. Native
client filenames are allowed only in the guard's exact capability phrases,
with adjacent requirements still checked. Review remains responsible for
semantic applicability; a text guard does not prove real-agent behavior.

## Every exception carries four fields and a date

An allowlist is a gate somebody turned off. The risk is not that exceptions exist –
some are correct – it is that an exception stops being a decision and becomes
furniture nobody revisits. So every entry in `scripts/allowlists.json` answers four
questions: **what** is excused, **why** (a full sentence a stranger can read), **who**
owns the decision, and **when** it expires. An expired entry fails the gate until
someone renews it with a fresh date or deletes it. `"expires": "never"` is allowed only
where `why` explains what makes it permanent – a naming convention, not a workaround.

The lists are bound to the code that uses them. `check-gate-list.mjs` imports the file
directly. `lint.sh` cannot – it is POSIX `sh` and must run without node – so its
`name_allow` literal is compared against the file, the same way the gate list binds
`SDLC.md`.

## A gate that has never failed is not known to work

Every check in this repository is green, which says nothing about whether it still
catches anything. `scripts/test-guards.mjs` introduces one named, realistic defect at a
time – a brand token in a skill, a pattern-matched `pkill`, a credential-shaped value, a
stale skill name, an expired allowlist entry – runs the real gate, and asserts the real
error message comes back. Asserting the message, not just a non-zero exit, is deliberate:
a guard failing for an unrelated reason would otherwise count as a pass.

It mutates real tracked files and restores them in a `finally`, then compares `git status`
against a snapshot taken before the run, so a contributor's own work in progress is not
mistaken for a mutation the suite failed to undo. The cost is honest: it runs `lint.sh`
about ten times, so it is the slowest entry in the gate list.

## The label taxonomy is data, not memory

`.xezar/pipeline/config.json` names the labels a pipeline uses;
`.xezar/pipeline/labels.json` gives each one a colour and a one-line description, and
`ensure-label-taxonomy` reads it. Before this, two repositories installing the same
pipeline got the same label names meaning subtly different things, and a reader could
not learn what `qa-self-verified` was for without finding the skill that applies it.

Deliberately **not** fatal on missing. A label that does not exist in a consumer
repository still degrades to a logged skip, because a collection that refuses to run in a
repository whose labels it did not create is a collection nobody installs. The reverse –
an absent label read as a satisfied gate – is the real defect, and it is fixed in the
merge gate, not here.
