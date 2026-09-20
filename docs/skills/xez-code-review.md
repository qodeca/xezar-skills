# xez-code-review

> 🧑‍💻 Interactive — acts once, may ask questions, hands control back

Reviews a diff, branch, or PR against correctness, security, breaking-change, and quality standards. It runs the configured validation gate (every failure is a blocker), applies a built-in review checklist plus any repo-local `reviewChecklist`, `CODE_REVIEW.md`, and `BACKWARD_COMPATIBILITY.md` rules, and produces severity-ranked findings (blocker / major / minor / nit) with a mechanical approve or request-changes verdict. It is the shared review engine used across the pipeline. Use it whenever you want a rigorous review of a change unit.

## Parameters

No flags. It takes one review unit as its input: a PR number, a branch, an explicit range or diff, or nothing — which means the current branch's diff.

## Works with

Accepts one review unit — a PR number, a branch, an explicit range/diff, or nothing (defaulting to the current branch's diff). It is the review engine invoked by [xez-auto-review-pr](xez-auto-review-pr.md) and [xez-review-prs](xez-review-prs.md), and by the self-review steps of [xez-auto-create-pr](xez-auto-create-pr.md) and [xez-auto-continue-pr](xez-auto-continue-pr.md), which consume its verdict and blocker/major findings.

---
*Source: [`skills/xez-code-review/SKILL.md`](../../skills/xez-code-review/SKILL.md)*
