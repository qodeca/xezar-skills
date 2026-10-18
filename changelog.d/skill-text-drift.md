## 🐛 Fixes

- 🐛 **`xez-release` and `xez-maintain-deps` report their own work.** Their report templates
  were copies of `xez-apply-upgrade-notes`' upgrade report and said they emit no `PR:` line. Each
  now has its own: the release's version, commit, release PR, tag and the publish command a human
  runs; the dependency run's inventory, what is behind or vulnerable, one PR per group and what
  could not be checked – both ending with the `PR:` chaining line.
- 🐛 **Step numbers in reference files match their skill again.** `xez-auto-create-pr`,
  `xez-auto-create-pr-loop`, `xez-auto-continue-pr`, `xez-auto-continue-pr-loop`,
  `xez-auto-fix-issue`, `xez-auto-update-changelog`, `xez-auto-qa-pr` and `xez-auto-write-spec`
  pointed at steps one past the right one, so the ready flip and lock release were filed under
  the report step. `lint.sh` now fails a reference that names a step past its skill's last one.
- 🐛 **`xez-auto-*` skills no longer stop to ask mid-run.** The version bump, the release-window
  boundary, a mixed bug-and-feature issue, an unreachable plan commit, several candidate plans, an
  ambiguous brief and an expired lock now get a recorded default (patch bump, the earlier date,
  the newest plan, a takeover note) instead of a question; `xez-auto-update-changelog` is safe on a
  schedule. Claim conflicts without `--force` and `⚠ NEEDS HUMAN CONFIRMATION` still stop.
  `lint.sh` now fails "ask the user" in an `xez-auto-*` skill outside those stops, with
  exceptions in `scripts/allowlists.json` (`autoSkillAsks`).

## 📝 Specs & Documentation

- 📝 **The docs name the self-QA exception.** README, the release-manager guide and
  `DECISIONS.md` said automation never grants `qa-approved`; they now name `xez-auto-qa-pr
  --self-qa-signoff` on a fully-green run, and the kit's independent QA step. `CONTRIBUTING.md`
  gives the measured `lint` job time (about two minutes) instead of a placeholder.
