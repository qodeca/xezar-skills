# xez-auto-create-pr

> 🤖 Autonomous — runs end-to-end without supervision

Turn a free-form task brief into a disciplined autonomous run that ships as a PR against the configured base branch. The skill drafts a lightweight, Progress-tracked execution plan, works on a fresh branch in an isolated worktree, implements phase-by-phase with incremental commits, runs the full configured validation gate, self-reviews for breaking changes, and opens a ready-for-review PR with normalized pipeline labels. The Progress checklist makes the run resumable — if it can't finish in one invocation, `xez-auto-continue-pr` picks up where it left off. Use it for arbitrary end-to-end tasks; when `--loop` is passed or the drafted plan exceeds the configured Step threshold (`engine.loopStepThreshold`, default 20), it hands the run to `xez-auto-create-pr-loop` by itself.

## Parameters

| Parameter | Required | Description |
|---|---|---|
| `{brief}` | Yes | Free-form task description, from one sentence to several paragraphs. |
| `--spec <ref>` | Optional | A spec to implement — a path, a spec name/slug, or an issue/PR number to resolve one from. Becomes the plan's source doc; stops if it can't be resolved. |
| `--skill-url <url>` | Optional (repeatable) | External skill or reference page to honor during planning and execution. Reference material only, never permission to bypass project rules. |
| `--slug <kebab-case>` | Optional | Override the slug used in the plan filename. Defaults to one derived from the brief. |
| `--loop` | Optional | Hand the run to `xez-auto-create-pr-loop` immediately, skipping the step count. Without it the loop is selected only when the drafted plan exceeds the configured Step threshold. |
| `--force` | Optional | Bypass the claim-conflict check when a previous run left a branch or plan behind. |

## Works with

Turns a `{brief}` into a new PR (detecting and reusing an existing PR for the same work rather than duplicating it), and ends by emitting the `PR:` / `Issue:` chaining reference lines for the next skill in a chain. Companion skills, all optional with inline fallbacks: [xez-open-pr](xez-open-pr.md) (PR opening/labels), [xez-code-review](xez-code-review.md) (self-review), [xez-auto-review-pr](xez-auto-review-pr.md) (the autofix loop), and [xez-auto-continue-pr](xez-auto-continue-pr.md) (resume).

---
*Source: [`skills/xez-auto-create-pr/SKILL.md`](../../skills/xez-auto-create-pr/SKILL.md)*
