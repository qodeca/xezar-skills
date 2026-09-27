# Windows test guide – Xezar skills 3.1.0

Use this guide to test Xezar skills 3.1.0 on Windows. The release waits for these tests.

## Before you start

- The xezar engine 0.19.0 does not run on native Windows. It needs POSIX and bash.
- Run the engine, the leader and the workflows in WSL2 (Ubuntu).
- Run only the Erfana UI tests on native Windows.
- Version 3.1.0 is on the `develop` branch. It has no release and no tag yet.

## 1. Set up WSL2

In PowerShell (as administrator), run:

```powershell
wsl --install -d Ubuntu
```

Restart Windows. Open Ubuntu. Make a user. Then, in Ubuntu, run:

```bash
sudo apt update && sudo apt install -y git jq curl
curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg | sudo dd of=/usr/share/keyrings/githubcli-archive-keyring.gpg
echo "deb [signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" | sudo tee /etc/apt/sources.list.d/github-cli.list
sudo apt update && sudo apt install -y gh
gh auth login
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/master/install.sh | bash
source ~/.bashrc && nvm install --lts
npm install -g @anthropic-ai/claude-code
```

Install the Codex and pi CLIs too, if the project uses them.

Clone all repositories into the Linux home (`~`). Do not clone under `/mnt/c`. It is slow, and file watching fails there.

## 2. Start the leader (in WSL2)

In terminal 1, in the project clone, run:

```bash
cd ~/<project>
xezar --single-project --no-open
```

Keep terminal 1 open. In terminal 2, run:

```bash
cd ~/<project>
./scripts/xezar-leader.sh
```

- If the script says "the engine is not running here", start the engine first (terminal 1).
- If it says "the xez-* skills are missing", install them as the project `AGENTS.md` says.
- Claude Code shows a warning about `--dangerously-load-development-channels`. This is expected.

## 3. Run one workflow end to end (in WSL2)

1. Make a small bug-fix issue in the project.
2. Tell the leader to run it.
3. Make sure the task gets to `done` and a PR opens with the correct labels.

## 4. Test the review step with browser tools (in WSL2)

1. Let the review or QA step open a page with chrome-devtools (headless, in WSL2).
2. Make sure the step takes a screenshot and has no permission denial.

## 5. Test the dependency freshness check (in WSL2)

In a task worktree of the project, run:

```bash
bash .xezar/checks/repo-gates.sh --fast
bash .xezar/checks/repo-gates.sh --fast
```

1. The first run installs the dependencies and writes the freshness stamp.
2. The second run must skip the install. The stamp is fresh.
3. Change one file in `node_modules`. Run the command again.
4. It must install again. The stamp is now stale.

## 6. Test the upgrade prompt on a throwaway clone (in WSL2)

Do this on a throwaway clone, never on the live project.

```bash
git clone https://github.com/qodeca/xezar-skills.git ~/xezar-skills-develop
git -C ~/xezar-skills-develop checkout develop
git -C ~/xezar-skills-develop rev-parse HEAD
git clone https://github.com/<owner>/<project>.git ~/<project>-upgrade-test
```

Use a full clone (not `--depth`). The helpers read old kit versions from git history.

1. Stop the leader for this project.
2. Open `~/xezar-skills-develop/upgrade/UPGRADE-PROMPT.md`.
3. In `~/<project>-upgrade-test`, run `claude` with normal permission prompts. Do not use `-p`.
4. Paste everything below `=== PROMPT START ===`.
5. Step 1 of the prompt stops, because it needs the `v3.1.0` tag and `gh release verify`. This is expected before the release.
6. To go on, tell Claude: "Dry run before release. Use `~/xezar-skills-develop` at `<sha>` as the clone. Skip only the tag and release checks in step 1." (This is a workaround, not part of the prompt. Check that Claude keeps all other rules.)
7. Answer its questions. Read the plan before it changes files.
8. When it ends, make sure that:
   - `verify.mjs` shows no `problem=` line;
   - branch `xezar/upgrade-3.1.0` exists, with a report in `.xezar/upgrade-reports/3.1.0.md`;
   - no entry in `.xezar/LOCAL-PATCHES.md` is lost;
   - the engine and the leader start on the upgraded clone, and one throwaway task gets to `done`.
9. Do not push this branch. Delete the throwaway clone when you finish.

## 7. Run the Erfana e2e tests (native Windows, not WSL)

WSLg can show Linux GUI apps, but that is Linux. It does not prove Windows support.

In PowerShell, run:

```powershell
git clone https://github.com/qodeca/erfana.git
cd erfana
npm ci
npx electron-vite build
npx playwright test --project=electron
```

Make sure all tests pass.

## Checklist

- [ ] The leader starts in WSL2.
- [ ] One workflow (a small bug fix) runs end to end.
- [ ] The review step uses chrome-devtools (headless, in WSL2) with no denial.
- [ ] The dependency freshness check passes.
- [ ] The upgrade prompt runs on a throwaway clone, and `verify.mjs` passes.
- [ ] The Erfana e2e tests pass on native Windows.

Write down each failure with its exact output.

When all is green, tell Claude: Windows tests done

The release (merge `develop` to `main`, tag `v3.1.0`) waits for this.
