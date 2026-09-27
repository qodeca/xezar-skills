# Release 3.1.0 – implementation plan

Status: draft for the owner, revised after a five-lens review · Base: `main` at 3.0.3
(`c911694`) · Written: 2026-09-27

## 1. What 3.1.0 delivers

1. **Twelve fixes and features** found while reviewing how live projects customised the kit
   (issues labeled `release-3.1.0`), plus the design-system modules from PR #49.
2. **An upgrade tool.** A Claude Code prompt with helper scripts. The owner runs it by hand,
   in one live project at a time. It brings that project from whatever version it runs to
   3.1.0 and keeps every local customization. Nothing upgrades automatically.

The work runs as parallel streams, each in its own git worktree and PR, merged into a new
`develop` branch. `main` changes only on release day, because `main` is what live projects
install from.

## 2. Decisions

### Owner decisions

| # | Decision |
|---|---|
| D1 | The upgrade tool is a **prompt file in this repo** (`upgrade/UPGRADE-PROMPT.md`) plus helper scripts in `upgrade/tools/`. It is not a skill. |
| D2 | The owner runs it by hand, in one project, when the owner decides. No list of projects, no automatic runs. |
| D3 | Claude Code decides how to merge a file the project changed by hand. It keeps the customization and brings in the 3.1.0 change. The limits are in D11 and §6.4. |
| D4 | It upgrades from **any version that shipped the kit** (v1.2.0 and later, tagged or not). |
| D5 | The owner delivers the result by hand. The prompt works on a local branch and commits there. It never pushes and never opens a PR. |
| D6 | Parallel work uses Claude Code agents in git worktrees, one PR per stream. |
| D7 | PR #49 (design-system modules) is part of 3.1.0 and merges first. |
| D8 | The plan lives in this file. |
| D9 | **A `develop` branch.** All 3.1.0 work merges into `develop`. On release day, one PR moves `develop` → `main`. `main` stays the default branch, and live projects install from it. |
| D10 | **#69: warning only.** A widening Bash rule in the private `.claude/settings.local.json` gives a warning, on that computer too, and never fails a check. The same rule in committed `.claude/settings.json` still fails. This is an owner-accepted risk: the review advised blocking on that computer. `DECISIONS.md` records it. |
| D11 | **Unknown hand edits: Claude drafts, the owner approves.** When the upgrade finds a kit file changed with no register entry, Claude keeps the change and writes a register entry marked `Confirmed: no`. The drift check stays red until the owner confirms it. For a safety file (a trust-boundary path, a check, a workflow, routing, or permission settings), Claude stops and asks first. |
| D12 | **#54 ships with its known limit written down.** The kit makes delivery an integrity check. A task running as the same user can still forge the target record. The owner signs this limit in `SECURITY.md`'s accepted list and in `DECISIONS.md`, and an engine issue asks for a run-scoped grant. |

### Plan defaults (the owner can veto any of them)

- **P1 – one routing-defaults bump.** Stream B creates `references/routing-defaults/4.json`. #54
  may edit it in place, because `develop` is not released. `schemaVersion` stays 1. A missing
  vendor-exclusion key means no exclusion.
- **P2 – fragment files, not shared edits.** Each stream writes
  `docs/plans/3.1.0/notes/<stream>.md`, holding:
  - its changelog text;
  - its upgrade entry, with the machine block from §6.3;
  - its `BACKWARD_COMPATIBILITY.md` rows.

  No stream edits `CHANGELOG.md`, `UPGRADE_NOTES.md` or `BACKWARD_COMPATIBILITY.md` directly.
  The release PR folds the fragments in stream order.
- **P3 – #54 is kit-only** (see D12).
- **P5 – `.xezar/onboarding.json` becomes a protected surface** in `BACKWARD_COMPATIBILITY.md`,
  but only **after** the v1 and v2 schemas are written in `upgrade/CONTRACT.md`. Freezing an
  undefined format would make every later fix a breaking change.
- **P6 – focused patches.** Each stream changes only what its issue needs, plus its tests, pins
  and fragment. No wording sweeps, no clean-ups on the side
  (`docs/memories/feedback-focused-patches.md`).
- **P7 – no invented config values.** The upgrade adds a new config key only when the key has a
  documented default. Otherwise the key stays unset and goes on the owner checklist, with the
  question onboarding would have asked. A kit role with an unset key names it and stops
  (`BACKWARD_COMPATIBILITY.md` §2), which is louder and safer than a wrong value.

## 3. Work streams

`K` = `skills/xez-onboard-opinionated/kit`, `R` = `skills/xez-onboard-opinionated/references`,
`SAP` = `skills/xez-setup-agent-pipeline/references`.

| Stream | Issues | Owns (only this stream edits these) | Size |
|---|---|---|---|
| **0** Scaffold | `develop`, PR #49 | The `develop` setup (§4), `upgrade/CONTRACT.md`, `docs/plans/3.1.0/notes/` (empty folder with README), the per-stream anchors in the three test files | S |
| **A** Toolchain-neutral skills | #59 | `K/skills/xezar-testing.md`, `K/skills/xezar-dependency-maintenance.md`, the shared tail in `K/skills/xezar-docs-maintenance.md`, `K/pipeline/toolchains/*`, `SAP/toolchains/*`, the new lint rule and its allowlist entries | M |
| **B** Routing and leader guide | #50 → #65 | `K/checks/route.mjs`, `K/routing.json`, `K/routing.schema.json`, `R/routing-defaults/4.json`, `K/docs/routing.md`, `K/leader-guide.template.md`, `K/docs/leader-guide-detail.md`, `K/docs/close-out.md`, `K/loops.json` | M |
| **C** Leader context and settings | #64 + #69 | `K/checks/leader-context.sh`, `K/docs/leader-context-loading.md`, `K/docs/campaign-notes.md`, `K/checks/fenced-quotes.mjs`, `K/checks/documented-output*`, the `.claude` settings loop in `K/checks/catalog-check.mjs` | M |
| **D** Workflow data and browser | #52 → #63 | `K/workflows/*.yaml`, the workflow rules in `K/checks/catalog-check.mjs`, `K/pipeline/browsers/chrome-devtools.md` with its `SAP` copy and pin | M |
| **E** Install freshness | #53 | `K/checks/lib/deps.mjs`, `K/checks/lib/common.sh`, `K/checks/resume-complete.sh`, `K/checks/lib/gate-results.mjs` (wave 1), `scripts/test-deps-units.mjs` | M |
| **F** Changelog formats | #57 | `K/checks/changelog-check.sh`, `K/checks/changelog-fragments.mjs`, `K/skills/xezar-release-changelog.md` | M |
| **G** Project trust boundaries | #70 | `K/checks/lib/security-scan.mjs`, the new key in `K/checks/lib/config-grammar.mjs` / `project-policy.mjs`, the `security.trustBoundaries` row in `SAP/config-fields.md` | S–M |
| **H** Sealed repair delivery | #54 | Wave 1: a design note only. Wave 2: `K/workflows/address-review-findings.yaml`, `K/checks/ci-watch.sh`, `K/checks/verify-evidence.sh`, the task-evidence `K/checks/lib/manifest.mjs`, `K/skills/xezar-review-response.md` | L |
| **U** Upgrade tool | #55 + new | `upgrade/**`, `R/write.md` / `verify.md` / `preflight.md` (manifest v2 only), the drift-check line in `K/checks/repository-checks.sh`, `scripts/test-upgrade.mjs`, `scripts/build-upgrade-fixtures.mjs`, `scripts/fixtures/upgrade/**`, and **the four gate-list files** (`.xezar/pipeline/config.json`, `.github/workflows/lint.yml`, `SDLC.md`, `package.json`) | L |

