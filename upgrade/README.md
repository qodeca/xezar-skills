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

1. **Get a verified copy of the release.** Clone `qodeca/xezar-skills` at the release tag (for
   example `v3.1.0`) and check it: `gh release verify v3.1.0 --repo qodeca/xezar-skills`.
   Copy the prompt from that clone, never from a web page.
2. **Prepare the project.** A clean working tree on the base branch, up to date with the remote.
   Stop the leader and let running tasks finish. The engine may stay running.
3. **Run it.** In the project folder, start `claude` with normal permission prompts – never with
   `-p` and never in a mode that skips prompts – and paste the prompt.
4. **Answer its questions.** It shows a plan before it changes anything, and it stops to ask
   whenever a decision touches safety or permissions.
5. **Review the result.** It leaves a local branch `xezar/upgrade-<version>` with its commits and
   a report at `.xezar/upgrade-reports/<version>.md`: what changed, each merge decision and why,
   the register changes, the permission changes, the owner checklist and the rollback steps.
6. **Confirm the new register entries.** Entries it wrote in `.xezar/LOCAL-PATCHES.md` say
   `Confirmed: no`, and the drift check stays red until you change each to `yes`.
7. **Deliver it yourself.** Push the branch, open the pull request, wait for green, merge, then
   follow the report's checklist on every machine that runs the leader or reviews, and restart
   the engine and the leader.

Try it on a throwaway clone of the project first. The release plan
(`docs/plans/release-3.1.0.md` §7 and §9) describes the dry run and the order of projects.

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
