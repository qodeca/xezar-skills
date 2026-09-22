# Backward compatibility

What this repository considers a **protected contract surface** and how changes to one must be handled. Review skills flag violations as Critical; implementation skills warn the user before shipping one. The consumers of these contracts are installed copies of the skills in third-party repos and the repos' committed `.xezar/pipeline/` state – neither of which this repository can migrate for them.

## Protected surfaces

### 1. Skill names and the directory layout

From 1.0.0 the contract is: every skill lives at `skills/<name>/SKILL.md`, its frontmatter `name` equals the directory, and the name carries the `xez-` prefix. Installed skills are invoked by name (`/xez-auto-create-pr`), skills reference each other by name, and repo-local overrides bind by name at `.xezar/pipeline/overrides/<name>.md`.

- **Breaking:** renaming or removing a skill, changing the `xez-` prefix.
- **Required path:** keep the old name as a deprecated alias skill for at least one release cycle, note the rename in `README.md`, `DECISIONS.md` and `UPGRADE_NOTES.md`, and update the roster in `skills/xez-setup-agent-pipeline/references/skill-coverage.md` in the same PR.

### 2. The config file (`.xezar/pipeline/config.json`)

Written once per consumer repo by `xez-setup-agent-pipeline` and read by every skill via the standard loading snippet. Consumer repos commit this file; they will not regenerate it on upgrade. The path itself is part of the contract, and so are the `paths` defaults every loading snippet falls back to when a key is absent:

| Key | Default |
|---|---|
| `paths.runs` | `.xezar/pipeline/runs` |
| `paths.specs` | `.xezar/pipeline/specs` |
| `paths.scripts` | `.xezar/pipeline/scripts` |
| `paths.qa` | `.local/qa` |

`xez-onboard-opinionated` added thirteen keys that only its own kit reads: eleven in 1.5.0 with the `docs/` work, and two more that arrived earlier, in 1.4.0, with the portability work. All are additive; none has a loader default, on purpose — a kit role with its key unset names the key and stops, and a guarded workflow refuses. Renaming or removing one, or loosening a list's element grammar, is breaking.

| Key | Written for a new project as | Read by |
|---|---|---|
| `paths.designs`, `paths.architecture`, `paths.spikes`, `paths.runbooks`, `paths.deprecations`, `paths.performance`, `paths.migrations` | `docs/<name>` | the kit's role skills; `paths.migrations` also by `kit/checks/deploy-guard.sh` |
| `deploy.environments`, `deploy.rollback` | `[]`, elements `<environment>=<workflow file>` | `kit/checks/config-guard.sh`, `kit/checks/deploy-guard.sh` — always from the remote's default branch |
| `performance.budgets` | `[]`, elements `<metric>=p<NN><<limit>@n=<runs>` | `kit/checks/config-guard.sh` |
| `localisation.locales` | `[]`, locale tags | `kit/checks/config-guard.sh` |
| `ci.requiredChecks` | `[]`, check names exactly as the check-runs API reports them | `kit/checks/integration-preflight.sh` |
| `paths.designSystem` | `docs/design-system`, or the project's own | the kit's design role skills |

The `ci.requiredChecks` and `paths.designSystem` rows were missing from this table until
2026-09-21. `DECISIONS.md` records them being created in the **1.4.0 portability** work — the same
change that removed twenty-three engine-repository strings — and not alongside the eleven keys
above, which are the 1.5.0 `docs/` work. Different work, different release; that is why they were
missed. They are listed now so the next reader does not have to re-derive whether they are
protected. **They are.** A third key created in that same 1.4.0 work, `ci.knownLoadFlakes`, was
removed on 2026-09-21 — see the ledger below, which is what a removal from this list looks like
when it is done deliberately.

`config.version` stays at `1`. A version bump signals to a reader that their file may need
migrating; here nothing on disk does. A config carrying the removed key still parses, still
validates, and the key is simply never read again — so a bump would send every project looking
for a migration that does not exist. The removal is recorded in the ledger instead, which is where
a reader is told what changed.

The line `reversibility: one-way` in a page under `paths.migrations` is read by `deploy-guard.sh`; its spelling is part of the contract.

Three gate switches were added on 2026-09-20, all optional and all defaulting to `false`, so an existing config keeps its behaviour untouched:

| Key | Default | Meaning of the default |
|---|---|---|
| `gates.failClosed` | `false` | A gate reporting `unknown` is disclosed and the run continues. The merge gate refuses on `unknown` either way — it does not read this key. |
| `gates.requireVerdictHead` | `false` | A verdict with no `Head:` line is read as `unknown` and tolerated. Fresh setups get `true`. |
| `gates.designGate` | `false` | A change marked as needing a design answer passes review without one. |

Flipping any of these **defaults** is breaking, because it changes what an unmodified consumer repo does on upgrade. All three are read from the base branch's config on a gate path, never the working tree.

- **Breaking:** moving the file, removing or renaming a key, changing a key's meaning, value format or default, making a previously optional key required.
- **Not breaking:** adding a new key with a default in the loading snippet (`jq -r '.newKey // "default"'`).
- **Required path:** new keys always ship with defaults so existing configs keep working; a genuinely incompatible change needs a `version` bump plus explicit migration handling in `xez-setup-agent-pipeline` and an entry in `UPGRADE_NOTES.md`.

### 3. The tracker operations contract

The named operations (**get-issue**, **create-pr**, **comment-pr**, **merge-pr**, …) and label guards (`label_exists`, `apply_label`, `apply_issue_label`, `remove_issue_label`, `set_pipeline_label`) defined by `skills/xez-setup-agent-pipeline/references/trackers/TEMPLATE.md`. Consumer repos hold committed, possibly team-edited copies at `.xezar/pipeline/trackers/<tracker>.md`.

- **Breaking:** renaming an operation, changing an operation's inputs/outputs, removing a guard, referencing a new operation from a skill without adding it to the template and shipped descriptors.
- **Required path:** add new operations to `TEMPLATE.md` and every shipped descriptor in the same PR; skills must degrade gracefully (documented fallback) when running against an older descriptor copy that lacks a newly added operation.

**A write operation carries its postcondition, never its verb.** `branch-protected` is named for the state the branch is in when the call ends, because "set branch protection" is one host's API and another host has no such call at all. Two rules bind every write operation added here: it states what happens without permission (refuse and print the command — never report a postcondition nobody reached), and its caller re-reads the state afterwards through the matching read operation. A write that returned success and a state that actually holds are different claims, and only the second is worth reporting.

**`get-pr`'s normalized fields** are part of this contract, not per-descriptor detail. A merge gate is portable only if `headRefOid`, `baseRefOid` and `reviewVerdict` mean the same thing on every tracker. A descriptor that cannot produce one emits the literal `unknown` — never a plausible-looking default, because a gate cannot tell a guess from a measurement. `reviewVerdict` is one of `approved` · `rejected` · `pending` · `not-enforced` · `unknown`, and `not-enforced` exists because some hosts report a request as approved when *no approval rule applies to it at all*; collapsing that to "approved" is the same fail-open shape as a label that was never created. Adding a value to that set, or changing what one means, is breaking.

**Operations added 2026-09-20:** **put-verification-record**, **get-verification-record**, **get-pr-template** and **get-issue-templates**. The two template operations degrade to "no template", which is `not-applicable` — plenty of repositories have none, and a skill that treated absence as a failure would refuse to file an issue in them. An older descriptor copy lacks both. The documented fallback is to report the record as unavailable and carry on — the record was never a gate input, so its absence costs the written trail, not the checking.

### 3b. The toolchain and security provider contracts

The toolchain operations (**toolchain-check**, **restore-dependencies**, **build**, **outdated**, **update-dependency**) defined by `skills/xez-setup-agent-pipeline/references/toolchains/TEMPLATE.md`, and the security operations (**security-check**, **security-scan**, **dependency-inventory**) defined by `references/security/TEMPLATE.md`. Consumer repos hold committed copies at `.xezar/pipeline/toolchains/<name>.md` and `.xezar/pipeline/security/<name>.md`.

Each operation is defined by its **postcondition**, never by a verb, and renaming one or changing what its postcondition guarantees is breaking. So is adding a status value outside the five, since consumers branch on them with a POSIX `case`.

- **`toolchain.providers` is a list.** Turning it back into a single value is breaking: a repository with two ecosystems configures both.
- **`security.provider` has no default, permanently.** Giving it one would make an upgrade silently gain a stage that executes descriptor commands. Absent is `not-applicable` — never `unknown`, which would look like a problem with every change.
- **Required path:** a new operation lands in the template and every shipped provider in the same PR, and every cell of the parity matrix in `scripts/test-toolchain-providers.mjs` gets an answer — including the cells where a provider genuinely cannot perform it, which are recorded as `not-applicable` with a reason rather than left blank.

