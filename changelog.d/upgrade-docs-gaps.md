## 📝 Specs & Documentation

- 📝 **An interrupted upgrade can be cleared and resumed.** The upgrade prompt's clean-tree check
  now recognises a run that stopped between two commits and gives the owner the commands to clear
  it; "start over" now also removes the untracked files a run left.
- 📝 **`upgrade/README.md` checks Node 22** before the engine, and describes the dry run on a
  throwaway copy inline instead of pointing at the 3.1.0 release plan.
- 📝 **`upgrade/CONTRACT.md` no longer calls 3.1.0 a release**: manifest version 2 is written from
  3.2.0 (and by the unreleased 3.1.0 builds), and `install-pi-extension` is marked obsolete.
- 📝 **`UPGRADE_NOTES.md` gives the order for a hand upgrade from before 3.2.0**: engine, then
  `route.mjs`, then one merge of `routing.json` against the newest defaults, then the rest.
