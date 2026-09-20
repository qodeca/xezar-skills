# Improvement plan: from instructions to evidence

**Revision 4 — 2026-09-20.** Two rounds of review shaped this document. Revision 1 went through
six lenses (architecture, contract, security, sequencing, verifiability, portability) and
collected 14 blockers. Revision 2 answered them and went through five more (regression, contract,
security, executability, coherence), which found 11 more — including three places where revision
2 changed the vocabulary and left the hole open, and seven factual claims of mine that were
wrong. Every claim below was verified by reading the file, not by trusting a reviewer.

The net effect of the second audit is a **smaller** plan. Three items disappeared because the
mechanism they proposed to build already ships.

**Based on:** [docs/research/dogfooding-xezar.md](research/dogfooding-xezar.md), a survey of this
repository, and the two review rounds.
**Status: delivered, 2026-09-20.** All 64 items across the six releases are implemented on
`feature/improvement-plan-revision-2`. What that means concretely, and what it does not, is in
§11 at the bottom — read that before reading the plan as a to-do list, because it is now a
record of what was done rather than a proposal.

## 1. Read this first

Today this collection ships **instructions**. Good ones: careful, safe, chainable. But an
instruction is a **promise**, and a repository that installs these skills has no way to check
that a promise was kept.

We went looking, and in seven places the promise is already not kept. They are in section 2.

The upgrade this plan proposes is one idea, applied about sixty times:

> **Make the pipeline produce evidence, and make the gates re-derive that evidence from an
> authenticated source instead of trusting prose.**

Evidence means a small number of facts, each tied to one commit, that a later run or a human can
check. Not a reporting system. Not a database. A handful of lines in places we already write to.

"Re-derive", not "read". That word carries the whole security argument: anything a gate merely
*reads* can be written by whoever can write there. Revision 2 said the tracker API was the
authority and then added "the gate accepts either record" — which put a forgeable PR comment back
in the trust path. Three independent reviewers found it. The sentence is gone.

### Why this matters for every project using Xezar this way

1. **You can prove what was checked.** "Was this merged at the commit that was reviewed?" has no
   answer right now, in any repository running these skills.
2. **A resumed run neither repeats work nor skips gates.**
3. **An agent that cannot fix something stops and says so** — instead of retrying forever, then
   quietly lowering a threshold to get past a gate.
4. **A repository with no CI, no tracker, or no network still gets an honest verdict** that names
   which parts are unknown.
5. **Supporting a new language becomes writing one file.**
6. **The collection improves from real use** instead of from our guesses.

None of that requires a consumer repository to change anything. Every new gate ships **off**, and
the one gate whose meaning changes ships behind a config key that defaults to today's behaviour.

### The spine

Five sentences from the report carry the whole roadmap. Every item in §5 serves one of them.

1. **Unknown is never a pass.**
2. **Evidence belongs to one commit and one named source.**
3. **Write it down where the next session will look.**
4. **Two copies of one fact get checked, not trusted.**
5. **Every rule carries the incident that produced it, including the cost.**

## 2. Seven things that are broken right now

Confirmed by reading each file.

### 2.1 An approval can ride along to a commit nobody reviewed

Nothing binds a verdict to a commit. `xez-auto-review-pr` fetches the head commit and uses it
only to decide "is this a re-review". `xez-approve-merge-pr` never fetches it at all
(`SKILL.md:23` — the field list has no head commit).

**So:** a PR gets approved, gets `qa-approved`, receives three more commits, and merges. The
review covered code that is no longer there.

There is also a **race** underneath this, which revision 2 missed. Even a correct check at the
head sha is check-then-act: `merge-pr` runs `gh pr merge {prNumber} --squash`
(`trackers/github.md:337`), which carries no sha, so a push between the check and the merge
re-creates the defect. The fix ships today and costs nothing — `--match-head-commit <sha>`, or
the REST `sha` parameter, which returns 409 on mismatch.

### 2.2 The merge skill does not check two gates it is said to check

`xez-merge-buddy/SKILL.md:45` tells the user that `xez-approve-merge-pr` "re-checks the same
gates before merging". Two of them are not re-checked.

- `reviewDecision` is **fetched and never tested** (`xez-approve-merge-pr/SKILL.md:23`).
- Required checks are never independently verified. The skill relies on the host's merge-state
  field plus branch protection. **In a repository without branch protection that field is clean
  even with a failing check and no approval**, so the merge proceeds.

