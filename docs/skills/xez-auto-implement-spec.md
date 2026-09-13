# xez-auto-implement-spec

> 🤖 Autonomous — runs end-to-end without supervision

Takes an existing spec and returns an implemented, code-reviewed, UI-verified, ready PR with screenshots of the working app in its comments. It resolves the spec by path, name, linked issue, or spec-PR number (stopping cleanly with candidate suggestions when not found), reuses an existing spec-PR branch when one is present, then delegates the actual implementation to the create/continue engine before running the review loop and UI verification. It is deliberately thin — resolution and routing only. Use it for "implement the spec X" or "build spec from issue 123".

## Parameters

| Parameter | Required | Description |
|---|---|---|
| `{spec}` | Yes | The spec to implement: a repo-relative path, a spec name/slug, an issue id whose body links a spec, or a spec-PR number. |
| `{repo}` | No | `owner/name`; inferred from the git remote when omitted. |
| `--no-ui` | No | Skip end-of-run UI verification even when the change is user-facing. |
| `--loop` | No | Forwarded verbatim to `xez-auto-create-pr` on a fresh run, which then hands off to the loop engine immediately; never re-routes an existing run. |
| `--force` | No | Bypass claim-conflict checks (passed through to the engine skill). |

## Works with

Continues on the spec PR that [xez-auto-write-spec](xez-auto-write-spec.md) may already have opened rather than opening a second one, and ends with the `PR:` / `Spec:` chaining reference lines. It delegates implementation to [xez-auto-create-pr](xez-auto-create-pr.md) (fresh runs — the engine self-routes to [xez-auto-create-pr-loop](xez-auto-create-pr-loop.md) for long plans) or [xez-auto-continue-pr](xez-auto-continue-pr.md) (when a PR exists; the loop continue variant when the PR tracks a run folder), then runs [xez-auto-review-pr](xez-auto-review-pr.md) and [xez-auto-qa-pr](xez-auto-qa-pr.md), with [xez-open-pr](xez-open-pr.md) as a fallback piece.

---
*Source: [`skills/xez-auto-implement-spec/SKILL.md`](../../skills/xez-auto-implement-spec/SKILL.md)*
