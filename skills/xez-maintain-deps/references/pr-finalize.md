# PR finalize — open or reuse, labels, summary comment, markers

The single procedure for the "commit → push → open (or reuse) the PR → normalize labels → summary comment → chaining reference lines" mechanics (steps 10 and 12 of the skill body). The point is **one** implementation of PR opening + labeling, reused rather than copied, and never a second PR for work that already has one.

## Never open a duplicate PR

Before opening anything, check whether a PR already exists for this branch (or, in an issue-driven run, one that references the issue) via **search-prs** / **get-pr**. If one exists, **reuse it** — push new commits to its head branch and update its body/labels — never open a second PR. Only the skill that first opens the PR owns opening it; everyone else updates that same PR.

## Prefer the `xez-open-pr` skill when installed

`xez-open-pr` already implements exactly this: it commits the worktree, pushes the branch, opens a **ready-for-review** PR against `$BASE_BRANCH` (draft only with `--draft`) with the unified body template, applies the locally established label set (pipeline the local review-ready label, category, QA meta, one priority, one risk) through the descriptor guards with rationale comments, posts the caller's summary comment, and (in an issue-driven run) hands the issue back and releases the local active-ownership label lock — emitting the `PR:` / `Issue:` chaining reference lines. When it is installed, **delegate to it** instead of re-deriving the steps:

- Issue-driven run (an `{issueId}` is in scope): invoke `xez-open-pr {issueId} {category}` (add `--plan <path>` when an execution plan exists, `--draft` for a spec-only design PR) and capture the PR number and URL from its `PR:` reference line.
- Brief- or spec-driven run (no issue — e.g. `xez-auto-create-pr`): invoke it without `{issueId}`; the issue-handback and lock-release parts don't apply.

## Graceful fallback when `xez-open-pr` is NOT installed

`xez-open-pr` is an **optional** enhancement — a repo may install this skill without it, and it must still work. When `xez-open-pr` is absent, perform the mechanics inline:

1. Commit the worktree changes with a conventional-commit subject; push the branch.
2. Open the PR via the tracker operation **create-pr** against `$BASE_BRANCH`, with the body template below.
3. Normalize labels per the section below.

Detect availability simply: if invoking `xez-open-pr` is not possible in this environment (skill not present), take the inline path. Behavior is identical either way — the same PR, the same labels — so installing `xez-open-pr` only removes duplication, it never changes the outcome.

## Early draft PR, then ready

The run **always** leaves a PR the user can watch, even when it never finishes:

