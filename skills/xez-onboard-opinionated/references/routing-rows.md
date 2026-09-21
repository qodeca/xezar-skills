# The shipped routing rows

Loaded by `routing-interview.md`. These are the **rows** — the part of the routing table that is
the same in every project. The chain column is empty on purpose: it is built with the owner from
the lanes the analysis step found on this machine.

Never write a model or an account name into this file. A lane is a tool plus a model
(`<tool>/<model>`), it exists on a machine, not in a repository, and a shipped lane name is a
first dispatch to something that is not there. Logins are not lanes: they are the rotation under
a tool (`routing-interview.md`).

## How to read a row

| column | what it holds |
|---|---|
| **Task kind** | the row's identity; several kinds may share a workflow |
| **Workflow** | the shipped workflow file the leader runs for this kind |
| **Trigger** | one sentence saying how the leader recognises that this row is the one |
| **Class** | which class question on the routing screen sets this row's chain |
| **Never** | row-specific bans only — a prohibition that holds everywhere is stated once above, not repeated per row |

A row without a trigger is a row the leader guesses at, so every row carries one.

**"Strongest" and "cheapest" are about the lanes this machine has**, ranked in the routing
interview — not about any particular vendor or model. The chain column, once filled, is what makes
them concrete.

## Global prohibitions

Stated once here, never repeated per row. They apply to every row and they override a chain:

1. **Never the authoring model for its own review.** A model does not judge what it wrote.
2. **A locally hosted model never touches a branch.** It may read and advise; it may not write.
3. **A cloud-lane write needs another vendor's review** before it can merge.
4. **A high-risk change needs a different vendor** from the author — which is always a different
   login as well. Rotating to another login of the *same* vendor never satisfies this.
5. **A provider that does not enforce a step's tool limits is in no chain for a read-only or a
   security-and-release row** — a tool allowlist is the only thing that makes a read-only role
   read-only, and a deploy step's two permitted writers the only thing that bounds it. This holds
   when somebody switches such a provider back on. A provider the setup switched off is in no
   chain at all.

## The forty-five rows

