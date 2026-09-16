<!--
  Optional software delivery example, consumed by the xez-setup-agent-pipeline skill.
  Use only for requested guidance at a project-selected path; no filename is required.
  When adapting this example:
  - Replace {{baseBranch}}, {{tracker}}, {{specsDir}}, and {{validationCommands}}
    with values resolved from .xezar/pipeline/config.json. Render
    {{validationCommands}} as a bullet list of the configured commands, in order.
  - Replace {{localWorkflowPolicy}} with established local workflow rules.
    Do not invent a taxonomy or a process for absent evidence.
  - Resolve every conditional block marked "IF <condition>" ... "END IF": keep
    the content when the config condition is true, delete it entirely when
    false, and strip the marker comments either way.
  - Delete this instruction comment from the generated file.
-->

# Software delivery process

Adapt this example only within authorized software setup. Keep locally relevant roles and stages; remove those the project does not use. Resolve every label role below from project/tracker evidence, not from this template. Existing quality gates remain binding.

## Purpose

This file documents how work flows from ticket to merged PR in this repository. The agent skills configured in `.xezar/pipeline/config.json` enforce the process; humans read it here. PRs target `{{baseBranch}}`; issues and PRs live in {{tracker}}, with every tracker operation the skills run defined in `.xezar/pipeline/trackers/{{tracker}}.md` (edit that file to extend or override tracker behavior).

Work enters through two paths: a free-form task brief handed to an agent, or a filed ticket. Both converge on the same review loop, the same validation gate, and the same merge gates.

Before intake, the work is shaped: `xez-discover` establishes the product context every later decision reads (`{{specsDir}}/product-brief.md` — who the users are, what hurts, what the product is not, which rules and decisions bind the work), `xez-brainstorm` turns a single idea or question into a routing decision and a brief, and the spec skills (`xez-spec-writing`, `xez-auto-write-spec`) turn a feature into a design document before anything is built. Those steps feed the table below; they are not the ticket flow itself, and the Definition of Ready is the contract between them and Intake.

## Roles

- **Author** — the human or agent who writes the change. Owns the ticket from claim to a merge-ready PR.
- **Reviewer** — reads the diff and approves or requests changes. May be a human or the `xez-auto-review-pr` skill; the `xez-code-review` checklist applies either way.
- **Designer** — owns the flow and its states before the code exists, and the design contract the UI review reads back. May be a human, `xez-ux-shape` for the shaping, `xez-ux-review-pr` for the pass over a PR's screens.
<!-- IF qaGate -->
- **QA reviewer** — exercises user-facing changes before they merge, with `xez-prepare-test-env` to boot the app once and `xez-auto-qa-pr` to walk it in a real browser. Manual means a person judges the result and owns the local QA-passed label; it does not mean the work is unassisted. Always referenced by role, never by name or handle: assignments change.
<!-- END IF -->
- **Maintainer** — owns branch protection, the label taxonomy, the config, and this document; arbitrates when gates conflict.

## Ticket lifecycle