And a second-order hole: "all required checks pass" is **vacuously true over an empty set**. A PR
that deletes or renames the workflow files produces zero check runs. So the rule must be a *set*
comparison — an unreadable protection API, or a check-name set smaller than the base branch's, is
`unknown`, never pass.

### 2.3 The QA gate fails open when a label was never created

`apply_label` (`trackers/github.md:66-73`) `echo`s a skip when the label does not exist in the
repository and returns that echo's success status. Nothing downstream can tell "no `needs-qa`
because it was not needed" from "no `needs-qa` because the label was never created". The merge
check looks for `needs-qa`, does not find it, and merges.

**Correction carried from revision 2.** Revision 1 also claimed the skill "skips the whole label
step outright when labels are disabled", implying silence. It does not:
`xez-approve-merge-pr/SKILL.md:29` says *"Skip this step only when `labels.enabled` is `false`
(then note in the final report that label gates were not evaluated)"*. That is a **documented
degradation**, not a fail-open.

**And the fix changed.** Revision 2 proposed giving `apply_label` a distinct return code. That is
wrong twice over: it changes a protected guard's output (`BACKWARD_COMPATIBILITY.md:32-35` —
breaking) and it lands in a **consumer-owned descriptor that never auto-updates**, so it would
fix the defect for fresh installs only. The real fix needs no contract change at all:
`label_exists` already exists, and **already paginates** (`trackers/github.md:61-63`). The merge
gate calls it directly and treats an absent label as `unknown`. That works in every install
today.

### 2.4 The durable store is read through an unpaginated call

**list-issue-comments** (`trackers/github.md:205`) runs `gh api .../comments` with no
`--paginate`. GitHub returns 30 per page and the request still **succeeds**, so the caller gets a
truncated list with no error signal. Siblings in the same file paginate (`label_exists` at `:62`,
**list-review-comments** at `:368`), so this is an inconsistency, not a bound.

A pipeline that posts claim, label-rationale, review, QA, CI-follow-up and run-summary comments
crosses 30 routinely, and the consequences compound: the marker is not found → re-runs post
duplicates → marker idempotency dies.

### 2.5 Three smaller defects

- **The retry cap is documented twice with different numbers** — `3` in
  `xez-auto-fix-pr/SKILL.md:33`, `5` in `references/stabilize-ci.md:61`.
- **The self-review loop has no bound at all.** *Revision 2 said five `review-report.md` copies.
  It is **12 files**, six of which are always-loaded SKILL.md bodies.* That matters: a body
  saying "loop until clean" outranks a reference saying "two rounds", so the bound must go in the
  body.
- **The new-skill template fails our own lint** —
  `xez-create-skill/references/templates/skill-skeleton.md` lacks the override preflight line
  `scripts/lint.sh:56` requires.
- **`paths.analysis` is declared, created, committed and read by nothing.** *Revision 2 said
  "every skill resolves it". One file does:*
  `xez-setup-agent-pipeline/references/agentic-setup.md`. Removing a `paths` key is breaking
  (`BACKWARD_COMPATIBILITY.md:26`), so it is deprecated in place and removal waits for a major.

## 3. What actually generalizes

**Seven questions. A "no" to any of them means it does not ship as-is.**

1. **Toolchain-free?** Is the thing defined by its **postcondition**, and do at least two
   ecosystems from different families implement it without an out-of-band tool?
   *(Revision 1 asked only whether a name was banned. `scripts/lint.sh:161` bans exactly one
   package-manager token, so `npm`, `cargo` and `poetry` are lint-legal because nobody banned
   them, not because they generalize.)*
2. **Degrades?** When the thing it needs is missing — no network, no tracker, no browser, no CI —
   does it produce a **named unknown**?
3. **Silent on upgrade?** Does a repository that upgrades and changes nothing behave exactly as
   before?
4. **Affordable to duplicate?** `rules.md` exists in 38 skills; `agentic-setup.md` in 37.
   *(Revision 1's escape hatch — "can it live as one file in the consumer repository?" —
   contradicted §7. The consumer-repo answer applies to **policy**, never to behaviour.)*
5. **Leaves something readable?**
6. **Single-valued?** Does the repository necessarily have exactly **one** of the thing? A repo
   has one issue tracker and drives one browser. It does **not** have one package manager.
   *(New in revision 2. Its absence let `toolchain.provider` through as a scalar — and in
   revision 4 it caught `outdated` sitting on the wrong axis.)*
