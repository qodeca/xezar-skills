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
| 3 | Every guard still catches the defect it was written for | `test-guards.mjs` — 23 deliberate defects | ✅ |
| 4 | Skills stay portable and free of unsafe commands | `lint.sh` — base branch, package manager, `pkill`, credential-shaped values | ✅ |
| 5 | The chaining lines one skill hands the next still parse | `test-chaining-lines.mjs` — 215 assertions, incl. a renamed-label case | ✅ |
| 6 | Shared safety text has not drifted across its copies | `test-shared-blocks.mjs` + the generator's clause floor | ✅ |
| 7 | A tracker descriptor implements every operation skills name | `test-tracker-providers.mjs` — 46 operations × 4 providers | ✅ |
| 8 | A toolchain or security provider degrades where it cannot act | `test-toolchain-providers.mjs` — 12 parity cells | ✅ |
| 9 | A browser provider implements every operation, on every platform | `test-browser-providers.mjs` | ✅ |
| 10 | Every pointer between documents resolves | `check-links.mjs` — 404 documents | ✅ |
| 11 | The gate list means the same thing in all four places | `check-gate-list.mjs` | ✅ |
| 12 | Every gate exception has an owner and an expiry | `check-allowlists.mjs` | ✅ |
| 13 | Labels mean the same thing in every repository | `check-label-taxonomy.mjs` | ✅ |
| 14 | The P6 skills carry no project-specific instruction | `check:generic-instructions` + its own guard test | ✅ |
| 15 | A skill body stays inside its per-run token budget | `lint.sh` load-budget gate | ✅ |
| 16 | Close-keyword configurability | `test-close-keywords.mjs` | ✅ |
| 17 | Pipeline-retro classification rules | `test-classify-runs.mjs` | ✅ |
| 18 | Onboarding native-token boundaries | `test-onboarding-content.mjs` | ✅ |
| 19 | Discovery contracts | `test-discovery-contracts.mjs`, invoked by `lint.sh` | ✅ |
| 20 | A skill actually works end to end under a real coding agent | `test:agent-browser-codex` | ❌ — needs the `codex` CLI and a full-access sandbox |

## What this says

**The thin row is the last one.** Nineteen checks read what the skills *say*; one runs a
skill and watches what it *does*, and that one cannot run in CI — it needs a CLI and a
sandbox with full access, and granting a pull request's own code full access is exactly
what CI must not do.

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
