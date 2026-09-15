<h1 align="center">Xezar Skills</h1>

<p align="center">
  <b>🧠 plan · 🔨 implement · 🔍 review · ✅ QA gate · 🚢 merge</b><br/>
  Thirty-eight agent skills that run a full PR pipeline. Install them into any repo, with any coding agent.
</p>

<p align="center">
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-green.svg" alt="License: MIT" /></a>
  <a href="https://skills.sh"><img src="https://img.shields.io/badge/install%20via-skills.sh-blue.svg" alt="Install via skills.sh" /></a>
  <a href="https://github.com/qodeca/xezar-skills/pulls"><img src="https://img.shields.io/badge/PRs-welcome-ff69b4.svg" alt="PRs welcome" /></a>
</p>

This is the team skills collection behind [Xezar](https://github.com/qodeca/xezar), the local cockpit for parallel coding agents. Xezar loads it by default, and its software pipeline runs independently of Xezar: every skill is a plain Markdown playbook that installs into any repository and runs under any coding agent that reads skills. The pipeline is product-agnostic by rule – pipeline behavior comes from project configuration. Onboarding also supports general project work, with optional native Xezar engine and client setup.

## ⚡ 30-second quickstart

```bash
npx skills add qodeca/xezar-skills --skill '*'
```

Install all thirty-nine — the pipeline composes, and every skill is small until invoked. Drop `--skill '*'` to cherry-pick interactively. Skills install for 22+ coding agents (Claude Code, Cursor, Codex, and others) via [skills.sh](https://skills.sh).

For optional minimal setup across software, campaign/marketing, research or other work, use [`xez-onboard`](docs/skills/xez-onboard.md). It inspects first and previews only useful project files; no pipeline or leader is required.

For the software delivery pipeline, once per repository:

```
/xez-setup-agent-pipeline
```

It inspects your repo (default branch, validation scripts, GitHub labels), asks a few questions, writes `.xezar/pipeline/config.json`, and generates `SDLC.md` — your team's ticket-flow doc. The software pipeline skills read the config; onboarding does not require it. The standalone `xez-issue-create` skill reads existing project guidance and works without setup.

Then ship something:

```
/xez-auto-create-pr "add rate limiting to the login endpoint"
```

The agent drafts an execution plan, implements it phase by phase in an isolated worktree, runs your validation commands, reviews its own diff, and opens a labeled, reviewed PR.

## 🔄 Update an existing installation

Update project-installed skills from the project directory:

```bash
npx skills update -p
```

For skills installed globally, update the global installation instead:

```bash
npx skills update -g
```

This refreshes the installed skill files to their latest versions. It does not overwrite artifacts that the setup skill previously generated inside your repository, including `.xezar/pipeline/trackers/<tracker>.md` and `.xezar/pipeline/browsers/<provider>.md`. After updating, run:

```text
/xez-apply-upgrade-notes
```

That skill applies the relevant [UPGRADE_NOTES.md](UPGRADE_NOTES.md) migrations while preserving local edits.

Coming from the predecessor collection? [UPGRADE_NOTES.md](UPGRADE_NOTES.md) carries the one-time migration: remove the old skill set, install this one, move the pipeline files to `.xezar/pipeline/`.

ℹ️ A few skills drive a real browser through the configured browser provider — [`xez-prepare-test-env`](docs/skills/xez-prepare-test-env.md), [`xez-integration-tests`](docs/skills/xez-integration-tests.md), and [`xez-auto-qa-pr`](docs/skills/xez-auto-qa-pr.md). Because of that, skills.sh validation may flag them as **Medium** or **High** risk. Read any skill before you run it; these three run as shipped in the Xezar project itself.

## 🛠️ Local development

Working on the skills themselves? Skip the `npx skills add` round-trip and symlink this checkout straight into your agents' skill directories:

```bash
npm run install-skills
```

This links every skill in `skills/` into `~/.claude/skills` (Claude Code) and `~/.codex/skills` (Codex). Because they are symlinks, any edit you make in this repo is live on the next skill invocation — no reinstall needed.

Options:

```bash
npm run install-skills -- --agent claude   # only one agent (claude or codex)
npm run install-skills -- --force          # replace existing non-symlink installs
npm run uninstall-skills                   # remove only the links owned by this repo
```

The installer never touches skills it does not own: an existing real directory (e.g. installed earlier via `npx skills add`) is skipped with a warning unless you pass `--force`, and uninstall removes only symlinks that point into this checkout.

## 🔁 The pipeline

Three entry paths: hand the agent a task brief ([`xez-auto-create-pr`](docs/skills/xez-auto-create-pr.md)), a spec ([`xez-auto-write-spec`](docs/skills/xez-auto-write-spec.md) to author one, [`xez-auto-implement-spec`](docs/skills/xez-auto-implement-spec.md) to build one), or a GitHub issue ([`xez-auto-fix-issue`](docs/skills/xez-auto-fix-issue.md)). The issue path classifies first — a bug drives the autofix chain, a feature request gets its spec resolved (or autonomously written) and implemented on the same PR. All paths converge on the same review loop and the same QA gate. And when there is no artifact yet — just an idea or a question — [`xez-brainstorm`](docs/skills/xez-brainstorm.md) runs the conversation first and hands the pipeline a routing decision plus a brief. Before even that, [`xez-discover`](docs/skills/xez-discover.md) establishes the product context every later decision reads: a `product-brief.md` built from real material — interviews, data, documents — with every claim tagged by its evidence and every decision owned by a person.

The skills chain: every PR-producing skill ends with a `PR: #<number> (link: <url>)` reference line the next skill consumes, and every skill checks for a PR a previous skill already opened and continues on it instead of opening a duplicate. A completed autonomous run always leaves a **ready, fully labeled PR** (pipeline + category + priority + risk + QA meta) with a run-summary comment — and screenshots from the working app when the change is user-facing. Skills claim PRs and issues with an `in-progress` label, so concurrent agents back off instead of colliding.

```mermaid
flowchart LR
    discover["xez-discover<br/>(product context)"] --> brainstorm
    brainstorm["xez-brainstorm<br/>(conversation)"] -. "small task" .-> createPR
    brainstorm -. "feature" .-> writeSpec
    subgraph brief ["From a task brief"]
        createPR["xez-auto-create-pr"] --> reviewPR["xez-auto-review-pr"]
        reviewPR -- "changes requested" --> continuePR["xez-auto-continue-pr"]
        continuePR --> reviewPR
        reviewPR -- "approved" --> qaGate{"QA gate"}
        qaGate -- "skip-qa" --> mergePR["xez-merge-buddy /<br/>xez-approve-merge-pr"]
        qaGate -- "needs-qa" --> manualQA["manual QA"]
        manualQA -- "qa-approved" --> mergePR
    end
    subgraph issue ["From a GitHub issue: xez-auto-fix-issue classifies, then routes"]
        classify{"bug or FR?"}
        classify -- "bug" --> verifyStep["xez-verify-in-repo"]
        verifyStep --> rootCause["xez-root-cause"]
        rootCause --> applyFix["xez-fix"]
        applyFix --> openPR["xez-open-pr"]
        classify -- "feature request" --> specExists{"spec exists?"}
        specExists -- "no spec" --> writeSpec["xez-auto-write-spec<br/>(spec PR + mockups)"]
        writeSpec --> implementSpec["xez-auto-implement-spec"]
        specExists -- "spec exists" --> implementSpec
    end
    openPR --> reviewPR
    implementSpec --> reviewPR
```

## 📦 Skill catalog

📇 Per-skill cards with parameters: [docs/skills/](docs/skills/README.md)

### 🤖 Autonomous skills

**Naming convention:** the `xez-auto-*` prefix means **autonomous and non-interactive** — hand these a brief, an issue, or nothing at all and they run end-to-end without supervision: they claim their work with the `in-progress` lock so concurrent agents back off, work in isolated worktrees so your checkout stays untouched, run the validation gate, self-review, make the recommended most-reversible call themselves (documented for override) instead of stopping to ask, and finish with a PR, a review verdict, or a reconciled tracker. Safe to run on a schedule or in CI. Every skill **without** the `auto` prefix is interactive: it acts once, may ask you questions, reports, and hands control back.

| Skill | What it does autonomously |
|---|---|
| [`xez-auto-create-pr`](docs/skills/xez-auto-create-pr.md) | Takes a free-form task brief end-to-end: execution plan, isolated worktree, phase-by-phase commits, validation gate, self-review, labeled PR, then an autofix review loop until clean. Resumable. Hands runs whose plan exceeds the configured step threshold to [`xez-auto-create-pr-loop`](docs/skills/xez-auto-create-pr-loop.md) automatically. |
| [`xez-auto-create-pr-loop`](docs/skills/xez-auto-create-pr-loop.md) | Advanced xez-auto-create-pr for long spec implementations: run folder with PLAN/HANDOFF/NOTIFY, one commit per step, checkpoint verification every ~5 steps, plan-driven executor dispatch (per-step placement + model-tier hints in the plan), full gate at completion. |
| [`xez-auto-fix-issue`](docs/skills/xez-auto-fix-issue.md) | The single issue-to-PR entry point: classifies the issue first, then routes. A bug drives the autofix chain — triage gate, root-cause analysis, minimal fix with regression tests, a ready labeled PR, autofix review loop. A feature request takes the feature route — claims the issue, resolves its spec (autonomously written via [`xez-auto-write-spec`](docs/skills/xez-auto-write-spec.md) when none exists, implemented via [`xez-auto-implement-spec`](docs/skills/xez-auto-implement-spec.md)), and verifies the contract on the same PR — reviewed, UI-verified, fully labeled. For a spec without implementation, run `xez-auto-write-spec` directly. Stops cleanly when the issue is already solved or claimed. |
| [`xez-auto-write-spec`](docs/skills/xez-auto-write-spec.md) | Turns a brief or FR issue into a finished spec on a ready PR: autonomous Open-Questions defaults posted for override, UI mockups + current-app screenshots attached as PR evidence, full SDLC labels, chain markers for [`xez-auto-implement-spec`](docs/skills/xez-auto-implement-spec.md). |
| [`xez-auto-implement-spec`](docs/skills/xez-auto-implement-spec.md) | Implements an existing spec (by path, name, issue, or spec-PR number; clean stop when not found): reuses the spec PR's branch or runs [`xez-auto-create-pr`](docs/skills/xez-auto-create-pr.md), then the review autofix loop and UI verification with screenshots on the PR. |
| [`xez-auto-continue-pr`](docs/skills/xez-auto-continue-pr.md) | Resumes an in-progress PR from the first unchecked step in its tracking plan and carries it to completion — implementation, validation, review loop, summary comment. A PR with no plan (a human's, another tool's, a crashed run's) is adopted: the goal is reconstructed from its description, comments, review feedback, linked issues and diff, landed as a real plan, then executed. |
| [`xez-auto-continue-pr-loop`](docs/skills/xez-auto-continue-pr-loop.md) | Resumes runs started by [`xez-auto-create-pr-loop`](docs/skills/xez-auto-create-pr-loop.md): orients from HANDOFF.md, picks up at the first non-done Tasks-table row, keeps the per-step commit and checkpoint discipline to completion. |
| [`xez-auto-review-pr`](docs/skills/xez-auto-review-pr.md) | Reviews a PR by number in an isolated worktree, approves or requests changes, manages labels. On changes-requested, its autofix loop iterates fixes and re-review until merge-ready. A spec-only design PR gets a **specification review** instead of the code checklist: what can go wrong, backward compatibility, what's missing, how the spec can be improved, and whether it is the simplest possible solution — same severity scale and verdict rule, and the autofix loop amends the spec document (never adds implementation). |
| [`xez-auto-fix-pr`](docs/skills/xez-auto-fix-pr.md) | Drives one PR to merge-ready: merges the latest base in first, then loops review-autofix ([`xez-auto-review-pr`](docs/skills/xez-auto-review-pr.md)), its own CI-stabilization step (classify each failing check as real bug / test bug / flake / infra, fix the real ones with tests, never fake green), and UI QA ([`xez-auto-qa-pr`](docs/skills/xez-auto-qa-pr.md)), re-merging base whenever it advances. Files follow-up issues for non-blocking nits via [`xez-followup-issue-from-pr`](docs/skills/xez-followup-issue-from-pr.md), keeps the fork carry-forward supersede/credit rules, normalizes labels, and hands off to [`xez-approve-merge-pr`](docs/skills/xez-approve-merge-pr.md) — it never merges itself. A `--ci-only [--branch <name>]` mode drives a plain branch or no-PR change to green CI without the rest of the loop. |
| [`xez-pr-autopilot`](docs/skills/xez-pr-autopilot.md) | The single "just finish this PR" entry point: diagnoses what state one open PR is actually in — unfinished plan steps, missing review, unresolved conversations, red CI, base conflicts, missing labels or QA evidence, merge-ready — then maps that onto an ordered chain of the skills above and runs it, re-diagnosing between steps. Dispatch only: [`xez-auto-continue-pr`](docs/skills/xez-auto-continue-pr.md), [`xez-auto-fix-pr`](docs/skills/xez-auto-fix-pr.md), [`xez-auto-qa-pr`](docs/skills/xez-auto-qa-pr.md), [`xez-followup-issue-from-pr`](docs/skills/xez-followup-issue-from-pr.md) and [`xez-approve-merge-pr`](docs/skills/xez-approve-merge-pr.md) do the work. Never merges without `--allow-merge`; `--dry-run` diagnoses and mutates nothing. |
| [`xez-review-prs`](docs/skills/xez-review-prs.md) | Sweeps all unreviewed open PRs, newest first, through [`xez-auto-review-pr`](docs/skills/xez-auto-review-pr.md), respecting claim locks. |
| [`xez-close-fixed-issues`](docs/skills/xez-close-fixed-issues.md) | Post-merge housekeeping sweep: closes issues that merged PRs fix, comments on issues whose PRs were closed without merging. |

### 🧑‍💻 Interactive skills

Interactive helpers (no `auto` in the name — the other half of the naming convention): they act once, may ask you questions along the way, report, and hand control back to you.

| Skill | What it does |
|---|---|
| [`xez-setup-agent-pipeline`](docs/skills/xez-setup-agent-pipeline.md) | One-per-repo configurator. Inspects the repository, asks a few questions, writes `.xezar/pipeline/config.json`, installs tracker and browser-provider descriptors, generates `SDLC.md` and an `AGENTS.md` starter when missing. Verifies cross-skill coverage: if an installed skill references one that isn't installed, it prints the exact `npx skills add` command to fix it. |
| [`xez-apply-upgrade-notes`](docs/skills/xez-apply-upgrade-notes.md) | Post-upgrade migrator. Applies `UPGRADE_NOTES.md` to the repo: re-syncs installed tracker/browser descriptors while preserving local edits, reports custom-provider gaps, and checks the config against notable upgrades. |
| [`xez-merge-buddy`](docs/skills/xez-merge-buddy.md) | Scans open PRs and reports which can merge now and which are close but blocked, based on labels, reviews, CI, and mergeability. |
| [`xez-issue-create`](docs/skills/xez-issue-create.md) | Draft or file one issue with explicit authority, duplicate checks, project templates, and recovery receipts; no setup required. |
| [`xez-pipeline-retro`](docs/skills/xez-pipeline-retro.md) | Classifies runs the pipeline already finished — clean single pass, hard recovery, loop checkpoints, or a second pass with no recorded cause — and ranks the causes by the wall-clock hours they cost. Read-only; hands the top cause to `xez-prepare-issue`. |
| [`xez-approve-merge-pr`](docs/skills/xez-approve-merge-pr.md) | Approves and squash-merges a PR given only its number. Can file a follow-up issue at the same time. |
| [`xez-check-and-commit`](docs/skills/xez-check-and-commit.md) | Runs the configured validation gate on the current branch, fixes obvious drift, then commits and pushes when green. |
| [`xez-followup-issue-from-pr`](docs/skills/xez-followup-issue-from-pr.md) | Turns a PR or a PR comment into a tracked follow-up issue, assigned to the right person. |
| [`xez-discover`](docs/skills/xez-discover.md) | Product-level discovery and define, before there is anything to brainstorm about. Runs in three modes — existing product, client idea, own idea — and leaves one `product-brief.md`: problem and who has it, stakeholders, rules, flows, benchmark, success criteria, scope (now, later, not doing), non-goals, decisions with owners, riskiest assumptions with tests, open questions. Gathers real material first: a section with nothing behind it becomes a collection plan with capture templates, never prose; synthetic personas and assumptions are tagged and never count as evidence. [`xez-brainstorm`](docs/skills/xez-brainstorm.md), [`xez-spec-writing`](docs/skills/xez-spec-writing.md), and [`xez-prepare-issue`](docs/skills/xez-prepare-issue.md) read the brief when it exists, and its non-goals, business rules, and decisions become a contract the review skills enforce. |
| [`xez-brainstorm`](docs/skills/xez-brainstorm.md) | The conversation before any artifact exists: open questions one at a time, alternatives weighed (including building nothing), a challenger subagent attacks the conclusion, then the user confirms a routing decision — a machine-parsed `Next:` line plus a handoff brief that feeds [`xez-prepare-issue`](docs/skills/xez-prepare-issue.md), [`xez-auto-write-spec`](docs/skills/xez-auto-write-spec.md), [`xez-spec-writing`](docs/skills/xez-spec-writing.md), or [`xez-auto-create-pr`](docs/skills/xez-auto-create-pr.md). |
| [`xez-spec-writing`](docs/skills/xez-spec-writing.md) | Writes and reviews feature specs to staff-engineer standards: skeleton-first with a hard Open Questions gate, phased implementation breakdown that feeds [`xez-auto-create-pr`](docs/skills/xez-auto-create-pr.md), severity-ranked architectural reviews. |
| [`xez-prepare-issue`](docs/skills/xez-prepare-issue.md) | Files a single well-formed tracker issue for deferred work: dedupes against existing issues and PRs, links (or authors) a covering spec, otherwise embeds step-by-step guidance, and applies the SDLC labels on creation. |
| [`xez-auto-manage-issues`](docs/skills/xez-auto-manage-issues.md) | Brings existing issues up to standard, single or in bulk: applies missing SDLC labels, and for a laconic issue (one line + a screenshot) analyzes the screenshot with the terse text, clarifies the wording non-destructively, and posts the agent's understanding as a comment. Checks spec coverage for feature issues: when one lacks a covering spec it posts a spec-required comment to the issue author (fill up the spec before implementation), or authors the spec itself via [`xez-auto-write-spec`](docs/skills/xez-auto-write-spec.md) with `--write-missing-specs` (default off). Batch defaults to the last ~25 open, worst-described first, narrowable by state/label/author/limit. Idempotent and claim-aware. |
| [`xez-integration-tests`](docs/skills/xez-integration-tests.md) | Creates and runs integration/E2E tests by exploring the running app first — real locators, runtime fixtures, no hardcoded IDs — and reports failures with artifact-based per-test diagnosis. Reuses the shared [`xez-prepare-test-env`](docs/skills/xez-prepare-test-env.md) instance so QA and tests hit the same booted app. |
| [`xez-auto-qa-pr`](docs/skills/xez-auto-qa-pr.md) | QAs a change's UI in a real browser without merging. Checks the PR's review state first and runs [`xez-auto-review-pr`](docs/skills/xez-auto-review-pr.md) when the PR is still unreviewed, then boots the app via [`xez-prepare-test-env`](docs/skills/xez-prepare-test-env.md), derives a scenario from the diff, drives the configured browser provider with screenshots, and produces a pass/fail report. Posts evidence as a PR comment when a tracker is configured; otherwise saves screenshots + JSON/Markdown reports. |
| [`xez-auto-update-changelog`](docs/skills/xez-auto-update-changelog.md) | Drafts a CHANGELOG.md release entry for every PR merged since the last release — emoji categories, contributor credits resolved by the Supersede Credit Rule and verified against commit authorship so carry-forwards and umbrella merges credit the author, not the merger — then delegates to [`xez-auto-create-pr`](docs/skills/xez-auto-create-pr.md) to ship it as a docs PR. |

### 🤝 Skills invoke each other

The building blocks behind the autofix chain and the review loop. You can call them directly, but they mainly exist for the other skills to compose.

| Skill | What it does |
|---|---|
| [`xez-verify-in-repo`](docs/skills/xez-verify-in-repo.md) | Read-only triage gate: decides whether a GitHub issue is a real, still-unfixed defect, and stops the chain cleanly when there is nothing to do. |
| [`xez-root-cause`](docs/skills/xez-root-cause.md) | Read-only analysis: locates the bug and the minimal change surface so the fix step never re-explores the repo. |
| [`xez-fix`](docs/skills/xez-fix.md) | Implements the minimal change, adds regression tests, runs the validation gate. Does not commit or push. |
| [`xez-open-pr`](docs/skills/xez-open-pr.md) | The shared PR opener: commits, pushes, opens (or reuses) a ready PR with the unified body template, applies the full SDLC label set, posts the run summary, releases the claim lock, and emits the chain markers. |
| [`xez-code-review`](docs/skills/xez-code-review.md) | The review checklist behind [`xez-auto-review-pr`](docs/skills/xez-auto-review-pr.md): correctness, security, contract surfaces, plus your repo-local checklist when configured. |
| [`xez-prepare-test-env`](docs/skills/xez-prepare-test-env.md) | Boots the app for QA and tests, any stack: reuses the repo's own environment or generates portable bring-up scripts, then caches builds and validates warm reuse. It autonomously provisions the configured browser provider (agent-browser by default; Playwright supported), writes a shared environment descriptor, and works on macOS, Linux, WSL2, and Windows. |

## 👥 Workflows by role

Same pipeline, different entry points. Each role runs one or two commands; the skills chain the rest automatically. Deeper guides live under [docs/roles/](docs/roles/).

### 📋 Product Manager / Analyst

Turn ideas into well-formed, labeled work — and review the plan before any code is written.

| ▶️ You run | ⚙️ Runs automatically inside | 🎁 You get |
|---|---|---|
| `/xez-discover --mode client "Benefits portal for SMB clients"` | context gate over your research folder, interview rounds, a skeptic subagent, a quality gate against invented evidence | `product-brief.md` with tagged evidence and owned decisions, or a collection plan naming what still has to be gathered |
| `/xez-brainstorm "should we build bulk-archive?"` | read-only repo reading and tracker checks, a challenger subagent | a routing decision with its reasoning, and a brief file the pipeline can run with |
| `/xez-prepare-issue "Bulk-archive orders from the grid"` | dedupe search, [`xez-spec-writing`](docs/skills/xez-spec-writing.md) (when a feature needs a spec) | one well-formed issue with SDLC labels, a linked spec or step-by-step guidance |
| `/xez-auto-manage-issues` | claim-aware label sync, screenshot analysis, implementation-prep comment, spec-coverage check | the backlog triaged: missing labels added, laconic issues clarified, feature issues without a spec get a spec-required comment to their author (or a spec via `--write-missing-specs`) |
| `/xez-auto-write-spec 123` | `xez-spec-writing --autonomous`, [`xez-open-pr`](docs/skills/xez-open-pr.md) | a spec-first PR to review before implementation starts |

More: [docs/roles/product-manager.md](docs/roles/product-manager.md)

### 🎨 Designer

Get a written spec with visuals attached — mockups of the new layout next to screenshots of the current app.

| ▶️ You run | ⚙️ Runs automatically inside | 🎁 You get |
|---|---|---|
| `/xez-auto-write-spec "Redesign the checkout summary panel"` | `xez-spec-writing --autonomous`, [`xez-open-pr`](docs/skills/xez-open-pr.md), [`xez-prepare-test-env`](docs/skills/xez-prepare-test-env.md) + browser provider | a ready spec PR with UI mockups, current-app screenshots, and an assumptions comment |
| `/xez-auto-implement-spec 2026-07-18-checkout-redesign` | [`xez-auto-create-pr`](docs/skills/xez-auto-create-pr.md), [`xez-auto-review-pr`](docs/skills/xez-auto-review-pr.md), [`xez-auto-qa-pr`](docs/skills/xez-auto-qa-pr.md) | the built change with before/after screenshots from the working app |
| `/xez-auto-qa-pr 123` | [`xez-prepare-test-env`](docs/skills/xez-prepare-test-env.md), browser provider | fresh screenshots of a PR's UI to design-review, no source touched |
| `/xez-ux-setup` once, then `/xez-ux-review-pr 123` | [`xez-ux-setup`](docs/skills/xez-ux-setup.md) extracts the repo's design contract; [`xez-ux-review-pr`](docs/skills/xez-ux-review-pr.md) walks the PR in a real browser | a design review judged against your own design system: evidence-tagged findings with done-when criteria |
| `/xez-ux-shape "Quick-add flow for the people list"` | [`xez-ux-shape`](docs/skills/xez-ux-shape.md) | a decided direction before anything is drawn: scope, states, riskiest-assumption test |

💡 Tip — ask for visuals explicitly to force mockups: `/xez-auto-write-spec "Redesign the checkout summary panel — include mockups of the new layout and screenshots of the current one"`.

More: [docs/roles/designer.md](docs/roles/designer.md)

### 👩‍💻 Developer

Hand off a brief, a spec, or an issue number; get back a reviewed, labeled PR.

| ▶️ You run | ⚙️ Runs automatically inside | 🎁 You get |
|---|---|---|
| `/xez-auto-write-spec "CSV export for the orders grid"` | `xez-spec-writing --autonomous`, [`xez-open-pr`](docs/skills/xez-open-pr.md), browser provider for mockups | a ready spec PR with mockups + assumptions comment |
| `/xez-auto-implement-spec 2026-07-18-csv-export` | [`xez-auto-create-pr`](docs/skills/xez-auto-create-pr.md) / [`xez-auto-continue-pr`](docs/skills/xez-auto-continue-pr.md), [`xez-auto-review-pr`](docs/skills/xez-auto-review-pr.md), [`xez-auto-qa-pr`](docs/skills/xez-auto-qa-pr.md) | an implemented, reviewed PR with screenshots from the working app |
| `/xez-auto-fix-issue 123` | classifies then routes: bugs to the autofix chain, features to [`xez-auto-write-spec`](docs/skills/xez-auto-write-spec.md) + [`xez-auto-implement-spec`](docs/skills/xez-auto-implement-spec.md) | a finished, fully-labeled PR from an issue number |
| `/xez-auto-fix-issue 456` | [`xez-verify-in-repo`](docs/skills/xez-verify-in-repo.md), [`xez-root-cause`](docs/skills/xez-root-cause.md), [`xez-fix`](docs/skills/xez-fix.md), [`xez-open-pr`](docs/skills/xez-open-pr.md), [`xez-auto-review-pr`](docs/skills/xez-auto-review-pr.md) | a bug-fix PR with regression tests and a clean review |
| 🔁 `/xez-auto-create-pr-loop "Implement the multi-tenant billing spec"` | run folder (PLAN/HANDOFF/NOTIFY), per-step commits, checkpoint verification | a resumable, step-tracked PR for a large spec (continue with [`xez-auto-continue-pr-loop`](docs/skills/xez-auto-continue-pr-loop.md); plain runs escalate here on their own past the step threshold) |

More: [docs/roles/developer.md](docs/roles/developer.md)

### 🧪 QA

Boot the app once, verify UI changes in a real browser, and add integration coverage — without touching source.

| ▶️ You run | ⚙️ Runs automatically inside | 🎁 You get |
|---|---|---|
| `/xez-prepare-test-env` | app discovery, launch-script generation, browser-provider provisioning | a reusable booted app + shared test-env descriptor the other QA skills reuse |
| `/xez-auto-qa-pr 123` | [`xez-prepare-test-env`](docs/skills/xez-prepare-test-env.md), browser provider | screenshots + a pass/fail report posted on the PR (evidence only, no labels changed) |
| `/xez-auto-qa-pr 123 --self-qa-signoff` | same, plus label guards | `qa-approved` + `qa-self-verified` — only on a fully-green run with screenshots on a `needs-qa` PR |
| `/xez-integration-tests` | [`xez-prepare-test-env`](docs/skills/xez-prepare-test-env.md), browser provider | integration/E2E tests written against the live app, with artifact-based failure diagnosis |

More: [docs/roles/qa.md](docs/roles/qa.md)

### 🚀 Release Manager

Sweep open PRs, drive them to merge-ready, and ship — the QA gate stays a human decision.

| ▶️ You run | ⚙️ Runs automatically inside | 🎁 You get |
|---|---|---|
| `/xez-merge-buddy` | tracker scan of labels, reviews, CI, mergeability | a report of which PRs can merge now and which are close but blocked |
| `/xez-review-prs` | [`xez-auto-review-pr`](docs/skills/xez-auto-review-pr.md) per PR, claim-lock aware | every unreviewed open PR reviewed, newest first |
| `/xez-auto-fix-pr 123` | [`xez-auto-review-pr`](docs/skills/xez-auto-review-pr.md), its CI-stabilization step, [`xez-auto-qa-pr`](docs/skills/xez-auto-qa-pr.md), [`xez-followup-issue-from-pr`](docs/skills/xez-followup-issue-from-pr.md) | one PR driven to approvable, green, QA-evidenced — handed to [`xez-approve-merge-pr`](docs/skills/xez-approve-merge-pr.md), never self-merged |
| `/xez-auto-fix-pr 123 --ci-only` | tracker check status + failed-step logs | green CI from real fixes with tests, never by weakening checks |
| `/xez-pr-autopilot 123` | diagnosis of the PR's real state, then the matching chain of the skills above | one PR driven from wherever it is to merge-ready, with a summary comment covering every step — never merged unless `--allow-merge` |
| `/xez-auto-update-changelog` | [`xez-auto-create-pr`](docs/skills/xez-auto-create-pr.md) | a CHANGELOG release entry landed as a docs PR, with Supersede Credit |
| `/xez-approve-merge-pr 123` | approving review + squash-merge, QA-gate guard | the PR merged — refused when `needs-qa` lacks `qa-approved` or a blocking label is set |

More: [docs/roles/release-manager.md](docs/roles/release-manager.md)

## 🧰 Works with any stack

Nothing here assumes JavaScript, or any particular product. The base branch, the validation commands, the label taxonomy, and the working paths all come from one committed file, `.xezar/pipeline/config.json`, written by [`xez-setup-agent-pipeline`](docs/skills/xez-setup-agent-pipeline.md):

```json
{
  "version": 1,
  "baseBranch": "auto",
  "tracker": "github",
  "browser": { "provider": "agent-browser" },
  "validation": {
    "commands": ["pnpm typecheck", "pnpm test", "pnpm build"]
  },
  "labels": {
    "enabled": true,
    "pipeline": ["review", "changes-requested", "qa", "qa-failed", "merge-queue", "blocked", "do-not-merge"],
    "category": ["bug", "feature", "refactor", "security", "dependencies", "documentation"],
    "meta": ["needs-qa", "skip-qa", "qa-approved", "qa-self-verified", "in-progress"],
    "priority": ["priority-low", "priority-medium", "priority-high", "priority-extreme"],
    "risk": ["risk-low", "risk-medium", "risk-high"]
  },
  "qaGate": true,
  "paths": {
    "runs": ".xezar/pipeline/runs",
    "analysis": ".xezar/pipeline/analysis",
    "specs": ".xezar/pipeline/specs",
    "scripts": ".xezar/pipeline/scripts",
    "qa": ".local/qa"
  },
  "reviewChecklist": null,
  "closeKeywords": []
}
```

A Rust repo puts `cargo test` and `cargo clippy` in `validation.commands`; a Go repo puts `go test ./...`. Skills run whatever you configure and treat any non-zero exit as a gate failure. A software pipeline skill invoked in a repo without the config runs [`xez-setup-agent-pipeline`](docs/skills/xez-setup-agent-pipeline.md) first — interactively when you're there to answer its questions, with `--defaults` when running unattended — then continues with the freshly written config.

GitHub is the default tracker. Shipped split-provider templates also support Linear issues through `schpet/linear-cli` and Jira Cloud work items through Atlassian CLI, while GitHub continues to own PRs, reviews, and CI — see the tracker providers section below.

Agent-browser is the default browser automation provider for fresh setups. It
installs itself and Chrome for Testing when needed; existing repositories remain
on Playwright until their config makes a provider explicit.

### Repository layout in your project

Everything the skills write into a consuming repository lives under two directories:

| Path | What it holds | Committed? |
|---|---|---|
| `.xezar/pipeline/config.json` | the config read by software pipeline skills | yes |
| `.xezar/pipeline/trackers/<tracker>.md` | tracker descriptor(s) – the commands behind every issue/PR/label operation | yes |
| `.xezar/pipeline/browsers/<provider>.md` | browser-provider descriptor | yes |
| `.xezar/pipeline/overrides/<skill>.md` | your repo-local extensions, one flat file per skill | yes |
| `.xezar/pipeline/{runs,specs,analysis,scripts}/` | execution plans, specs, analyses and generated launcher scripts | yes |
| `.local/qa/` | the test-env descriptor and per-run QA artifacts | no – add `.local/` to `.gitignore` |

The four working directories under `.xezar/pipeline/` are the defaults of the config's `paths` block; point them elsewhere if your repo already has a home for specs or plans.

## 🎨 Make it yours

Four layers of project fit, no forking:

- **Agent instructions** — skills read your `AGENTS.md` / `CLAUDE.md` before working, so project conventions apply from the first run. No such file? [`xez-setup-agent-pipeline`](docs/skills/xez-setup-agent-pipeline.md) offers a starter.
- **Generated project docs** — `SDLC.md` (the process doc), `CODE_REVIEW.md` (review rules, auto-applied by [`xez-code-review`](docs/skills/xez-code-review.md)), `BACKWARD_COMPATIBILITY.md` (protected contract surfaces — reviews flag violations, implementations warn you), and an `AGENTS.md` starter with a task-routing table. [`xez-setup-agent-pipeline`](docs/skills/xez-setup-agent-pipeline.md) derives each from your repository and only when the file is missing; existing docs are honored as-is.
- **Repo-local overrides** — drop a flat Markdown file named after a skill into your repo at `.xezar/pipeline/overrides/<skill-name>.md` and the installed skill applies it as an extension (details below).
- **Tracker descriptor** — every issue/PR/label command the skills run lives in one committed file, `.xezar/pipeline/trackers/<tracker>.md`, that you can edit or replace (details below).

## 🧩 Extending the skills

### How a skill is laid out

Each skill keeps its numbered main algorithm in `SKILL.md` and factors its repeatable procedures into per-skill `references/<step>.md` files under standard names — `agentic-setup.md`, `worktree-setup.md`, `claim-pr.md`, `pr-finalize.md`, `review-report.md`, `rules.md`. These standard step files are deliberately **duplicated inside every skill that uses them** rather than shared through cross-skill pointers, so each skill installs and runs standalone ([`xez-auto-create-pr`](docs/skills/xez-auto-create-pr.md) holds the canonical copy). The trade-off is intentional: standalone installability over DRY. When you edit a standard step file in one skill, sync the same change into the other skills that carry it — the collection's own contributor rule is to ask whether to propagate before doing so.

### Repo-local skill overrides

Every installed skill checks, right after loading the config, for a repo-local override file at `.xezar/pipeline/overrides/<skill-name>.md` – a flat Markdown file named after the skill, not a skill of its own, so it never shadows the installed one. When present, the installed skill applies it as an extension: the override file `@`-imports or references the installed skill and adds rules on top, and where the two overlap on repo specifics the local rules win:

```markdown
<!-- .xezar/pipeline/overrides/xez-auto-review-pr.md -->
Follow the installed `xez-auto-review-pr` skill, plus:

- Also run `pnpm test:e2e` before approving PRs that touch `apps/web`.
- Our PR body template additionally requires a "Screenshots" section for UI changes.
```

Local rules win, but an override file can never relax the installed skill's safety rules (no skipping tests, no `--no-verify`, no force-pushes).

### Project management (tracker) providers

Tracker commands live in tracker references. Pipeline skills use committed descriptors; `xez-issue-create` also carries a safe standalone GitHub mapping when no descriptor exists. Skills name **tracker operations** (**get-issue**, **create-pr**, **comment-pr**, **merge-pr**, …) and one committed descriptor file, `.xezar/pipeline/trackers/<tracker>.md`, defines how each operation is executed. [`xez-setup-agent-pipeline`](docs/skills/xez-setup-agent-pipeline.md) asks which tracker you use, sets the config's `tracker` field, and installs the matching descriptor into your repo.

That file is yours, which makes three things easy:

- **Extend or override GitHub behavior** — edit `.xezar/pipeline/trackers/github.md`: add flags, change the merge strategy, adjust comment conventions, extend the label taxonomy commands. Every skill picks it up on its next run.
- **Use a shipped split provider** — select `linear` for Linear issues through [`schpet/linear-cli`](https://github.com/schpet/linear-cli), or `jira` for Jira Cloud work items through [Atlassian CLI](https://developer.atlassian.com/cloud/acli/guides/introduction/). Setup installs the selected descriptor plus `github.md`, because the code host still owns PRs, reviews, CI, and PR labels. The templates document authentication, issue-label semantics, claim signals, identifier cross-links, and explicit post-merge issue transitions.
- **Bring your own tracker** — write `.xezar/pipeline/trackers/<name>.md` from the shipped `TEMPLATE.md` (in `xez-setup-agent-pipeline/references/trackers/`), implementing each operation with your tracker's CLI, MCP tools, or API, and set `"tracker": "<name>"` in the config. No skill changes needed — the descriptor is the whole integration surface.
- **Build another split setup** — implement issue operations against the project tracker and delegate repository/PR/review/CI/PR-label operations to its code-host companion. The template documents the pattern, including how identifiers cross-link (for example, an `ENG-123` ticket referenced from a GitHub PR).

The claim protocol (assignee + `in-progress` + 🤖 comment), the label guards (missing label ⇒ logged skip, `labels.enabled: false` ⇒ no label ops), and the QA gate semantics are part of the contract — a provider must express them, in whatever way its tracker allows.

### Browser automation providers

QA and integration-test skills select `browser.provider` from
`.xezar/pipeline/config.json` and execute the committed descriptor at
`.xezar/pipeline/browsers/<provider>.md`. Fresh setups use agent-browser; Playwright remains
available for existing repositories and teams that prefer it. The agent-browser
descriptor downloads its native release binary and Chrome for Testing itself,
then verifies a live headless launch — no Node runtime, project dependency, or
cloud-browser subscription is required.

Custom providers implement the operations in
`skills/xez-setup-agent-pipeline/references/browsers/TEMPLATE.md`. Repository E2E
suites remain authoritative; the provider controls agent-driven exploration,
assertions, and screenshots.

## 🏷️ Labels and the QA gate

Every PR carries at most one pipeline label (`review`, `changes-requested`, `merge-queue`, ...) plus additive category, meta, priority, and risk labels; priority says how urgent the work is, risk says how dangerous the change is to ship. The full taxonomy, and whether to use labels at all, lives in the config; [`xez-setup-agent-pipeline`](docs/skills/xez-setup-agent-pipeline.md) documents every group and creates missing labels for you.

The QA gate is the one hard rule: a PR labeled `needs-qa` cannot merge until a human adds `qa-approved`, no matter how green the checks are. Automated skills request QA; they never grant it.

---

Maintained by [Qodeca](https://github.com/qodeca).
