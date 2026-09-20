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

- **The rows** — the full set, in [routing-rows.md](routing-rows.md). Twenty-six rows over
  roughly two dozen task kinds, each carrying the workflow it runs and a written trigger: one
  sentence saying how the leader recognises that this row is the one. A row without a trigger is
  a row the leader guesses at.
- **The global prohibitions**, stated once in `routing-rows.md` rather than repeated per row:
  never the authoring model for its own review; a locally hosted model never touches a branch; a
  cloud-lane write needs another vendor's review; a high-risk change needs a different account
  *and* a different vendor.
- **The Never column**, which carries only row-specific bans, plus the precedence rule for the
  rows that deliberately overlap. A prohibition that applies everywhere belongs above, not repeated twenty-six times.

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

## How to ask without twenty-six questions

Ask **per task class**, then expand. Five classes cover the rows:

| class | rows it covers | what the owner is really choosing |
|---|---|---|
| mechanical | tracker-only work, evidence passes, mechanical docs edits, root-sync | the cheapest lane that can be trusted with it |
| writing | docs with real writing, analysis, specs, research | quality of prose over cost |
| implementation | bounded fixes, multi-file work, UI work, kit refactors | the working horse of the project |
| review | scoped re-checks, full cold reviews, review responses | who is allowed to judge whose work |
| security and release | security-sensitive review, verifying a strong claim, the release role | the strongest lane, and never the author's |

The row-to-class mapping is in the `Class` column of [routing-rows.md](routing-rows.md), so the
expansion is a lookup rather than a judgement.

The owner ranks the available lanes once per class. The skill expands that into the full row set,
applies the global prohibitions, and then **shows the whole table for row-level edits**. Most
rows will be right; the two or three that are not are exactly the ones worth a minute.

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
