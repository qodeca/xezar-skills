# xez-open-pr

> 🧑‍💻 Interactive — acts once, may ask questions, hands control back

The shared PR-opening step of the agent pipeline. It commits the worktree, pushes the branch, and either reuses an existing PR or opens a ready (non-draft) one against the configured base branch using the unified body template. It applies the full SDLC label set — pipeline, category, QA meta, one priority, one risk — with a rationale comment per label, and for issue-driven runs it hands the issue back to its author and releases the in-progress lock. It always ends by emitting the `PR: #<number> (link: <url>)` reference line (plus `Issue:` when issue-driven) so the next step can reference the PR.

## Parameters

| Parameter | Required | Description |
|---|---|---|
| `issueId` | Optional | Tracker issue id; when present the run is issue-driven (adds the linkage line, hands the issue back, releases the lock). Omit for brief- or spec-driven runs. |
| `repo` | Optional | Repository as `owner/name`; inferred from the git remote when omitted. |
| `category` | Optional | One of `bug`, `feature`, `refactor`, `security`, `dependencies`, `documentation`; drives the title prefix and category label. Inferred from the diff when omitted. |
| `--title <text>` | Optional | Full PR title; otherwise derives `<prefix>(<area>): <summary>` from the previous step. |
| `--plan <path>` | Optional | Execution-plan path; adds the tracking-plan/status lines and `## Progress` section so `xez-auto-continue-pr` can resume. |
| `--draft` | Optional | Open as a draft — only for explicitly incomplete work; default is ready for review. |
| `--summary-file <path>` | Optional | Caller-provided run-summary body, posted as a PR comment after labeling. |

## Works with

Called by the autofix chain (after [xez-fix](xez-fix.md), driven by [xez-auto-fix-issue](xez-auto-fix-issue.md)), [xez-auto-create-pr](xez-auto-create-pr.md), [xez-auto-continue-pr](xez-auto-continue-pr.md)/`-loop`, [xez-auto-write-spec](xez-auto-write-spec.md), and [xez-auto-implement-spec](xez-auto-implement-spec.md). It detects and reuses any PR already opened for the branch or issue rather than duplicating, and emits the `PR:` / `Issue:` reference lines that downstream skills like [xez-auto-review-pr](xez-auto-review-pr.md) consume.

---
*Source: [`skills/xez-open-pr/SKILL.md`](../../skills/xez-open-pr/SKILL.md)*