### 4. The browser-provider operations contract

The named browser operations (**ensure-installed**, **doctor**, **open**, **snapshot**, **interact**, **assert**, **screenshot**, **close**) defined by `skills/xez-setup-agent-pipeline/references/browsers/TEMPLATE.md`. Consumer repos hold committed, possibly team-edited copies at `.xezar/pipeline/browsers/<provider>.md`.

- **Breaking:** renaming an operation, changing its inputs/outputs, or selecting a provider without installing its descriptor.
- **Required path:** update `TEMPLATE.md` and every shipped browser descriptor in the same PR. Browser consumers must retain the implicit Playwright fallback for configs and environment descriptors that carry no `browser` key.

### 5. Cross-skill file formats

- **Execution-plan `## Progress` section** (`- [ ]` / `- [x]` checklists with `N.M` step ids and ` — <sha>` suffixes) – written by `xez-auto-create-pr`, parsed by `xez-auto-continue-pr`.
- **PR body `Tracking plan:` and `Status:` lines** – written by `xez-auto-create-pr`, parsed by `xez-auto-continue-pr` and the loop skills.
- **`<paths.qa>/test-env.json`** – written by `xez-prepare-test-env`, consumed by `xez-auto-qa-pr` and `xez-integration-tests`. Readers accept both the provider-neutral `browser` object and the legacy `playwright` object.
- **Generated launcher scripts in `<paths.scripts>/`** – created by `xez-prepare-test-env`, re-run by later runs and other skills.
- **Chaining reference lines** (`PR: #<number> (link: <url>)`, `Issue: #<number> (link: <url>)`, `Spec: <path>`) – emitted at the end of every PR-producing/-driving skill's final report, parsed by the next skill in a chain and by session orchestrators. Consumers also accept the legacy `PR_URL=` / `PR_NUMBER=` / `SPEC_PATH=` lines; emitters write only the current form. Skills whose report carries a verdict about a pull request also emit `Head: <head commit sha>`, and `Base: <base commit sha>` where the merge base is part of what was judged, so the verdict names the commit it certifies. **A missing `Head:` line is legacy permanently, keyed to the artifact and not to a release:** a PR opened before the line existed and merged two releases later must not be refused, so a consumer reads its absence as `unknown` and carries on. Enforcement is opt-in through `gates.requireVerdictHead` (default `false`; fresh setups get `true`). The grammar is asserted by `scripts/test-chaining-lines.mjs`, which fills every documented template with realistic values and parses it, and rejects a renamed or re-punctuated label.
- **Routing lines from `xez-brainstorm`** (`Next: none` | `Next: xez-<skill> <args>`, plus `Brief: <repo-relative path>` when a handoff brief was written) – emitted at the end of its final report, parsed by session orchestrators to route the follow-up run. The `— brief: <path>` suffix inside the args is read by the routed skill (`xez-prepare-issue`, `xez-auto-write-spec`, `xez-spec-writing`, `xez-auto-create-pr`), which ingests the brief file per the brief lifecycle in `xez-brainstorm/references/exit-ramps.md`.
- **The `Gate:` verdict line and the gate `NAME=value` lines** emitted by `merge-gate.sh` and `gate-status.sh` – line-anchored `^Gate: ` (and `Status=` from the status script), one line per gate plus a `Blocking=` list. Parsers split a `NAME=value` line on the **first** `=` and never source the output as shell. `Status:` is reserved and is not the verdict keyword; renaming `Gate:` is breaking.
- **The verification record** (a fenced `text` block of `NAME=value` lines carrying `Head=`, `Base=`, `Skill=`, `At=`, repeated `Gate=`/`Status=` pairs and `Verdict=`) – written through **put-verification-record**, read through **get-verification-record**. Parsers split on the **first** `=` only, never source it as shell, and ignore names they do not know, so the grammar can grow without breaking a reader. A tracker with no record support, or a pull request with no record, is **not** a failure: the record was never a gate input, so a consumer reports it as unavailable and decides from the tracker API as it always did.
- **The five gate statuses** (`pass`, `findings`, `unknown`, `not-applicable`, `evidence-unavailable`) – produced by `gate-status.sh` and read by every gate consumer. Hyphenated, because the consumer is POSIX `sh` and an unquoted `case` word-splits on a space. Only `pass` and `not-applicable` are satisfied; renaming one, or adding a sixth that a consumer's `case` does not handle, is breaking.
- **The onboarding kit's routing file** (`.xezar/routing.json`, `schemaVersion: 1`, shape in `kit/routing.schema.json`) – written by `xez-onboard-opinionated`, edited by the owner through pull requests, read by `kit/checks/route.mjs`, and through it by the leader (`kit/docs/routing.md`) and the L2/L3 loops. It grows **additively**: a new field is optional, and `route.mjs` ignores a key it does not know and warns. Renaming or removing a field, changing what a field means, or adding a required one is breaking, and so is changing the `NAME=value` lines `route.mjs <row id>` prints (`lane=`, `removed=`, `wait=`, `also=` and the rest), which the leader parses after the first `=`. `defaults.version` is raised only when the shipped defaults change, and every version is kept under `references/routing-defaults/` for the upgrade comparison.
- **Discovery output lines from `xez-discover`** (`Product brief:`, `Coverage:`, `Collection plan:`, `Next:`) – line-anchored like the chaining lines; `product-brief.md` is read by `xez-brainstorm`, `xez-spec-writing` and `xez-prepare-issue` when present.

