## 🐛 Fixes

- 🐛 **A leader guide committed with CRLF no longer fails the upgrade's verify step.** The
  verifier read the guide's earlier version raw and compared it with the LF-read current file,
  so `owner-rules-changed` fired on every run and no edit could clear it. Both sides are now
  read as LF text.
- 🐛 **The upgrade's merge step works on git older than 2.35.** `apply.mjs` falls back from
  `git merge-file --zdiff3` to `--diff3` when git refuses the option, and computes every merge
  before its first write, so a git that cannot merge leaves the project untouched instead of
  half written with no `applied.json`.
- 🐛 **A path behind a symbolic link no longer hides which files git ignores.** One such path
  made `git check-ignore` abort the whole batch, and every other path then counted as not
  ignored. The upgrade tool now keeps those paths out of the batch (they count as ignored, so
  they are never written), and any other `git check-ignore` failure stops the run.
- 🐛 **`plan.md` no longer says "None" for machine-block actions while upgrade entries list
  files.** It counts those entries and lists their files, so an owner does not read the section
  as nothing to apply.
- 🐛 **The upgrade prompt reads the engine version the way the planner does.** Step 0 records
  both the project's pinned `node_modules/@qodeca/xezar` and `xezar --version`, uses the pinned
  one when it exists, and for a pinned engine tells the owner to raise the project's own
  dependency rather than install globally.

## 🚀 CI/CD & Infrastructure

- 🚀 **`scripts/build-kit-index.mjs` refuses an unknown flag.** It used to ignore one and run in
  write mode, so `--help` rewrote `upgrade/kit-index/`; it now answers `--help` and exits 2 with
  its usage on anything it does not know.
- 🚀 **The stale-index check no longer goes quiet after a release is tagged.**
  `test-upgrade.mjs` also fails when a local `v<package version>` tag exists but
  `upgrade/kit-index/<version>.json` does not.
