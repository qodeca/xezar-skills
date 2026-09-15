# `xez-issue-create`

[Skill source](../../skills/xez-issue-create/SKILL.md)

Draft or file one bug, feature, task, or question. Supply a brief, intended destination when known, supporting evidence, and an existing receipt on resume. Works without pipeline setup, Git, or a remote tracker.

Modes: **draft-only**, **interactive-create** (approve the exact artifact), and **authorized-autonomous-create** (an explicit bounded filing brief already authorizes publication). Autonomy alone grants nothing. Duplicate candidates stop creation; unavailable search leaves a local draft; ambiguous create outcomes stop retries.

Unlike `xez-prepare-issue`, this path creates no spec PR, comments, or existing-issue updates. It favors project templates and supports nonsoftware work. Outputs are `created`, `existing-match`, `draft-only`, or `unknown-outcome`, with a receipt and next action.

See the bundled [examples](../../skills/xez-issue-create/references/examples.md) and [qualification checklist](../../skills/xez-issue-create/references/verification.md). Backend and live-tracker qualification must be recorded separately from content lint.
