# Stream D – #52 workflow timeouts, #63 QA and design-review browser tools

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

**QA and design review can check dark mode and reduced motion, and their shell only reads
(#63).** The `qa` and `design-review` review steps may now call the chrome-devtools `emulate` tool,
so a review no longer stops on a permission denial when it needs a colour scheme or a media
feature; no other workflow gets it, and `evaluate_script`, `upload_file` and the performance, heap
and lighthouse tools stay ungranted. Both review steps now carry the kit's reading
`bashAllowlist`, like `code-review` and `security-review`: they post and label through
`gh-write.sh`, and they no longer start the app or run the PR's code, so they review a change
that is already running. Both preflight steps run strict, without `--allow-root`. The browser
descriptor names `emulate` as allowed in those two workflows only, and `catalog-check.mjs` refuses
`emulate` anywhere else and a `qa` or `design-review` review step without a `bashAllowlist`.
Found in Erfana (qodeca/erfana#177, #202).

## Upgrade entry

**Symptom.** A `handoff` step (or a review step) runs with no time limit and can hang the run
after its work is sealed; or a QA or design-review run stops on "Permission to use
mcp__chrome-devtools__emulate has been denied" when it checks dark mode or reduced motion.

**What to do.** Copy the kit's workflows, `catalog-check.mjs`, the three role skills and the
chrome-devtools descriptor listed below. A project with **its own** workflows gives each agent
step a `timeout` (`15m` for a handoff, `2h` for a main step) – the new check refuses one without.
A project that kept its own `qa.yaml` or `design-review.yaml` adds the reading `bashAllowlist` from
`code-review.yaml` to the review step and drops `--allow-root` from the preflight. A QA or design
review now needs the change already running (a URL in the launch text or the PR): it cannot start
the app itself. `gh-write.sh` still refuses to add `qa-approved` or `design-approved` and to remove
`needs-qa` or `needs-design`, so those labels are moved by whoever holds that authority.

**What you lose by skipping it.** Handoff and review steps keep no time limit on runners that
apply none; QA and design review keep stopping on the `emulate` denial, and their shell stays
unrestricted, able to run the PR's code with the operator's permissions.

```upgrade
Applies-to: <3.1.0
Files: .xezar/checks/catalog-check.mjs; .xezar/pipeline/browsers/chrome-devtools.md; .xezar/skills/xezar-qa.md; .xezar/skills/xezar-ui-design.md; .xezar/skills/xezar-ux-design.md; .xezar/workflows/acceptance-verification.yaml; .xezar/workflows/address-review-findings.yaml; .xezar/workflows/architecture-review.yaml; .xezar/workflows/architecture.yaml; .xezar/workflows/bug-fix.yaml; .xezar/workflows/business-analysis.yaml; .xezar/workflows/code-review.yaml; .xezar/workflows/dependency-maintenance.yaml; .xezar/workflows/deploy.yaml; .xezar/workflows/deprecation-plan.yaml; .xezar/workflows/design-review.yaml; .xezar/workflows/design-system.yaml; .xezar/workflows/design.yaml; .xezar/workflows/docs-maintenance.yaml; .xezar/workflows/feature-implementation.yaml; .xezar/workflows/hotfix.yaml; .xezar/workflows/integration-tests.yaml; .xezar/workflows/integration.yaml; .xezar/workflows/issue-filing.yaml; .xezar/workflows/issue-triage.yaml; .xezar/workflows/localisation.yaml; .xezar/workflows/migration.yaml; .xezar/workflows/observability.yaml; .xezar/workflows/performance.yaml; .xezar/workflows/plan-and-spec.yaml; .xezar/workflows/qa.yaml; .xezar/workflows/refactor.yaml; .xezar/workflows/regression-suite.yaml; .xezar/workflows/release-prep.yaml; .xezar/workflows/release.yaml; .xezar/workflows/research.yaml; .xezar/workflows/root-sync.yaml; .xezar/workflows/security-review.yaml; .xezar/workflows/spike.yaml; .xezar/workflows/testing-and-verification.yaml; .xezar/workflows/ui-design.yaml; .xezar/workflows/ui-tests.yaml; .xezar/workflows/visual-asset.yaml
```

## Compatibility rows

Ledger rows for `BACKWARD_COMPATIBILITY.md` (dated on the release day):

| Date | What changed | Who it affects | What they must do | Why it was worth it |
|---|---|---|---|---|
| 2026-09-27 | the kit's `catalog-check.mjs` refuses an agent step with no `timeout`, or with `timeout: none` | a project that copies the new `catalog-check.mjs` and has **its own** workflow with an agent step and no `timeout` – its gate turns red until the step gets one | add a `timeout` such as `15m` or `2h` to each agent step, sized for the job (`UPGRADE_NOTES.md`) | without it the limit is the runner's default, and the last step's default is none: a handoff that hangs after its work is sealed holds the run open (#52) |
| 2026-09-27 | the kit's `catalog-check.mjs` refuses `mcp__chrome-devtools__emulate` in any workflow but `qa` and `design-review`, and no longer exempts those two from the reading `bashAllowlist` (`RUNS_CODE_WORKFLOWS` is now `acceptance-verification` only) | a project that copies the new `catalog-check.mjs` and kept its own `qa.yaml` or `design-review.yaml` without a `bashAllowlist`, or granted `emulate` elsewhere | copy the kit's two workflows, or add the reading `bashAllowlist` from `code-review.yaml` to the review step; remove `emulate` from any other workflow | a review that could run the PR's code with an open shell was read-only in name only, and `emulate` is a grant that should exist in exactly the two places that need it (#63) |
