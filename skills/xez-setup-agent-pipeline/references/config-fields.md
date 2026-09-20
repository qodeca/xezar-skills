# Config field notes

## Field reference

Every key in the schema, one bullet each.

- `baseBranch` — the branch PRs target. `"auto"` means resolve at runtime from the repository's default branch; set an explicit name only when PRs target something else.
- `tracker` — selects `.xezar/pipeline/trackers/<tracker>.md`. Shipped values are `"github"`, `"linear"` (Linear issues + GitHub PRs/CI), and `"jira"` (Jira Cloud issues + GitHub PRs/CI); see Tracker providers below.
- `browser.provider` — the browser-automation provider used by QA and integration-test skills. Selects `.xezar/pipeline/browsers/<provider>.md`. Fresh setups default to `"agent-browser"`; configs without this key keep legacy Playwright behavior (see Browser providers).
- `validation.commands` — ordered list of shell commands that constitute the full validation gate. Skills run them in order and treat any non-zero exit as a gate failure. Keep the list complete: typecheck, lint, tests, build — whatever proves the repo is healthy.
- `labels.enabled` — when `false`, skills skip every label operation and note that in their PR summaries. Use this for repos that do not want the label workflow.
- `labels.pipeline` — mutually exclusive workflow states. A PR carries at most one.
- `labels.category` — additive kind-of-change labels.
- `labels.meta` — additive process signals resolved from the project's workflow and tracker descriptions. Discover the labels (if any) for QA required, QA passed, active ownership and CI observation. Never invent a mapping from spelling alone. CI observation is not ownership; missing labels do not bypass required QA or claims recorded by other means.
- `labels.priority` and `labels.risk` — local urgency and impact categories; preserve the project's exclusivity and inference rules. Do not impose either group on a project that does not use it.
- `qaGate` — preserve existing required QA and independent approval semantics. Turning labels off never waives required verification. When the project has no documented mapping, report the missing mapping and keep gated delivery pending.
- `ci.maxWaitMinutes` — bounded CI observation (default `40`, `0` means no wait). Report pending checks honestly when it expires and release only the run's own observation signal. Required checks still gate merge.
- `gates.failClosed` — optional; when `true`, a gate that reports `unknown` blocks every stage that reads it, not only the merge. Default `false`, so an upgrade changes nothing until someone opts in.
- `gates.requireVerdictHead` — optional; when `true`, a verdict that does not name the commit it certifies (the `Head:` line) is refused. Default `false`; fresh setups get `true`. Both keys are read from the base branch on a gate path — `references/config-fields.md`.
- `gates.designGate` — optional; when `true`, a change the project marked as needing a design answer does not pass review until the project's design-accepted marker is present. Default `false`, so nothing changes on upgrade. Both markers belong in the **meta** group, not the mutually-exclusive pipeline group.
- `toolchain.providers` — optional **list** of dependency-lifecycle providers, each selecting `.xezar/pipeline/toolchains/<name>.md`. A list because one repository often has several ecosystems. Empty or absent means no toolchain operation applies — `not-applicable`, never `unknown`. Shipped: `npm`, `cargo`; scaffold others from `references/toolchains/TEMPLATE.md`.
- `security.provider` — optional; selects `.xezar/pipeline/security/<name>.md`. **No default.** Absent means every supply-chain operation is `not-applicable` and nothing runs, so an upgrade never silently gains a stage that executes descriptor commands. Shipped: `osv-scanner`; scaffold others from `references/security/TEMPLATE.md`.

- `engine.executorTier` — optional; the default abstract model tier (`cheap` / `standard` / `capable`) for executor subagents dispatched by the loop skills when a Tasks-table `Exec` cell names none. Harnesses that support subagent model selection map the tier onto their closest model class; others ignore it. Configs without the key behave as `standard`.
- `engine.loopStepThreshold` — the Step count above which `xez-auto-create-pr` hands a run off to `xez-auto-create-pr-loop` (default 20). Raise it to keep more runs on the cheaper plain engine; `--loop` always forces the loop regardless.
- `engine.stepReview` — optional; how often the loop skills code-review landed work mid-run: `final` (default), `checkpoint`, or `per-step`. Trade-offs and the fix-now/defer split: `references/config-fields.md`.
- `paths.runs` — where execution plans of autonomous runs are stored.
- `paths.analysis` — where generated reports are stored.
- `paths.specs` — where feature specifications live (default `.xezar/pipeline/specs`). Spec filenames follow `{YYYY-MM-DD}-{kebab-case-title}.md`. `xez-spec-writing` writes here, `xez-prepare-issue` links from here, `xez-followup-issue-from-pr` checks here first in design-doc mode, and `xez-brainstorm` writes handoff briefs under `<paths.specs>/briefs/`.
- `paths.scripts` — where reusable environment scripts are generated (default `.xezar/pipeline/scripts`); `xez-prepare-test-env` writes the env bring-up/teardown scripts here.
- `paths.qa` — where QA working state and artifacts live (default `.local/qa`): the shared `test-env.json` descriptor, and QA reports/screenshots under `<paths.qa>/artifacts_<runId>/`.
- `reviewChecklist` — optional path to a repo-local review checklist file. When set, the `xez-code-review` skill reads it in addition to its built-in checklist. Use the existing project checklist when present; no particular filename is required.
- `closeKeywords` — optional extra words that mark a PR as closing an issue, for repositories whose PR bodies are not written in English. They **extend** the built-in English keywords, never replace them, and a run that finds issue mentions with no recognized keyword reports them rather than passing over them silently. Worked example and the silent failure it prevents: `references/config-fields.md`.

