# Release runs – Xezar skills 3.1.0 on Windows, macOS and Linux

Use this guide for the release runs in qodeca/xezar-skills#132. The 3.1.0 release waits for every
cell in that issue's grid. The issue is the single source of truth: record each result there.

## What a run proves

- One real issue goes from open to a merged pull request, **hands-off**: no person fixes a step.
- Every step works: labels, review, QA with screenshot evidence, and the gates.
- The run starts from the Xezar app, through the leader, as a user would.

A run that needed a person is a ❌, even when its pull request merged.

## The grid

| Column | What it means |
|---|---|
| Claude Code, Codex, pi | The agent that **writes the code**. Ask the leader to put the implementation step on that agent's lane. Every other step routes as `.xezar/routing.json` says. |
| OpenCode | A **dispatch check**: the kit switches OpenCode off by design (`DECISIONS.md` → "OpenCode is off by default"). Switch it on for this check only, run one task to done, then switch it off again. |

Extra rows: one upgrade from 3.0.3 to 3.1.0 on each system, and one install on Windows from the
docs alone, by a Qodeca developer who gets no help.

## Before you start (every system)

- **Engine:** xezar 0.20.0 or newer (`npm install -g @qodeca/xezar`, then `xezar --version`).
- **Tools:** Node 22 or later, `git`, the GitHub CLI logged in (`gh auth status`), and `jq`.
- **Agents:** Claude Code, Codex, pi and OpenCode installed and logged in. pi needs its DeepSeek
  provider set up for `pi/deepseek-api/deepseek-v4-pro`.
- **Windows only:** Git for Windows (the full installer, not MinGit) and long paths switched on
  (`git config --global core.longpaths true` and the Windows `LongPathsEnabled` setting). Work in
  Git Bash or PowerShell, never in WSL.
- **Skills from `develop`** (3.1.0 has no tag yet). In the test repository's root, run:

  ```bash
  DISABLE_TELEMETRY=1 npx -y skills add https://github.com/qodeca/xezar-skills/tree/develop --skill '*' --agent claude-code --agent codex --yes
  ```

  Check that you got `develop`: `.agents/skills/xez-onboard-opinionated/kit/checks/lib/windows-process.mjs`
  must exist. It is not on `main`.

## The test repositories

Each system has its own private repository, made from the template `qodeca/xezar-e2e-webapp`:

| System | Repository | Machine | Owner session |
|---|---|---|---|
| Windows | `qodeca/xezar-e2e-webapp-windows` | the owner's Windows PC | `xezar-skills-windows` |
| macOS | `qodeca/xezar-e2e-webapp-macos` | the owner's MacBook M5 | `xezar-skills-macos` |
| Linux | `qodeca/xezar-e2e-webapp-linux` | the `homelab-e2e` Linux runner | `xezar-skills-windows` |

The app is a small todo list: `npm start` serves it, `npm test` runs its tests. It has no
dependencies.

## 1. Onboard

1. Clone the system's repository. Open Claude Code in its root.
2. Follow [the bootstrap prompt](../../bootstrap-prompt.md), end to end.
3. Merge the onboarding pull request when its checks are green.
4. Record the onboarding result in #132 (it is not a grid cell, but a failure here blocks all of them).

## 2. The issues

Use the same four issues, in this order, on every system. Open each one in the system's repository
just before its run.

| # | Column | Issue title | Issue text |
|---|---|---|---|
| 1 | Claude Code | Show how many todos are left | Under the list, show "N left" – the number of todos not done. Update it when a todo is added or toggled. Add a test. |
| 2 | Codex | Clear finished todos | Add a "Clear done" button that removes every done todo, through a new `POST /api/todos/clear-done`. Add tests for the store and the API. |
| 3 | pi | Rename a todo | Double-clicking a todo's text lets you edit it; Enter saves, Escape cancels. Add `PATCH /api/todos/:id` with a title check (not empty). Add tests. |
| 4 | OpenCode | Add a page footer | Dispatch check only: one task that adds a footer with the app name. |

## 3. One run

1. Start the engine and the leader as the onboarding report says (`./scripts/xezar-leader.sh`).
2. Tell the leader, in plain words:
   "Run issue #<n> end to end. Put the implementation step on a <agent> lane. Route every other
   step as `.xezar/routing.json` says. Do not ask me anything; I am testing a hands-off run."
3. Do not touch the run. Write down the time it started.
4. When the pull request has merged, record in #132:
   - ✅ or ❌, with the merged pull request's link;
   - the **local work time** – the time the gates, installs, worktree set-up, test-environment boot
     and browser QA took, from the task's timeline. Model time does not count;
   - any problem, with its exact output.
5. Before the next run, pull the base branch.

The OpenCode check: switch the provider on with the engine's `project_config` tool (action
`set_provider_enabled`, `provider: "opencode"`, `enabled: true`), dispatch issue 4 to an OpenCode
lane, wait for the task to reach done, then switch it off again the same way.

## 4. The upgrade row

1. Make a new repository from the template (or reset a scratch clone) and onboard it with skills
   **3.0.3** (`npx -y skills add qodeca/xezar-skills --skill '*' …` from `main`, before the release).
2. Upgrade it to 3.1.0 with `upgrade/UPGRADE-PROMPT.md`. Before the release, its step 1 stops on the
   missing `v3.1.0` tag: say "Dry run before release. Use my develop clone at <sha>. Skip only the
   tag and release checks in step 1."
3. `verify.mjs` must show no `problem=` line. Then run issue 1 with Claude Code, as in section 3.

## 5. Speed

Windows' local work time must be at most twice the macOS time for the same issue and agent. A
larger gap blocks the release (#132). Model time is never counted.

## When something fails

- **A skills bug:** an issue on qodeca/xezar-skills, linked from #132. After the fix, re-run only the
  cells the fix can touch.
- **An engine bug:** an issue on qodeca/xezar, linked from #132. Windows bugs go to the
  `xezar-windows` session; macOS, Linux and all-system bugs go to `xezar-macos`.
- **A bug in Codex, pi or OpenCode itself:** report it to its makers, add a safe workaround if one
  exists, and mark the cell as a known issue. The owner decides on any known-issue cell before the
  release.
- **A random failure** (it passes on a re-run): re-run once, then open an issue and fix the cause.