7. **Real incident behind it?** *(This question may not override questions 1 and 2 — that is how
   the parity matrix was wrongly rejected.)*

### What fails the test

| From the report | Why it does not ship as-is |
|---|---|
| Workflow files as data (item 15) | We have no runtime. We ship markdown that arbitrary agents read. |
| Read-only enforced by tool grant (item 15) | Tool grants are not portable across the 22-plus agents that install these skills. |
| The session-start hook (item 20) | One vendor's feature. The **note format** is portable and ships; the hook ships as an optional template only. |
| Coverage floors and mutation testing (part of 33) | We ship markdown, not a suite that can be silently wrong. The *inventory* ships; the floor does not. |
| The per-**step** evidence file (part of 12) | The product built it and removed it as noise; our loop engines carry the same negative rule. The per-**run** record ships. |
| The 80 % number, UI file paths, product internals | Product-shaped. The report says so. |

**Re-admitted: the parity matrix (32) and golden fixtures (31).** Revision 1 rejected both on
question 7. Wrong: release 2.1 ships exactly the surface a parity matrix governs, so questions 1
and 2 override.

### The evidence store — two layers, not three

Revision 1 put durable evidence in a PR comment the merge gate reads. Revision 2 replaced that
with three layers. Revision 4 has two, because the middle one was doing no work.

- **Security killed the comment as authority.** Anyone who can comment can write the marker and a
  matching `Head:`. No authorship model exists.
- **`.local/` is not durable.** It is gitignored (asserted in CI at
  `scripts/test-browser-providers.mjs:139`) and per-checkout — which is exactly why revision 2
  itself dropped the "counters are never reset" guarantee eight lines after calling the same
  directory "always available". A merge gate usually runs in a fresh clone, a worktree or a CI
  leg, where it is empty.
- **"The tracker" is not one store.** Jira and Linear ship as split providers that own issues
  only (`jira.md:250`, `linear.md:241` both read "Delegate to GitHub **get-pr**"), and
  `xez-setup-agent-pipeline` explicitly supports a **no-tracker** local setup.

| Layer | What it is | What it is for |
|---|---|---|
| **Authority** | the tracker API, re-read at the head sha every time a gate runs | the **only** thing that satisfies a gate |
| **Published record** | a marker-idempotent artifact written through **put-verification-record** | so a human, and a later run, can read what happened |

`.local/` is renamed for what it is: an **in-run cache**. Retry counters live there and are
advisory, never a guarantee.

## 4. Three moves

### Move 1 — bind every verdict to a commit; the API is the only authority

Add a `Head: <sha>` line to the chaining reference lines skills already emit.

- **Only the tracker API satisfies a gate.** The record and the comment are reporting and
  caching.
- **A normalized `get-pr` field set comes first.** `TEMPLATE.md:53` punts the field list to
  `github.md`, so "extend the TEMPLATE" means writing a normalized list that does not exist yet.
  Scope is **two files**, not three — jira and linear delegate `get-pr` verbatim and inherit it.
  The review verdict must be **tri-state** (`approved` / `changes-requested` / `not-enforced`):
  GitLab's approvals API returns `approved: true` when no approval rules apply, which is defect
  2.2's fail-open shape all over again.
- **Pin the sha at merge time** with `--match-head-commit`.
- **Read the whole merge-gate config from the base branch**, not one key. `qaGate` lives in the
  same file (`xez-approve-merge-pr/references/agentic-setup.md:26`), so pinning `gates.failClosed`
  alone leaves the QA gate switchable from inside the PR under review. Unreadable base config is
  `unknown`, never the tolerant default.
- **`Head:` covers push-after-approval only.** GitHub's stale-approval dismissal also fires on
  merge-base movement, which head-sha equality cannot express. Say so; bind to the pair
  (`Head:`, `Base:`) where the base matters.
- **Missing `Head:` is legacy permanently**, keyed to the artifact, not to a release. Revision 2
  said "for one release" — but a PR opened before the change and merged two releases later would
  then be refused, which is the retroactive block the correction existed to prevent. Enforcement
  arrives only through `gates.requireVerdictHead`, `true` for fresh setups.
- **Where the host enforces it, the host wins.** `Head:` is the portable fallback; setup should
  read the host's protection settings and recommend the native rule.

### Move 2 — name the operation, ship the descriptor — on two axes

| Axis | Config key | Operations |
|---|---|---|
| Lifecycle | **`toolchain.providers`** — a **list** | **restore-dependencies**, **build**, **outdated**, **update-dependency** |
| Supply chain | **`security.provider`** — default: one agnostic scanner | **security-scan**, **dependency-inventory** |

