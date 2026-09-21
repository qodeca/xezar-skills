# Building the routing table

Called from step 4. The routing table is what the leader consults on every single dispatch, and
it is the one artifact this skill **cannot** ship as a file.

## Why it is built here and not shipped

A routing table names lanes: a vendor, an account and a model class. Those exist on a machine,
not in a repository. A shipped table would name accounts that exist somewhere else, and the
failure mode is a first dispatch to an account that does not exist here — after onboarding
reported success.

So the skill ships the table's **shape** and builds its **content** from the lanes the analysis
step actually found.

## What is shipped

- **The rows** — the full set, in [routing-rows.md](routing-rows.md). Forty-five rows over
  eight classes, each carrying the workflow it runs and a written trigger: one
  sentence saying how the leader recognises that this row is the one. A row without a trigger is
  a row the leader guesses at.
- **The global prohibitions**, stated once in `routing-rows.md` rather than repeated per row:
  never the authoring model for its own review; a locally hosted model never touches a branch; a
  cloud-lane write needs another vendor's review; a high-risk change needs a different account
  *and* a different vendor; a provider that does not enforce a step's tool limits is in no
  read-only or security-and-release chain, and one the setup switched off is in no chain at all.
- **The Never column**, which carries only row-specific bans, plus the precedence rule for the
  rows that deliberately overlap. A prohibition that applies everywhere belongs above, not repeated on every row.

## What is built with the owner

**One ordered preference chain per row**, ending in `wait`.

```
review (full cold) → strongest lane → second lane → advisory lane → wait
```

The leader walks the chain top down and takes the first lane whose budget is available. Three
consequences worth stating in the interview:

- **A lane being out is one entry failing, not a new column.** An earlier design had a column
  per lane state; budget is per vendor × account × model class, one vendor's window is shared
  across its models, one model can carry a sub-cap inside that window, and several logins can
  exist per vendor. Columns multiply under all that. Chains do not.
- **`wait` is a real terminator.** When every lane in a chain is unavailable, the work waits.
  There is no invented fallback, and "wait" is never silently replaced by the reserved leader
  login.
- **Adding an account later changes the lane list, never the table's shape.**

## How to ask without a question per row

**One screen, eight classes, then expand.** Each class gets a proposed chain — strongest to cheapest
among the lanes this machine has, ending in `wait`, with the global prohibitions already applied —
and the owner confirms or reorders all of them together. One screen per class was the old shape and
bought nothing: the classes do not depend on each other, so nobody answers the fourth differently
for having answered the third.

Eight classes cover the rows:

| class | rows it covers | what the owner is really choosing |
|---|---|---|
| mechanical | tracker-only work, evidence passes, mechanical docs edits (root-sync sits in this class and takes no chain: the leader does it) | the cheapest lane that can be trusted with it |
| writing | docs with real writing, analysis, specs, research, business analysis, architecture decisions, spikes, deprecation plans | quality of judgement and prose over cost |
| design | designing a surface, its visual layer, the design system, and reviewing a design | a lane that can actually **see** a screen |
| visuals | generated images and illustrations, diagrams and charts | a lane that can make a picture, or get a figure right |
| implementation | bounded fixes and hotfixes, multi-file work, UI work, refactors, migrations, observability, localisation, conflicts, merge chains, dependencies | the working horse of the project |
| testing | automated UI tests, integration tests, the regression suite, performance and load | who can be trusted to write a test that fails for the right reason |
| review | scoped re-checks, full cold reviews, review responses, browser QA, architecture review, acceptance verification | who is allowed to judge whose work |
| security and release | security-sensitive review, verifying a strong claim, the release role, deploy and rollback | the strongest lane, and never the author's |

**Why design and visuals are their own classes.** They were rows inside `writing` and `review`, and
that made the wrong lane look acceptable. Design work needs a lane that can look at a screen, which
is nothing to do with how well a lane writes prose; and a picture that must be *invented* needs a
different capability from a figure that must be *correct*. Folding either into a prose class means
one ranking decides both, and the one that loses is the one nobody checks.

**Why testing is a class, and where it bends.** Writing a test that fails for the right reason is a
different skill from writing the feature, and a lane that is good at one is often careless at the
other. One row inside the class needs more than that: automated UI tests need a lane that can see a
screen and drive a browser. That is a row-level ban in the table, not an eighth-and-a-half class —
the ranking still holds for the row, minus the lanes that cannot do it.

The row-to-class mapping is in the `Class` column of [routing-rows.md](routing-rows.md), so the
expansion is a lookup rather than a judgement.

The owner confirms or reorders the proposed chains on that one screen. The skill then expands
them into the full row set, applies the global prohibitions, and **shows the whole table for
row-level edits** — the last screen of the interview. Most rows will be right; the two or three
that are not are exactly the ones worth a minute.

## Budget is not in this table

Routing is preference; budget is availability. The leader keeps a separate budget table keyed by
tool × account, and dispatch filters the chain through it. Two rules the interview should state
because they decide behaviour at 03:00:

- **Unlimited lanes are exempt** from budget tracking entirely.
- **Unknown is never "out" and never "fine".** A quota entry carries a reset time and expires to
  `unknown`, which means the next real dispatch that prefers that lane finds out. Nothing probes
  in a loop: a probe *is* a first use, and a first use opens a fresh window.

## What is recorded where

The committed half of the manifest records the table's **shape** — which lanes exist, how rows
map to classes. Account names and profile values go to the gitignored half. A teammate cloning
the repository gets a table that explains the project's routing policy without naming anybody's
logins.
