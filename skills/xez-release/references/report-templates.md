# Report templates

Two shapes: the **final report** to the user (step 7, and any run that stops earlier) and
the **summary comment** on the release pull request (step 5, `references/pr-finalize.md`).
Lead with where the release stands and what a human does next. A clean run needs 4–8 lines.
Omit a line that has nothing to say, but never drop the ⚠️ line when something could not be
checked – a missing line reads as a clean result.

## Final report

```markdown
🚀 `xez-release`: {version} – {release PR opened, tag waits for its merge / tagged / dry-run preview / stopped}.
🎯 Commit: `{RELEASE_SHA short}` on `{BASE_BRANCH}` – ancestry {✅ proved / ❌ not an ancestor}; required checks {✅ green / ❌ red / ⚠️ unknown}.
📋 Release PR: #{number} – {open, waiting for review and merge / merged as `{merge sha short}`}.
🏷️ Tag: {`v{version}` created on `{sha short}` and pushed / not created yet – it comes after the release PR merges / refused: `v{version}` already exists on `{sha short}`}.
⚠️ Publishing is yours: run `{publish command}` {or: the tag starts `{workflow name}`, which publishes under the repository's own credentials}. This skill did not run it and holds no credential that could.
⚠️ {Anything that could not be checked, and why.}
**Next:** {review and merge the release PR, then re-run `xez-release --ref {merge sha}` to tag / run the publish command above / pick a new version – an existing tag is never moved}.

PR: #{number} (link: {full PR URL})
```

- **Stopped at step 1 or 2** (not an ancestor, red or unknown checks): the first line says
  `stopped`, the 🎯 line names the commit and the failed check, and the report ends after
  **Next:**. No release PR was opened, so there is no `PR:` line.
- **Dry run:** every line says *would* – the version, the files with old and new values, the
  PR it would open – and nothing is described as written, opened or tagged. No `PR:` line.
- **Tagged:** the 🏷️ and publish lines are the point of the report; keep the `PR:` line for
  the release PR the tag came from.
- The `PR:` line is the exact undecorated chaining shape from `references/pr-finalize.md`
  (Marker emission). This skill has no subject issue, so it emits no `Issue:` line.

## Summary comment on the release PR

Posted once via **comment-pr** with a body file and updated in place on a re-run. The PR
body already holds the changelog section, the version files and the evidence; do not repeat
them.

```markdown
🤖 `xez-release` — release summary

🚀 {version} is ready to merge: changelog folded and version written, nothing else changed.
🧪 Ancestry {✅ / ❌} and required checks {✅ / ❌ / ⚠️ unknown} at `{RELEASE_SHA short}` – detail in the PR body.
⚠️ {Anything that could not be checked, when present.}
**Next:** merge this PR; the tag is created afterwards from the merge commit. No tag or publish happens from this PR.
```
