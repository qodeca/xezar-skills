# 🧪 QA

The pipeline lets you boot the app once and reuse it for everything: UI verification of a PR in a real browser, and integration/E2E tests written against the live app with real locators. QA skills never modify source — they explore, capture screenshots, and report a verdict. The QA gate is yours: automated skills request QA (`needs-qa`); a human grants it (`qa-approved`). The one exception is a documented self-QA sign-off on a fully-green run, opted into explicitly.

← Back to the [README](../../README.md#-workflows-by-role)

## Skills you'll use

| Skill | When | Example call | What you get |
|---|---|---|---|
| [`xez-prepare-test-env`](../skills/xez-prepare-test-env.md) | Boot the app for QA/tests | `/xez-prepare-test-env` | a reusable booted app + shared test-env descriptor the other skills reuse |
| [`xez-auto-qa-pr`](../skills/xez-auto-qa-pr.md) | QA a PR's UI (evidence only) | `/xez-auto-qa-pr 123` | screenshots + a pass/fail report on the PR; no labels changed |
| [`xez-auto-qa-pr`](../skills/xez-auto-qa-pr.md) | Sign off your own green run | `/xez-auto-qa-pr 123 --self-qa-signoff` | `qa-approved` + `qa-self-verified` when fully green with screenshots on a `needs-qa` PR |
| [`xez-auto-qa-pr`](../skills/xez-auto-qa-pr.md) | Flag a broken UI | `/xez-auto-qa-pr 123 --apply-failure` | `qa-failed` applied with a comment on why |
| [`xez-integration-tests`](../skills/xez-integration-tests.md) | Add or run E2E coverage | `/xez-integration-tests` | integration/E2E tests against the live app, with artifact-based failure diagnosis |

## What happens automatically

- **Shared test env** — [`xez-auto-qa-pr`](../skills/xez-auto-qa-pr.md) and [`xez-integration-tests`](../skills/xez-integration-tests.md) reuse the same booted app from [`xez-prepare-test-env`](../skills/xez-prepare-test-env.md) instead of each spinning up their own.
- **Browser provider provisioned** — the configured provider (agent-browser by default; Playwright supported) is set up autonomously.
- **Evidence posted** — screenshots + a pass/fail report land as a PR comment via the tracker's image-evidence op (or saved locally when no tracker).
- **Labels stay untouched by default** — verification changes no labels unless you pass a sign-off/failure flag.
- **Native runners preserved** — integration tests respect the repo's own test runner; real locators and runtime fixtures, no hardcoded IDs.

## Tips

- [`xez-auto-qa-pr`](../skills/xez-auto-qa-pr.md) **checks the PR's review state first** — if the PR is still unreviewed it runs [`xez-auto-review-pr`](../skills/xez-auto-review-pr.md) before the browser QA, so a code review always precedes the UI pass.
- `qa-approved` is **human-owned** — the QA gate blocks merge until a person adds it, no matter how green the checks are.
- `--self-qa-signoff` is the only path to an automated `qa-approved` (+ `qa-self-verified`), and only when the run is fully green **AND** screenshots were attached **AND** the PR carries `needs-qa` without `skip-qa`. Never sign off a partial or environment-limited run.
- Use `--apply-failure` to mark `qa-failed` when the UI is broken; it never combines with `qa-approved`.
- Run `/xez-prepare-test-env` once at the start of a QA session — the other skills warm-reuse it, which is much faster than re-booting per PR.
- Integration tests explore the running app first for real selectors — boot the env before writing them so [`xez-integration-tests`](../skills/xez-integration-tests.md) sees live locators.
