# xez-auto-write-spec

> 🤖 Autonomous — runs end-to-end without supervision

Turns a feature brief or a feature-request issue into a fully written spec that lands on a published PR, unattended. It runs `xez-spec-writing` in autonomous mode (resolving open questions into documented default assumptions), and for UI-facing features attaches current-app screenshots and proposed-UI mockups as PR evidence when a browser provider is available. It applies the full SDLC labels, keeps high-stakes assumptions gated as a draft, and emits PR/spec markers for chaining. Use it for requests like "write a spec for X and open a PR" or "spec this issue".

## Parameters

| Parameter | Required | Description |
|---|---|---|
| `{brief}` or `{issueId}` | Yes (one of the two) | A free-form feature brief, or a tracker issue id whose body supplies the brief. With an issue, the claim protocol applies and the PR carries `Refs #{issueId}`. |
| `{repo}` | Optional | `owner/name`; inferred from the git remote when omitted. |
| `--slug <kebab-case>` | Optional | Override the slug used in branch and spec filenames. |
| `--no-mockups` | Optional | Skip the mockup/screenshot step even for UI-facing specs. |
| `--force` | Optional | Bypass the claim-conflict check. |

## Works with

Requires [xez-spec-writing](xez-spec-writing.md) as its document engine and prefers [xez-open-pr](xez-open-pr.md) to ship the spec (with an inline create-pr fallback); UI evidence uses [xez-prepare-test-env](xez-prepare-test-env.md) plus a browser provider, degrading to a text-only spec when unavailable. It ends with the `PR:` / `Spec:` (and `Issue:` when issue-driven) reference lines so the spec PR feeds [xez-auto-implement-spec](xez-auto-implement-spec.md) (or the feature route of [xez-auto-fix-issue](xez-auto-fix-issue.md)), which reuse the same branch and PR.

---
*Source: [`skills/xez-auto-write-spec/SKILL.md`](../../skills/xez-auto-write-spec/SKILL.md)*
