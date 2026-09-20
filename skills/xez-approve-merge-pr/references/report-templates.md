# Merge report

Use after the merge attempt. Follow `references/rules.md`; keep the outcome,
reason, and next action in 3–6 lines before the chaining fields.

```markdown
🚀 `xez-approve-merge-pr` — {merged | queued for auto-merge | refused | awaiting confirmation}: {title}.
{Why: merge confirmed, checks still pending, or the specific gate that stopped it.}
{Only if needed: next action, approval limitation, or follow-up issue and assignee.}
```

Queued is not merged. Name pending required checks. A refusal names the gate and
how to clear it: CI failures → `xez-auto-fix-pr {prNumber} --ci-only`; conflicts
or review findings → `xez-auto-fix-pr {prNumber}`; QA and hard label blocks need
the human path in the skill. Disclose disabled label checks or a rejected
self-approval when relevant. Mention branch deletion only if requested and done.
Omit routine passed-gate lists and “no follow-up requested.”

End with these exact fields. `Head:` is the commit every gate was evaluated against and the commit the merge was pinned to — a merge verdict that names no commit certifies nothing. Include `Base:` when the merge base moved during the run, and the issue only when this run has one:

```text
PR: #<number> (link: <full PR URL>)
Issue: #<number> (link: <full issue URL>)
Head: <head commit sha>
```
