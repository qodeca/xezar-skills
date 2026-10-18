## 🐛 Fixes

- 🐛 **`xez-apply-upgrade-notes` now upgrades every descriptor it names.** A Linear or Jira
  project also gets its companion `github.md` diffed – it owns the PR and merge operations – and
  the toolchain and security descriptors the config names are diffed by operation, keeping local
  edits. An upgrade-log entry is crossed off only when every file it names was diffed.
- 🐛 **`xez-apply-upgrade-notes` says what it really does.** Its references no longer claim it
  runs no tracker operations while it opens a PR, the PR steps are its own rather than a copy of
  another skill's, a project without the onboarding kit skips kit-only entries, and the report
  lists `labels.json` labels missing on the tracker (read-only). `UPGRADE_NOTES.md` no longer
  contradicts itself on who refreshes the tracker descriptor of an onboarded project.
