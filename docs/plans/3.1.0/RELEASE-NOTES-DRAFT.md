<!-- DRAFT. Before publishing: replace the 40 zeros on the Release-Commit line below with the full
sha of the commit the v3.1.0 tag points at (git rev-parse v3.1.0^{commit}), in lowercase.
Keep that line exactly once, on a line of its own, with nothing else on it. The upgrade prompt
reads it with ^Release-Commit: ([0-9a-f]{40})$ and stops if it is missing or appears twice.
Do not write that line anywhere else in these notes, including in this comment. -->
Release-Commit: 0000000000000000000000000000000000000000

# Xezar Skills 3.1.0

## 🎯 What this release is

Fifteen fixes and features found while running the kit in live projects. It adds design-system
modules and an upgrade tool. The tool brings an onboarded project to 3.1.0 and keeps its local
changes.

Nothing changes in an installed project until you upgrade it. You can run the upgrade prompt, or
apply the upgrade notes by hand.

## 🚀 How to upgrade

**Skills.** Run `npx skills update -p` (or `-g` for a global install). The new skill instructions
are live on the next run.

**An onboarded project.** Files the kit installed into your repository do not update themselves.
Use the upgrade prompt:

1. Clone the release with full history:
   `git clone --branch v3.1.0 https://github.com/qodeca/xezar-skills.git`
2. Verify it: `gh release verify v3.1.0 --repo qodeca/xezar-skills` must print
   `Release v3.1.0 verified!`
3. In the project, start with a clean tree on the base branch. Stop the leader and let running
   tasks finish.
4. Start `claude` with normal permission prompts – never with `-p`, never in a mode that skips
   prompts – and paste `upgrade/UPGRADE-PROMPT.md` from your clone. Never copy it from a web page.
5. Answer its questions, review the branch `xezar/upgrade-3.1.0` and the report in
   `.xezar/upgrade-reports/3.1.0.md`, then push and merge it yourself.

The prompt never pushes, never opens a pull request and never merges. `upgrade/README.md` in
the clone has the full steps and the rollback. Try it on a throwaway copy of the project first.

**By hand.** `UPGRADE_NOTES.md` → "upgrading an onboarded project to 3.1.0" holds the same
changes as fifteen entries. Apply them top to bottom, in order.

**Projects set up without the kit** (only `xez-setup-agent-pipeline`) keep using
`/xez-apply-upgrade-notes`.

## ⚠️ Windows

The kit's checks run natively on Windows, in Git Bash: install Git for Windows (the full
installer, not MinGit) and `jq`. The engine, the leader and its tasks need an engine that runs
natively on Windows – qodeca/xezar#963 phases 2b and 3, not released yet. Until it ships, run the
engine, the leader and the upgrade prompt in WSL2, which stays the fallback. The MCP servers start
with a plain `npx`, tested on Windows with Claude Code 2.1.286 and Codex 0.157.1. A project
onboarded or upgraded from Windows has its kit scripts marked executable in git; for one onboarded
from Windows before 3.1.0, `UPGRADE_NOTES.md` entry 14 has the repair.

## ⚠️ Before and after you upgrade

- **Before:** stop L3 dispatch and let running tasks finish. A task that starts mid-upgrade sees
  a mix of old and new kit files.
- **After:** merge, run `git pull --ff-only` in the primary checkout, restart the engine, and
  restart the leader with `./scripts/xezar-leader.sh`. Then check that
  `node .xezar/checks/route.mjs --check` passes.
- **Confirm the register.** Entries the upgrade writes to `.xezar/LOCAL-PATCHES.md` say
  `Confirmed: no`. The drift check stays red until you change each one to `yes`.

## 💥 Behaviour that changes

- **Node 22 is the minimum.** Node 20 left support in April 2026. A task on Node 20 stops at setup
  with `node v20.… is below the required 22`: install Node 22. A `dependencies.units` project that
  pins a major in a numeric `.nvmrc` keeps that pin.
