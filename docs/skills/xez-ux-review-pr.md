# xez-ux-review-pr

> 🧑‍💻 Interactive — acts once, may ask questions, hands control back

The design-judgment layer that follows QA screenshots: walks a PR's screens in a real browser, **performing** the user's tasks (an empty dataset is a create-flow test, not a blocker), checks the state matrix (empty, loading, error, no-permission, narrow viewport), and posts one review comment where every finding carries tagged evidence, a pattern (ideally an existing screen in the repo that already does it right), a trade-off, and a done-when criterion. Findings are ranked by user impact, never by ease of fix. A humane gate checks every persuasive element against deceptive-pattern taxonomy — findings no conversion metric can dismiss. The delivered report speaks the reader's language, declares what was not walked, and never blocks a merge by itself.

## Parameters

Accepts a PR number, a branch name, or nothing (the current branch).

## Works with

Judges against the contract written by [xez-ux-setup](xez-ux-setup.md) when present (standards-only otherwise, stated in the report). Composes with [xez-prepare-test-env](xez-prepare-test-env.md) and the browser provider to bring the PR up; complements [xez-auto-qa-pr](xez-auto-qa-pr.md), which captures evidence without judging it. For module- or flow-level analysis, it defers to [xez-ux-shape](xez-ux-shape.md) in Review mode and serves as its evidence-gathering procedure.

---
*Source: [`skills/xez-ux-review-pr/SKILL.md`](../../skills/xez-ux-review-pr/SKILL.md)*
