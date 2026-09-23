# What is actually checked

An inventory, not a gate. It exists so a reader can see where the checking is thin, and it
is deliberately **not** enforced: a coverage number that must not go down turns into tests
written to raise it, and those tests protect the number rather than the behaviour.

Ranked by what breaking it would cost, not by how much code it touches. Counts measured
2026-09-21; they move whenever a gate gains a case, so re-read them from the gate's own output
rather than trusting this table for a precise number.

| # | Behaviour | Checked by | Runs in CI? |
|---|---|---|---|
| 1 | A merge cannot land a commit no gate saw | `test-merge-gate.mjs` — 51 assertions incl. moved head, empty required set, absent label | ✅ |
| 2 | Missing evidence never reads as a pass | `test-gate-status.mjs` — 51 assertions, ending in a sweep over every shape of missing input | ✅ |
| 3 | Every guard still catches the defect it was written for | `test-guards.mjs` — 109 deliberate defects | ✅ |
| 4 | Skills stay portable and free of unsafe commands | `lint.sh` — base branch, package manager, `pkill`, credential-shaped values; inside a vendored `kit/`, paths from the engine's own repository | ✅ |
| 5 | The chaining lines one skill hands the next still parse | `test-chaining-lines.mjs` — 227 assertions, incl. a renamed-label case | ✅ |
| 6 | Shared safety text, and the kit role skills' shared contract, have not drifted across their copies | `test-shared-blocks.mjs` + the generator's clause floor | ✅ |
| 7 | A tracker descriptor implements every operation skills name | `test-tracker-providers.mjs` — 47 operations × 4 providers | ✅ |
| 8 | A toolchain or security provider degrades where it cannot act | `test-toolchain-providers.mjs` — 12 parity cells | ✅ |
| 9 | A browser provider implements every operation, on every platform | `test-browser-providers.mjs` | ✅ |
| 10 | Every pointer between documents resolves | `check-links.mjs` — 442 documents | ✅ |
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
| 22 | Named facts agree between a skill's prose and the kit it vendors | `test-kit-facts.mjs` — 18 pinned facts | ✅ |
| 23 | One minimum engine version across the bootstrap prompt, the preflight and the skill card; the prompt keeps its ten pinned rules | `test-compat-pins.mjs`, against `compat.json` | ✅ |
| 24 | The onboarding kit's workflows and role skills load under the kit's own validator, every workflow has a row in `kit/routing.json`, the file passes `route.mjs --check` and matches its schema and stored defaults, on a staged project `route` reads only the remote default branch, drops a missing program or login, and drops a lane the lane cache marks unavailable but distrusts a stale or future-dated cache, the maintained-skill list is the skill directory, and every row and class count in prose is the file's | `test-kit-catalog.mjs` | ✅ — proves a workflow loads and can be selected, and runs `config-guard.sh` and `deploy-guard.sh` for real on a throwaway repository; **not** that a workflow runs on an engine |
| 25 | The gate lease cannot loop, cannot delay `--list`, probes the engine before it commits, and never resolves through `npx` | `test-kit-facts.mjs` FACT 15, six break cases in `test-guards.mjs` | ✅ — but read the limit below |
| 26 | A reading step's shell is limited to reading commands and three write helpers, a project's Claude settings and Codex rules cannot widen it, and loosening either is a trust-boundary change | `catalog-check.mjs` reader and settings rules, `test-kit-facts.mjs` FACT 16, the Codex-rule cases and the write-script cases in `test-kit-catalog.mjs` (every documented pipe goes into a bare script, and both scripts accept one JSON request), and break cases in `test-guards.mjs` | ✅ — proves the lists; **not** that a runner honours them. Claude enforces an allowlist; Codex enforces it through a hook on engine 0.19.0 (qodeca/xezar#863 – the engine's live QA passed, this repository's own refusal test runs on release day); pi honours it per command, but the kit does not mark pi as enforcing until that test passes; a task login's own user settings are checked by hand at setup |
| 27 | Routing keeps its security minimums and reserved lanes, reads from the base branch, and is a trust boundary | `route.mjs --check` in `test-kit-catalog.mjs`, `test-kit-facts.mjs` FACT 17, twenty-one break cases in `test-guards.mjs` | ✅ — proves the file and the script; **not** which lanes are available on a machine, which only the leader's lane cache knows |

**Row 25 is thinner than it looks, and deliberately so.** What CI checks is the *shape* of the
lease block: that the re-entry guard exists, that it sits after the `--list` exit, that the engine
probe runs **before** the `exec` and `execfail` is set, and that no code line resolves through
`npx`. All of them break quietly — the gates still run and nothing goes red — which is why they are
pinned at all.

The probe assertions were added on 2026-09-21 after a review found the promise was not being kept.
The block said "fail open, always" and did not: `exec` replaces the script, so a fork engine that
did not know the verb, an engine too old for `--status-file` and an engine that died during boot
each reached the caller **as the gate verdict**, with zero gates run and an exit code
indistinguishable from a real failure. A probe after an `exec` is not a probe, so the order is
pinned, not just the presence.

What CI does **not** check is that the lease works. It cannot: that needs an engine 0.17.0 or later
on the machine, and the kit never installs one. Those properties were verified by hand on
2026-09-21 against engine 0.17.0 — a lease taken from a plain folder, a second project waiting 4s
for the first, a waiting notice at 30s, the slot released in under 0.2s after a `kill -TERM`, all
four fail-open paths naming their reason (no engine, too old, a wedged binary cut off by the
probe's own time bound, and a fork that lacks the verb), a held slot reported as `slot 1 of 1`, and
`leaseWaitMs` landing on the attempt record as a number when leased and `null` when not. That is a
dated observation, not a gate, and it will not notice the day the engine changes the verb. The
fail-open contract is what makes that acceptable: the worst outcome of the lease silently ceasing
to work is the behaviour this kit had before it.

**Two lease limits are not covered by anything, here or by hand.** A `SIGKILL` aimed at the
*wrapper* skips the engine's release and orphans a still-running gate run, so the slot is handed to
a waiter while the machine is still loaded — the over-subscription the lease exists to prevent, and
a cost the lease itself introduced, since before it the supervisor's direct child was the gate
script. And `XEZ_GATE_LEASE` set in a shell profile or a CI environment turns leasing off for every
run there; it is a re-entry guard being used as an off switch, and the engine deliberately offers
no such switch. Both are written into the block's own comment. Neither is reachable from CI.

**FACT 14 guards a concept through two of its phrasings, not the concept.** It greps the
identifiers and the two sentences that actually shipped. It cannot decide whether a new sentence
excuses a red build — that is reading, not matching — and the kit legitimately says true things
about flaky tests that must keep passing.

## What this says

**The thin row is 20.** Twenty-six checks read what the skills *say*; one runs a
skill and watches what it *does*, and that one cannot run in CI — it needs a CLI and a
sandbox with full access, and granting a pull request's own code full access is exactly
what CI must not do.

**Row 22 is a pin board, not a proof.** The opinionated onboarding skill carries about a
megabyte of vendored payload under `skills/<name>/kit/`, excluded from three gates by path. Its
prose half and its payload half can state opposite things and every other gate stays green — that
is not hypothetical, it shipped: one file said campaign folders were committed while the file
beside it said they never were, and prose promising `decisions.md` is never cut shipped alongside
a script that cut it at 8 KB.

`test-kit-facts.mjs` now pins seventeen facts that already caused such a contradiction, asserted in
every place that states them. **What it does not do is compare meaning.** Deciding whether two
English sentences agree is the actual problem, and no grep does it. So a fact nobody pinned is
still unchecked, and adding a pin is a deliberate act — the check cannot discover the next
contradiction on its own, only re-catch the kinds it was taught. The honest scope is: these seventeen
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
