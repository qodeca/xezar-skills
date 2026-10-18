## 🐛 Fixes

- 🐛 **`xez-release` opens a release pull request, not a dependency one.** Its PR reference
  carried `xez-maintain-deps`' specifics, so a release run was told to title the pull request
  `chore(deps): …` and fill it with an update-group table. It now describes the release PR: the
  folded changelog, the version files, and the ancestry and required-check evidence.
- 🐛 **`xez-maintain-deps` and `xez-release` no longer follow another skill's steps.** Their PR
  reference named `xez-auto-create-pr`'s steps, an early draft PR they never open, and another
  skill's comment markers; a re-run could not find its own label-rationale or verification
  comment.
