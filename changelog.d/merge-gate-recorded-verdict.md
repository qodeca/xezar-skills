## 🐛 Fixes

- 🐛 **The merge gate can merge a single-owner project again.** When branch protection requires no
  approving review, `xez-approve-merge-pr`'s gate refused every merge as `unknown`, and GitHub
  refuses self-approval when every agent runs under one login – so `xez-approve-merge-pr` and
  `xez-pr-autopilot --allow-merge` could never merge. The recorded pipeline review verdict now
  decides in that case: it passes only when it approves **and** names the pull request's current
  head commit. An approval for an older head refuses as stale; no recorded verdict still refuses.
  A review that branch protection requires is decided exactly as before.
