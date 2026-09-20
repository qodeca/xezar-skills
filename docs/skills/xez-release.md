# xez-release

> 🧑‍💻 Interactive — acts once, may ask questions, hands control back

Cuts a release from a commit that has **already merged** into the protected base branch: folds the changelog fragments, writes the version, opens the release pull request, and creates the annotated tag once that merges.

It refuses to tag anything that is not already an ancestor of the base branch, and the reason is specific. A tag-triggered release workflow is read *from the tagged commit*, so tagging an unmerged head would run that branch's workflow definition — written by whoever opened it, reviewed by nobody — with the release credentials.

It holds no publishing credential and never publishes. That is the skill's own hard stop, the third in this collection. Publishing is release-time code execution holding the most valuable secret a repository has, and the ecosystems are moving away from long-lived tokens anyway. The skill prints the publish command, or names the repository's release workflow, and stops there — a workflow triggered by the tag runs under the repository's own credentials, which is where that authority belongs.

It also refuses on `unknown`. Everywhere else in this collection a run reports what it could not check and carries on; a release is the exception, because the tag is the artifact everyone downstream trusts.

## Parameters

- `--version <x.y.z>` — the version to cut. Default: derived from the changelog fragments present, and always shown for confirmation.
- `--ref <sha|branch>` — the commit to release. Default: the protected base branch's tip.
- `--dry-run` — print everything that would happen; write no file, create no tag.

## Works with

Reads the changelog fragments [xez-auto-update-changelog](xez-auto-update-changelog.md) writes, and opens its release pull request through the same tracker operations every other skill uses. The tag is created only after that pull request merges — tagging first would tag a commit that does not contain its own version number.

---
*Source: [`skills/xez-release/SKILL.md`](../../skills/xez-release/SKILL.md)*
