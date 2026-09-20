# 🚀 Release Manager

The pipeline sweeps open PRs, tells you which can merge now and which are blocked, drives the close-but-not-ready ones to merge-ready, and ships — while keeping the QA gate a human decision. [`xez-auto-fix-pr`](../skills/xez-auto-fix-pr.md) loops review-autofix, CI stabilization, and UI verification until a PR is approvable, green, and QA-evidenced, then hands off to [`xez-approve-merge-pr`](../skills/xez-approve-merge-pr.md) rather than merging itself. At release time it drafts the changelog, reconciles merged PRs with the tracker, and cuts the tag through [`xez-release`](../skills/xez-release.md) — which refuses to tag anything that has not already merged, and never publishes.

← Back to the [README](../../README.md#-workflows-by-role)

## Skills you'll use

| Skill | When | Example call | What you get |
|---|---|---|---|
| [`xez-merge-buddy`](../skills/xez-merge-buddy.md) | Survey the merge queue | `/xez-merge-buddy` | a report of which PRs can merge now and which are close but blocked |
| [`xez-review-prs`](../skills/xez-review-prs.md) | Clear the review backlog | `/xez-review-prs` | every unreviewed open PR reviewed, newest first, claim-lock aware |
| [`xez-pr-autopilot`](../skills/xez-pr-autopilot.md) | Just finish this PR, whatever is left on it | `/xez-pr-autopilot 123` | the PR's real state diagnosed, then the matching chain of the skills below run in order, with one summary comment covering every step |
| [`xez-auto-fix-pr`](../skills/xez-auto-fix-pr.md) | Drive one PR to merge-ready | `/xez-auto-fix-pr 123` | an approvable, green, QA-evidenced PR handed to [`xez-approve-merge-pr`](../skills/xez-approve-merge-pr.md) |
| `xez-auto-fix-pr --ci-only` | Get red CI to green | `/xez-auto-fix-pr 123 --ci-only` | green CI from real fixes with tests, never faked |
| [`xez-approve-merge-pr`](../skills/xez-approve-merge-pr.md) | Ship a ready PR | `/xez-approve-merge-pr 123` | the PR approved and squash-merged, or refused if the QA gate/a label forbids it |
| [`xez-auto-update-changelog`](../skills/xez-auto-update-changelog.md) | Prep a release | `/xez-auto-update-changelog` | a CHANGELOG entry landed as a docs PR with Supersede Credit |
| [`xez-release`](../skills/xez-release.md) | Cut the release | `/xez-release` | the changelog folded, the version written, and an annotated tag on a commit that already merged — plus the publish command, for you to run |
| [`xez-maintain-deps`](../skills/xez-maintain-deps.md) | Before a release, or after a disclosure | `/xez-maintain-deps` | what you depend on, what is behind, what is vulnerable — and one PR per update group with the gate already run |
| [`xez-close-fixed-issues`](../skills/xez-close-fixed-issues.md) | Post-merge housekeeping | `/xez-close-fixed-issues` | issues closed for merged PRs, comments on PRs closed without merging |

## What happens automatically

- **Readiness classification** — labels, reviews, CI, and mergeability are read to sort merge-now from blocked.
- **The tag is bound to merged history** — [`xez-release`](../skills/xez-release.md) proves the release commit is an ancestor of the protected base branch before tagging, and proves it again against the merge commit afterwards. A tag-triggered publishing workflow is read from the tagged commit, so tagging an unmerged head would run that branch's workflow with release credentials.
- **Autofix + stabilize + verify loop** — [`xez-auto-fix-pr`](../skills/xez-auto-fix-pr.md) re-merges the base as it advances and iterates until the PR is clean.
- **Follow-up issues for nits** — non-blocking findings become tracked issues via [`xez-followup-issue-from-pr`](../skills/xez-followup-issue-from-pr.md), not merge blockers.
- **QA-gate guard on merge** — [`xez-approve-merge-pr`](../skills/xez-approve-merge-pr.md) refuses a `needs-qa` PR without `qa-approved`, and blocking labels stop it.
- **Supersede Credit** — carried-forward fork PRs credit the original contributor in the changelog and reconciliation.
- **Claim locks respected** — sweeps back off PRs another agent is already working.

## Tips

- The **QA gate is the hard rule**: `needs-qa` cannot merge until a human adds `qa-approved`. Automated skills request QA; they never grant it — [`xez-approve-merge-pr`](../skills/xez-approve-merge-pr.md) will refuse rather than override it.
- [`xez-auto-fix-pr`](../skills/xez-auto-fix-pr.md) **never merges** — it prepares and hands off to [`xez-approve-merge-pr`](../skills/xez-approve-merge-pr.md), keeping the merge itself a deliberate step.
- Watch merge order: re-merge the latest base before approving; [`xez-auto-fix-pr`](../skills/xez-auto-fix-pr.md) does this automatically as the base advances, but a manually-approved stack still needs the sequence.
- [`xez-auto-fix-pr`](../skills/xez-auto-fix-pr.md)'s CI-stabilization step never goes green by weakening tests or disabling checks — a red build it can't fix honestly is reported as a genuine blocker, not merged around. Use `--ci-only` to run just that step against a plain branch or no-PR change.
- Run [`xez-close-fixed-issues`](../skills/xez-close-fixed-issues.md) after a merge batch so the tracker reflects what actually shipped before you cut the release.
