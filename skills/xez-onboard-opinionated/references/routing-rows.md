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
| **Class** | which of the five interview questions sets this row's chain |
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

## The twenty-six rows

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
| 9 | UX mockups | `design.yaml` | A screen has to be proposed before anything is implemented. | writing | a lane that cannot see pictures |
| 10 | Generated images | `design.yaml` | Documentation or a design needs an image that does not exist yet. A deterministic screenshot capture is tooling, **not** this row. | writing | every lane without image generation |
| 11 | Bounded bug fix: one file, tests named | `bug-fix.yaml` | The failing test and the file are both already known. | implementation | a lane with a known weakness on small precise edits |
| 12 | Multi-file implementation, not UI | `feature-implementation.yaml` | The change spans files and the design is settled. | implementation | a locally hosted lane; a single mid lane with no review |
| 13 | UI implementation | `feature-implementation.yaml` | The change alters what a person sees on a screen. | implementation | a locally hosted lane; any lane that cannot see pictures |
| 14 | Kit / checks refactor | `feature-implementation.yaml` | The change is to the pipeline's own tooling rather than the product. | implementation | a locally hosted lane |
| 15 | Conflict repair | `integration.yaml` | A merge stopped on a conflict and the resolution needs judgement. | implementation | an image-only lane |
| 16 | Merge chain (integration) | `integration.yaml` | Several approved PRs must land in order. | implementation | the strongest lanes; a locally hosted lane |
| 17 | Dependency maintenance | `dependency-maintenance.yaml` | A dependency bump, with the gate as the judge. | implementation | — |
| 18 | Scoped code re-check | `code-review.yaml` | One earlier finding is being re-checked, not the whole diff. | review | the cheapest lanes; **whichever lane authored the change** |
| 19 | Full cold code review | `code-review.yaml` | The reviewer opens the diff with no prior context. | review | the cheapest lanes; a locally hosted lane; **the lane that wrote the change** |
| 20 | Review response, one verdict | `address-review-findings.yaml` | One verdict has to be answered or fixed. | review | — |
| 21 | Review response folding several verdicts | `address-review-findings.yaml` | Several verdicts disagree, or they interact. | review | the cheapest lanes; a locally hosted lane |
| 22 | Design review: judging screens and pictures | `design-review.yaml` | The verdict depends on looking at a rendered screen. | review | any lane that cannot see pictures |
| 23 | Browser / manual QA | `qa.yaml` | The check needs a live multi-step run in a browser. | review | a locally hosted lane |
| 24 | Security-sensitive review | `code-review.yaml` | The diff touches authentication, secrets, permissions, or anything reachable from outside. | security and release | a locally hosted lane; an advisory-only lane |
| 25 | Verifying a strong claim from a weaker lane | `code-review.yaml` | A cheaper lane reported something serious and nothing has confirmed it. | security and release | the author; the claimant |
| 26 | Release role | `release.yaml`, `release-prep.yaml` | The owner gave the release go, quoting the commit. | security and release | — |

**When two triggers both match, take the more specific row.** Several rows overlap on purpose —
row 24 (security-sensitive) is a *subset* of row 19 (full cold review), and row 25 is a subset of
row 24. Without this rule a cold review of an authentication diff routes to row 19 and quietly
loses the security chain. When two rows are equally specific, take the later one.

Two pairs need saying out loud, because their triggers read alike:

- **18 vs 20.** Row 18 *judges* — is this earlier finding actually fixed? Row 20 *changes code* to
  answer a verdict. Judging goes to the review workflow, fixing goes to the response workflow.
- **15 vs 16.** A merge chain that hits a conflict is row 15, not row 16, for as long as the
  conflict is open. Row 16 bans the strongest lanes; a conflict needs judgement, so routing it as
  16 bans exactly the lane the work requires.

## Filling the chain column

The owner ranks the available lanes **once per class**, not once per row. Five questions cover all
twenty-six rows. Expand the answers down the table, apply the global prohibitions above, then show
the whole table for row-level edits — most rows will be right, and the two or three that are not
are exactly the ones worth a minute.

Every chain ends in `wait`. `wait` is a real terminator: when every lane in a chain is unavailable,
the work waits. There is no invented fallback, and `wait` is never silently replaced by the
reserved leader login.
