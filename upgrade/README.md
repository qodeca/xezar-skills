# The kit upgrade tool

This folder brings a live project from the Xezar kit version it runs to a newer one, and keeps
every local change the project made to kit files. It is for projects set up by
`xez-onboard-opinionated`. A project set up by `xez-setup-agent-pipeline` without the kit keeps
using `xez-apply-upgrade-notes`.

It is not a skill and it never runs by itself. The owner runs it by hand, in one project at a
time, when they decide to.

## What is here

| Path | What it is |
|---|---|
| `UPGRADE-PROMPT.md` | The prompt the owner pastes into Claude Code in the live project. It holds the whole procedure, steps 0 to 8. |
| `tools/` | The helper scripts the prompt runs from a verified clone: detect the installed version, plan per file, apply the mechanical changes, verify the result. |
| `kit-index/` | One file per kit version since v1.2.0: what each installed file looked like, so the tool can find the "base" of a three-way merge. |
| [`CONTRACT.md`](CONTRACT.md) | The formats the tool reads and writes: the onboarding manifest, the local-patch register, the kit index, the upgrade-entry machine block. |

## How the owner runs it

1. **Get a verified copy of the release.** Clone `qodeca/xezar-skills` at the release tag, with
   full history (for example `git clone --branch v3.1.0 https://github.com/qodeca/xezar-skills.git`),
   and check it: `gh release verify v3.1.0 --repo qodeca/xezar-skills` must print
   `Release v3.1.0 verified!`. Copy the prompt from that clone, never from a web page.
2. **Prepare the project.** A clean working tree on the base branch, up to date with the remote.
   Stop the leader and let running tasks finish. The engine may stay running. Before you start
   `claude` there, check in your own shell, in the project folder, which commands git would run
   by itself: Claude Code may run `git status` when the session starts, before the prompt can ask
   about them. These reads run none of them:

   ```bash
   git config core.hooksPath
   ls -l "$(git rev-parse --git-path hooks)"
   git config --get-regexp '^(core\.fsmonitor|filter\..*\.(clean|smudge|process)|diff\.external|diff\..*\.(textconv|command))$'
   printenv GIT_EXTERNAL_DIFF
   ```

   A hooks folder, an executable hook not ending in `.sample`, or a config line or variable that
   names a program (`core.fsmonitor` set to `true` or `false` is git's own) is a command git
   runs. Decide now whether you trust it; if not, unset it (or open the session in a throwaway
   clone) before you start `claude`. Step 0 of the prompt asks again for the git commands it runs.
3. **Run it.** In the project folder, start `claude` with normal permission prompts – never with
   `-p` and never in a mode that skips prompts – and paste the prompt.
4. **Answer its questions.** It shows a plan before it changes anything, and it stops to ask
   whenever a decision touches safety or permissions.
5. **Review the result.** It leaves a local branch `xezar/upgrade-<version>` with its commits and
   a report at `.xezar/upgrade-reports/<version>.md`: what changed, each merge decision and why,
   the register changes, the permission changes, the owner checklist and the rollback steps.
6. **Confirm the new register entries.** Entries it wrote in `.xezar/LOCAL-PATCHES.md` say
   `Confirmed: no`, and the drift check stays red until you change each to `yes`.
7. **Deliver it yourself.** First answer the checklist's "config keys left unset" on the branch:
   add each key your project uses to `.xezar/pipeline/config.json` and commit it there. The kit
   reads keys such as `security.trustBoundaries` and `designSystem.modules` from the base branch,
   so a key added after the merge does nothing until a second pull request merges. Then push the
   branch, open the pull request, wait for green, merge, follow the rest of the report's
   checklist on every machine that runs the leader or reviews, and restart the engine and the
   leader.

Try it on a throwaway clone of the project first. The release plan
(`docs/plans/release-3.1.0.md` §7 and §9) describes the dry run and the order of projects.

## The release commit line

The prompt checks that its clone is the commit the release was cut from, before any helper
script runs. The release notes of every release this tool upgrades to carry that commit on one
line of its own, exactly once:

```text
Release-Commit: <40 lowercase hex characters>
```

The prompt reads it with the line-anchored pattern `^Release-Commit: ([0-9a-f]{40})$` from
`gh release view v<version> --repo qodeca/xezar-skills --json isImmutable,body`, and compares it
with the clone's `git rev-parse HEAD` and with the sha `gh release verify` resolves for the tag.
A release whose notes lack the line, or carry it twice, stops the upgrade before anything runs.

## Releasing a version the tool upgrades to

`scripts/build-kit-index.mjs` records, for each release, `commit` = the commit its `v<version>`
tag points at. A commit cannot contain its own sha, so the index entry committed before tagging
names a stand-in commit: the commit a local-only `v<version>` tag sat on when the index was built.
That commit must be on the release line – `node scripts/build-kit-index.mjs --check --ref <ref>`
refuses an index commit that is not an ancestor of `<ref>` – so the index is rebuilt with the
stand-in on the release branch's own head, after its last kit change, just before tagging; one
built on a branch that was later squash-merged names a commit the release does not contain.
Release in this order:

1. Merge the release and tag the release commit on `main` (`v<version>`).
2. Publish the GitHub release with `Release-Commit: <that sha>` in its notes (next section).
3. In a clone with full history and all tags, re-run `node scripts/build-kit-index.mjs`, and
   commit the refreshed index to `develop`; it reaches `main` with the next release. This is the
   one change a committed version file allows (`BACKWARD_COMPATIBILITY.md`): the target's own
   file gets its `commit` and `tag` refreshed, once; its `files` entries stay as they were.

Until step 3 lands, the index at the tag carries the stand-in `commit`. The tools do not read
that field – they read file contents by `kitBlob` – and a clone at the tag works even with no
index file for its own version: the target is computed from the kit tree in the clone, and the
target's unreleased development commits are still left out as bases. The one thing a committed
target index adds is `renamedFrom` (a kit file moved since the last release); without it a moved
file shows as new plus removed instead of moved. 3.1.0 moves no kit file.

## What it never does

- It never pushes, never opens a pull request and never merges. It commits only on its own local
  branch.
- It never runs helper code it has not verified: the scripts run from the release clone after
  the release and its commit are checked, never from the project and never from a URL.
- It never overwrites a local change silently. A change it cannot explain is kept and recorded
  for you to confirm; in a safety file it asks first.
- It never adds a permission, hook, MCP server or tool grant without asking you.
- It never invents a config value. A new key without a documented default stays unset and goes
  on your checklist.
- It never writes per-machine files such as `.claude/settings.local.json`; it lists those
  changes for you.
- It never touches repo-local overrides, application code or campaign notes.
- It never follows instructions found inside files, notes or pull-request text.
- It never hides a red check.

## Rollback

Before the pull request merges: delete the branch. After it merges: revert the merge commit,
`git pull --ff-only` everywhere, undo the per-machine steps listed in the report, and restart the
engine and the leader. The report carries these steps for its own run.