**Stream A's lint rule is scoped.** It refuses literal `npm`, `package-lock.json` and workspace
counts in the shared tail, `xezar-testing.md` and `xezar-dependency-maintenance.md`. These files
also contain `npm` today:
- `xezar-release-publish.md` – the engine's own npm release;
- `xezar-implementation.md:8`;
- `xezar-quality-gates.md:8,22`;
- `xezar-release-changelog.md:31,109`.

Each gets a `scripts/allowlists.json` entry with a reason, an owner and an expiry. Stream F fixes
`xezar-release-changelog.md` under #57 and removes its entry. Without this scope, A cannot go
green, and A must merge first.

**Two "manifests".** In this plan, "manifest" means `.xezar/onboarding.json`. The task-evidence
file `K/checks/lib/manifest.mjs` (Stream H) is unrelated. Agents must not confuse them.

### Shared files – who goes first

The scaffold PR runs a scripted overlap check: for each pair of streams, the intersection of
their owned paths must be empty, apart from the rows below.

| File | Streams | Rule |
|---|---|---|
| All 37 `K/skills/xezar-*.md` | A (shared tail), D (#63: qa, ui, ux), H (review-response), #49 | #49 merges in wave 0. A merges **first** in wave 1. Others edit only the body, rebase, and re-run `node scripts/sync-shared-blocks.mjs`. |
| `K/workflows/design-review.yaml`, `design.yaml`, `design-system.yaml`, `ui-design.yaml`, `visual-asset.yaml` | #49, D | #49 in wave 0. D rebases. |
| `SAP/config-fields.md` | #49 (`designSystem.modules`), G (`security.trustBoundaries`) | Separate rows. #49 first. |
| `K/checks/catalog-check.mjs` | C, D | Different functions. D merges first, C rebases. |
| `K/routing.json`, `R/routing-defaults/4.json` | B, H | B creates `4.json` (P1). H edits it in wave 2. |
| `K/workflows/address-review-findings.yaml` | D (#52 timeout), H | D in wave 1, H in wave 2. |
| `K/checks/worktree-preflight.sh` | H only | #63 needs no edit here: strict mode exists, so D only changes two `command:` lines. |
| `K/checks/lib/gate-results.mjs` | E, H | E in wave 1, H in wave 2. |
| `K/checks/repository-checks.sh` | F, U | Each adds or edits one line. F merges first. |
| `K/docs/phase-record.md` | E, G | Separate sections. Rebase only. |
| `K/leader-guide.template.md` | B only (#50 then #65, same stream) | – |
| `R/descriptor-digests.json` | A, D | Separate keys. Rebase, then re-pin. |
| `scripts/test-kit-catalog.mjs`, `test-kit-facts.mjs`, `test-guards.mjs` | most streams | Add cases only below your own anchor comment (`// 3.1.0-stream-<X>`), which the scaffold PR seeds. Never reorder existing cases. |
| The four gate-list files | U only | F makes its tests reachable through an existing gate script, which `scripts/check-gate-list.mjs` accepts. No other stream adds a gate command. |

## 4. Waves and order

```
Wave 0  develop setup ── #49 into develop ── Scaffold PR ──┐
                                                           ▼
Wave 1  A ─┐ (merges first)
        B ─┤  C ─┤  D ─┤  E ─┤  F ─┤  G ─┤  H (design note)
        U1 manifest+drift ─ U2 kit index ─ U3 planner ─ U4 prompt ─ U5 fixtures
                                                           ▼
Wave 2  H implement (after B, D, E) ── U finish: index for 3.1.0, dry runs on clones
                                                           ▼
Wave 3  Release PR develop → main ── immutable release, tag v3.1.0
                                                           ▼
Wave 4  Owner runs the upgrade prompt, one live project at a time
```

**Wave 0 – the `develop` setup (one small PR to `main`, then branch):**
1. Create `develop` from `main`.
2. In `.xezar/pipeline/config.json`, set `baseBranch` to `"develop"`. Today it is `"auto"`, which
   resolves to the remote default (`main`). `main` stays the GitHub default, so
   `npx skills add` keeps installing released code.
3. `.github/workflows/lint.yml`: run on pushes to `main` and `develop`, and add the
   `merge_group:` trigger.
4. Turn on the merge queue for `develop`, with "all queue entries must pass".
5. `SDLC.md`: say that work targets `develop` and a release merges `develop` → `main`.

Then retarget PR #49 to `develop` and merge it. Every stream branches from `origin/develop` and
targets `develop`.

**Merge queue.** PRs enter the `develop` merge queue. It tests each one on top of the PRs ahead
of it, so there is no hand-run rebase train. After wave 1, re-measure the guard-suite time
against the 20-minute CI timeout in `lint.yml`, and raise it if needed.

**Wave 1 merge order:** A → D → B → C → E → F → G → U1. U2–U5 merge when ready. Only A must go
first. The rest of the order just keeps the rebases small.

**Local gate runs.** The `scripts/test-guards.mjs` lock is per checkout, so worktrees can run it
at the same time. `scripts/test-gate-status.mjs` is known to fail locally on macOS on `main` and
to pass in CI (`docs/memories/release-302-work.md`). An agent reports that failure and does not
try to fix it. CI is the authority.

## 5. Stream detail

Each stream is done when all of these are true:

- every acceptance criterion of its issue is met, as mapped in §5.1;
- every new guard has a deliberate-break case in `scripts/test-guards.mjs`;
- each changed shipped descriptor is re-copied to `SAP/` and re-pinned;
- its fragment `docs/plans/3.1.0/notes/<stream>.md` is written. It holds the changelog text; the
  upgrade entry (symptom, what to do, what you lose by skipping, and the machine block from
  §6.3); and a `BACKWARD_COMPATIBILITY.md` row for every new config key and a ledger row for
  every new refusal;
- every command in `.xezar/pipeline/config.json` → `validation.commands` passes when run one at a
  time (CI is the authority for the known macOS exception in §4);
- the PR targets `develop` and carries the SDLC label set and `Closes #<n>`.

### 5.1 Acceptance criteria → evidence

"Gate" means an automated case in the named test file. "Live" means evidence captured in a
clone dry run (§7) and linked in the PR: a run id, a log excerpt or a screenshot.

| Issue | Criterion (short) | Evidence | Where |
|---|---|---|---|
| #50 | Claude-authored PR on `full-cold-review` gets a non-Claude lane or `wait` | `test-kit-catalog.mjs` route case | Gate |
| #50 | Repair chain excludes every model, and every vendor on high-risk rows | `test-kit-catalog.mjs` route case | Gate |
| #50 | Vendor exclusion read from `routing.json`, checked by `--check`, in the schema | `test-kit-catalog.mjs` + break case | Gate |
| #50 | Without `--author`, output byte-identical | `test-kit-catalog.mjs` golden output | Gate |
| #52 | Every agent step has a `timeout`, and the check refuses one without | `test-kit-catalog.mjs` + break case | Gate |
| #53 | Replaced package dir → not fresh | `test-deps-units.mjs` | Gate |
| #53 | Build cache inside `node_modules` → still fresh | `test-deps-units.mjs` | Gate |
| #53 | Resume with stale deps re-runs gates | `test-deps-units.mjs` or `test-guards.mjs` | Gate |
| #54 | Review repair ends `done` with sealed evidence for the exact sha | Clone dry run: run id + `verify-evidence.sh` output | Live |
| #54 | Delivery refuses an unsealed sha, a moved head, a history or release branch | `test-guards.mjs` break cases | Gate |
| #54 | Conflict repair ends `done` without `[target.missing]` | Clone dry run: run id | Live |
| #54 | `branch.owned-by-run` unchanged elsewhere | `test-kit-catalog.mjs` | Gate |
| #55 | Drift fails on an unrecorded change and passes once recorded and confirmed | `test-upgrade.mjs` | Gate |
| #55 | A recorded patch without a register entry fails | `test-upgrade.mjs` | Gate |
| #55 | Fresh onboarding passes | `test-upgrade.mjs` fresh-install fixture | Gate |
| #57 | Keep a Changelog direct edit refused, fragment accepted | fixture test reached via an existing gate script | Gate |
| #57 | Fold into Keep a Changelog is valid, and the verify step catches a lost entry | same | Gate |
| #57 | `--diff-base auto` resolves a non-`main` base | same | Gate |
| #59 | No literal `npm` etc. in the scoped files, and lint refuses one | `lint.sh` + break case | Gate |
| #59 | Yarn multi-unit and .NET fixtures resolve to their commands; npm unchanged | `test-toolchain-providers.mjs` | Gate |
| #63 | QA and design review can call `emulate` with no denial | Clone dry run: screenshot of dark mode + log | Live |
| #63 | `emulate` refused elsewhere; review steps need a `bashAllowlist` | `test-kit-catalog.mjs` + break cases | Gate |
| #63 | Both pass preflight without `--allow-root` | Clone dry run: preflight output | Live |
| #64 | Newest N entries plus a pointer line | `test-kit-facts.mjs` | Gate |
| #64 | Missing, symlinked and unreadable `decisions.md` each warn; a normal file does not | `test-guards.mjs` | Gate |
| #65 | Template carries the three rules; catalog and facts tests pass | `test-kit-facts.mjs` | Gate |
| #65 | "L3 is the only dispatcher" still true | `test-kit-facts.mjs` text check + clone dry run leader log | Gate + live |
| #69 | A second project hook keeps quotes and documented output green | `test-kit-catalog.mjs` | Gate |
| #69 | Changing the kit's own SessionStart hook still fails the quote check | `test-guards.mjs` break case | Gate |
| #69 | Local widening rule warns; committed one fails | `test-kit-catalog.mjs` | Gate |
| #70 | Project entry sets `reviewerRequired` with its reason | `test-kit-facts.mjs` / `test-guards.mjs` | Gate |
| #70 | A branch that drops its own path is still routed | same | Gate |
| #70 | An invalid entry routes to review with a clear message | same + break case | Gate |

### Stream 0 – scaffold (serial, before fan-out)

1. The `develop` setup (§4, wave 0).
2. Review PR #49, retarget it to `develop` and merge it. Add its `designSystem.modules` row to
   `SAP/config-fields.md` and its `BACKWARD_COMPATIBILITY.md` §2 row if they are missing. Write
   its fragment. Note: cmplus carries these files as a local patch marked `adapted`. The upgrade
   tool must see them as "already upstream" (a U5 case).
3. The scaffold PR:
   - `upgrade/CONTRACT.md` with the schemas and grammars from §6.2 and §6.3;
   - `docs/plans/3.1.0/notes/README.md`, which states the fragment format;
   - one anchor comment per stream in `test-kit-catalog.mjs`, `test-kit-facts.mjs` and
     `test-guards.mjs`;
   - the overlap check (§3).
4. Check that no gate breaks on `upgrade/` or `docs/plans/3.1.0/` (lint, `check-links`,
   `check-generic-instructions`).

### Stream A – #59 toolchain-neutral role skills

- Remove `npm`, `package-lock.json` and workspace counts from `xezar-testing.md`,
  `xezar-dependency-maintenance.md` and the canonical shared tail. Point them at:
  - the installed toolchain descriptor(s), which already exist for `npm`, `yarn`, `dotnet` and
    `cargo`;
  - `dependencies.units`, which already exists and is read by `K/checks/lib/deps.mjs`;
  - the validation and typecheck commands in config.
- Regenerate the tail: `node scripts/sync-shared-blocks.mjs`.
- Add the scoped lint rule, its allowlist entries (§3) and a break case.
- Fixtures: Yarn multi-unit, .NET, and single-root npm. The npm fixture must give the same
  effective instructions as today.

### Stream B – #50 then #65 routing and leader guide

- **#50.** Syntax: `route.mjs <row> --author <lane> [--repair <lane>]…`. Output lines, parsed as
  `NAME=value` after the first `=`:
  - each removal: `removed=<lane> reason=author-chain: <shared model|shared vendor> with <lane>`;
  - eligible escalation lanes: in the normal order as `lane=<id>`, with an extra
    `escalation-eligible=<id>` line for each one that is an escalation lane;
  - nothing left: `wait=no-independent-lane`;
  - `dispatch-checks=` stays byte-identical;
  - an unknown `--author` or `--repair` lane exits 2 with a message.
  - Rules:
    - "shares a model" compares the resolved `engineModel`;
    - `neverAuthor` keeps one meaning (lane, login and vendor, as in the schema), and
      `docs/routing.md:73` is corrected to match;
    - the vendor exclusion is data in `routing.json`: an optional key, where missing means none.
  - Without `--author`, the output stays byte-identical (golden test).
  - Add a grammar test that every output line parses.
  - Bump `defaults.version` 3→4 and write `R/routing-defaults/4.json`.
  - The upgrade entry copies `route.mjs` before the docs and the leader guide. An old
    `route.mjs` reads `--author` as a row id.
- **#65.** Add three rules to `leader-guide.template.md`: dispatch at once, `read_quota` before
  dispatch, and the merge-queue path.
  - The reasoning goes in `leader-guide-detail.md` and `close-out.md`.
  - Keep `loops.json`'s L1 text consistent.
  - Keep the ≤200-line template budget.
  - The leader's post-verdict turn counts as an L3 run, so "at most one pending wake" holds.
- One PR per issue, in order, in the same worktree.

### Stream C – #64 + #69 leader context and settings

- **#64.** Bound the timeline by entries: default 40, configurable. Add a pointer line. The byte
  cap stays as a backstop, and `decisions.md` stays whole. When `decisions.md` is missing, a
  symlink or unreadable, print a WARNING in the trusted header, outside the untrusted region and
  with the nonce.
- **#69.** Quote only the kit's own hook entry, and compare that entry structurally, not the
  whole file.
  - `catalog-check.mjs`: a widening Bash rule in `.claude/settings.local.json` gives a warning
    (D10). The same rule in committed `.claude/settings.json` still fails. The message says what
    to do instead.
  - The settings check also refuses any browser-tool grant (`mcp__chrome-devtools__*`) outside
    the descriptor's allowed set, and any whole-server grant, in either file.
  - Write the D10 `DECISIONS.md` entry, including the open question: #63 notes that read-only
    steps load only user settings. If the engine confirms this, the local-file risk is smaller
    than assumed.
- Both change `leader-context-loading.md` and the documented-output allowlist. Do #64 first, in
  the same worktree.

### Stream D – #52 then #63 workflows and browser

- **#52.** Add a `timeout` to every agent step in every kit workflow (handoff: short, for example
  `15m`). `catalog-check.mjs` refuses an agent step with no timeout. Add a break case in
  `test-kit-catalog.mjs`.
- **#63.** Add `emulate` to the tool lists of `qa.yaml` and `design-review.yaml` only. This is
  the only place it is granted – never through settings files.
  - Add an explicit read-only `bashAllowlist` and strict preflight without `--allow-root` (two
    `command:` lines).
  - The descriptor names `emulate` as allowed in exactly those two workflows. Update the `SAP/`
    copy and the pin.
  - `catalog-check.mjs` refuses `emulate` elsewhere, and refuses those review steps without a
    `bashAllowlist`.

### Stream E – #53 install freshness

- Measure first: time a metadata digest on a realistic tree (the issue reports about 3.5 s for
  about 236,000 entries). Put the result in the PR.
- `deps.mjs fresh`: a metadata digest over the tree.
  - Named build-cache folders are skipped only when they hold no package, no `.bin` and no link.
  - A link into a cache is refused.
  - An unreadable tree is refused.
  - A digest that times out counts as not fresh.
- `resume-complete.sh`: reuse sealed evidence only when deps are fresh (fail closed).
- Add the three regression tests from the issue. The docs state the re-stamp limit plainly.

### Stream F – #57 changelog formats

- Detect Keep a Changelog, or read the format from config. Support both formats for the
  Unreleased section, release headings, ordering and the direct-edit refusal.
- Fold: map fragment groups to Keep a Changelog groups. A verify step checks that no fragment is
  left behind and no content is lost.
- `--diff-base auto` uses `baseBranch` from config, then the remote default. Never `main`.
- Remove the `npm` lines from `xezar-release-changelog.md` and its allowlist entry (§3).
- New fixtures for both formats and a non-`main` base. They are reachable through an existing
  gate script, so no gate-list file changes.

### Stream G – #70 project trust boundaries

- New key `security.trustBoundaries: [{ "pattern": "...", "why": "..." }]`. Absent or empty means
  no project entries.
- **Read from the base branch tip.** Use `git show refs/remotes/origin/<baseBranch>:.xezar/pipeline/config.json`.
  Refuse when the ref cannot be resolved. Never read it from the merge-base or the working tree.
- **Matcher.** A hand-written, linear-time matcher over `*`, `**`, `?` and literals. It refuses
  `!`, braces, extglobs, character classes and regex characters. It allows at most 64 entries of
  at most 256 characters each. No glob library.
- **Fail toward review.** An invalid or unreadable project list sets `reviewerRequired: true`
  with the reason, through a new check `trust-boundary-config`. That check **counts** in the
  stage result, unlike the existing `trust-boundary` check.
- The result adds `list: "kit" | "project"` to each match (a new field only).
- Remove the four `packages/xezar/src/...` engine entries.
- Update `SAP/config-fields.md`, `K/docs/phase-record.md` and the `CODE_REVIEW.md` text the
  onboarding writes. Add a break case for each rule.

### Stream H – #54 sealed repair delivery

- **Wave 1: a design note** in the issue. It covers:
  - the repair-target record, the `start-repair` action and the `deliver` step;
  - the conflict-repair path with no `ci-watch` wait;
  - the D12 limit, stated plainly.

  File the engine issue for a run-scoped grant.
- **Wave 2: implement it** after B, D and E merge. `deliver` must:
  1. re-read the PR live from the tracker: open, head in this repository (not a fork), base =
     `baseBranch`, head = the recorded expected sha, and not a history or release branch;
  2. push only the sha that passes `verify-evidence.sh --require-current`, as
     `<sha>:refs/heads/<branch>` with no force, or with an explicit
     `--force-with-lease=<branch>:<expected-sha>`, never the bare form;
  3. confirm the remote tip with `git ls-remote`;
  4. send the new head back through review: stale approvals do not count.
- The owner signs the D12 entry in `SECURITY.md`'s accepted list and in `DECISIONS.md` in the
  same PR. `branch.owned-by-run` stays unchanged for every other workflow.

### Stream U – the upgrade tool

Five sub-streams. U1, U2 and U4 can start together once the contract is merged in wave 0. U3
needs the U2 interface. U5 grows alongside U3.

| Sub | What | Files |
|---|---|---|
| U1 | #55: manifest v2, drift check, `.xezar/LOCAL-PATCHES.md` register, onboarding writes v2 | `K/checks/manifest-drift.mjs` (new), one line in `repository-checks.sh`, `K/docs/local-patches.md` (register format), `R/write.md`, `R/verify.md`, `R/preflight.md`, `skills/xez-add-rule/SKILL.md` (a leader-guide rule is owner content) |
| U2 | Kit index and version detection | `scripts/build-kit-index.mjs`, `upgrade/kit-index/*.json`, `upgrade/tools/lib/copy-map.mjs`, `upgrade/tools/lib/rewrites.mjs` |
| U3 | Planner, applier, verifier | `upgrade/tools/detect.mjs`, `plan.mjs`, `apply.mjs`, `verify.mjs`, `upgrade/tools/lib/paths.mjs` (containment) |
| U4 | The prompt | `upgrade/UPGRADE-PROMPT.md`, `upgrade/README.md` |
| U5 | Fixtures and tests | `scripts/build-upgrade-fixtures.mjs`, `scripts/fixtures/upgrade/**`, `scripts/test-upgrade.mjs`, and the four gate-list files, all in one PR and in the same order |

- **U1 drift check:** on a v1 manifest it prints `not-applicable` with the migration line and
  exits 0. It enforces only on `manifestVersion >= 2`. A register entry with
  `Confirmed: no` fails the check until the owner confirms it (D11).
- **U1 preflight:** the "no upgrade path yet" message in `R/preflight.md` changes to point at
  `upgrade/UPGRADE-PROMPT.md` in the **release PR** (wave 3), not before. The tag must exist
  first.

### Stream R – #89 DeepSeek routing

- **What.** A new lane `pi/deepseek-api/deepseek-v4-pro` (strong, no vision, no tool limits).
  DeepSeek-first row orders: Flash first in the simple rows, V4 Pro first in the mid-size writing
  rows, V4 Pro after the Codex lanes in the Opus-first rows, no V4 Pro in a screen row (Flash is
  the no-Claude fallback there), V4 Pro last in every other review row.
  - Three bans relax: `tool-limits`, through a new optional lane key `fullShellReviews`;
    `pi-write-claude-review`; `high-risk-other-vendor`.
  - The owner signs the accepted risk in `SECURITY.md` and `DECISIONS.md`.
  - The shipped defaults stay version 4, edited in place (P1).
- **Files.** `K/routing.json`, `R/routing-defaults/4.json`, `K/routing.schema.json`,
  `K/checks/route.mjs`, `K/docs/routing.md`, `SECURITY.md`, `DECISIONS.md`, and the fragment
  `docs/plans/3.1.0/notes/R.md`. The kit files are Stream B's, which has merged.
- **Tests.** `test-kit-catalog.mjs`: the lane facts, every row group, the relaxation both ways, and
  `route` without the model. `test-kit-facts.mjs`: the relaxed ban texts, the kept bans, and the
  two records. `test-guards.mjs`: one break for each relaxed rule.

## 6. Upgrade tool design

### 6.1 How the owner uses it

```text
cd <live project>          # clean tree, leader stopped, no task running
claude                     # normal permission prompts – never -p, never bypass mode
                           # then paste upgrade/UPGRADE-PROMPT.md from the verified v3.1.0 clone
# review branch xezar/upgrade-3.1.0 and .xezar/upgrade-reports/3.1.0.md
git push -u origin xezar/upgrade-3.1.0 && gh pr create …   # by hand
```

### 6.2 What it needs to know – the three copies of every file

For every installed kit file, the tool compares three copies. This is a 3-way merge:

- **base** – what the kit shipped when this project installed or last upgraded this file;
- **mine** – what the project has now;
- **theirs** – what 3.1.0 ships.

**The kit index** (`upgrade/kit-index/`, schema in `upgrade/CONTRACT.md`):
- It covers **every commit that touched `kit/`** since v1.2.0, not only tags. An untagged commit
  gets a pseudo-version, for example `3.0.2+<sha12>`. Projects were installed from the default
  branch.
- For each version, it maps each installed path to: the kit source path, the raw blob sha, the
  rewrite class (`copied`, `adapted`, `generated`), and `renamedFrom` when the kit moved the file.
- It is built once by `scripts/build-kit-index.mjs` and committed. Nothing reads tags at test
  time.

**Finding the base, per file** (projects applied parts of old notes by hand):
1. The manifest's recorded `sha256` for the file is found in the index → that version is the
   base, with **high** confidence.
2. Otherwise, "mine" matches a version's copy after normalised hashing (placeholder regions and
   rewritten absolute paths masked) → the newest such version, with **medium** confidence.
3. Otherwise, the version with the smallest line diff to "mine" → **low** confidence, flagged
   "base inferred" in the report.
4. No candidate at all → class **base unknown**. Claude treats the file as both-changed and never
   as a clean update.

**Manifest v2** (`.xezar/onboarding.json`, additive over v1). v1 is rebuilt from the tags and
written as a JSON Schema in `upgrade/CONTRACT.md` before v2 is final.

```json
{
  "manifestVersion": 2,
  "version": "3.1.0",
  "descriptors": { ".xezar/pipeline/toolchains/npm.md": "<sha256>" },
  "files": {
    ".xezar/checks/ci-watch.sh": {
      "sha256": "<sha256 of the installed file>",
      "origin": "copied",
      "kitSource": "checks/ci-watch.sh",
      "kitBlob": "<git blob sha of the kit file before rewrite>",
      "renderInputs": { "UI_SCOPE": "…" },
      "patch": "LP-3"
    }
  }
}
```

Rules:
- A missing `manifestVersion` means v1.
- `version` is the kit version installed. There is no second version field.
- `descriptors` stays, because `UPGRADE_NOTES.md` refers to it.
- `origin` is set at install time and never changes. It is a closed list: `copied`, `adapted`,
  `generated`, `owner-file-appended`. Adding a value is a breaking change.
- A present `patch` means the file is locally patched, and it names the register entry.
- `renderInputs` holds the values a rewrite used, so base and theirs can be re-rendered exactly.
  It holds names of keys and plain text only, never secrets.

**Register** `.xezar/LOCAL-PATCHES.md`. The heading grammar is `^## (LP-\d+) [–-] (.+)$`, and one
entry may cover several files:

```markdown
## LP-3 – skip ci-watch for conflict repairs
- Files: .xezar/checks/ci-watch.sh, .xezar/workflows/address-review-findings.yaml
- Reason: conflict repairs do not merge the base, so ci-watch waits forever
- Upstream: qodeca/xezar-skills#54 | local only
- Since: 2026-09-25
- Confirmed: yes
```

After the schemas are written and merged, P5 adds the protected-surface row.

### 6.3 Machine block for upgrade entries

Every upgrade entry keeps its prose (symptom, what to do, what you lose) and ends with one fenced
block. The block replaces the old `Digests:` line.

````text
```upgrade
Applies-to: <3.1.0
Files: .xezar/checks/route.mjs; .xezar/routing.json =merge; .xezar/workflows/qa.yaml
Actions: restart-leader; per-machine=add-mcp-permission:mcp__chrome-devtools__emulate
```
````

- One key per line: `Applies-to`, `Files`, `Actions`. Items are separated by `;`.
- `Applies-to` is a version range, so the planner picks the entries between a project's version
  and the target.
- A `Files` item is a path with an optional `=merge`, `=new` or `=delete`.
- `Actions` uses a closed vocabulary defined in `CONTRACT.md`: `restart-leader`,
  `restart-engine`, `engine-min=<v>`, `config-key=<key>`, `label-sync`, `env-rename=<a>:<b>`, and
  `per-machine=<action>`.
- **Backfill:** Stream U writes machine blocks for every kit entry since v1.2.0. An upgrade from
  an old version then sees old non-file steps, for example the label taxonomy, the engine
  minimum, `DOGFOOD_*` → `KIT_TEST_*`, and per-machine MCP steps.
- The block format gets a `BACKWARD_COMPATIBILITY.md` §5 row, since `xez-apply-upgrade-notes` and
  every later prompt parse it.

### 6.4 How each file class is handled

| Class | Condition | Tool does | Claude does |
|---|---|---|---|
| Unchanged upstream | base = theirs | nothing | – |
| Clean update | mine = base ≠ theirs, base confidence high or medium | writes theirs (re-rendered with `renderInputs`) | – |
| Local only | mine ≠ base = theirs | keeps mine | checks that it has a confirmed register entry, else treats it as an unexplained change |
| Already upstream | mine = theirs | marks it current | drafts removal of the now-obsolete register entry (for example cmplus and #49) |
| Both changed | mine ≠ base ≠ theirs | runs `git merge-file --zdiff3` and branches on the exit code; stages the result | resolves it: keeps the local intent, takes the 3.1.0 fix, records it in the register |
| Base unknown | §6.2 step 4 | stages theirs next to mine | as both-changed, flagged in the report |
| Moved in kit | `renamedFrom` in the index | merges mine into the new path, using the old path's base | checks the result and removes the old file |
| Routing before 3.0 | `.xezar/docs/model-routing.md` and no `routing.json` | writes the 3.1.0 `routing.json` | converts the owner's lanes and rules into it, and lists each converted rule in the report |
| Unexplained local change | mine ≠ every known version, and no confirmed register entry | lists it | keeps it and drafts a register entry with `Confirmed: no` (D11). For a safety file, it **stops and asks** first. |
| Permission change | the merge would add an allow rule, hook, MCP server, tool grant, or Codex rule or trust | – | **always stops and asks**; the report gets a "permission changes" section with before and after |
| New in kit | not installed | adds it | checks that it fits the project's config |
| Removed from kit | installed, gone upstream, path in the base index | proposes deletion | deletes it, unless locally edited, then keeps it and flags it |
| Owner-shaped files | `config.json`, `routing.json`, leader guide, `SDLC.md`, `CODE_REVIEW.md`, appended `CLAUDE.md` / `AGENTS.md` sections, `.mcp.json`, `.claude/settings.json`, `.codex/config.toml` | gives facts only | a semantic merge: new config keys follow P7; owner values never change; routing uses the `defaults.version` 3-way; the leader guide keeps the owner-rules section; JSON and TOML merge by key |
| Per-machine | any gitignored or untracked file, such as `.claude/settings.local.json` | never writes it | lists the change as a per-machine action for the owner |
| Never touched | `.xezar/pipeline/overrides/**`, application code, campaign notes | – | – |

**Claude stops and asks the owner when:**
- the local change and a 3.1.0 safety change cannot both hold (`SECURITY.md` wins);
- a local change removes something 3.1.0 depends on;
- a local change **weakens a safety check**, even in a file 3.1.0 did not touch;
- an unexplained change is in a safety file (D11);
- a permission change appears;
- both sides changed the same routing field.

In every other case, Claude decides and writes the reason in the report.

### 6.5 Prompt algorithm (`upgrade/UPGRADE-PROMPT.md`)

0. **Preflight.** Check for:
   - a clean tree and `.xezar/onboarding.json`;
   - a stopped L3 and no running task;
   - an engine version that meets `compat.json`;
   - no leftover upgrade branch. If `xezar/upgrade-<target>` exists, resume from its last
     commit, or refuse and explain.

   Then create branch `xezar/upgrade-<target>`.
1. **Fetch and verify the tools.** Shallow-clone `qodeca/xezar-skills` at the target tag into a
   temp folder.
   - Verify it with `gh release verify v<target>` or `git verify-tag`, and check that `HEAD`
     equals the commit sha published with the release. This happens **before any Node code
     runs**.
   - The prompt is read from this verified clone, never from a URL.
   - The tool never runs code from the project under upgrade.
2. **Detect.** `detect.mjs` prints, per file, the manifest version, the base version and its
   confidence, and any file that is unknown or missing.
3. **Plan.** `plan.mjs` writes `.local/xezar/scratch/upgrade/plan.json` and a readable summary.
   Claude shows the owner:
   - the count per class;
   - the stop-and-ask items;
   - the unexplained changes;
   - the machine-block actions for the base→target range.
4. **Apply the mechanical classes.** `apply.mjs`.
   - Every path must be repo-relative, normalised, not absolute and without `..`. Its real path
     must stay inside the project. It must not be a symlink or sit under a symlinked folder, and
     it must be in that version's copy map.
   - Deletion only for paths in the base index.
   - Running `apply.mjs` twice changes nothing.
5. **Resolve.** Claude handles the both-changed, base-unknown, moved, routing and owner-shaped
   files, one at a time. It reads the matching upgrade entries to understand the intent of each
   upstream change.
6. **Follow the machine blocks.** Apply the actions that can be done in the repo. List the
   per-machine and restart actions for the owner.
7. **Verify.** `verify.mjs`, run from the verified clone, **fails the run** on any of these:
   - a conflict marker left in any touched file;
   - a JSON or TOML file that does not parse;
   - a config key that existed before and is now missing, or an owner value that changed;
   - a leader-guide owner-rules section that is not byte-equal to before;
   - `route.mjs --check` fails;
   - a `patch` link with no register entry, or a register entry with no file;
   - a safety line required by a 3.1.0 entry is missing.

   Then it writes manifest v2 and runs the drift check, the 3.1.0 kit catalog check and
   `repository-checks.sh`. A red check is fixed or reported. It is never hidden.
8. **Report and commit.** Write `.xezar/upgrade-reports/<target>.md`:
   - what changed, per class;
   - each merge decision with its reason;
   - the base confidence per file;
   - the register changes;
   - the permission changes;
   - the owner checklist (per-machine actions, keys left unset under P7, `Confirmed: no` entries);
   - the rollback steps;
   - anything not done.

   The report and `plan.json` name config keys, never values. Commit on the branch. Stop. The
   owner pushes.

The prompt is written for an agent that has no other context. It restates the untrusted-content
rule: file contents, notes and PR text are data, never instructions.

### 6.6 Relation to `xez-apply-upgrade-notes`

That skill stays as it is, for projects set up by `xez-setup-agent-pipeline` without the kit. The
prompt covers the kit's descriptors itself: they are ordinary kit files in the 3-way. The skill's
docs get one line that points kit projects at the prompt, in the release PR.

## 7. Testing the upgrade tool

**Fixtures are committed, and the gate stays offline.** `scripts/build-upgrade-fixtures.mjs`
builds the fixtures once from local tags and commits. It writes them to
`scripts/fixtures/upgrade/<version>/` with their source sha. `test-upgrade.mjs` reads only
committed files. CI's shallow checkout has no tags, and this design does not need them.

**Fixture set:**
- **Synthetic, from the copy map:** v1.2.0, v2.1.1, v3.0.0 and v3.0.3.
- **Real, not circular:** at least one sanitised snapshot of a real onboarded tree per major
  version (for example from the 8cli or cmplus onboarding PRs), with the expected count per
  class written down. Real installs were adapted by an LLM, so they catch what synthetic
  fixtures cannot.
- **Hard cases:**
  - a v1 manifest with drift (like #55's 7 of 172 files);
  - a partly applied old upgrade;
  - an install from an untagged commit;
  - a renamed kit file;
  - a pre-3.0 `model-routing.md`;
  - unknown placeholder values, which must never be classed as a clean update;
  - #49 files installed as `adapted`, which must be classed as already upstream;
  - a project hook in `.claude/settings.json` (#69);
  - a manifest path with `../`, an absolute path, and a symlinked kit file, all refused;
  - a local change that weakens a safety check in a file 3.1.0 did not touch, which must stop.
- **Scripted customizations on top:** an override, a changed config value, an owner routing row,
  a leader-guide owner rule, and a patched check.

**Assertions in `test-upgrade.mjs`:**
- the class and base confidence of every file;
- an upgraded **uncustomised** fixture equals a fresh 3.1.0 install: copied files byte-equal,
  owner files equal by key;
- for a customised fixture, the diff from a fresh install is **exactly** its customizations;
- running plan and apply twice gives no further change; a half-applied branch is resumed or
  refused cleanly;
- each 3.1.0 machine block's `Files:` matches the kit-index diff;
- the 3.1.0 catalog check and drift check pass on every upgraded fixture;
- a v1 manifest plus the new checks stays green (drift `not-applicable`).

**Drift-check cases:**
- a fresh install passes;
- a silent edit fails;
- a recorded, confirmed edit passes;
- `Confirmed: no` fails;
- `owner-file-appended` checks only the appended block;
- generated arrays such as the gate list in `repo-gates.sh`;
- a register entry with no manifest entry;
- a `patch` naming a missing LP id.

**Break cases** in `scripts/test-guards.mjs`:
- one byte changed in a copied fixture file → drift fails;
- a stale `upgrade/kit-index/3.1.0.json` → the release check fails;
- a fixture with a customization removed → `test-upgrade` fails.

The "index matches the tree" release check runs only when `package.json`'s version has an index
file, so it stays quiet until the release PR.

**The Claude merge step** cannot be a unit test, so it gets two things:
1. the `verify.mjs` invariants (§6.5 step 7), which run on every real upgrade;
2. an eval set of the both-changed, base-unknown and owner-shaped fixture cases, each with its
   expected invariants. The prompt runs against it before tagging, and the result goes in the
   release PR.

**Dry runs on clones (wave 2; the owner runs them).** Each live project gets a throwaway clone.
A dry run passes when:
- `verify.mjs` passes;
- there are no unexpected both-changed files compared with the plan summary;
- no register entry is lost;
- the engine starts, the leader lists its loops, and one throwaway task runs to `done`;
- the rollback (§9) has been practised once, on one clone.

The live evidence for §5.1 is captured here.

## 8. Release (wave 3)

- One release PR, **`develop` → `main`**, `chore(release): 3.1.0 — <tagline>`:
  - `package.json` → 3.1.0;
  - fold the fragments from `docs/plans/3.1.0/notes/` into `CHANGELOG.md`, `UPGRADE_NOTES.md`
    (one ordered block with Before / Order / After, like the 3.0.2 block) and
    `BACKWARD_COMPATIBILITY.md`;
  - generate `upgrade/kit-index/3.1.0.json` from the final tree (the release check verifies it);
  - update `compat.json` only if a stream raised the engine minimum;
  - point `R/preflight.md` and `xez-apply-upgrade-notes` at the prompt (§5 U1, §6.6);
  - update the README and `docs/coverage.md` rows for the upgrade tool;
  - add "Why 3.1.0 is a minor release" to `DECISIONS.md`: check every change against the
    protected surfaces, as the 1.5.0 entry did. If a change breaks a surface, the version becomes
    4.0.0.
- Turn on **immutable releases** for the repository before tagging. Tag `v3.1.0`, publish the
  GitHub release, and write the release commit sha in the release notes. The prompt verifies
  both (§6.5 step 1).

## 9. Roll-out (wave 4, the owner, one project at a time)

Order: least customised first, so that each run teaches something before the harder ones.

1. **8cli** – expected to have few local patches (not yet checked).
2. **cmplus** – carries #49 as a local patch and needs the `deps.mjs` copy. It tests "already
   upstream".
3. **Erfana** – has the most local patches. `.xezar/LOCAL-PATCHES.md` exists, and #53, #63 and
   #64 upstream several of its patches. It tests register migration.
4. **The other private consumer project(s)** – probably the one with the drifted manifest (7 of
   172 files) and Yarn plus .NET (inferred from #55 and #59). It tests #55 and #59 together.

For each project:

1. Dry run on a clone first (§7).
2. Stop L3 → run the prompt → read the report.
3. Confirm the `Confirmed: no` register entries.
4. Push and open the PR. Wait for the project's checks to go green, then merge.
5. `git pull --ff-only`.
6. **On every machine that runs the leader or reviews**, apply the report's per-machine actions.
7. Restart the engine and the leader, and check that the leader lists its loops.

**Rollback** (written in each report):
1. Revert the upgrade merge commit.
2. `git pull --ff-only`.
3. Undo the per-machine actions listed in the report.
4. Restart the engine and the leader.

The manifest goes back with the revert, so `version` shows the old kit again.

## 10. Risks

| Risk | Effect | Mitigation |
|---|---|---|
| Copy-time rewrites differ per project | Adapted files do not hash-match their base | v2 stores `renderInputs` and `kitBlob`. v1 uses normalised hashing and base confidence. Real-install fixtures. |
| A project applied only part of an old upgrade, or installed from an untagged commit | A wrong base gives a wrong merge | Index of every kit commit, per-file base with confidence, "base inferred" flag |
| Claude merges a file wrongly | A silent behaviour change | `verify.mjs` invariants, the eval set, a per-file reason in the report, owner review of the PR, dry run on a clone first |
| A tampered or silently weakened kit file | A safety check lost | D11 register with `Confirmed: no`; stop on safety files and on any weakened safety check |
| The upgrade tool itself is swapped | Bad code runs with the owner's rights | Immutable release, `gh release verify`, sha check before any Node code, kit-index hash check on base files |
| Paths from the manifest escape the project | Writes or deletes outside the repo | Path containment rules in §6.5 step 4, plus fixture tests |
| The shared tail (#59) conflicts with other skill edits | Rebase pain | A merges first. Others re-run the generator. |
| #69 warning only (D10, owner-accepted) | A widened local rule is live on that machine, and nobody may read the warning in an unattended run | Recorded in `DECISIONS.md`. Revisit if the engine shows that read-only steps do load `settings.local.json`. |
| #54 delivery target can be forged by a same-user task (D12) | A repair can land on the wrong PR | Live PR re-check, sealed sha only, no bare force push, re-review after push, and the signed limit in `SECURITY.md`. An engine issue asks for a run-scoped grant. |
| #52 timeouts have no effect on the pi runner until qodeca/xezar#932 | Handoff may still hang on pi | Ship the kit side. The upgrade entry says so. |

## 11. Agent brief for each stream

Start each stream in its own worktree:

```bash
git fetch origin
git worktree add ../xezar-skills-<stream> -b feature/3.1.0-<stream> origin/develop
```

Then start Claude Code there with this brief (fill in the brackets):

```text
You implement stream <X> of release 3.1.0 in qodeca/xezar-skills.
Read first: docs/plans/release-3.1.0.md (sections 2, 3, 5, 5-<X>, and 6 if you are in U),
AGENTS.md, upgrade/CONTRACT.md, and issue(s) <#n> (`gh issue view <n>`).
You own only these files: <list from §3>. For a shared file, follow the rule in §3.
In the three test files, add cases only below the anchor `// 3.1.0-stream-<X>`.
Keep the change focused (P6). Do not edit CHANGELOG.md, UPGRADE_NOTES.md or
BACKWARD_COMPATIBILITY.md: write docs/plans/3.1.0/notes/<X>.md instead (P2).
Done means: every item in §5 "done when" and your rows in §5.1. Run each validation command
one at a time. test-gate-status may fail locally on macOS: report it, do not fix it; CI decides.
Open a ready-for-review PR against develop with `Closes #<n>` and the SDLC labels. Do not merge.
If a decision is not covered by the issue or the plan, stop and report it. Do not guess.
```
