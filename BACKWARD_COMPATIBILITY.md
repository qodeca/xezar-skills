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
| `paths.analysis` | `.xezar/pipeline/analysis` (**reserved, deprecated 2026-09-20** — resolved by the loader, read by nothing; kept because removing a `paths` key is breaking) |
| `paths.specs` | `.xezar/pipeline/specs` |
| `paths.scripts` | `.xezar/pipeline/scripts` |
| `paths.qa` | `.local/qa` |

- **Breaking:** moving the file, removing or renaming a key, changing a key's meaning, value format or default, making a previously optional key required.
- **Not breaking:** adding a new key with a default in the loading snippet (`jq -r '.newKey // "default"'`).
- **Required path:** new keys always ship with defaults so existing configs keep working; a genuinely incompatible change needs a `version` bump plus explicit migration handling in `xez-setup-agent-pipeline` and an entry in `UPGRADE_NOTES.md`.

### 3. The tracker operations contract

The named operations (**get-issue**, **create-pr**, **comment-pr**, **merge-pr**, …) and label guards (`label_exists`, `apply_label`, `apply_issue_label`, `remove_issue_label`, `set_pipeline_label`) defined by `skills/xez-setup-agent-pipeline/references/trackers/TEMPLATE.md`. Consumer repos hold committed, possibly team-edited copies at `.xezar/pipeline/trackers/<tracker>.md`.

- **Breaking:** renaming an operation, changing an operation's inputs/outputs, removing a guard, referencing a new operation from a skill without adding it to the template and shipped descriptors.
- **Required path:** add new operations to `TEMPLATE.md` and every shipped descriptor in the same PR; skills must degrade gracefully (documented fallback) when running against an older descriptor copy that lacks a newly added operation.

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
- **The verification record** (a fenced `text` block of `NAME=value` lines carrying `Head=`, `Base=`, `Skill=`, `At=`, repeated `Gate=`/`Status=` pairs and `Verdict=`) – written through **put-verification-record**, read through **get-verification-record**. Parsers split on the **first** `=` only, never source it as shell, and ignore names they do not know, so the grammar can grow without breaking a reader. A tracker with no record support, or a pull request with no record, is **not** a failure: the record was never a gate input, so a consumer reports it as unavailable and decides from the tracker API as it always did.
- **The five gate statuses** (`pass`, `findings`, `unknown`, `not-applicable`, `evidence-unavailable`) – produced by `gate-status.sh` and read by every gate consumer. Hyphenated, because the consumer is POSIX `sh` and an unquoted `case` word-splits on a space. Only `pass` and `not-applicable` are satisfied; renaming one, or adding a sixth that a consumer's `case` does not handle, is breaking.
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

## Out of scope

Prose wording inside skills, `references/` content that no other skill parses, README copy, and this repo's own CI workflows may change freely – they have no external consumers beyond fresh installs.
