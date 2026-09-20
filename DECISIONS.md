# Decisions

Engineering decisions behind this repository. Read this before proposing a structural change. Each section states the rule that is in force today; the reasoning is kept short on purpose.

## Why a separate repository

The skills are the team collection [Xezar](https://github.com/qodeca/xezar) loads by default, but they are not part of Xezar. They are plain Markdown playbooks that install into any repository and run under any coding agent that reads skills, so they live in their own repository, versioned and released on their own. Xezar pins the source (`qodeca/xezar-skills`) and updates from it; nothing in the skills depends on Xezar being present.

## Layout

`skills/<name>/SKILL.md`, with optional `references/` and `scripts/` per skill. This is the layout the [skills.sh](https://skills.sh) CLI scans and installs into `.claude/skills/` and the equivalent directories of other coding agents. Frontmatter contract: `name` equals the directory name and `description` is present – `scripts/lint.sh` enforces both in CI. One card per skill lives under `docs/skills/`.

## Naming: `xez-`, not `xezar-`

Every skill carries the `xez-` prefix (`xez-auto-create-pr`, `xez-fix`, …). It matches Xezar's own short form (`XEZ_*` environment variables, `xez/<id>` task branches) and it is deliberately not `xezar-`: Xezar's project kit keeps its own skills under `.xezar/skills/xezar-*`, and the engine hides a team skill that shares a name with a kit skill. A distinct prefix keeps the two collections visible side by side. `scripts/lint.sh` reads the prefix from one variable so a rename is a one-line change – and a rename is a breaking change (see `BACKWARD_COMPATIBILITY.md` §1).

The `xez-auto-*` sub-prefix marks a skill as autonomous: it takes a brief, an issue or nothing and runs end-to-end without supervision. Every other skill is interactive. Two carve-outs are recorded rather than re-litigated: `xez-pr-autopilot` is autonomous without the prefix (it takes a PR number and dispatches), and `xez-review-prs` / `xez-close-fixed-issues` are sweeps that ask nothing.

## The brand rule, removed

The gate used to fail on `Qodeca` or `Xezar` anywhere under `skills/**`. It is gone, and
what remains is a portability gate: a hard-coded base branch, a hard-coded package manager,
an upstream helper name.

The rule could not survive its own scope. It only ever banned this collection's two names,
while third-party names were always present and legitimately so — Claude, GitHub, npm,
pnpm, Linear, Jira, Codex, OpenCode. A tracker skill must name its tracker. More decisively,
a skill that installs a product must name that product: of the kit files an opinionated
onboarding skill has to carry, 149 of 164 contain the product name, and 145 still do after
stripping every path and filename, because the word is in ordinary prose. The directory name
is read from the product's own source and cannot be renamed without breaking it.

**What is lost, and accepted.** Nothing automated keeps the rest of the collection
product-neutral; it stays neutral by habit and by review. The README's claim that the
pipeline is "product-agnostic by rule" is withdrawn rather than left standing untrue. The
asymmetry with the `.local/` artifact rule — where a check was chosen precisely because
documentation had measurably failed — is real: that rule had a measured failure, this one
was never enforceable for a skill whose job is installing a named product.

**What survives.** Any skill that is not agent-neutral still says so in its README entry
and its description; that disclosure was always a separate promise from the gate. The
permanent old-brand ban below is untouched, as is the portability gate.

A second, permanent ban covers the predecessor collection's brand, its skill prefix and its old pipeline directory across every maintained source. Lineage is recorded in `LICENSE` and in the one migration entry in `UPGRADE_NOTES.md`, nowhere else.

## Standalone installability over DRY

Each skill's repeatable procedures live in per-skill `references/<step>.md` files under standard names (`agentic-setup.md`, `worktree-setup.md`, `claim-pr.md`, `pr-finalize.md`, `review-report.md`, `rules.md`, `report-templates.md`, `ci-followup.md`). They are duplicated inside every skill that uses them, never shared through cross-skill pointers, so a skill cherry-picked with `--skill <one>` runs on its own; `xez-auto-create-pr` holds the canonical copy. The cost is drift, handled in two layers. The genuinely invariant part of a standard file — today the untrusted-content boundary — sits between `<!-- shared:<id>:start -->` markers and is **generated** from `xez-auto-create-pr` by `scripts/sync-shared-blocks.mjs`; CI re-runs the generator and fails on a drifted copy, so the fix is a command rather than one manual edit per skill, and a clause floor stops anyone making the check pass by emptying the block. Everything outside the markers is legitimately per-skill, and there the contributor rule still holds: when you change a standard file in one skill, ask whether to sync the others. Shipped executables live under `references/` too, because the lint resolves every `references/…` pointer and would catch a broken one.

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
pipeline skills retain their contracts. The content gate that once permitted only the
exact native engine paths, package identifier and MCP server identifiers is superseded by
"The brand rule, removed" above — naming the engine is no longer an exception but the
ordinary case. The boundary that still holds is a scope one: onboarding writes project
files a consumer owns, and carrying another project's working instructions into a consumer
repository remains out of scope regardless of which names appear in them.

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
a catalog-wide certificate; every other skill is outside this P6 change.
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
time – a hard-coded package manager, a pattern-matched `pkill`, a credential-shaped value, a
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

## Three gate switches, all off, each with an owner and a date

`gates.failClosed`, `gates.requireVerdictHead` and `gates.designGate` default to
`false`, and all three are read from the **base branch's** config rather than the
working tree — a pull request
must not set the terms of its own merge.

`gates.failClosed` decides what a stage does when a gate could not be evaluated at
all. The merge gate deliberately does **not** read it: refusing to merge on unknown
evidence was already its behaviour, and reading the switch there would suggest that
behaviour is optional. It governs the stages that currently carry on.

`gates.requireVerdictHead` decides whether a verdict must name the commit it
certifies. Absence of a `Head:` line is legacy **permanently**, keyed to the artifact
and not to a release: a pull request opened before the line existed and merged two
releases later must not be refused. A `Head:` line naming a *different* commit is a
different matter — that refuses whether the switch is on or off, because the switch
governs absence, never a mismatch.

`gates.designGate` decides whether a change somebody marked as needing a design
answer may pass review before that answer exists. It applies only to what was marked,
never to every change, and both markers are **meta** labels rather than pipeline ones:
a change can be in review and waiting on a design answer at the same time, and making
that a pipeline state would force a false choice.

All three are off so an upgrade is a no-op until somebody opts in. Owner: the collection
maintainers. Review date: 2027-09-20. An off-by-default switch with no owner and no
date quietly becomes permanent, which is how a temporary tolerance turns into policy
nobody remembers choosing.

## Report every gate failure at once

A gate run evaluates everything before it reports anything, and names all the failing
gates together — `merge-gate.sh` prints a `Blocking=` line listing them. Reporting the
first failure and stopping looks efficient and is not: it teaches the reader to fix one
thing, re-run, and discover the next, which costs a full cycle per problem. The rule
lives in every skill's `rules.md` as a generated shared block, alongside the five gate
statuses and the reason `unknown` and `evidence-unavailable` are not passes.


## Publishing is the third hard stop

This collection's autonomous skills have exactly two hard stops: a claim conflict without
`--force`, and a `⚠ NEEDS HUMAN CONFIRMATION` default. `xez-release` adds the third and
last one: it never publishes, and holds no credential that could.

Three reasons, in order of weight. Publishing is release-time code execution holding the
most valuable secret a repository has, so it is the step an attacker most wants to reach.
The ecosystems are moving off long-lived tokens anyway — npm revoked classic tokens on
2025-12-09 — so a skill built around a stored token would be building on something already
being removed. And a tag-triggered publishing workflow is read *from the tagged commit*,
which is why the skill also refuses to tag anything that is not already an ancestor of the
protected base branch: tagging an unmerged head would run that branch's workflow definition
with release secrets, which is strictly worse than holding the token.

The skill prints the publish command and stops. A workflow triggered by the tag runs under
the repository's own credentials, from a commit that was reviewed on its way to the
protected branch. That is where publishing authority belongs.

`xez-release` also refuses on `unknown`, which is the one place in this collection that
does. Everywhere else a run reports what it could not check and carries on; a tag is the
artifact everyone downstream trusts, and it is the one place where the cost of being wrong
is not local.

## A model never approves its own work

Stated once, in the shared rules every skill carries, because the self-QA exception and the
autofix loop both leaned on it without saying it.

The exception stays, and stays narrow: a run that verified its own change applies the
self-verified marker *alongside* the approval, so a reader can tell independent sign-off
from a self-check at a glance. Outside it, a run that wrote a change reports what it found
and hands the verdict to someone else. "I reviewed it and it is fine" from the author is a
status report, not a review.


## A coverage inventory, and deliberately no coverage floor

`docs/coverage.md` lists what is actually checked, ranked by what breaking it would cost.
It is an inventory, never a gate.

A floor would be satisfiable by the wrong work — the cheapest way to raise a coverage
number is to test something already covered — and the number cannot tell the merge-gate
test apart from the onboarding-content test, since losing either moves it identically.
Most of all it would be a gate bound to a proxy: every other gate here is bound to captured
evidence, and a percentage is bound to line counts. This would be the one place the
collection did what it tells everyone else not to.

The table's own conclusion is the useful part: twenty-one checks read what the skills *say*
and one runs a skill and watches what it *does* — and that one cannot run in CI, because it
needs a full-access sandbox and granting a pull request's own code full access is what CI
must not do. The collection is well protected against saying the wrong thing and lightly
protected against the right thing not working. Recorded, not papered over.

## `xez-analyze-request` stays deferred

Proposed as a front door that classifies an incoming request and routes it. Deferred, with
the reason written down rather than left as silence on a list.

It overlaps three skills that already ship. `xez-brainstorm` takes an unshaped idea and
emits a routing line. `xez-prepare-issue` turns a request into a filed, ready ticket.
`xez-pr-autopilot` diagnoses the state of an existing pull request and dispatches. Between
them, the cases a request-analyser would handle are handled — by skills that also do the
next step, rather than handing back a classification.

The cost of adding it is not the skill: it is a fourth entry point users have to choose
between, in a collection whose main usability problem is already that there are forty-five
skills. A router that saves one decision and adds one is not a router.

Revisit if a real run shows a request that none of the three accepts, or if routing between
them is repeatedly got wrong. Neither has happened yet, and "it would be tidy" is not a
trigger.

## Coordination: the portable half and the vendor hook, kept apart

Agents coordinate so they do not clobber each other, and the mechanism splits cleanly into
two halves that must not be confused.

**The portable half** is the claim protocol: an assignee, an active-ownership marker, and a
timestamped comment, all three readable back through the tracker operations any descriptor
implements. It works on every tracker, it survives a restart, and a second agent can see it
without sharing a machine with the first.

**The vendor hook** is anything a particular harness offers — a lock file, a session
registry, a scheduler's own mutex. It is faster and it is not portable: it does not exist
under most of the 22+ agents this collection installs into, and it does not survive a
different checkout.

The rule: a skill's correctness depends only on the portable half. A vendor hook may make
coordination cheaper, never make it possible. A skill that would misbehave when the hook is
absent is broken, because that is the normal case.

The corollary is the one that bites: the CI-observation marker is **not** a claim. It
records that a finished, fully reported run still owes a result comment. Reading it as
ownership would make every later skill back off from a pull request nobody is working on.

## Two rulers, not one: depth and maturity

Asking "how good is this" gets one answer where two are needed, and the two move
independently.

**Depth** is how much of the problem is addressed. A skill that handles the common case and
says so is shallow and correct; one that claims to handle everything and handles the common
case is shallow and wrong.

**Maturity** is how much the claim has been tested. The four evidence levels apply:
adapted, fixture-tested, real-task verified, recommended.

They are independent, and the dangerous quadrant is deep-and-immature: a thorough-looking
thing nobody has run. It reads as the most trustworthy of the four and is the least. The
comfortable quadrant is shallow-and-mature, which is usually the right place to ship from.

So a claim states both, or it states neither. "Handles the common case; fixture-tested" is
a useful sentence. "Works well" is not.

## Seven rules for replacing something that works

Rewrites of working things fail in a recognisable way, so these are the conditions before
starting one.

1. **Name what the current thing does that you do not yet know about.** Every working
   system encodes cases nobody remembers. If you cannot name at least one, you have not
   read it closely enough to replace it.
2. **Write down what would make the replacement wrong**, before building it. A rewrite with
   no falsifiable failure condition is a preference.
3. **Keep the old one running until the new one has done the job for real.** Not a fixture:
   the actual work, on actual inputs.
4. **Migrate the data and the decisions, not just the code.** The allowlist entries, the
   recorded exceptions, the dated notes — those are the expensive part, and they are the
   part that gets dropped.
5. **Keep the seam.** A replacement that cannot be reverted in one step is a commitment, not
   a change.
6. **State the cost in the same sentence as the benefit.** "Simpler" always has a price;
   naming it is what makes the trade reviewable.
7. **Delete the old one on a date, in writing.** Two systems doing the same job is the worst
   state of all, and the way to stay there forever is to never name the day you leave it.

If three or more of these cannot be answered, the honest move is to improve the existing
thing instead.

## Zero config is a design law, not a nicety

Every config key is a decision pushed onto someone who has less context than the person who
added it. So:

- **A new key ships with a default that makes an upgrade a no-op.** Absent must behave as
  the repository behaved yesterday. Every gate switch in this collection is off by default
  for this reason.
- **A key exists only when two reasonable repositories genuinely need different answers.**
  Not when we are unsure which answer is right — that is a decision to make, not to export.
- **Absent, off, and unreadable are three different things**, and a key that collapses them
  is worse than no key.
- **A key that nothing reads is deleted**, or marked reserved with a date. `paths.analysis`
  is the cautionary example: declared, created, committed and read by nothing, and now
  unremovable without a major version because removing a `paths` key is breaking.

The test before adding one: *what does this repository do if the key never exists?* If the
answer is "the right thing", do not add the key.

## Cheap document conventions

Four, because a convention that costs effort gets dropped exactly when things are busy.

- **Date anything that will look stale.** A measurement, a count, a "currently". Write the
  date next to it, so a reader knows whether to re-check rather than guessing.
- **One file, one job.** A document that has grown a second subject gets split, not a new
  heading. The test is whether you can say what it is for in one clause.
- **Link, do not copy.** Except where a skill must install standalone — the one deliberate
  exception in this repository, and it is paid for with a generator.
- **Say what a document is not for**, near the top, when it is likely to be mistaken for a
  neighbour. One sentence saves a lot of reading.

`docs/style.md` holds the counted wording choices; it is the only place wording is decided.

## You do not need the automation

Automation is worth its cost only sometimes, and a collection that never says so trains
people to reach for it always. Reach for the plain thing when the row matches:

| Situation | Do this instead | Why |
|---|---|---|
| A one-line fix you already understand | Edit, run the gate, commit | The skill would spend a claim, a worktree and a review cycle to save you one minute |
| One PR, and you are the only person on it | Open it yourself | Claim protocols exist for concurrency you do not have |
| You want to know what a skill would do | Read its `SKILL.md` | The body is a numbered list on purpose; it is faster than a dry run |
| A question about the repo | Search it | A skill that reads files is a slower `grep` with a worse summary |
| Something is broken and you do not know why | Look first | Diagnosis is the part a skill is worst at without your context |
| A change nobody else will review | Still get a review | This is the row where the automation is worth it — see below |

The last row is the point of the table. The cases where automation pays are the ones with
**concurrency, repetition, or a check you would skip** — several agents on one tracker, the
same twelve steps for the fortieth time, a gate you would wave through at 6pm on a Friday.
The cases where it does not are the ones where you already have the context and the work is
one step.

Reaching for a skill to avoid thinking is the failure this table exists to name.

## A rename never rewrites a dated record

When something is renamed, the new name goes in the current documents. Dated records —
`UPGRADE_NOTES.md` entries, the ledger of deliberate breaks, `CHANGELOG.md`, a decision
recorded here — keep the name that was true on their date.

The reason is simple: those documents are read to find out what happened. A note dated
2026-09-13 that uses a name coined in 2027 describes a past nobody lived through, and the
reader who matches it against their own repository finds nothing and concludes the note
does not apply to them.

Where a stale name in a record would genuinely confuse, add the current name in brackets
after the old one — `<old name>` (now `<current name>`) — rather than replacing it. Add;
never overwrite. (The predecessor collection's own name is the one exception: it is
permanently banned outside `LICENSE` and `UPGRADE_NOTES.md`, and `scripts/lint.sh`
enforces that, so records naming it live only in those two files.)

`scripts/lint.sh` enforces the other half: a stale `xez-` name in a *skill* is an error,
because there it reads as an optional dependency that simply never fires.

## Admission gate, and two-step deprecation

**Admission.** Before anything new enters this collection — a skill, a config key, a gate,
a document — it answers four questions in writing:

1. What request does it serve that nothing here serves today?
2. Who decides it worked, and by what observation?
3. What does it cost every run, every reader, or every consumer repository?
4. What would make us remove it again?

An entry that cannot answer the fourth is a permanent addition, and it should be admitted
on that basis or not at all. `xez-analyze-request` was declined on question 1; every gate
switch answers question 4 with an owner and a review date.

### Admitted: the three leader-control skills

`xez-unattended-on`, `xez-unattended-off` and `xez-add-rule`, answered together because they
are one mechanism in three acts.

1. **What request do they serve?** A project running a leader unattended needs three things
   nothing here does: a way to hand it a narrower stop list *deliberately and on the record*, a
   way to get back every decision it made alone, and a way to give it a rule that survives the
   next compaction. The existing skills all act on a PR or an issue; these act on the project's
   own operating contract.
2. **Who decides they worked?** The owner, in the morning. The observation is concrete: the
   mode file's git history shows exactly when the mode was on, and the count of parked
   decisions asked back versus parked decisions written tells you whether the interview is
   doing its job. A morning where the owner says "fine" to everything is the mechanism failing,
   and it is visible in that count.
3. **What do they cost?** Two committed files in an onboarded project (`unattended.json` and a
   `parked.md` in the live campaign), and one growing document: every rule `xez-add-rule` adds
   loads on every session start and every compaction, permanently. Nothing in the collection
   costs a reader anything until invoked.
4. **What would make us remove them?** If the hard stops move into a hook or another
   enforcement point, `xez-unattended-on`'s contract-reading becomes decoration and the pair
   should go. If `parked.md` routinely reaches a length nobody interviews honestly, the
   park-and-continue model is wrong and should be replaced by stopping, not patched.

### A vendored kit is payload, not skill prose

`skills/<name>/kit/**` is excluded from three gates: the tracker-CLI gate, the process-kill
gate and the link checker. The exclusion is a **path** exclusion and nothing else.

A kit is another product's files, copied verbatim into a consumer project by the skill that
carries them. They run under that product's own engine, so they call its tracker directly
rather than naming this collection's operations, and their relative links resolve at the
install location rather than in this tree. Rewriting them to satisfy a checker here would
fork the payload from its source — which is the one thing a vendored copy must not do, since
the version tested would stop being the version installed.

Two things keep this from becoming a hole. Every excluded gate has a deliberate-break case
proving it still fires in the *body* of the very skill that owns a kit, so the exclusion
cannot quietly widen into "that skill is exempt". And the exclusions are three, named, and
listed here: the permanent old-brand ban, the credential-shape gate and the portability gate
still walk every kit file, and kit content that failed them was fixed at source rather than
exempted.

### Admitted: `xez-onboard-opinionated`, and why a second onboarding skill

1. **What request does it serve?** Reproducing one specific way of working — a leader, an
   engine, a campaign record and the rules between them — in a new project. `xez-onboard` is
   deliberately generic and minimal, and `xez-setup-agent-pipeline` configures a pipeline with
   no leader at all. Neither can install an opinion, because being unopinionated is their
   contract.
2. **Who decides it worked?** The setup itself, before it reports success: it dispatches one
   throwaway task end to end, watches it reach a pull request and pass the gates, then cleans
   up. Every part of the setup can pass a part-by-part check while the whole cannot run a task
   — and that failure is otherwise discovered by the first real piece of work, when nobody is
   watching.
3. **What does it cost?** It is the largest skill in the collection: it carries the engine kit
   it installs, roughly a megabyte of workflows, check scripts and role skills. Carried rather
   than fetched, because every skill here carries its own files so it installs standalone, and
   because the version tested is then the version installed. The accepted cost is that
   re-syncing when the engine moves ahead is manual, mitigated by a drift check that **reports**
   and never auto-updates — a file installed into a consumer repository never updates itself.
4. **What would make us remove it?** If the engine's own `init` grows to install a real working
   setup, this skill is duplicating the product and should go. It exists precisely because
   `init` ships placeholders by design.

**Why three narrow limits rather than graceful degradation.** Claude Code only, GitHub only,
clean projects only. Each limit is a claim we can actually keep: the leader design is Claude
Code mechanics, branch protection and the label flow are GitHub mechanics, and merging into an
existing setup is the one thing that could destroy work somebody already did. The stack limit
is the deliberate exception — gate commands are detected from whatever build files exist, so any
stack can onboard, and the description says which stack has actually been tested rather than
refusing the rest. The difference: the tracker decisions were never designed for another
tracker, while the gate mechanism is stack-neutral by construction and only its testing is
narrow.

**Naming, settled deliberately.** They were nearly `xez-autopilot-on` / `-off`. Three reasons
against: `xez-pr-autopilot` already ships and means something else entirely; the `xez-auto-*`
prefix is a behavioural contract meaning *never asks mid-run*, which is the opposite of what
`xez-unattended-off` does; and the lint's prefix check keys on `xez-auto-` **with** the hyphen,
so it would not have caught the confusion. A skill name is a one-way door.

**Deprecation is two steps, never one.** Step one: mark it deprecated, keep it working, say
what to use instead and from when. Step two, in a later release: remove it, with a row in
the ledger of deliberate breaks.

Collapsing the two is how a consumer discovers a removal by having a run fail. The gap
between the steps is the entire value of the process, so a "deprecated and removed in the
same release" is a break with a softer word on it.

## A worker cap, because a worktree is not a sandbox

Skills that run work in parallel bound the number of concurrent workers, and the bound is
about the machine rather than about correctness.

A git worktree isolates the **files**. It does not isolate anything else: the CPU, the
memory, the port a dev server binds, the browser processes a QA run starts, the rate limit
the tracker applies per account, the database the tests connect to. Four agents in four
worktrees are four builds on one machine, competing for all of it — and the failures that
produces look like flaky tests rather than like resource exhaustion, which is why it is
worth saying out loud.

So: a default of no more than a handful of concurrent workers, lowered further when the
work starts servers or browsers, and never raised because "the worktrees are separate".
They are separate in exactly one dimension.

## Gate hygiene: no switch without an owner and a date

Every off-by-default switch gets both **at the moment it is created**, recorded where the
switch is documented:

- `gates.failClosed` — collection maintainers, review 2027-09-20.
- `gates.requireVerdictHead` — collection maintainers, review 2027-09-20.
- `gates.designGate` — collection maintainers, review 2027-09-20.

A switch is a decision postponed. Without an owner there is nobody to ask, and without a
date nobody asks — so the temporary default becomes the permanent behaviour, and in a year
nobody can say whether it was ever revisited or simply forgotten. The same rule already
applies to allowlist entries, which fail the gate when they expire; a switch cannot expire
that way without breaking consumers, so the date is a review rather than an expiry, and the
honesty depends on someone keeping it.

## Every local artifact lives under `.local/xezar/`, and a check says so

The opinionated onboarding skill creates six named subfolders and nothing else at the top of
`.local/xezar/`: `runtime/` engine state and claim files · `tasks/` per-run evidence and phase
records · `worktrees/` task checkouts · `scratch/` throwaway, safe to delete at any time ·
`cache/` anything re-derivable · `qa/` test artefacts. `kit/checks/local-tree.sh` reports a
missing subfolder or a loose entry, and deletes nothing.

Answering the admission gate, because a check is a thing that enters the collection:

1. **What request does it serve?** Keeping an agent's working area legible over months. Nothing
   else in the collection owns the untracked tree; every skill writes into it and none tidies it.
2. **Who decides it worked?** The check itself: it exits 0 on a clean tree and names what is loose
   otherwise. It runs as part of `repository-checks.sh`, the last gate command.
3. **What does it cost?** One directory listing per gate run, and six empty folders in a fresh
   checkout. It is skipped in a linked worktree, which only ever holds the folders it needs.
4. **What would make us remove it?** Nobody reading its output, or the tree staying clean for a
   year without it. Both are visible in the same place: the gate log.

The rule is a **check** rather than a line in a document because a rule about tidiness is exactly
the kind that gets skimmed. The path carries the `xezar/` level deliberately: it keeps the engine's
working area distinct from anything else a project already puts in `.local/`, which is a
conventional user-level directory and not ours to claim whole.

Two consequences worth stating, because each looks like a mistake from the outside:

- **`paths.qa` is set per project, not changed.** The frozen default stays `.local/qa` for every
  existing install; the onboarding skill writes `".local/xezar/qa"` into the new project's own
  config. Flipping the default would be breaking; setting a config value is what config is for.
- **`.local/xezar-tasks` stays spelled that way.** It is the frozen historical evidence root, and
  a sealed manifest stores absolute paths into it. Renaming the literal in code is the bulk move
  the two-roots rule exists to forbid.

## Campaign records are committed, and the bypass that costs

Campaign folders live at `.xezar/campaigns/<yyyymmdd>-<code-name>/` and are committed, because a
record that lives only in an ignored directory dies with the machine and takes the trail of who
decided what with it.

The cost is a bypass: record files are pushed straight to the base branch, so branch protection is
configured **without admin enforcement**. That exemption is scope-free — nothing in the repository
limits it to record files, and two of the three permitted paths are the leader's own governing
files. The owner accepted this on 2026-09-20 in preference to routing every record write through a
pull request. The leader guide states the limit, states that it is a written rule rather than an
enforced one, and names what must never travel that way.

Committing the records also makes them **untrusted input**: anyone who can open a pull request can
put text in front of a privileged session. So the session-start loader wraps them in a
nonce-delimited untrusted-content boundary, defuses any line that imitates its own delimiters,
refuses symlinks by shape rather than judging their targets, and skips a candidate campaign that
carries no readable note — because an empty record is indistinguishable from no campaign at all,
and a name anyone can choose would otherwise blind the leader in one line.

## A pin board for a vendored kit, not a prose checker

A skill that vendors a kit is two halves: its own prose, and payload copied verbatim into every
consumer project. The kit is excluded from three gates by path — it is payload, and the
portability and tracker rules do not fit it — so the two halves can state opposite things while
every gate stays green. That shipped: one file called campaign folders committed while the file
beside it said they never were, and prose promising `decisions.md` is never cut shipped next to a
script that cut it at 8 KB. Six reviewers reading both halves found sixteen such contradictions;
no gate found one.

`scripts/test-kit-facts.mjs` pins six facts that have already caused a contradiction, asserted in
every place that states them.

1. **What request does it serve?** Catching a disagreement between a skill's prose and its
   vendored payload. Nothing else looks at both halves.
2. **Who decides it worked?** Five deliberate-break cases in `test-guards.mjs`, each restoring
   a real defect that shipped. They cover four of the six pins — the campaign commit status, the
   note cap, the loop ceilings and single dispatcher, and the guide headings. The subfolder list
   and the campaign file kinds have no break case yet, so nothing proves those two still fire.
3. **What does it cost?** A few hundred milliseconds per gate run, and a deliberate act whenever
   somebody wants a seventh fact pinned.
4. **What would make us remove it?** The kit ceasing to be vendored, or the pins never firing
   across a year of changes to both halves.

**It deliberately does not compare meaning.** Deciding whether two English sentences agree is the
actual problem and no grep does it. A check that pretended otherwise would pass forever and catch
nothing, which is worse than the gap it replaced, because green would stop meaning anything here.
So the scope is stated in `docs/coverage.md` in the same words: these six cannot silently drift
again; a fact nobody pinned is still unchecked.

The pins are also narrow on purpose. The first draft searched for the word "runtime" near
"campaign" and flagged the sentences saying campaigns are *not* gitignored — the correct ones. A
check that cries wolf gets relaxed, and a relaxed check is a hole with a green tick over it, so
each pin matches the exact shape that shipped wrong rather than the topic it belongs to.
