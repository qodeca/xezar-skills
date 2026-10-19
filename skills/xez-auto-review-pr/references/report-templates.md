# Report templates — user-facing output (step 14)

The posted review owns the findings; the session reply reports the outcome and
next action. Follow `references/rules.md`. Aim for 3–6 lines plus chaining
references, expanding only for a decision or blocker that cannot be linked.

## Final run report

```markdown
🔍 `xez-auto-review-pr`: {APPROVED | CHANGES REQUESTED} — {concrete reason and recommended next action}.
{What changed during autofix or re-review, if anything; link the authoritative review.}
🧪 {Validation and required-CI outcome; any pending/failed/skipped checks and their consequence}.
{Remaining QA, decision, or access requirement; give the next action.}
```

When autofix was ineligible, preserve
`autofix: skipped (not my PR — re-run with --autofix to fix it here)`.
Surface inability to read inline feedback, a draft left intentionally incomplete,
or CI wait exhaustion when applicable. Link inherited feedback dispositions from
the review rather than listing them again. Do not repeat labels, the PR body,
resolved findings, or routine branch/claim metadata. Approval alone does not
establish that required CI and QA gates are satisfied.

End with exact chaining lines. `Head:` is the commit this verdict certifies; a later push makes the verdict stale rather than wrong, and a consumer can tell. Include `Issue:` only for a subject issue:

```text
PR: #<number> (link: <full PR URL>)
Issue: #<number> (link: <full issue URL>)
Head: <head commit sha>
```

## Review-verdict comment (steps 6, 10, 11, 13)

The durable verdict record `xez-approve-merge-pr` reads when the host enforces
no review — a host refuses self-approval when every agent runs under one login,
so the review itself may not exist. Post it on **every** verdict, also when
**review-pr** succeeded: find this marker with **list-issue-comments** among
comments whose author is `$CURRENT_USER`, rewrite it via **update-comment**, and
post it via **comment-pr** only when none exists — never a second one. Rewrite it
whenever the verdict or the head it covers changes (an autofix push, a step-13
CI result that flips the verdict). Exact shape — the marker is the first line,
and `Verdict:` / `Head:` are bare lines, each exactly once:

```markdown
🤖 `xez-auto-review-pr` — review verdict
🔍 {Approved | Changes requested} — {one-sentence reason}; review: {review link, or "not submitted: <reason>"}.
Verdict: {approved | changes-requested}
Head: <40-hex head commit sha>
```

`Head:` is the full 40-character sha the verdict covers. Emojis decorate; the
consumer keys on the text only (`^🤖 ` + optional backticks + `xez-auto-review-pr`
+ optional backticks + ` — review verdict`, `^Verdict: (approved|changes-requested)$`,
`^Head: ([0-9a-f]{40})$`). This shape is a protected surface
(`BACKWARD_COMPATIBILITY.md` §5).

## CI-result comment (step 13)

Update the existing `` 🤖 `xez-auto-review-pr` — CI result `` comment via
**update-comment**. Report the new result and consequence in 40–100 words;
link the checks and review rather than repeating them. A wait-budget exit still
includes every local `validation.commands` result, pending check names/links,
and **no further follow-up will come from this agent**. This ends
`ci-monitoring`; it never waives required CI. Procedure:
`references/ci-followup.md`.

## Completion comment (step 12)

Keep the exact release/retain marker from `references/claim-pr.md`
(`🤖 … completed: {VERDICT}. Lock released.` / `Lock retained — chain continues.`).
Add only the review link, changes made, and next action. Preserve the autofix
skip text when applicable. Update this comment in place on a re-run; do not
repeat the review or label rationale.