| # | Task kind | Workflow | Trigger | Class | Never |
|---|---|---|---|---|---|
| 1 | Tracker only: labels, comments from a file, issue filing | `issue-triage.yaml` | The whole change is tracker state; no file in the repository changes. | mechanical | the strongest lanes — this work cannot justify them |
| 2 | Re-check of one record against one comment | `issue-triage.yaml` | A single comment claims one record is wrong, and the check is reading two things and comparing them. | mechanical | the strongest lanes |
| 3 | Evidence pass: gate evidence, phase record, close-out audit | `testing-and-verification.yaml` | The work is collecting what already happened into a record; nothing new is decided. | mechanical | the strongest lanes |
| 4 | Mechanical docs edits | `docs-maintenance.yaml` | Paths, counts, renames, link fixes — no sentence has to be composed. | mechanical | an image-capable lane; nothing here needs it |
| 5 | Root-sync (fast-forward only) | `root-sync.yaml` | The base branch moved and the checkout only has to catch up. | mechanical | any dispatch at all — the leader does this itself |
| 6 | Docs PR with real writing | `docs-maintenance.yaml` | Someone has to decide what the paragraph says, not just where it points. | writing | — |
| 7 | Analysis, specs, research | `research.yaml`, `plan-and-spec.yaml` | The output is a judgement or a design, and the work is larger than one file. | writing | the cheapest lanes — the failure is invisible and expensive |
| 8 | Business analysis | `business-analysis.yaml` | The question is about what to build or why, not how. | writing | the cheapest lanes |
| 9 | Architecture decision: something that outlives a feature | `architecture.yaml` | The question is how the system is cut, what owns what, or a quality the whole must hold — and the answer will bind work beyond this one feature. | writing | the cheapest lanes — a wrong decision is inherited by everything built after it |
| 10 | Spike: one open technical question, answered by trying | `spike.yaml` | Somebody cannot decide until they know whether something is possible, how hard it is or how it behaves, and the way to find out is to try it. | writing | the cheapest lanes — an over-confident answer is worse than none |
| 11 | Deprecation plan | `deprecation-plan.yaml` | Something people depend on has to be retired, and nothing may be removed until who is affected, the replacement and the dates are written down. | writing | the cheapest lanes |
| 12 | UX / UI design: a surface proposed, with every state | `design.yaml` | A surface has to be designed before anything is implemented — the flow, what is seen first, every state. | design | a lane that cannot see pictures |
| 13 | Design review: judging screens and pictures | `design-review.yaml` | The verdict depends on looking at a rendered screen or a mockup. | design | any lane that cannot see pictures; **the lane that authored the design** |
| 14 | Design system: created, extended or corrected | `design-system.yaml` | The change is to what every design is built from — a token, a component, a page of the system — not to one feature. | design | a lane that cannot see pictures |
| 15 | UI design: the visual layer of a designed surface | `ui-design.yaml` | The flow has already landed and the surface now needs its look: components, tokens, layout, every state in both themes. | design | a lane that cannot see pictures |
| 16 | Generated images and illustrations | `visual-asset.yaml` | Documentation or a design needs a picture that does not exist yet and has to be **invented**. A deterministic screenshot capture is tooling, **not** this row. | visuals | every lane without image generation |
| 17 | Diagrams and charts | `visual-asset.yaml` | Structure or data has to be **drawn**: an architecture diagram, a sequence, a chart from real numbers. Usually authored as text — Mermaid, SVG, a plotting script — so a lane with no image generation can still do it, and the figure has to be *correct* before it is handsome. | visuals | a lane that cannot read the data it is charting |
| 18 | Bounded bug fix: one file, tests named | `bug-fix.yaml` | The failing test and the file are both already known. | implementation | a lane with a known weakness on small precise edits |
| 19 | Multi-file implementation, not UI | `feature-implementation.yaml` | The change spans files and the design is settled. | implementation | a locally hosted lane; a single mid lane with no review |
| 20 | UI implementation | `feature-implementation.yaml` | The change alters what a person sees on a screen. | implementation | a locally hosted lane; any lane that cannot see pictures |
| 21 | Kit / checks refactor | `feature-implementation.yaml` | The change is to the pipeline's own tooling rather than the product. | implementation | a locally hosted lane |
| 22 | Conflict repair | `integration.yaml` | A merge stopped on a conflict and the resolution needs judgement. | implementation | an image-only lane |
| 23 | Merge chain (integration) | `integration.yaml` | Several approved PRs must land in order. | implementation | the strongest lanes; a locally hosted lane |
| 24 | Dependency maintenance | `dependency-maintenance.yaml` | A dependency bump, with the gate as the judge. | implementation | — |
| 25 | Hotfix: a live fault, the narrowest fix now | `hotfix.yaml` | People are hitting the fault right now, and waiting for the full fix costs more than shipping a narrow one and following up. | implementation | a lane with a known weakness on small precise edits; a locally hosted lane |
| 26 | Refactor: structure changes, behaviour does not | `refactor.yaml` | The product's code has to be restructured and nothing a user or a caller can observe may change. | implementation | a locally hosted lane; a single mid lane with no review |
| 27 | Migration: data, a schema or a format changes shape | `migration.yaml` | Something that already exists outside the code — rows, files, a config people wrote by hand — has to move to a new shape. | implementation | a locally hosted lane; the cheapest lanes — it cannot be reverted the way code can |
| 28 | Observability: logs, metrics, alerts, runbooks | `observability.yaml` | People cannot tell what a part of the system is doing, and the change adds signals and changes no behaviour. | implementation | a locally hosted lane |
| 29 | Localisation: translatable text, a listed locale | `localisation.yaml` | Text has to become translatable, or a language the owner has listed has to be added or brought up to date. | implementation | a lane that cannot see pictures — a translated layout has to be looked at |
| 30 | Automated UI tests: built or maintained | `ui-tests.yaml` | A user-visible behaviour has to be protected by a test that drives the real interface in a browser, again and again, with nobody watching. | testing | any lane that cannot see pictures; a locally hosted lane |
| 31 | Integration tests: two real parts across a boundary | `integration-tests.yaml` | The thing to prove is that two parts work together — a handler and its database, a client and an API, a command and the file system — not that one part works alone. | testing | a locally hosted lane |
| 32 | Regression suite: curated | `regression-suite.yaml` | The job is the suite that pins past bugs: fixes with no test that fails without them, tests that guard nothing, or a test to retire. | testing | the cheapest lanes — a test that passes either way looks exactly like a good one |
| 33 | Performance and load: measured against a budget | `performance.yaml` | The question is whether something is fast enough, and the owner has stated the budget it answers to. | testing | a lane on a shared or noisy machine; a locally hosted lane |
| 34 | Scoped code re-check | `code-review.yaml` | One earlier finding is being re-checked, not the whole diff. | review | the cheapest lanes; **whichever lane authored the change** |
| 35 | Full cold code review | `code-review.yaml` | The reviewer opens the diff with no prior context. | review | the cheapest lanes; a locally hosted lane; **the lane that wrote the change** |
| 36 | Review response, one verdict | `address-review-findings.yaml` | One verdict has to be answered or fixed. | review | — |
| 37 | Review response folding several verdicts | `address-review-findings.yaml` | Several verdicts disagree, or they interact. | review | the cheapest lanes; a locally hosted lane |
| 38 | Browser / manual QA | `qa.yaml` | The check needs a live multi-step run in a browser. | review | a locally hosted lane |
| 39 | Architecture review | `architecture-review.yaml` | A plan, a spec or a diff has to be judged against the recorded architecture decisions. | review | the cheapest lanes; **the lane that wrote the design** |
| 40 | Acceptance verification | `acceptance-verification.yaml` | A finished change has to be checked against each accepted criterion of its issue, one by one, by running it. | review | the cheapest lanes; **the lane that wrote the change** |
| 41 | Security-sensitive review | `security-review.yaml` | The diff touches authentication, secrets, permissions, anything reachable from outside — or what the pipeline itself trusts: a deploy or rollback target, the base branch, a CI workflow, the hook or its loader. The gate's `SECURITY` record says `reviewerRequired` when it is the second kind. | security and release | a locally hosted lane; an advisory-only lane; **the lane that wrote the change** |
| 42 | Verifying a strong claim from a weaker lane | `code-review.yaml` | A cheaper lane reported something serious and nothing has confirmed it. | security and release | the author; the claimant |
| 43 | Release role | `release.yaml`, `release-prep.yaml` | The owner gave the release go, quoting the commit. | security and release | — |
| 44 | Deploy: a sealed commit to a named environment | `deploy.yaml` | The owner gave the go to deploy, naming the environment and quoting the full commit SHA. The leader copies those words into the launch text: it is the only authority the run accepts. | security and release | a locally hosted lane; an advisory-only lane |
| 45 | Rollback: a named environment back to a named revision | `deploy.yaml` | The owner gave the go to roll back, naming the environment and the full SHA to return to — and, in their own words, any one-way migration they accept crossing. The leader copies those words into the launch text. | security and release | a locally hosted lane; an advisory-only lane |