- **`outdated` moved to the lifecycle axis** in revision 4. It *is* per-ecosystem (`npm
  outdated`, `cargo outdated`, `pip list --outdated`), and question 6 should have caught it. And
  `xez-maintain-deps` had no contracted way to *apply* a bump, so **update-dependency** joins it.
- **Operations are defined by their postcondition, never by a verb.** `install` is an npm false
  friend: `cargo install` installs global binaries into the installation root; `mvn install`
  installs *your* artifact and has no dependency-install phase. So **restore-dependencies** =
  *"after this, declared dependencies resolve locally; no global state is modified"*.
- **`publish` is excluded.** Descriptors are literal bash the agent executes, so a publish
  operation is release-time code execution holding a long-lived credential, and npm revoked
  classic tokens on 2025-12-09 in favour of OIDC trusted publishing, which cannot be driven from
  a local checkout. *(Revision 2 also argued a tag push was "forbidden elsewhere". It is not —
  both documents mandate one. That false premise is deleted; the credential argument stands
  alone.)*
- **`release-trigger` tags only a merged commit** that is an ancestor of the protected base
  branch. A tag-triggered workflow is read **from the tagged commit**, so tagging a PR head would
  execute the author's own workflow YAML with release secrets — strictly worse than the scoped
  token we removed. It also needs a token that is not `GITHUB_TOKEN`, which does not trigger
  workflow runs at all; "no run appeared" is `unknown`, never success.
- **Scanner hygiene.** Resolve the scanner from an absolute or base-pinned path, never through
  repo-local `node_modules/.bin` or `PATH` — otherwise the PR under review supplies the tool that
  judges it. Enumerate each provider's exit codes; anything unenumerated is `unknown`, not
  `findings`. Stdout is never echoed. The status names the scan kind (`sca: pass`,
  `sast: unknown`).
- **Dependency inventory is an SBOM** (CycloneDX or SPDX) — the existing cross-ecosystem
  artifact.

### Move 3 — a gate whose input is missing says unknown, and refuses to claim it passed

The rule is *refuse to claim the gate was satisfied*, not *refuse to act*: interactive skills
ask, autonomous skills report the unknown.

- **`gates.failClosed`, default `false`**, read from the base branch with the rest of the config.
  Without a key this would reach every installed repository silently, and `xez-auto-*` skills are
  forbidden from stopping to ask (Cross-skill contract §1), so there would be no consent path.
- **Five statuses, hyphenated, and only `pass` passes**: `pass` · `findings` · `unknown` ·
  `not-applicable` · `evidence-unavailable`. Hyphenated because the consumer is POSIX `sh`, where
  an unquoted `case` word-splits on a space.
- **`evidence-unavailable` does not merge.** Revision 2 exempted it so a tracker 429 would not
  block a green PR. But the authority *is* the tracker API — if it is unreachable, **zero** gates
  were verified, and the exemption was a licensed fail-open an attacker can induce on demand
  (rate-limiting is cheap). It differs from `unknown` in retry, backoff and report text only.
- **`labels.enabled: false` yields `not-applicable`**, never `unknown`. Same for a no-tracker
  local setup and a `jq`-less machine.
- **The verdict keyword is `Gate:`**, anchored `^Gate: `. Not "`Gate:` or `Result:`" — leaving it
  open would force every consumer to accept both. `Status:` stays reserved.

**And it must be testable.** "Unknown is never a pass" is satisfiable by an agent typing "pass"
unless it is bound to a captured exit code. So the decision is a **shipped script** on the
`classify-runs.sh` model — stdin JSON of gate inputs, one status on stdout, exit 3 for
cannot-decide — unit-tested against a fixture per missing-input case.

## 5. The work, in order

Six releases. You can stop after any of them and be better off than today. `[R#]` marks the
dogfooding-report item an entry discharges; every one of the 53 is accounted for in §10.

### 1.0.1 — the live defects

1. **Merge path.** Test `reviewDecision`. Verify checks through **get-pr-checks** *and*
   **get-required-checks**, inheriting the documented 404 degradation, with the set-shrink rule.
   Add `--match-head-commit` to **merge-pr**. Correct `xez-merge-buddy/SKILL.md:45`.
2. **QA fail-open, fixed in the skill** — the merge gate calls `label_exists "needs-qa"` itself
   and treats absent as `unknown`. No descriptor change, so it works in every existing install.