| Stage | What happens | Driven by | Done when |
|---|---|---|---|
| Discovery | The product context is established before any idea is weighed — problem and who has it, stakeholders, rules, flows, success criteria, scope — from material that exists, with every claim tagged by its evidence and every decision owned by a person. Then an idea, question, or itch is talked through: the problem is questioned, alternatives (including building nothing) are weighed, and the conversation ends in a routing decision. | `xez-discover` (product level) and `xez-brainstorm` (one idea), or a human | A product brief, or a routed conversation with a brief when the work continues |
| Intake | A ticket or task brief is filed in {{tracker}} and meets the Definition of Ready below. `xez-prepare-issue` files it with locally established labels and the ready sections; `xez-auto-manage-issues` reports what an existing ticket still lacks. | Anyone, `xez-prepare-issue`, `xez-auto-manage-issues` | Ticket exists and is ready, or its gaps are named on the ticket |
| Triage | Confirm the issue is real, still unfixed on `{{baseBranch}}`, and not already claimed or covered by an open PR. Read-only; stops the chain cleanly when there is nothing to do. | `xez-verify-in-repo` or a human | Confirmed actionable, or closed as no-action |
| Claim | The author claims the ticket so concurrent agents back off. See the claim protocol below. | `xez-fix` / `xez-auto-create-pr`, or a human | Claim visible on the ticket |
| Design | For a user-facing change, the flow and its states are settled before the code exists: what the screen does when empty, loading, in error, and without permission, and what the change deliberately does not do. A ticket that touches no UI skips this stage. | `xez-ux-shape`, or a human designer | The flow and its states are decided, or the ticket is not user-facing |
| Implement | Locate the minimal change surface (`xez-root-cause`, read-only), then implement the change with regression tests and run the validation gate. Task briefs without a ticket go through `xez-auto-create-pr`, which plans, implements phase by phase in an isolated worktree, and runs the same gate. | `xez-root-cause` + `xez-fix`, `xez-auto-create-pr`, or a human author | Change complete, validation gate green |
| PR | Commit, push, and open a PR against `{{baseBranch}}` with normalized labels. On a hand-worked branch, `xez-check-and-commit` runs the gate, fixes obvious drift, and pushes when green. | `xez-open-pr`, `xez-auto-create-pr`, or `xez-check-and-commit` | Open, labeled PR |
| Review loop | The reviewer reads the diff against the `xez-code-review` checklist and approves or requests changes. Requested changes are addressed (`xez-auto-continue-pr` resumes agent PRs from the tracking plan, and adopts a PR that has none by reconstructing the plan from the PR's own context) and the PR is re-reviewed until approved. A user-facing change also gets a design pass: `xez-ux-review-pr` walks the changed screens and reports findings ranked by user impact. That pass is advisory — it informs the review, it does not hold the merge. | `xez-auto-review-pr` (single PR), `xez-review-prs` (sweep), `xez-ux-review-pr` (design pass), or a human | Approving review submitted |
<!-- IF qaGate -->
| QA | A PR carrying the local QA-required label waits for QA. The reviewer boots the app once with `xez-prepare-test-env`, walks the change in a real browser with `xez-auto-qa-pr` — which attaches screenshots and a pass/fail report and touches no labels by default — and records the outcome. A flow worth keeping becomes `xez-integration-tests` coverage. See the QA gate below. | QA reviewer, with `xez-prepare-test-env`, `xez-auto-qa-pr`, `xez-integration-tests` | the local QA-passed label applied by a person, or the local QA-failure label routes it back |
<!-- END IF -->
| Merge | `xez-merge-buddy` reports, read-only, which PRs can merge now and which are close but blocked. `xez-approve-merge-pr` re-checks every gate, approves, and squash-merges. | `xez-merge-buddy` + `xez-approve-merge-pr`, or a human | PR squash-merged into `{{baseBranch}}` |
| Post-merge housekeeping | Close issues the merged PR fixes; comment on issues whose PRs were closed without merging; turn leftover asks or review comments into tracked follow-up issues. | `xez-close-fixed-issues`, `xez-followup-issue-from-pr` | Tracker reconciled, follow-ups filed |

## Definition of Ready

A ticket is ready for implementation when the answers below are on the ticket or in a spec it links. They come in two tiers, because a spec can supply the second but never the first.

**Ticket-level — only a human can supply these:**

- the problem or need, and who has it (a user or a role);
- the expected outcome, and how it will be checked;
- what is out of scope;
- open questions, each marked blocking or non-blocking — no blocking question left unanswered;
- any autonomous assumption confirmed by a human (the resolved-assumptions comment on a spec PR).

**Spec-level — a covering spec supplies these, and `xez-auto-write-spec` writes them when they are missing:**

- acceptance criteria;
- business rules;
- the happy path and the main unhappy paths;
- impact on data and permissions;
- dependencies;
- a link to the prototype or mockups when the change is user-facing.

For a bug, ready means reproducible: `xez-verify-in-repo` is that gate, and the list above applies only to its ticket-level items. Enforcement: `xez-prepare-issue` files tickets with these sections; `xez-auto-manage-issues` records `READY_STATUS` per issue and posts a not-ready comment naming what is missing; `xez-auto-fix-issue`'s feature route stops on a ticket that fails the ticket-level tier instead of speccing around the gap, the way `xez-verify-in-repo` stops on a bug that is not real. Spec-level gaps are not a stop — the spec is authored. A maintainer may waive an item by saying so on the ticket.

## Product decisions as a protected contract

When `xez-discover` has written `{{specsDir}}/product-brief.md`, its **Non-goals**, **Business rules**, and **Decisions** tables are protected the way `BACKWARD_COMPATIBILITY.md` protects contract surfaces. Each entry carries a stable id (`N01`, `R03`, `D07`), an owner, a status (`active` or `superseded`), a review-by date, and a required path for changing it. The rules:

- A PR that builds something a non-goal excludes, or contradicts a business rule or a decision, without a superseding entry in the same PR is a **blocker** in review, quoting the entry and its id. The way out is never "delete the code": it is "change the decision explicitly" — a superseding row approved by the entry's owner, with the maintainer arbitrating a dispute, as in Roles.
- The decisions in play are surfaced where people work, not remembered: `xez-auto-manage-issues` lists them in its implementation-notes comment, `xez-spec-writing` carries a *Decisions in play* section, and every PR body carries *Decisions touched*. A newcomer or a new agent reads them at the issue, the spec, or the PR, not in a chat history.
- An autonomous assumption a human confirmed on a spec PR (the resolved-assumptions comment) is recorded as a decision on the next `xez-discover --refresh`, with the confirmer as owner, so the reason a thing is the way it is survives the people who decided it.
- Decisions age: an entry past its review-by date is flagged in review as due for a look, not enforced blindly. Which entries block more than they protect is a retro question.

## Local workflow and labels

{{localWorkflowPolicy}}

Resolve this section from the project's policy and tracker evidence: existing stages, label/state names, exclusivity, priority/risk inference and who can change each signal. Omit groups the project does not use. No taxonomy is supplied by this template. If labels are disabled, describe the actual review, approval and ownership evidence instead; required quality gates still apply.

<!-- IF qaGate -->
## The QA gate

The one hard rule of this process: **a PR carrying the local QA-required label must not merge until it also carries the local QA-passed label, even when every other check is green.** Automatic enforcement by `xez-merge-buddy` or `xez-approve-merge-pr` is available only after verifying that the installed consumer and any applicable override recognize the exact local QA-required, QA-passed, QA-failure, merge-prohibited, blocked-work and active-QA signals. Record the inspected consumer version and supported mapping in this generated guidance so a later independent invocation can check it again. A configured label name alone is not proof of consumer support. If support is absent, unknown or has changed, keep the QA gate pending, do not delegate an automatic merge, and require the authorized maintainer to verify the local QA evidence manually before merging. Missing support never waives the gate.

- Apply the local QA-required label to UI changes, new features, and other user-facing behavior that needs manual exercise.
- The local QA-not-required label is the explicit opt-out for docs-only, dependency-only, CI-only, test-only, and similarly low-risk non-user-facing changes. Never combine it with the local QA-required label.
- The local QA-failure label, the local merge-prohibited label, and the local blocked-work label are hard blocks regardless of every other signal. A local signal that QA is active means a tester is on the PR right now — never merge under an active tester.
- The gate is satisfied when a QA reviewer tests the PR and applies the local QA-passed label.
- **Self-QA exception, only if local policy authorizes it**: when no QA reviewer has capacity in time, an authorized engineer may sign off instead — but only by (1) checking the PR out and running it locally, (2) exercising the affected flow, and (3) attaching evidence to the PR: a screenshot of it working, or a written account of what was exercised and the observed result. Then apply both the local QA-passed label (so the gate passes) and the local self-verification label (so the exception is auditable). No evidence means no QA approval.
<!-- END IF -->

## The claim protocol

Before mutating an issue or PR, an agent claims it with all three signals: it assigns itself, adds the local active-ownership label, and posts a claim comment saying what it is doing. Any agent that finds an existing claim backs off instead of colliding. Automatic exclusion by merge tooling is available only after verifying that the installed consumer and any applicable override recognize the exact local active-ownership signal and distinguish it from CI observation. Record the inspected consumer version and mapping here and recheck them before a later independent invocation. If support is absent, unknown or has changed, keep the ownership gate pending, do not delegate an automatic merge, and require the authorized maintainer to verify manually that no active claim remains before merging. A configured ownership label alone does not establish enforcement.

The local active-ownership label means **actively working**. Once an agent's work is finished and fully reported — labels applied, review submitted, comments posted — it swaps the local active-ownership label for the local CI-observation label if it still intends to report the CI outcome. The local CI-observation label is **not** a claim and blocks nobody: it says only that the CI-result follow-up comment is still owed, so another agent or a human may act on the PR freely. That distinction matters because CI runs long: an agent that reported its work and then died while watching a run leaves an honest, self-describing state instead of a lock nobody holds. The label comes off when the follow-up lands, or when the agent gives up waiting at `ci.maxWaitMinutes` and says so.

The claim is released when the work finishes — on success and on failure alike. A stale ownership signal with no recent activity may be cleared by the maintainer.

### Reporting is decoupled from CI

Agents apply labels, submit reviews, and post comments **as soon as their work is done**, without waiting for CI to go green. A review submitted while checks are still running says so in its body: branch protection plus the QA-approval gate hold the actual merge, and the approval covers the code, not a green run. The CI outcome arrives afterwards as a follow-up comment, which also corrects the pipeline label if the result changes the verdict.

The wait for that outcome is bounded by `ci.maxWaitMinutes` (default 40). When it expires with checks still running, the agent stops waiting, runs the local validation gate as its own evidence, posts that together with the still-pending check names and an explicit statement that no further follow-up is coming, drops the local CI-observation label, and finishes.

A red signal does not short-circuit the review either. A failing required check or a conflicted head is collected as a **blocker finding** and reported together with the full code review, never instead of it: one review cycle gives the author the failing check, the conflict, and every code finding at once, rather than the cheapest red flag first and another cycle to discover the rest. Such a verdict still requests changes — completeness changed, the gate did not.

None of this touches the merge gates. Reporting early is safe; merging early is not — required checks still gate every merge, and the merge tooling refuses until they are genuinely green.


## The automation contract

The `xez-auto-*` skills run this process unattended and are chainable: each accepts the artifact the previous one produced (an issue id, a spec path, or a PR number from the `PR: #<number> (link: <url>)` reference line every PR-producing skill emits), and each detects work already started — an open PR referencing the issue or plan — and continues on it rather than opening a duplicate. A completed autonomous run leaves a **ready** (non-draft), PR labeled according to local policy — with a run-summary comment and, for user-facing changes, screenshots from the working app attached as PR evidence. Draft PRs are reserved for explicitly incomplete states: spec-only design PRs, interrupted hand-offs, or autonomous defaults flagged for human confirmation. Automation never applies the local QA-passed label.

## Validation gate

Every PR passes the full validation gate before review sign-off, in this order:

{{validationCommands}}

Any non-zero exit fails the gate and blocks the PR. The implementing skills run the gate before opening a PR, and `xez-check-and-commit` runs it before pushing a hand-worked branch. The command list lives in `.xezar/pipeline/config.json`; when it changes, update it there and in this section together.

## Amending this process

This document and `.xezar/pipeline/config.json` describe the same process: change them together, and re-run the `xez-setup-agent-pipeline` skill when the toolchain or label taxonomy changes. The design contract the Design and Review stages read is set up the same way, once rather than per ticket: `xez-ux-setup` extracts it from the repository, and is re-run when the design system changes. Per-skill deviations — extra review rules, a different PR body template, an added gate step — belong in a repo-local override file at `.xezar/pipeline/overrides/<skill-name>.md` – a flat Markdown file named after the skill, not a skill of its own – which the installed skill applies as an extension (it can `@`-import or reference the installed skill); local rules win, but an override file cannot grant what the installed skill's safety rules forbid.
