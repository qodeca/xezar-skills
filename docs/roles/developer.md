# 👩‍💻 Developer

Hand the pipeline a brief, a spec, or an issue number and get back a labeled, reviewed PR — implemented phase by phase in an isolated worktree so your checkout stays clean, run through the validation gate, self-reviewed, and UI-verified with screenshots when the change is user-facing. Every PR-producing skill emits the `PR: #<number> (link: <url>)` reference line and reuses an existing PR instead of opening a duplicate, so the steps chain end to end. Long specs run on a resumable, step-tracked loop.

← Back to the [README](../../README.md#-workflows-by-role)

## Skills you'll use

| Skill | When | Example call | What you get |
|---|---|---|---|
| [`xez-auto-write-spec`](../skills/xez-auto-write-spec.md) | Author a spec from a brief | `/xez-auto-write-spec "CSV export for the orders grid"` | a ready spec PR with mockups + assumptions comment |
| [`xez-auto-implement-spec`](../skills/xez-auto-implement-spec.md) | Build an existing spec | `/xez-auto-implement-spec 2026-07-18-csv-export` | an implemented, reviewed PR with screenshots from the working app |
| [`xez-auto-fix-issue`](../skills/xez-auto-fix-issue.md) | Take any issue to a PR | `/xez-auto-fix-issue 123` | a finished, fully-labeled PR; bugs get the fix chain (regression tests, clean review), features get spec-then-build — classified and routed automatically |
| [`xez-auto-create-pr`](../skills/xez-auto-create-pr.md) | Ship an ad-hoc task | `/xez-auto-create-pr "Add rate limiting to the login endpoint"` | a labeled, self-reviewed PR from a free-form brief |
| [`xez-auto-create-pr-loop`](../skills/xez-auto-create-pr-loop.md) | Force/resume a step-tracked loop run | `/xez-auto-create-pr-loop "Implement the multi-tenant billing spec"` | a resumable, step-tracked PR (continue with [`xez-auto-continue-pr-loop`](../skills/xez-auto-continue-pr-loop.md)) |

## What happens automatically

- **Isolated worktrees** — every autonomous run works off a fresh branch worktree; your checkout is never touched.
- **Validation gate** — the configured commands run and any non-zero exit blocks the PR.
- **Self-review + autofix loop** — [`xez-auto-review-pr`](../skills/xez-auto-review-pr.md) reviews the diff and iterates fixes until merge-ready. On a spec-only PR it switches to a specification review (risks, backward compatibility, gaps, improvements, simplicity) and its autofix amends the spec document, never adds implementation.
- **UI verification** — user-facing PRs get screenshots + a pass/fail report from [`xez-auto-qa-pr`](../skills/xez-auto-qa-pr.md).
- **Chaining reference lines** — `PR: #<number> (link: <url>)` (plus `Issue:` / `Spec:` where defined) are emitted so the next skill continues the same PR, never a duplicate.
- **Full label set + run-summary comment** on the finished PR (pipeline + category + priority + risk + QA meta).
- **Claim locks** — the `in-progress` label + assignee + 🤖 comment make concurrent agents back off.

## Tips

- [`xez-auto-fix-issue`](../skills/xez-auto-fix-issue.md) is the **single issue entry point** — hand it any issue and it classifies first, driving bugs through the autofix chain and features through [`xez-auto-write-spec`](../skills/xez-auto-write-spec.md) + [`xez-auto-implement-spec`](../skills/xez-auto-implement-spec.md) on one PR. For a spec without implementation, run `xez-auto-write-spec <issue>` directly. Pass `--interactive` to answer Open Questions live, `--no-ui` to skip UI verification, `--force` to bypass a claim conflict.
- The plain [`xez-auto-create-pr`](../skills/xez-auto-create-pr.md) escalates to the loop variant ([`xez-auto-create-pr-loop`](../skills/xez-auto-create-pr-loop.md)) by itself past the configured Step threshold (`engine.loopStepThreshold`, default 20); pass `--loop` to force it up front.
- Resume anything interrupted: `xez-auto-continue-pr <PR>` for plain runs, `xez-auto-continue-pr-loop <PR>` for loop runs — they pick up from the first unchecked step.
- [`xez-auto-implement-spec`](../skills/xez-auto-implement-spec.md) resolves a spec by path, name, issue, or spec-PR number and reuses the spec PR's branch — pass `--no-ui` for backend-only specs, `--force` to bypass claim checks.
- Add `Closes #123` yourself only if you're opening the PR by hand; the skills manage the `Refs`→`Closes` linkage for you.