3. **Pagination fix** for **list-issue-comments** in both descriptor copies, plus the
   `UPGRADE_NOTES.md` entry.
4. **Read the whole merge-gate config from the base branch** — resolve the base via
   **default-branch**, then `git fetch --depth=1` + `git show`. Unreadable base is `unknown`.
5. **The offline fixture harness** — canned `get-pr` / `get-pr-checks` / `get-required-checks` /
   `label_exists` responses driving the merge decision as a unit test. **This release's
   acceptance check, which is why it lands first.** `[R34 partial]`
6. **Small defects**: the retry-cap number; the skeleton's override line; `paths.analysis`
   deprecated in place.
7. **Bound the self-review loop in all 12 files, with the bound in the body.**
8. **Never kill a process by command-line pattern match** — use a saved PID. `[R7]`
9. **No machine-specific keys in committed config.** `[R19]`
10. **The secret rule gets a test**, plus an env-example file. `[R53]`

**Acceptance check:** `node scripts/test-merge-gate.mjs` passes, including the moved-head,
empty-required-set and absent-label cases.

### 1.1 — groundwork

11. **Normalize the `get-pr` field set** in `TEMPLATE.md` and `github.md` — head sha plus the
    tri-state verdict.
12. **A mock tracker mode** — no credentials, no network. Generalizes item 5 and lets an outside
    contributor test a tracker change at all. `[R34]`
13. **Normalize the shared region** of `rules.md` and `agentic-setup.md` — own PR, no behaviour
    change. Must precede item 15.
14. **Then** markers plus `scripts/sync-shared-blocks.mjs`. The block is **generated** from
    `xez-auto-create-pr`'s canonical copy; CI re-runs the generator and fails on a non-empty diff,
    so the test says what to *run* rather than what to retype 38 times. Clause floor plus a
    negative fixture. `DECISIONS.md` and `AGENTS.md` §5 change in the same PR.
15. **Budget what actually loads.** Two decisions, not deferrals: a **machine-readable marker**
    for "always loaded" (the prose form `follow references/<f>.md` is identical for
    `agentic-setup.md` and for conditional files, so a frontmatter list is needed), and
    **error-or-warn with the remediation budget attached** — measured today, body plus
    `agentic-setup.md` puts **9 of 39 skills over 20 000**, worst `xez-setup-agent-pipeline` at
    27 034. Safety text never moves behind a conditional branch.
16. **A reproducible label-creation list.** `[R6]`
17. **Allowlist entries need four fields and a negative test.** `[R35]`
18. **Test the guards by deliberately breaking them.** `[R36]`
19. **A link checker** over 39 skills and 274 reference files. `[R1]`
20. **Harden the CI workflow.** `[R2]`
21. **Bind the gate list honestly.** `test-discovery-contracts.mjs` is **not** an orphan —
    `scripts/lint.sh:232` runs it. The real assertion is "in `validation.commands` **or
    transitively invoked by one**", with an explicit opt-out for CLI-gated E2E:
    `test:agent-browser-codex` requires the `codex` CLI and a full-access sandbox, so it must
    never enter CI. Add `SDLC.md` to the binding. `[R3]`

**Acceptance check:** edit a shared block — CI fails and names the generator. Run the full gate
suite with no network and no credentials — it passes.

### 2.0 — evidence and honesty (the major)

22. **`Head:` on every verdict**, with the parser test landing **first**. `[R9]`
23. **The verification record**, executed from the **base branch ref only** — a PR can rewrite the
    descriptor it runs from. Fixed `NAME=value` grammar, never sourced as shell, bodies never
    echoed. `[R12 partial]`
24. **The status decision as a shipped script.** `[R8]`
25. **`gates.failClosed`** and **`gates.requireVerdictHead`**, both default `false`, both from the
    base branch, both through the eight-place checklist.
26. **Collect every gate failure, then report.** `[R18]`
27. **A disposition vocabulary** — *fixed in `<sha>`*, *disputed, with evidence*, *deferred,
    naming the issue*. Plus "silence is not a disposition". `[R5]`
28. **What a review may consume** — named through the existing `reviewChecklist` key
    (`config.json:36`), **not** a literal filename: `check-generic-instructions.mjs:44-47`
    rejects `CODE_REVIEW.md` regardless of example markers. `[R4]`