1. **Open early as a bare draft** — right after the plan's first commit (skill step 6), open the PR via **create-pr** with the draft flag, carrying the body template's `Tracking plan:` line and `Status: in-progress`. Keep it bare here — no labels, no summary yet; those are premature on a run that just started. This is the natural point: the branch has its first commit, so an interrupted run leaves a draft PR carrying the committed plan/Progress rather than a branch with no PR. (Do **not** delegate this early open to `xez-open-pr` — that skill also applies labels and posts a summary, which belong at steps 10–12.)
2. **Reuse it** — steps 10–12 update this same PR (never open a second one): apply labels (delegating to `xez-open-pr`'s reuse path when installed — it refreshes the body and labels without disturbing the draft state), run the review pass, post the summary comment.
3. **Flip to ready at completion** — at cleanup (skill step 13), once `Status:` is `complete` (all Progress steps `- [x]`), promote the draft with **mark-pr-ready**. A run with `Status: in-progress` stays a draft for the user to resume. A spec-only design PR stays draft by intent.

## Verification comments on the PR

Verification proofs land on the PR, not only in the plan. Keep the validation outcome and material limits in the PR body; the end-of-run comment links its evidence; when a verification (validation gate, integration or UI check) runs mid-flight and is worth surfacing before the summary, post it as its own idempotent comment with the marker `` 🤖 `xez-apply-upgrade-notes` — verification `` (re-run updates it in place). Attach screenshots via **attach-image-evidence** whenever UI was touched.

## PR body

Use the body shape in the specifics section below — a conventional-commit-prefixed title scoped to the primary area. This skill writes no execution plan, so it emits no `Tracking plan:` line and no `Status:` line: there is nothing for a continuation skill to resume, and emitting an empty plan reference would make a chained consumer look for one.

## Label normalization

Apply labels from the config's taxonomy after opening the PR, always through the `apply_label` guard from the tracker descriptor (missing labels degrade to a logged skip; `labels.enabled: false` skips everything — note that in the summary comment). This is the canonical label contract for every PR-opening skill; `xez-open-pr` carries the canonical version of these rules.

- Choose the locally documented initial workflow state and applicable category labels.
- Apply QA-required or QA-not-required signals only as project policy permits, never contradictory signals. An authoring run cannot award QA approval. Required QA stays pending until the authorized reviewer supplies evidence.
- Use priority/risk groups and exclusivity only when established locally. Infer values using the project's criteria and explain uncertainty; do not impose missing groups.
- After applying the label set, post **one** consolidated rationale comment covering every applied label — never one comment per label (that spams the PR timeline and multiplies tracker API calls). Labels are still applied individually through the `apply_label` guard; only the commentary consolidates. The comment carries the standard idempotent marker, so a re-run updates it in place.
- When `qaGate` is `true`, a PR requiring QA will not be mergeable until QA signs off with the local QA-passed label. Do not add the local QA-passed label from this skill — it is earned by manual QA or the self-QA exception. State in the PR summary that manual QA is still pending.

Consolidated label-rationale comment — exactly **one** marker-idempotent comment from this skill per PR, listing only the labels actually applied: **one label per line**, each with a relevant shared-glossary emoji and a full-sentence reason (drop lines for labels not applied; never compress into a `·`-concatenated one-liner). On any later label change — a pipeline transition, a priority/risk adjustment — find the marker via **list-issue-comments** and rewrite this same comment via **update-comment** so it always describes the current label state; never post an additional per-change comment (when the descriptor lacks **update-comment**, post a replacement stating it supersedes the previous rationale):

```markdown
🤖 `xez-auto-create-pr` — 🏷️ label rationale

- 🏷️ `{actual local label}` — {full-sentence reason supported by project policy and this change}.
```

Label decoration is optional; use the shared glossary for meaning and the actual local label string for tracker operations. Do not infer labels from emoji.

## Summary comment

Every run ends with one outcome and handoff comment: the run’s delta, verification result or evidence link, and next action. Keep the enduring explanation in the PR body; do not repeat its scope or label rationale. Post it via the tracker operation **comment-pr** with a body file so multi-line formatting is preserved. The shape for this skill is in `references/report-templates.md`. Never post it before the automated review loop (step 11) finishes, never claim a completion you did not reach, and never paste secrets into it.

## Marker emission

End the run's final report with the chaining reference lines, one per line, exact shape — include `Issue:` only when the run has a subject issue:

```
Issue: #<issue number> (link: <full issue URL>)
PR: #<PR number> (link: <full PR URL>)
```

Chained consumers (`xez-auto-review-pr`, `xez-auto-qa-pr`, orchestration scripts) parse these exact text markers — never rename, translate, or decorate them.

## xez-maintain-deps specifics

- **One pull request per update group**, per `grouping.md`. Reuse an open one for the same
  group (**search-prs**) instead of opening a second.
- **Title:** `chore(deps): <group> updates — <n> packages` (`fix(deps):` for a security group,
  because it fixes something).
- **Body**, in this order:
  - 🎯 one line: what changes for whom. For a security group, the advisory and what it exposes;
    otherwise, what drift this closes.
  - 📋 a table: package, from, to, and why it is in this group. Advisory id and severity as extra
    columns for a security group.
  - 💥 the blast radius — `UPDATE_OTHERS_MOVED` per member, and the total count of transitive
    packages whose locked version changed. A reviewer shown "1 package updated" for a change that
    moved thirty has been misled by omission.
  - 🧪 the gate result in full, with each command named. "Tests pass" is not evidence.
  - ⚠️ anything that could **not** be checked, and why. A dropped section reads as a clean result.
- **Labels:** category `dependencies`; `risk-high` for a security group or any major bump,
  `risk-low` for a patch group whose gate passed clean. Apply the full canonical set per step 6
  above.
- **Never mark it ready to merge on the strength of the gate alone.** This skill proposes; the
  decision to take a version is the maintainer's.
