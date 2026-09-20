# xez-auto-fix-issue

> 🤖 Autonomous — runs end-to-end without supervision

Takes a tracker issue (a GitHub issue by default) from a single command all the way to a labeled, reviewed PR — without disturbing your active worktree. It first classifies the issue: a bug is driven through the autofix chain (verify → root-cause → fix → open PR → review loop), while a feature request takes the spec-then-build route instead. Everything happens in an isolated worktree under the in-progress claim protocol, and the run stops cleanly when the issue is already solved or already claimed by someone else. Use it for "fix issue 123" or "implement issue 123".

## Parameters

| Parameter | Required | Description |
|---|---|---|
| `{issueId}` | Yes | The tracker issue number (a GitHub issue number by default), e.g. `1234`. |
| `{repo}` | No | `owner/name`; inferred from the current git remote when omitted. |
| `--interactive` | No | Feature route only: opt into human gates so the spec is written with interactive Open Questions stops instead of autonomous defaults. |
| `--slug <kebab-case>` | No | Feature route only: override the derived slug (passed through to delegated skills). |
| `--no-ui` | No | Skip UI verification. On the bug route it skips step 10; on the feature route it is passed through. |
| `--loop` | No | Feature route only: forwarded verbatim to `xez-auto-implement-spec` when the user passed it; the route never adds it on its own. |
| `--force` | No | Bypass the in-progress concurrency check; use only when intentionally taking over an issue another actor claimed. |

## Works with

Consumes an `{issueId}` and finishes by emitting the `PR:` / `Issue:` chaining reference lines for the next skill in a chain. On the bug route it invokes [xez-verify-in-repo](xez-verify-in-repo.md), [xez-root-cause](xez-root-cause.md), [xez-fix](xez-fix.md), [xez-open-pr](xez-open-pr.md), and [xez-auto-review-pr](xez-auto-review-pr.md); on the feature route it delegates to [xez-auto-write-spec](xez-auto-write-spec.md) and [xez-auto-implement-spec](xez-auto-implement-spec.md).

---
*Source: [`skills/xez-auto-fix-issue/SKILL.md`](../../skills/xez-auto-fix-issue/SKILL.md)*