29. **Acceptance criteria are an input** — IDs and a named accepting authority. `[R10]`
30. **Two missing review rules** — graceful degradation, and the absent-default rule. `[R29]`
31. **Retry counters** in the in-run cache. Advisory. `[R13]`
32. **`BACKWARD_COMPATIBILITY.md` entries land in the release that introduces each surface**, each
    with the older-descriptor fallback that `BACKWARD_COMPATIBILITY.md:35` requires.

### 2.1 — named operations, cut to what has a consumer

33. **`security.provider`**, with **security-scan** **config-gated and default-off**: an absent
    key means `not-applicable`, never `unknown`. Otherwise an upgraded repo silently gains a stage
    that executes descriptor bash, or reports `unknown` forever — which becomes a permanent block
    the day `failClosed` is turned on.
34. **`toolchain.providers`** (a list), TEMPLATE plus **two** providers — npm and one non-JS.
35. **`scripts/test-toolchain-providers.mjs`** — golden-output fixtures, a tool-missing negative
    fixture, and a capability × provider parity matrix. Headings are a schema precondition, never
    the pass criterion. `[R31, R32]`
36. **`xez-apply-upgrade-notes` taught the new directories**, delivering descriptors as a **PR**.
37. **`xez-maintain-deps`** — inventory, outdated, update. `[R22]`
38. **Changelog fragments**, with the four evidence levels. `[R14]`
39. **PR template and issue forms** as tracker-descriptor operations. `[R47]`
40. **Research with citations.** `[R24]`
41. **Docs maintenance** — never edit a generated copy. `[R25]`

**Acceptance check:** a third provider passes every golden fixture including tool-missing, and an
upgraded repo with no `security.provider` behaves byte-identically.

### 2.2 — gates, review discipline, missing skills

42. **The design gate**, config-gated and off by default, reconciled with the Design stage that
    already exists at `SDLC.md:27`. Labels are **meta**, not pipeline —
    `set_pipeline_label` loops over the consumer's own `labels.pipeline` array. `[R16]`
43. **A model never approves its own work** — the rule the self-QA exception and the autofix loop
    both lean on without stating. `[R45]`
44. **`xez-release`** — credential-free, tagging only a merged ancestor of the protected base.
    Publishing is the third hard stop. `[R21]`
45. **A merge policy small enough to run.** `[R17]`
46. **Four review-discipline rules.** `[R26-R28, R30]`
47. **A coverage inventory** with a "runs in CI?" column — never a gate. `[R33]`
48. **`xez-analyze-request`** — *deferred pending justification*. `[R23]`

### 2.3 — documents and governance

49. **`SECURITY.md`.** The collection has none, and it ships descriptors that execute bash.
    `[R52]`
50. **Coordination notes.** `[R20]` · 51. **Depth and maturity.** `[R11]` ·
    52. **Rules short; every document names which document wins.** `[R37, R38]` ·
    53. **A dated ledger of deliberate breaks.** `[R43]` ·
    54. **Seven rules for replacing something that works.** `[R39]` ·
    55. **Zero config as design law.** `[R40]` · 56. **An "adding a new skill" checklist.**
    `[R42]` · 57. **Cheap document conventions.** `[R44]` ·
    58. **A "you do not need the automation" table.** `[R46]` ·
    59. **A rename must not rewrite dated records.** `[R48]` ·
    60. **A style guide from counted usage**, seeded by the report's glossary. `[R49]` ·
    61. **An admission gate and two-step deprecation.** `[R50]` ·
    62. **A worker cap.** `[R51]` · 63. **Gate hygiene** — every off-by-default switch gets an
    owner and an expiry date at creation.

The removal of `paths.analysis` is **not** here: it is breaking, so it waits for a major or stays
reserved indefinitely.

### Continuous

64. **An improvement register with an admission bar.** `xez-pipeline-retro` feeds it;
    `docs/research/dogfooding-xezar.md` is its first entry. `[R41]`

## 6. What we are deliberately not doing

- **A step-machine runtime.** *Trigger: the collection stops being agent-neutral.*
- **A per-step evidence file.** *Trigger: a real incident that per-step records would have
  caught.*
- **A publish operation executed by an agent.** Not deferred — **excluded**. *Trigger: none
  foreseeable; a registry that makes agent-held publishing credentials safe would have to exist
  first, and the ecosystem is moving the other way.*
- **A coverage floor or mutation testing.** *Trigger: we ship executable code in a scope where a
  suite could be silently wrong.*
- **A design-system corpus.** *Trigger: a standing design reviewer exists.*
- **Anything named after one vendor inside `skills/**`.** No trigger.