**When two triggers both match, take the more specific row.** Several rows overlap on purpose —
row 42 (verifying a strong claim) is a *subset* of row 35 (full cold review), and a hotfix
(row 25) is a subset of a bounded bug fix (row 18). Without this rule the narrow case
routes to the broad row and quietly loses the chain that was built for it. When two rows are equally
specific, take the later one.

**One overlap is not a choice: a diff that touches a trust boundary gets both.** Row 41
(security-sensitive review) and row 35 (full cold review) run different workflows and judge
different things. The cold review reads the whole change for correctness; the security review asks
what a scanner cannot decide. Neither replaces the other, and a security review that found nothing
is not a code review that passed.

**Row 5 has no chain.** The leader does a root-sync itself; the chain cell holds `leader` and the
class ranking is not expanded into it.

**Rows 13, 39, 40 and 41 judge somebody else's work, and the judge cannot look the author up.** A
step agent cannot read another run's record. So the leader names the author's lane, login and
vendor in the launch text of these four, and the role reports independence as confirmed, not
confirmed or unknown. A launch that leaves them out gets "unknown", never a silent pass.

These pairs need saying out loud, because their triggers read alike:

- **34 vs 36.** Row 34 *judges* — is this earlier finding actually fixed? Row 36 *changes
  code* to answer a verdict. Judging goes to the review workflow, fixing goes to the response
  workflow.
