# PR finalize — open or reuse, labels, summary comment, markers

The single procedure for the "commit → push → open (or reuse) the PR → normalize labels → summary comment → chaining reference lines" mechanics (step 6 of the skill body). The point is **one** implementation of PR opening + labeling, reused rather than copied, and never a second PR for work that already has one.

## Never open a duplicate PR

Before opening anything, check whether a PR already exists for this branch (or, in an issue-driven run, one that references the issue) via **search-prs** / **get-pr**. If one exists, **reuse it** — push new commits to its head branch and update its body/labels — never open a second PR. Only the skill that first opens the PR owns opening it; everyone else updates that same PR.

## Prefer the `xez-open-pr` skill when installed

`xez-open-pr` already implements exactly this: it commits the worktree, pushes the branch, opens a **ready-for-review** PR against `$BASE_BRANCH` (draft only with `--draft`) with the unified body template, applies the locally established label set (pipeline the local review-ready label, category, QA meta, one priority, one risk) through the descriptor guards with rationale comments, posts the caller's summary comment, and (in an issue-driven run) hands the issue back and releases the local active-ownership label lock — emitting the `PR:` / `Issue:` chaining reference lines. When it is installed, **delegate to it** instead of re-deriving the steps:

- This skill has no subject issue: invoke it without `{issueId}` (the issue-handback and lock-release parts don't apply) and capture the PR number and URL from its `PR:` reference line.

## Graceful fallback when `xez-open-pr` is NOT installed

`xez-open-pr` is an **optional** enhancement — a repo may install this skill without it, and it must still work. When `xez-open-pr` is absent, perform the mechanics inline:

1. Commit the worktree changes with a conventional-commit subject; push the branch.
2. Open the PR via the tracker operation **create-pr** against `$BASE_BRANCH`, with the body template below.
3. Normalize labels per the section below.

Detect availability simply: if invoking `xez-open-pr` is not possible in this environment (skill not present), take the inline path. Behavior is identical either way — the same PR, the same labels — so installing `xez-open-pr` only removes duplication, it never changes the outcome.

## Ready for review, never an early draft

Open the PR **ready for review** once the approved changes are applied and verified — this skill
writes no execution plan, so there is no early draft to resume. Open it as a draft only when the
run stopped on a `⚠ NEEDS HUMAN CONFIRMATION` point it could not resolve.

## Verification comments on the PR

Keep the step-6 sanity-check outcome (descriptors carry every operation the installed skills name, the browser provider resolves, the config parses) and material limits in the PR body. This skill touches no UI, so it attaches no screenshots.

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
🤖 `xez-apply-upgrade-notes` — 🏷️ label rationale

- 🏷️ `{actual local label}` — {full-sentence reason supported by project policy and this change}.
```

Label decoration is optional; use the shared glossary for meaning and the actual local label string for tracker operations. Do not infer labels from emoji.

## Summary comment

Every run ends with one outcome and handoff comment: the run’s delta, verification result or evidence link, and next action. Keep the enduring explanation in the PR body; do not repeat its scope or label rationale. Post it via the tracker operation **comment-pr** with a body file so multi-line formatting is preserved. The shape for this skill is in `references/report-templates.md`. Never claim a completion you did not reach, and never paste secrets into it.

## Marker emission

End the run's final report with the chaining reference line, exact shape — this skill has no subject issue, so it emits no `Issue:` line:

```
PR: #<PR number> (link: <full PR URL>)
```

Chained consumers (`xez-auto-review-pr`, orchestration scripts) parse these exact text markers — never rename, translate, or decorate them.

## xez-apply-upgrade-notes specifics

- **Opened with the pre-upgrade descriptor.** Every tracker operation in this file runs from the
  descriptor as committed on the base branch, not from the upgraded copy the PR proposes.

- **What the PR contains.** Only pipeline artifacts: tracker, browser, toolchain and security
  descriptors, `labels.json`, and `config.json` keys an UPGRADE_NOTES entry introduced. Never
  application source, never tests, never the skills installation itself.
- **Title:** `chore(pipeline): apply upgrade notes through <date of the newest entry applied>`.
- **Body**, in this order:
  - 🎯 what stopped working, or could not happen, before this — the *symptom* each applied
    entry names, not the entry's title. A reader approving a descriptor diff needs to know what
    it fixes.
  - 📋 one line per applied entry: the date, the artifact, and the operation affected.
  - ⚠️ every local customization that was **preserved** rather than replaced, named by section.
    This is the part a reviewer checks hardest: the team edited those sections deliberately.
  - Entries deliberately **not** applied, with the reason — a symptom that does not match this
    repository is a decision, and silence about it reads as an oversight.
- **Labels:** category `dependencies`, and risk by blast radius — a merge-path or gate
  descriptor is `risk-high` however small the diff, because it changes what every later run
  does. Apply the rest of the canonical set per **Label normalization** above.
- **One PR per run.** Re-running finds the open PR through **search-prs** and updates it rather
  than opening a second one.
- **No tracker, no PR.** A repository with no tracker configured has nowhere to open one: leave
  the changes uncommitted in the working tree, say exactly that in the report, and list the
  files touched so a human can review the diff themselves.