- **A repair's `DELIVERED` record is now refused.** A repair no longer pushes its fix before the
  gates. Re-dispatch any repair that already wrote `DELIVERED`.
- **The drift check fails a gate run on an edited kit file with no record.** Record deliberate
  changes in `.xezar/LOCAL-PATCHES.md`. A manifest from before 3.1.0 is not enforced.
- **An older install stamp reads as not fresh.** The first gate run after the upgrade installs
  again. Each fast check now walks `node_modules`, which costs a few seconds on a large install.
- **Routing defaults move to version 4.** `anthropic` is in the new `vendorExclusions` key, and
  DeepSeek V4 Pro can review when Claude has no budget. Three routing bans relax; the accepted
  risk is in `SECURITY.md` and `DECISIONS.md`.
- **Review and QA steps can run the change they judge.** They check out the PR head and run one
  project command. That runs PR code with the operator's user rights. The accepted risk is in
  `SECURITY.md`.

## 📋 What is new

- **Design-system modules.** A project with several product surfaces lists them in
  `designSystem.modules`. Design roles pick the right module. A project without the key works as
  before.
- **Toolchain-neutral roles.** The dependency and testing roles, and all 37 role skills' shared
  tail, stop assuming npm. They read commands from the config and the installed toolchain
  descriptor (#59).
- **`route.mjs --author`.** It removes lanes that share a model or an excluded vendor with the
  author chain, so the leader stops parking lane switches as owner decisions (#50, #89).
- **Leader guide rules.** Dispatch at once when work and headroom exist, read quota before every
  dispatch, and use `gh pr merge --auto` under a merge queue (#65).
- **Leader context.** It carries the newest 40 timeline entries, and warns when `decisions.md`
  is missing (#64).
- **Project settings no longer turn kit checks red.** A project hook or a local Bash rule is
  allowed or reported as a warning (#69).
- **Every agent step has a time limit** (#52).
- **Review and QA steps get the full browser tool set and `review-run.sh`** (#63).
- **Install freshness covers edits in place**, for `dependencies.units` and a single npm root
  (#53).
- **Keep a Changelog support** in the changelog check and fold, with the base branch read from
  config (#57).
- **`security.trustBoundaries`** lets a project name its own sensitive paths for the security
  scan.
- **Repair pushes go through `push-check.sh`** only after the gates sealed the fix (#54).
- **The drift check and the local-patch register** (`manifest-drift.mjs`,
  `.xezar/LOCAL-PATCHES.md`), and onboarding writes manifest version 2 (#55).
- **The upgrade tool**: a kit index for every version since 1.2.0, per-file base finding, a plan
  by class, a mechanical applier, a verifier, and `upgrade/UPGRADE-PROMPT.md`.
- **More work goes to DeepSeek.** A new lane, `pi/deepseek-api/deepseek-v4-pro`, takes mid-size
  writing work and is the last-resort reviewer (#89).
- **The kit's checks on native Windows (Git Bash).** The router finds `claude.exe` and `codex.cmd`,
  dependency installs start npm's and Yarn's `.cmd` shims with checked text only, the worktree check
  reads Git Bash's `/c/…` paths, label and comment writes drop the CR a Windows jq adds, and
  onboarding and the upgrade mark every kit script executable in git (#122).

## 🧪 Checks

- New gate: `node scripts/test-upgrade.mjs`, over synthetic installs of 1.2.0, 2.1.1, 3.0.0,
  3.0.3 and one untagged commit.
- The lint gate refuses a literal `npm`, `package-lock.json` or workspace count in a kit role
  skill's shared tail.
- `catalog-check.mjs` refuses an agent step with no timeout, and a review step without
  `review-run.sh` or the full browser set.
- This repository's gate runs on native Windows, from Git Bash or with `npm run gate`. The
  Windows and macOS CI jobs are informational (#122).

## ✅ Full details

See `CHANGELOG.md` → 3.1.0 for every change, and `UPGRADE_NOTES.md` for what each upgrade entry
does and what you lose by skipping it.
