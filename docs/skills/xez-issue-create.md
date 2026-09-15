# xez-issue-create

> 🧑‍💻 Interactive — acts once, may ask questions, hands control back

Draft or file one bug, feature, task, or question. Supply a brief, intended destination when known, supporting evidence, and an existing receipt on resume. Works without pipeline setup, Git, or a remote tracker.

Modes: **draft-only**, **interactive-create** (approve the exact artifact), and **authorized-autonomous-create** (an explicit bounded filing brief already authorizes publication). An autonomous flag, silence, a generic continuation nudge, or selecting this skill grants nothing. Launching it through a slash command, a `task_create` skill source, or a future New-issue button is not a filing grant. Duplicate candidates stop creation; unavailable search leaves a local draft; ambiguous create outcomes stop retries.

## Parameters

| Parameter | Required | Meaning |
| --- | --- | --- |
| Brief | Yes | Problem or desired outcome; explicit filing words establish publication intent. |
| Tracker/project | No | Intended destination, otherwise resolved from existing context. |
| Supporting evidence | No | Known facts and references used in the draft. |
| Operation receipt | On resume | Existing authority, approved content, and attempt state. |

## Works with

Use [xez-prepare-issue](xez-prepare-issue.md) for pipeline-labelled issues with spec links. Unlike `xez-prepare-issue`, this path creates no spec PR, comments, or existing-issue updates. It favors project templates and supports nonsoftware work. Outputs are `created`, `existing-match`, `draft-only`, or `unknown-outcome`, with a receipt and next action.

See the bundled [examples](../../skills/xez-issue-create/references/examples.md) and [qualification checklist](../../skills/xez-issue-create/references/verification.md). Backend and live-tracker qualification must be recorded separately from content lint.

---
*Source: [`skills/xez-issue-create/SKILL.md`](../../skills/xez-issue-create/SKILL.md)*
