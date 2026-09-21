# The shipped routing rows

Loaded by `routing-interview.md`. These are the **rows** — the part of the routing table that is
the same in every project. The chain column is empty on purpose: it is built with the owner from
the lanes the analysis step found on this machine.

Never write a model or an account name into this file. A lane exists on a machine, not in a
repository, and a shipped lane name is a first dispatch to something that is not there.

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
4. **A high-risk change needs a different account *and* a different vendor** from the author.

## The thirty-five rows

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
| 9 | UX / UI design: a surface proposed, with every state | `design.yaml` | A surface has to be designed before anything is implemented — the flow, what is seen first, every state. | design | a lane that cannot see pictures |
| 10 | Design review: judging screens and pictures | `design-review.yaml` | The verdict depends on looking at a rendered screen or a mockup. | design | any lane that cannot see pictures; **the lane that authored the design** |
| 11 | Generated images and illustrations | `visual-asset.yaml` | Documentation or a design needs a picture that does not exist yet and has to be **invented**. A deterministic screenshot capture is tooling, **not** this row. | visuals | every lane without image generation |
| 12 | Diagrams and charts | `visual-asset.yaml` | Structure or data has to be **drawn**: an architecture diagram, a sequence, a chart from real numbers. Usually authored as text — Mermaid, SVG, a plotting script — so a lane with no image generation can still do it, and the figure has to be *correct* before it is handsome. | visuals | a lane that cannot read the data it is charting |
| 13 | Bounded bug fix: one file, tests named | `bug-fix.yaml` | The failing test and the file are both already known. | implementation | a lane with a known weakness on small precise edits |
| 14 | Multi-file implementation, not UI | `feature-implementation.yaml` | The change spans files and the design is settled. | implementation | a locally hosted lane; a single mid lane with no review |
| 15 | UI implementation | `feature-implementation.yaml` | The change alters what a person sees on a screen. | implementation | a locally hosted lane; any lane that cannot see pictures |
| 16 | Kit / checks refactor | `feature-implementation.yaml` | The change is to the pipeline's own tooling rather than the product. | implementation | a locally hosted lane |
| 17 | Conflict repair | `integration.yaml` | A merge stopped on a conflict and the resolution needs judgement. | implementation | an image-only lane |
| 18 | Merge chain (integration) | `integration.yaml` | Several approved PRs must land in order. | implementation | the strongest lanes; a locally hosted lane |
| 19 | Dependency maintenance | `dependency-maintenance.yaml` | A dependency bump, with the gate as the judge. | implementation | — |
| 20 | Scoped code re-check | `code-review.yaml` | One earlier finding is being re-checked, not the whole diff. | review | the cheapest lanes; **whichever lane authored the change** |
| 21 | Full cold code review | `code-review.yaml` | The reviewer opens the diff with no prior context. | review | the cheapest lanes; a locally hosted lane; **the lane that wrote the change** |
| 22 | Review response, one verdict | `address-review-findings.yaml` | One verdict has to be answered or fixed. | review | — |
| 23 | Review response folding several verdicts | `address-review-findings.yaml` | Several verdicts disagree, or they interact. | review | the cheapest lanes; a locally hosted lane |
| 24 | Browser / manual QA | `qa.yaml` | The check needs a live multi-step run in a browser. | review | a locally hosted lane |
| 25 | Security-sensitive review | `code-review.yaml` | The diff touches authentication, secrets, permissions, or anything reachable from outside. | security and release | a locally hosted lane; an advisory-only lane |
| 26 | Verifying a strong claim from a weaker lane | `code-review.yaml` | A cheaper lane reported something serious and nothing has confirmed it. | security and release | the author; the claimant |
| 27 | Release role | `release.yaml`, `release-prep.yaml` | The owner gave the release go, quoting the commit. | security and release | — |
| 28 | Architecture decision: something that outlives a feature | `architecture.yaml` | The question is how the system is cut, what owns what, or a quality the whole must hold — and the answer will bind work beyond this one feature. | writing | the cheapest lanes — a wrong decision is inherited by everything built after it |
| 29 | Architecture review | `architecture-review.yaml` | A plan, a spec or a diff has to be judged against the recorded architecture decisions. | review | the cheapest lanes; **the lane that wrote the design** |
| 30 | Design system: created, extended or corrected | `design-system.yaml` | The change is to what every design is built from — a token, a component, a page of the system — not to one feature. | design | a lane that cannot see pictures |
| 31 | UI design: the visual layer of a designed surface | `ui-design.yaml` | The flow has already landed and the surface now needs its look: components, tokens, layout, every state in both themes. | design | a lane that cannot see pictures |
| 32 | Automated UI tests: built or maintained | `ui-tests.yaml` | A user-visible behaviour has to be protected by a test that drives the real interface in a browser, again and again, with nobody watching. | testing | any lane that cannot see pictures; a lane on a machine with no browser descriptor; a locally hosted lane |
| 33 | Integration tests: two real parts across a boundary | `integration-tests.yaml` | The thing to prove is that two parts work together — a handler and its database, a client and an API, a command and the file system — not that one part works alone. | testing | a locally hosted lane |
| 34 | Regression suite: curated | `regression-suite.yaml` | The job is the suite that pins past bugs: fixes with no test that fails without them, tests that guard nothing, or a test to retire. | testing | the cheapest lanes — a test that passes either way looks exactly like a good one |
| 35 | Performance and load: measured against a budget | `performance.yaml` | The question is whether something is fast enough, and the owner has stated the budget it answers to. | testing | a lane on a shared or noisy machine; a locally hosted lane |

**When two triggers both match, take the more specific row.** Several rows overlap on purpose —
row 25 (security-sensitive) is a *subset* of row 21 (full cold review), and row 26 is a subset of
row 25. Without this rule a cold review of an authentication diff routes to row 21 and quietly
loses the security chain. When two rows are equally specific, take the later one.

Three pairs need saying out loud, because their triggers read alike:

- **20 vs 22.** Row 20 *judges* — is this earlier finding actually fixed? Row 22 *changes code* to
  answer a verdict. Judging goes to the review workflow, fixing goes to the response workflow.
- **17 vs 18.** A merge chain that hits a conflict is row 17, not row 18, for as long as the
  conflict is open. Row 18 bans the strongest lanes; a conflict needs judgement, so routing it as
  18 bans exactly the lane the work requires.
- **11 vs 12.** A picture that has to be *invented* is row 11 and needs a lane that can generate
  images. A figure that has to be *correct* — a diagram of what exists, a chart of real numbers —
  is row 12, and the lane that draws it best is usually the one that reads the data best, not the
  one with an image model. Routing a chart as row 11 gets a handsome picture of the wrong numbers.

## Filling the chain column

The owner ranks the available lanes **once per class**, not once per row. One question per class covers every
row. Expand the answers down the table, apply the global prohibitions above, then show
the whole table for row-level edits — most rows will be right, and the two or three that are not
are exactly the ones worth a minute.

Every chain ends in `wait`. `wait` is a real terminator: when every lane in a chain is unavailable,
the work waits. There is no invented fallback, and `wait` is never silently replaced by the
reserved leader login.