**Breaking:** changing any of these formats so an unmodified consumer skill can no longer parse output produced by a modified producer (or vice versa). **Required path:** update producer and all consumers in one PR, and keep the parser tolerant of the previous format when consumer repos may hold old artifacts (committed plans, descriptors).

### 6. The label taxonomy semantics

The pipeline/category/meta/priority/risk groups, their exclusivity rules, and the QA-gate meaning of `needs-qa`/`qa-approved`/`skip-qa`. Consumer repos have these labels created in their trackers and encoded in their committed `SDLC.md`.

- **Breaking:** renaming a label, changing a group's exclusivity, weakening the QA gate rule.
- **Required path:** additive labels only; renames need a documented migration note and support for both names in the skills for one release cycle.

`ci-monitoring` is a meta label, never a pipeline label: `in-progress` means *actively working*, and a run that has finished and reported swaps to `ci-monitoring` while it waits on CI. Claim detection must never treat `ci-monitoring` as a lock signal. Every skill applies and removes it through `apply_label`, so a repo that has not created it degrades to a logged skip.

### 7. Installer CLI (`package.json` scripts, `scripts/install-skills.mjs`)

`npm run install-skills` / `uninstall-skills` flags and behavior, and the skills.sh-compatible repo layout it relies on.

- **Breaking:** removing a script or flag, moving `skills/` – this breaks documented install instructions and skills.sh scanning.
- **Required path:** keep old flags as deprecated aliases; update README in the same PR.

## The ledger of deliberate breaks

Every break we chose, with its date and its reason. The point of writing them down is not
politeness: a break nobody recorded gets rediscovered years later as a bug, by someone who
then "fixes" it back.

Nine breaks have shipped, all deliberate. Each gets a row here on the day it ships:

