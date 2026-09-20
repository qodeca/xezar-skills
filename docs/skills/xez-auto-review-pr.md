# xez-auto-review-pr

> 🤖 Autonomous — runs end-to-end without supervision

Reviews or re-reviews a PR by number in an isolated worktree, leaving your current worktree untouched. It fetches the exact PR from the tracker, runs the code-review engine (or a specification review for spec-only design PRs), submits an approve/request-changes verdict, and manages the pipeline labels. When changes are requested it enters an autonomous autofix loop — resolving conflicts, fixing code, adding tests, validating, and re-reviewing — until the PR is genuinely merge-ready or only a non-actionable blocker remains. That loop runs on the automation's own PRs; on another author's PR it runs only with `--autofix`, so an uninstructed run never modifies somebody else's branch. Usage: `/xez-auto-review-pr <PR-number> [--autofix]`.

## Parameters

| Parameter | Required | Description |
|---|---|---|
| `{prNumber}` | Yes | The PR number to review or re-review, e.g. `1234`. |
| `--autofix` | No | Run the autofix loop even when the PR belongs to another author. Without it the loop runs only on PRs authored by the current user. The fixing chains pass it explicitly. |
| `--force` | No | Bypass the in-progress concurrency check; use when intentionally taking over a PR another auto-skill or human already claimed. |

## Works with

Consumes a `{prNumber}` (the `PR:` reference line a PR-producing skill emitted), reviews that existing PR, and ends by reporting its verdict (`APPROVED` / `CHANGES REQUESTED`) plus the `PR:` reference line (and `Issue:` when known) for the next skill in a chain. It runs [xez-code-review](xez-code-review.md) verbatim as its review engine inside the isolated worktree, and is itself invoked by chain skills such as [xez-auto-fix-issue](xez-auto-fix-issue.md), [xez-auto-fix-pr](xez-auto-fix-pr.md), and [xez-auto-qa-pr](xez-auto-qa-pr.md).

---
*Source: [`skills/xez-auto-review-pr/SKILL.md`](../../skills/xez-auto-review-pr/SKILL.md)*
