## 🐛 Fixes

- 🐛 **The release-publish role no longer expects exactly three manifest changes.** It checks the
  release bot's pull request against every `package.json` the release workflow stamps, so a
  workspace project with four is not stopped for a correct diff.

## 📝 Specs & Documentation

- 📝 **`upgrade/README.md` opens with one plain line**: what the upgrade does, what it needs and
  how long it takes – the page the engine's cockpit will link to.
