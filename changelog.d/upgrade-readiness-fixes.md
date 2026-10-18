## 🐛 Fixes

- 🐛 **An upgrade no longer trusts a kit version no release carries.** A project whose manifest
  says `3.1.0` – written by the pre-release upgrade tool, and never tagged – had every upgrade
  step below 3.1.0 dropped unseen. The planner now works the version out from the files, as for
  a manifest that names none, and `plan.md` says why (`versionUnindexed`).
- 🐛 **The engine upgrade comes in the order that works.** Old pi or OpenCode tasks are deleted
  with the engine you run now, before engine 0.30.0 is installed – the new engine does not
  start while one exists, and only the old one can delete it. The upgrade prompt's engine stop,
  `upgrade/README.md` and the `UPGRADE_NOTES.md` entry now say so, with the way back when 0.30.0
  is already installed.

## 📝 Specs & Documentation

- 📝 **`upgrade/README.md` says to jump straight to the newest release**, adds an engine check as
  step 0, and states that rolling back below kit 3.2.0 is not supported. The rollback steps now
  remove untracked files and fit a squash merge.
- 📝 **No note names the missing `v3.1.0` tag any more**, and the old "engine too old" notes pin
  `@qodeca/xezar@0.20` for a kit before 3.2.0, since a bare install now brings 0.30.0.

## 🚀 CI/CD & Infrastructure

- 🚀 **The upgrade evals grade against the checkout's own version**, not a hard-coded `3.1.0`, and
  re-running them is now release step 0 for any release that changes kit files.
