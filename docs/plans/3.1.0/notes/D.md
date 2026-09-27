# Stream D – #52 workflow timeouts, #63 reviewers run the change (D13)

## Changelog

**Every agent step in every kit workflow has its own time limit (#52).** Until now only the main
agent step of an authoring workflow carried `timeout: 2h`; the `handoff` step and the single step
of every reading workflow carried none, so their limit was the runner's default – and the last
step's default is no limit at all. On the pi runner a handoff sat for minutes after its fix was
sealed, and one hung. Now `handoff` steps get `15m`, reading and review steps `2h`, the earlier
steps of `deploy`, `integration` and `release` `30m` (the default they already fell through to),
their closing report steps `1h`, `root-sync` `30m`, `issue-filing` `1h`, and the release publish
step `12h`. The kit's `catalog-check.mjs` refuses an agent step with no `timeout`, or with
`timeout: none`. The limit takes effect on pi once the engine honours step timeouts
(qodeca/xezar#932).

**Every review and QA step can run the change it judges, and use the whole browser (#63, D13).**
The `qa`, `design-review`, `code-review`, `security-review`, `architecture-review` and
`acceptance-verification` review steps now hold every chrome-devtools tool – `emulate`,
`evaluate_script`, `lighthouse_audit`, the performance and heap tools – and a new script,
`.xezar/checks/review-run.sh`: it checks the PR's head out in the run's own worktree, installs,
runs one project command (tests, build) and starts or stops a dev server. It refuses git, gh,
shells and wrappers. The steps still have no Edit or Write tool. A verdict needs the tree the
review found: `verdict-write.sh` runs `review-run.sh finish` first and refuses the packet when HEAD
or a tracked file changed. QA and design review may now move their own labels (`qa-approved` and
`needs-qa`, `design-approved` and `needs-design`) through `gh-write.sh` with a verdict request –
only for the PR's current head, after checking it out, on an unchanged tree. Review preflights
run strict, without `--allow-root`. `catalog-check.mjs` refuses a review step without
`review-run.sh` or without the full browser set, an Edit or Write tool in one, and a review-only
browser tool anywhere else. The accepted cost – running PR code runs it with the operator's user
rights – is in `SECURITY.md` and `DECISIONS.md`. Found in Erfana (qodeca/erfana#177, #202).

## Upgrade entry

**Symptom.** A `handoff` step (or a review step) runs with no time limit and can hang the run
after its work is sealed; or a review or QA run stops on "Permission to use
mcp__chrome-devtools__emulate has been denied" (or `evaluate_script`, `lighthouse_audit`), or
cannot start the app it should test.

**What to do.** Copy the kit's workflows, `catalog-check.mjs`, `gh-write.sh`, `verdict-write.sh`,
the new `review-run.sh`, the seven role skills and the chrome-devtools descriptor listed below. A
project with **its own** workflows gives each agent step a `timeout` (`15m` for a handoff, `2h`
for a main step) – the new check refuses one without. A project that kept its own review
workflows adds `"bash .xezar/checks/review-run.sh"` to each review step's `bashAllowlist`, grants
it every `mcp__chrome-devtools__*` tool the kit's `code-review.yaml` lists, and drops
`--allow-root` from its preflight.

**What you lose by skipping it.** Handoff and review steps keep no time limit on runners that
apply none; review and QA steps keep stopping on browser-tool denials, cannot start the app they
test, and QA and design review cannot move their own labels.

```upgrade
Applies-to: <3.1.0
Files: .xezar/checks/catalog-check.mjs; .xezar/checks/gh-write.sh; .xezar/checks/review-run.sh =new; .xezar/checks/verdict-write.sh; .xezar/pipeline/browsers/chrome-devtools.md; .xezar/skills/xezar-acceptance.md; .xezar/skills/xezar-architecture.md; .xezar/skills/xezar-code-review.md; .xezar/skills/xezar-qa.md; .xezar/skills/xezar-security-review.md; .xezar/skills/xezar-ui-design.md; .xezar/skills/xezar-ux-design.md; .xezar/workflows/acceptance-verification.yaml; .xezar/workflows/address-review-findings.yaml; .xezar/workflows/architecture-review.yaml; .xezar/workflows/architecture.yaml; .xezar/workflows/bug-fix.yaml; .xezar/workflows/business-analysis.yaml; .xezar/workflows/code-review.yaml; .xezar/workflows/dependency-maintenance.yaml; .xezar/workflows/deploy.yaml; .xezar/workflows/deprecation-plan.yaml; .xezar/workflows/design-review.yaml; .xezar/workflows/design-system.yaml; .xezar/workflows/design.yaml; .xezar/workflows/docs-maintenance.yaml; .xezar/workflows/feature-implementation.yaml; .xezar/workflows/hotfix.yaml; .xezar/workflows/integration-tests.yaml; .xezar/workflows/integration.yaml; .xezar/workflows/issue-filing.yaml; .xezar/workflows/issue-triage.yaml; .xezar/workflows/localisation.yaml; .xezar/workflows/migration.yaml; .xezar/workflows/observability.yaml; .xezar/workflows/performance.yaml; .xezar/workflows/plan-and-spec.yaml; .xezar/workflows/qa.yaml; .xezar/workflows/refactor.yaml; .xezar/workflows/regression-suite.yaml; .xezar/workflows/release-prep.yaml; .xezar/workflows/release.yaml; .xezar/workflows/research.yaml; .xezar/workflows/root-sync.yaml; .xezar/workflows/security-review.yaml; .xezar/workflows/spike.yaml; .xezar/workflows/testing-and-verification.yaml; .xezar/workflows/ui-design.yaml; .xezar/workflows/ui-tests.yaml; .xezar/workflows/visual-asset.yaml
```

## Compatibility rows

Ledger rows for `BACKWARD_COMPATIBILITY.md` (dated on the release day):

| Date | What changed | Who it affects | What they must do | Why it was worth it |
|---|---|---|---|---|
| 2026-09-27 | the kit's `catalog-check.mjs` refuses an agent step with no `timeout`, or with `timeout: none` | a project that copies the new `catalog-check.mjs` and has **its own** workflow with an agent step and no `timeout` – its gate turns red until the step gets one | add a `timeout` such as `15m` or `2h` to each agent step, sized for the job (`UPGRADE_NOTES.md`) | without it the limit is the runner's default, and the last step's default is none: a handoff that hangs after its work is sealed holds the run open (#52) |
| 2026-09-27 | the kit's `catalog-check.mjs` requires every review and QA step (`qa`, `design-review`, `code-review`, `security-review`, `architecture-review`, `acceptance-verification`) to carry `review-run.sh` and every chrome-devtools tool, refuses Edit or Write in one and `--allow-root` in its preflight, and refuses the review-only browser tools in any other workflow (D13) | a project that copies the new `catalog-check.mjs` and kept its own review workflows, or granted `emulate`, `evaluate_script` or another review-only tool elsewhere | copy the kit's six review workflows, or add `review-run.sh` and the full browser list from `code-review.yaml` to each review step; remove the review-only tools from any other workflow | a reviewer that cannot run the change passes what it cannot see; the grant stays in exactly the steps that judge a change and cannot edit it (#63) |