| Date | What changed | Who it affects | What they must do | Why it was worth it |
|---|---|---|---|---|
| 2026-09-22 | the minimum engine version in `compat.json` raised from 0.18.0 to 0.19.0 | anyone running engine 0.18.x: the onboarding skill's preflight refuses until they upgrade | `npm install -g @qodeca/xezar`, or stay on xezar-skills 2.1.1, which supports 0.18.0 | 0.19.0 is the first engine that makes a reading step read-only on Claude, and the shipped routing gives review and release work only to lanes that rely on it |
| 2026-09-22 | the leader's routing moved from the prose table `.xezar/docs/model-routing.md` to `.xezar/routing.json`, read through `route.mjs`; the onboarding skill no longer writes the markdown table, and its `references/routing-rows.md` is gone | a project onboarded by `xez-onboard-opinionated` before 3.0.0 that copies the new `loops.json` or leader docs without migrating: the new L3 prompt runs `route.mjs`, which refuses when there is no `routing.json` on the base branch | run `/xez-onboard-opinionated --section routing`, which writes the file from the shipped defaults, carries the rotations over and deletes the markdown table; or keep the old `loops.json` and docs until you do (`UPGRADE_NOTES.md`) | a prose table cannot be checked, so a ban in it was a ban the leader had to remember; as data, every ban a file can decide is applied by a script, and routing is read from the base branch so a change under review cannot reroute its own review |
| 2026-09-22 | `paths.analysis` removed: no longer in the config the setup writes, not resolved by the loading snippet, no directory created | nobody in practice – nothing ever read it. A committed config that still has the key keeps working, because readers ignore it | nothing; optionally delete the key and the empty `.xezar/pipeline/analysis/` (`UPGRADE_NOTES.md`) | a key nothing reads misleads every reader of the config, and a major version is the one time removing it is allowed |
| 2026-09-22 | the kit's `catalog-check.mjs` refuses a `code-review`, `design-review` or `qa` workflow whose agent steps declare no `verdictRole`, and accepts the new step key | a project that kept its own copy of one of those three workflows | add `verdictRole: <role>` to the verdict step, or copy the kit's workflow (`UPGRADE_NOTES.md`) | engine 0.19.0 refuses every verdict packet from a step that declares no role, so the workflow would lose its verdicts in silence; the checker says so at load time instead |
| 2026-09-22 | the kit's `catalog-check.mjs` refuses a workflow step whose `allowedTools` holds neither `Edit` nor `Write` unless it carries a `bashAllowlist` of reading prefixes, or its workflow is one of the three that run code (`qa`, `acceptance-verification`, `design-review`); five kit workflows gained that allowlist, and a Bash rule in the project's `.claude/settings*.json` that is not a reading prefix is refused too | a project onboarded by `xez-onboard-opinionated` that copies the new `catalog-check.mjs` and has **its own** reading workflow – its gate turns red until the step is fixed | give the step `bashAllowlist` entries from the table in `catalog-check.mjs` (`READER_BASH_PREFIXES`), or add `Edit`/`Write` if it is really a writing step | no backend made such a step read-only: every one still gave it an open shell (xezar #849), so "read-only" was a label, and a reviewer that can write can change the thing it is judging |
| 2026-09-22 | the minimum engine version in `compat.json` raised from 0.16.0 to 0.18.0 | anyone running engine 0.16.x or 0.17.x: the onboarding skill's preflight now refuses until they upgrade | `npm install -g @qodeca/xezar` — 0.16.0 and 0.17.0 remain published, so nothing is forced on an existing project until it re-runs the skill | 0.18.0 is the first engine that answers a refusal before validating arguments and that exposes `import_global_accounts`; supporting engines without them meant carrying fallback branches nobody could test and a security exception wider than it needed to be |
| 2026-09-21 | `ci.knownLoadFlakes` removed from `.xezar/pipeline/config.json`, with the `knownLoadFlakes` and `failedJobsAreKnownLoadFlakes` fields of `ci-watch.sh`'s `outcome.json` and the one-rerun rule that read them | a project onboarded by `xez-onboard-opinionated` 1.4.0–1.6.1 (the release the key arrived in) that copies the new kit checks without the new role skills | copy `kit/skills/xezar-integration.md` **before or with** `kit/checks/ci-watch.sh` — the role is safe to copy first, the check is the one that must not lead; then delete the now-unread key | the mechanism taught a new project that a red build can be excused by naming a job, which is the opposite of the owner's rule that a flaky test is rebuilt, never retried |
| 2026-09-21 | the `DOGFOOD_GH`, `DOGFOOD_WORKFLOW`, `DOGFOOD_GATE_LOG` and `DOGFOOD_ALLOW_ROOT_BOOTSTRAP` environment variables renamed to `KIT_TEST_*` | anyone whose own tooling sets one of the four; they fail **silently**, not loudly | set the `KIT_TEST_` name instead, after copying the new check files | the word named a practice being removed from the kit entirely, and leaving four variables carrying it would have kept the thing findable and copyable |
| 2026-09-21 | the dogfooding fragment ledger removed: `kit/checks/dogfooding-fragments.mjs` deleted, its `repository-checks.sh` call removed, the producer sentence dropped from all 37 role skills, and the release role's fold step deleted | a project that has been writing `.xezar/docs/dogfooding.d/` fragments | nothing breaks on its own; the fragments stop being folded, so fold or delete them by hand once | it was one project's record-keeping habit shipped to every other project, and `AGENTS.md` forbids a skill assuming a practice only its home project has |

A row is written **in the PR that ships the break**, never afterwards. "We will document it
later" has the same success rate everywhere.

### Reserved, waiting for a major

Things that are wrong, that we are not fixing yet, because fixing them is a break.

None. `paths.analysis`, the one entry here, was removed in 3.0.0 (see the ledger).

## Out of scope

Prose wording inside skills, `references/` content that no other skill parses, README copy, and this repo's own CI workflows may change freely – they have no external consumers beyond fresh installs.
