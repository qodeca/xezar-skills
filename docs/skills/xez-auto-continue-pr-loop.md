# xez-auto-continue-pr-loop

> 🤖 Autonomous — runs end-to-end without supervision

The advanced counterpart to `xez-auto-continue-pr`, for resuming long spec-implementation runs started by `xez-auto-create-pr-loop`. Given a PR number, it claims the PR, re-enters an isolated worktree, reads `HANDOFF.md` for session context, parses the authoritative `## Tasks` table in the run folder's `PLAN.md`, and resumes from the first row whose status is not `done`, honoring the plan's `Exec` placement column when dispatching executors. It keeps the strict discipline of the creator loop — one lean commit per Step, verification batched into `checkpoint-<N>-checks.md` every ~5 Steps (with focused integration tests and screenshots when UI was touched), the full validation gate plus the repo's integration suite and a style-compliance pass at spec completion — and preserves the run-folder and label contract. Use the plain `xez-auto-continue-pr` for simple runs.

## Parameters

| Parameter | Required | Description |
|---|---|---|
| `{prNumber}` | Yes | The PR number to resume, e.g. `1492`. |
| `--force` | Optional | Bypass the in-progress concurrency check to take over a PR another auto-skill or human already claimed. |
| `--from <phase.step>` | Optional | Override the resume point (e.g. `2.1`). Only honored when the `## Tasks` table (and any legacy `## Progress` fallback) cannot be parsed unambiguously. |

## Works with

Consumes a `{prNumber}`, reads the `Tracking plan:` / `Tracking run folder:` line written by [xez-auto-create-pr-loop](xez-auto-create-pr-loop.md), and ends by emitting the `PR:` / `Issue:` chaining reference lines for the next skill in a chain. It invokes the companion skills [xez-open-pr](xez-open-pr.md) (push + label normalization), [xez-code-review](xez-code-review.md) (compatibility self-review), [xez-auto-review-pr](xez-auto-review-pr.md) (the autofix second pass), and [xez-integration-tests](xez-integration-tests.md) (checkpoint + final-gate suites). A PR with no resolvable plan at all was not created by a loop run, so it is handed to [xez-auto-continue-pr](xez-auto-continue-pr.md), which adopts it by reconstructing the plan from the PR's own context — and hands the run back here when that plan is long enough to need the loop engine.

---
*Source: [`skills/xez-auto-continue-pr-loop/SKILL.md`](../../skills/xez-auto-continue-pr-loop/SKILL.md)*
