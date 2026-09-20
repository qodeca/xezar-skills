# Improvement register

Where ideas for changing this collection wait, and where most of them stop.

The register exists because good ideas arrive faster than they can be done well, and a list
with no admission bar turns into a backlog nobody reads — which is the same as no list, but
with a maintenance cost.

## The admission bar

An entry is admitted only when it answers all four questions in writing. These are the same
four the admission gate in `DECISIONS.md` applies, and an entry that cannot answer them is
not rejected — it is **not yet an entry**.

1. **What request does it serve that nothing here serves today?**
2. **Who decides it worked, and by what observation?** A named person or role, and an
   observation someone could actually make.
3. **What does it cost** every run, every reader, or every consumer repository?
4. **What would make us remove it again?**

Question 4 is the one that does the filtering. An idea with no removal condition is a
permanent addition, and it has to be admitted on that basis or not at all.

## Status vocabulary

| Status | Meaning |
|---|---|
| **open** | Admitted, not started. |
| **in progress** | Being done now, with the PR or branch named. |
| **done** | Shipped. The row keeps its evidence and stops changing. |
| **declined** | Considered and refused, with the reason and the trigger that would reopen it. |
| **deferred** | Worth doing, not now, with what would make it now. |

A declined entry is never deleted. Deleting it guarantees the idea comes back, is
re-argued from scratch, and is possibly decided the other way by someone who never saw the
reasoning.

## Feeding the register

- **`xez-pipeline-retro`** classifies finished runs and ranks causes by the wall-clock hours
  they cost. Its top cause is the highest-quality input this register gets, because it comes
  with a measurement rather than an impression.
- **A review finding that keeps recurring** across unrelated pull requests is a process
  problem wearing a code problem's clothes.
- **Anything that cost real time twice.** Once is bad luck.

An idea that arrives with none of these behind it answers question 2 with "nobody has
observed this yet", which is a fair answer and usually means **deferred**.

## Entries

| # | Idea | Status | Evidence / reason | Removal condition |
|---|---|---|---|---|
| 1 | The dogfooding study of this collection against a production pipeline — 53 findings, of which 51 were adopted across releases 1.0.1 through 2.3 | **done** | `docs/research/dogfooding-xezar.md`; the coverage table in `docs/improvement-plan.md` maps every finding to where it landed or why it did not | n/a — the work shipped; the study stays as a dated record |
| 2 | `xez-analyze-request`, a front door that classifies an incoming request and routes it | **declined** | Overlaps `xez-brainstorm`, `xez-prepare-issue` and `xez-pr-autopilot`, each of which also does the next step rather than handing back a classification. Full reasoning in `DECISIONS.md` | Reopen on a real run that none of the three accepts, or repeated mis-routing between them |
| 3 | A coverage floor enforced in CI | **declined** | `docs/coverage.md` explains why: satisfiable by the wrong work, cannot tell row 1 from row 18, and would be the one gate here bound to a proxy | Reopen if a real regression ships through an area the inventory shows as uncovered |
| 4 | A per-step evidence file alongside the per-run verification record | **declined** | The product that invented it built it and removed it as noise. The per-run record ships | Reopen if a post-mortem needs step-level evidence that the per-run record cannot give |
| 5 | Read-only enforcement by tool grant rather than by instruction | **declined** | Tool grants are not portable across the 22+ agents this collection installs into, so the rule would hold in some installs and silently not in others | Reopen if a portable capability model appears across the major agents |

Entry 1 is the register's first entry on purpose: the study is what produced most of what
this collection now checks, and recording it as an entry rather than as history is the
difference between a register and a scrapbook.
