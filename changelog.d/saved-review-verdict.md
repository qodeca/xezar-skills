## 🐛 Fixes

- 🐛 **A standalone merge finds the review verdict on a one-login project.** GitHub refuses
  self-approval when every agent runs under one login, so `xez-auto-review-pr` left no lasting
  verdict and a later `xez-approve-merge-pr` run refused as `unknown`. The review now writes one
  marked review-verdict comment (`Verdict:` and the full `Head:` sha), updated in place, and the
  merge gate reads it – only from the automation's own login or an owner, member or collaborator,
  and only as an approval when it names the current head.