Long-form notes for the config fields whose full explanation does not belong in the
skill body. The body keeps a one-line bullet per field; this file holds the reasoning,
the failure it prevents, and the worked example.

## `closeKeywords`

Extra words that mark a pull request as closing an issue, for repositories whose PR
bodies are not written in English.

`xez-close-fixed-issues` matches the built-in English keywords — `fix`/`fixes`/`fixed`,
`close`/`closes`/`closed`, `resolve`/`resolves`/`resolved` — plus everything listed
here, case-insensitively and only immediately before a `#N` token. Configured words
**extend** the built-ins; they never replace them, so adding one cannot cost you a match
you already had.

The failure this prevents is silent. The tracker's own closing-reference parser is
English-only as well, so a Polish repository writing `Zamyka #88` gets no closing signal
from either source — the issue simply stays open and nobody is told why. Setting
`["zamyka", "naprawia", "rozwiązuje"]` fixes it. Leave the list empty on an English
repository.

Whatever the setting, a run that finds issue mentions with no recognized keyword
**reports them** rather than passing over them silently. A gap you can see is worth more
than a guess.

## `engine.stepReview`

How often the loop skills code-review landed work mid-run.

| Value | Behaviour |
|---|---|
| `final` (default) | Only the authoritative end-of-run review. |
| `checkpoint` | Review the diff at every checkpoint pass. |
| `per-step` | Review each Step's commit as it lands. |

Blocker and major findings are fixed immediately as `X.Y-review-fix` Steps; minor
findings defer to the final review, which runs in every mode. Raising the frequency buys
earlier detection at the cost of more review passes over the same code.

## `gates.failClosed`, `gates.requireVerdictHead` and `gates.designGate`

Both default to `false`, and both are read from the **base branch's** config, never the
working tree — see `agentic-setup.md` in a gate skill for why.

`gates.failClosed` decides what a gate does when it could not be evaluated at all. With
`false` (the default, and what every existing installation gets on upgrade) a gate that
reports `unknown` is disclosed in the report and the run continues; the merge gate still
refuses, because refusing to merge on unknown evidence was already its behaviour. With
`true`, `unknown` blocks every stage that reads it, not just the merge. Turn it on when
the pipeline's checks are trusted enough that "we could not check" should stop work.

`gates.requireVerdictHead` decides whether a verdict must name the commit it certifies.
With `false`, a report with no `Head:` line is read as `unknown` and the run carries on —
which is what lets a pull request opened before the line existed still merge. With
`true`, a verdict with no `Head:` line is refused. Fresh setups get `true`; upgrades keep
`false` until someone changes it, because turning it on retroactively would refuse work
that was correct when it was done.

Both switches are off-by-default by design: an upgrade must be a no-op until somebody
opts in. Each carries an owner and a review date in `DECISIONS.md`, under the rule that
an off-by-default switch with no expiry quietly becomes permanent.

### `gates.designGate`

Where a project's own process document already describes a design stage — for a user-facing
change, the flow and its states settled before the code exists: what the screen does when empty,
loading, in error, and without permission — that stage usually has no enforcement behind it, so
it happens when someone remembers.

With the switch on, a change that the project marked as needing a design answer does not pass
review until the project's design-accepted marker is also present. A change with no such marker
is unaffected: the gate applies to what somebody flagged, not to every change.

<!-- example:start -->
For a project using the example taxonomy, that means a change carrying `needs-design` waits for
`design-approved`.
<!-- example:end -->

Both markers belong in the **meta** group, deliberately. The pipeline group is mutually exclusive
— a change is in exactly one of its states — and a design question does not replace any of them.
A change can be in review and waiting on a design answer at the same time, and modelling that as
a pipeline state would force a false choice.

Off by default because an upgrade must be a no-op, and because a gate nobody asked for turns
every user-facing change into a stall. Owner: the collection maintainers. Review date:
2027-09-20.
