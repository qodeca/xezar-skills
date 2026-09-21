# What is actually checked

An inventory, not a gate. It exists so a reader can see where the checking is thin, and it
is deliberately **not** enforced: a coverage number that must not go down turns into tests
written to raise it, and those tests protect the number rather than the behaviour.

Ranked by what breaking it would cost, not by how much code it touches. Counts measured
2026-09-20; they move whenever a gate gains a case, so re-read them from the gate's own output
rather than trusting this table for a precise number.

| # | Behaviour | Checked by | Runs in CI? |
|---|---|---|---|
| 1 | A merge cannot land a commit no gate saw | `test-merge-gate.mjs` — 51 assertions incl. moved head, empty required set, absent label | ✅ |
| 2 | Missing evidence never reads as a pass | `test-gate-status.mjs` — 51 assertions, ending in a sweep over every shape of missing input | ✅ |
| 3 | Every guard still catches the defect it was written for | `test-guards.mjs` — 46 deliberate defects | ✅ |
| 4 | Skills stay portable and free of unsafe commands | `lint.sh` — base branch, package manager, `pkill`, credential-shaped values | ✅ |
| 5 | The chaining lines one skill hands the next still parse | `test-chaining-lines.mjs` — 225 assertions, incl. a renamed-label case | ✅ |
| 6 | Shared safety text has not drifted across its copies | `test-shared-blocks.mjs` + the generator's clause floor | ✅ |
| 7 | A tracker descriptor implements every operation skills name | `test-tracker-providers.mjs` — 47 operations × 4 providers | ✅ |
| 8 | A toolchain or security provider degrades where it cannot act | `test-toolchain-providers.mjs` — 12 parity cells | ✅ |
| 9 | A browser provider implements every operation, on every platform | `test-browser-providers.mjs` | ✅ |
| 10 | Every pointer between documents resolves | `check-links.mjs` — 439 documents | ✅ |
| 11 | The gate list means the same thing in all four places | `check-gate-list.mjs` | ✅ |
| 12 | Every gate exception has an owner and an expiry | `check-allowlists.mjs` | ✅ |
| 13 | Labels mean the same thing in every repository | `check-label-taxonomy.mjs` | ✅ |
| 14 | The P6 skills carry no project-specific instruction | `check:generic-instructions` + its own guard test | ✅ |
| 15 | A skill body stays inside its per-run token budget | `lint.sh` load-budget gate | ✅ |
| 16 | Close-keyword configurability | `test-close-keywords.mjs` | ✅ |
| 17 | Pipeline-retro classification rules | `test-classify-runs.mjs` | ✅ |
| 18 | Onboarding portability and credential boundaries | `test-onboarding-content.mjs` | ✅ |
| 19 | Discovery contracts | `test-discovery-contracts.mjs`, invoked by `lint.sh` | ✅ |
| 20 | A skill actually works end to end under a real coding agent | `test:agent-browser-codex` | ❌ — needs the `codex` CLI and a full-access sandbox |
| 21 | Vendored kit payload cannot widen a gate for the rest of the collection | `test-guards.mjs` — two cases proving the `kit/` exclusion is a path exclusion only | ✅ |
| 22 | Named facts agree between a skill's prose and the kit it vendors | `test-kit-facts.mjs` — 11 pinned facts | ✅ |
| 23 | One minimum engine version across the bootstrap prompt, the preflight and the skill card; the prompt keeps its seven safety rules | `test-compat-pins.mjs`, against `compat.json` | ✅ |
| 24 | The onboarding kit's workflows and role skills load under the kit's own validator, every workflow has a routing row, the maintained-skill list is the skill directory, and every row and class count in prose is the table's | `test-kit-catalog.mjs` | ✅ — proves a workflow loads and can be selected, **not** that it runs |

## What this says

**The thin row is 20.** Twenty-three checks read what the skills *say*; one runs a
skill and watches what it *does*, and that one cannot run in CI — it needs a CLI and a
sandbox with full access, and granting a pull request's own code full access is exactly
what CI must not do.

**Row 22 is a pin board, not a proof.** The opinionated onboarding skill carries about a
megabyte of vendored payload under `skills/<name>/kit/`, excluded from three gates by path. Its
prose half and its payload half can state opposite things and every other gate stays green — that
is not hypothetical, it shipped: one file said campaign folders were committed while the file
beside it said they never were, and prose promising `decisions.md` is never cut shipped alongside
a script that cut it at 8 KB.

`test-kit-facts.mjs` now pins ten facts that already caused such a contradiction, asserted in
every place that states them. **What it does not do is compare meaning.** Deciding whether two
English sentences agree is the actual problem, and no grep does it. So a fact nobody pinned is
still unchecked, and adding a pin is a deliberate act — the check cannot discover the next
contradiction on its own, only re-catch the kinds it was taught. The honest scope is: these six
cannot silently drift again.

So: everything above the line is a check on instructions. That is worth a great deal for a
collection whose deliverable *is* instructions, and it is not the same as knowing the
instructions work. The honest summary is that this repository is well protected against
saying the wrong thing and lightly protected against the right thing not working.

The gap is recorded rather than papered over, and the one check kept out of CI is
recorded in `scripts/allowlists.json` with an owner and an expiry date.

## Why there is no floor

Three reasons, in order:

1. **A floor is satisfiable by the wrong work.** The cheapest way to raise a number is to
   test something already covered, and the cheapest way to stop it falling is to not delete
   a test that no longer checks anything.
2. **The number does not distinguish row 1 from row 18.** Losing the merge-gate test and
   losing the onboarding-content test move it identically. Ranking by cost does not.
3. **It would be a gate on a proxy.** Every other gate in this repository is bound to
   captured evidence; a coverage percentage is bound to line counts, and treating it as a
   gate would be the one place the collection did what it tells everyone else not to.

This table is maintained by hand and reviewed when a check is added or removed. That is
the cost, and it is accepted.