- **22 vs 23.** A merge chain that hits a conflict is row 22, not row 23, for as long as the
  conflict is open. Row 23 bans the strongest lanes; a conflict needs judgement, so routing it as
  23 bans exactly the lane the work requires.
- **16 vs 17.** A picture that has to be *invented* is row 16 and needs a lane that can generate
  images. A figure that has to be *correct* — a diagram of what exists, a chart of real numbers —
  is row 17, and the lane that draws it best is usually the one that reads the data best, not the
  one with an image model. Routing a chart as row 16 gets a handsome picture of the wrong numbers.
- **12 vs 15 vs 14.** Row 12 decides how a person *uses* a surface and comes first. Row 15
  decides what it *looks like* and runs only on a flow that already landed. Row 14 changes what
  every design is built from. A feature request that needs a new component is two tasks, 14 then
  15 — never a component invented inside one feature.
- **18 vs 25.** Both fix a bug. Row 25 is for a fault people are hitting *now*: the
  narrowest change that stops the harm, and a follow-up issue for the real fix. Urgency alone does
  not make a hotfix — if it can wait for the full fix, it is row 18.
- **26 vs 21.** Row 26 restructures the *product's* code with no behaviour change. Row 21
  changes the pipeline's own tooling, where behaviour usually does change.
- **3 vs 30 vs 38.** Row 30 *writes* a browser suite that runs again tomorrow. Row 38
  *runs the change by hand* once and judges it. Row 3 collects what already happened. A request
  to "test the UI" is 38 when it means this change, and 30 when it means from now on.
- **13 vs 38.** Both look at a running screen. Row 13 judges it against the *design* — states,
  tokens, both themes. Row 38 judges whether the change *works*. A screen can be exactly as
  designed and broken, or working and wrong.
- **15 vs 20.** Row 15 writes design files under `paths.designs` and no product code. Row 20
  writes the product code that makes the screen look like them. "Make it look right" is 15 when no
  design says what right is, and 20 when one does.
- **20 vs 29.** Text that changes what a screen *says* in the language it already has is row 20.
  Making text translatable, or adding a listed language, is row 29 — even when every file it
  touches is a UI file.
- **38 vs 40.** QA asks whether the change works and broke nothing. Row 40 asks whether
  it did what the issue asked, criterion by criterion. A change can pass one and fail the other.
- **7 vs 9 vs 10.** Row 7 plans one feature. Row 9 decides something the next ten
  features inherit. Row 10 is for when nobody can decide yet, because nobody knows.
- **43 vs 44 / 45.** A release publishes a version. A deploy puts a commit in front of
  users. Each needs its own go from the owner, and neither implies the other; a rollback (row
  45) needs a go of its own, naming the revision to return to.

## Filling the chain column

The owner ranks the available lanes **once per class**, not once per row. One question per class covers every
row. Expand the answers down the table, apply the global prohibitions above, then show
the whole table for row-level edits — most rows will be right, and the two or three that are not
are exactly the ones worth a minute.

Every chain ends in `wait`. `wait` is a real terminator: when every lane in a chain is unavailable,
the work waits. There is no invented fallback, and `wait` is never silently replaced by the
reserved leader login.