## 7. Rules for whoever builds this

- **Skills auto-update. The files they install do not.** So a fix that must reach existing
  installs goes in a **skill**, never in a descriptor. This is why defect 2.3's fix moved. Every
  PR carries an `UPGRADE_NOTES.md` entry **or a written statement that none is needed**.
- **Every new `validation.commands` entry lands in `config.json` and
  `.github/workflows/lint.yml` in the same PR, in the same position** —
  `scripts/test-browser-providers.mjs:122-127` deep-equals them in order, so an unpaired addition
  breaks a green test.
- **Descriptor sections on a gate path execute from the base branch ref only.**
- **The body budget is measured against the wrong number** until item 15 lands: 20 000 counts the
  body, but `agentic-setup.md` loads on every run too.
- **New config keys ship with a default** and land in **eight** places.
- **A new skill touches eight places.**
- **Anything installed into a consumer repository is POSIX `sh`** with an inline prose fallback,
  never `.mjs`.
- **`docs/` is inside the old-brand lint scope** — no assistant session URLs in a document here.
- **Untrusted input stays untrusted** — scanner output, tracker content, record bodies, fetched
  pages. Status from exit codes; stdout never echoed.
- **Contract surfaces**: labels, config keys, tracker and browser operations, cross-skill line
  formats, skill names, the installer. Additive is fine. Changing a meaning is a **major**;
  removing a `paths` key or changing a guard's output is **breaking**.
- **Sync direction is one-way.** This repository is canonical for tracker descriptors, the label
  taxonomy and the standard step files. The product repository is read as ideas, never diffed in.

## 8. How we will know it worked

Revision 1's six checks had no executor; four needed a live repository, tracker and merge
attempt. Every release's acceptance check is now an **offline command**, and the harness that
makes that possible is §5 item 5 — which is why it is in the first release.

| Claim | Offline check (in `validation.commands`) | Live demo |
|---|---|---|
| No merge on a commit no verdict covers | canned `get-pr` fixture with a moved head sha | push a commit after an approval |
| A label-less repo gets an honest report | `label_exists` returns false; the status script returns `unknown` | run in a label-less repo |
| No scanner reports unknown | the tool-missing fixture returns `unknown` / exit 3 | run a gate with no scanner |
| Two failed rounds stop the agent | the loop bound asserted over a scripted failure | make an unfixable failure |
| A new ecosystem is one descriptor | a new descriptor passes every golden fixture including tool-missing, with no change to any existing skill | — |
| Shared blocks stay identical | the generator re-runs and the diff is empty; one byte fails it | — |

Live demos are labelled demos, carry a named owner, and are **never** counted as checks.

## 9. What the reviews changed

| Revision 1 said | Revision 2 said | Revision 4 says |
|---|---|---|
| The gate reads a PR comment | The comment is a mirror; the API is authority — *but "the gate accepts either record"* | **Only** the API satisfies a gate |
| — | Three layers, `.local/` "always available" | **Two layers.** `.local/` is an in-run cache |
| — | `evidence-unavailable` may still merge | It does **not** merge — that was a licensed fail-open |
| `publish` behind an authority gate | `publish` excluded; `release-trigger` pushes a tag | Same, but the tag must be a **merged ancestor**, and the "tag push is forbidden" premise was false |
| Gates fail closed | `gates.failClosed`, base-pinned | The **whole config** is base-pinned; one key was not enough |
| — | Fix `apply_label`'s return code | Use `label_exists`, which already exists and paginates — **no contract change** |
| — | Verify checks via `get-pr-checks` | Also `get-required-checks`, which already ships with the 404 rule |
| One toolchain family | Two axes | Two axes, with `outdated` moved to lifecycle and `update-dependency` added |
| Six questions | Seven | Seven; question 6 earned its keep twice |
| 1.1 → 1.4 → 2.0 | 1.0.1 → 2.3 | Same, and `paths.analysis` removal deferred out of 2.3 |
| Six end-to-end checks | Offline + demos | Same, and the harness moved into the first release |
| — | `Head:` legacy for one release | Legacy **permanently**, keyed to the artifact |
| — | `<!-- example -->` exempts `CODE_REVIEW.md` | It does not; use the `reviewChecklist` key |
| — | Status tokens with a space | Hyphenated, for POSIX `sh` |

**Seven factual claims of mine were wrong** and are corrected above: the gate-list orphan, the
`paths.analysis` sweep, the `config.version` count, the self-review file count, the `apply_label`
fix, the checks operation, and the example-marker remedy. Three plan items disappeared as a
result — the mechanism already shipped.

One provenance note: a reviewer in the first round cited an advisory identifier that could not be
opened. The finding stands on repository-verifiable fact regardless — descriptors under
`.xezar/pipeline/` contain literal bash the agent executes — and that is the ground it is
recorded on.

## 10. Coverage of the report

All 53 numbered findings, plus the Tier-5 bullets. Nothing is silently dropped.

| Report items | Where they land |
|---|---|
| 1, 2, 3, 6, 7, 19, 34, 35, 36, 53 | 1.0.1 items 5, 8-10; 1.1 items 12, 16-21 |
| 4, 5, 8, 9, 10, 12, 13, 18, 29 | 2.0 items 22-31 |
| 14, 22, 24, 25, 31, 32, 47 | 2.1 items 35, 37-41 |
| 16, 17, 21, 23, 26, 27, 28, 30, 33, 45 | 2.2 items 42-48 |
| 11, 20, 37-44, 46, 48-52 | 2.3 items 49-63 |
| 41 | Continuous item 64 |
| 15, part of 12, part of 33, Tier 5, "what not to copy" | Declined, with reasons in §3 and §6 |

The report's **contract warnings**, **one-direction sync note** and **glossary** are constraints
rather than findings: the first two are folded into §7, and the glossary seeds item 60.

## 11. What was delivered, and what was not

All six releases shipped. The plan is a record now, not a proposal.

### The gates that did not exist before

| Gate | What it prevents |
|---|---|
| `test-merge-gate.mjs` | A merge landing a commit no gate saw — 51 assertions incl. moved head, empty required set, absent label |
| `test-gate-status.mjs` | Missing evidence reading as a pass — 51 assertions ending in a sweep over every shape of missing input |
| `test-guards.mjs` | A guard that has quietly stopped catching anything — 23 deliberate defects |
| `test-chaining-lines.mjs` | A renamed or re-punctuated chaining line silently breaking the handoff |
| `test-shared-blocks.mjs` | Drift between the copies of shared safety text |
| `test-toolchain-providers.mjs` | A provider that cannot do something pretending it can |
| `check-links.mjs` | A pointer between documents that no longer resolves |
| `check-gate-list.mjs` | The gate list meaning different things in its four homes |
| `check-allowlists.mjs` | An exception with no owner and no expiry |
| `check-label-taxonomy.mjs` | The same label name meaning different things in two repositories |

Eighteen gate commands in total, all offline, all runnable with no credentials and no network.

### The seven defects

All fixed. The two that mattered most were fixed in **skills**, not descriptors, because
descriptors never auto-update and a fix that reaches nobody already installed is close to no
fix: the merge gate now calls `label_exists` itself and treats an absent label as `unknown`, and
it pins the head commit at merge time.

### What was declined, in writing

Four entries, each with the trigger that would reopen it, in
[docs/improvement-register.md](improvement-register.md): `xez-analyze-request`, a coverage floor,
the per-step evidence file, and read-only enforcement by tool grant.

### The honest limit

[docs/coverage.md](coverage.md) says it plainly: nineteen of the twenty checks read what the
skills **say**, and one runs a skill and watches what it **does** — and that one cannot run in
CI, because it needs a full-access sandbox and granting a pull request's own code full access is
exactly what CI must not do.

So this repository is now well protected against saying the wrong thing, and lightly protected
against the right thing not working. That gap is recorded rather than papered over, and closing
it needs a real run under a real agent, which is a labelled demo with a named owner and has never
been counted here as a check.

### Corrections found while building

Beyond the seven the reviews caught, the work itself surfaced more — each one an argument for
running a thing rather than reading it:

- `.applicable // true` in jq evaluates to `true` when `applicable` is `false`; the alternative
  operator treats `false` as empty. One character would have turned every "does not apply" into
  "applies".
- The first version of the chaining-line test passed with the label renamed to `PR #123:` —
  the check only saw lines that already started `PR: `. The guard suite caught it.
- The guard suite mistook a contributor's own uncommitted work for a mutation it had failed to
  undo, and two concurrent runs of it trampled each other. Both fixed; it now takes a lock.
- `SDLC.md` listed eight validation commands while the config listed ten. The gate-list binding
  found it on its first run.
- The lint gate caught this plan's sibling document using the permanently banned predecessor
  brand in an example about renaming.
