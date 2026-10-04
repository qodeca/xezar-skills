# Contributing

How work is done here, and which rule wins when two differ, is in [AGENTS.md](AGENTS.md). The
process – branches, labels, reviews – is in [SDLC.md](SDLC.md), and its
[Validation gate](SDLC.md#validation-gate) section lists every command a change must pass.

`npm run gate` runs that whole list and ends with a table of each command's exit code and time. It
runs up to four commands at once and prints each command's output in list order; every command
still runs in full. `npm run gate -- --jobs 1` runs them one at a time, each writing straight to the
terminal. It reads the list from `.xezar/pipeline/config.json`, so it is always the current gate.
The guard suite (`npm run test:guards`) is separate: it breaks every gate on purpose and runs
nightly. It works in private copies of the tree under your temp folder, so you can run it beside
the gate. Your edits made before it starts are tested with it; changing the checkout's
`git status` while it runs fails the run.

## Contributing from Windows

Native Windows works for **this repository's checks**, and the kit's checks run natively in Git
Bash in a project too. The leader and the engine's tasks need an engine that runs natively on
Windows (qodeca/xezar#963 phases 2b and 3, not released yet); until it ships, run them in WSL, as
the [README](README.md) says. To work on this repository on Windows itself, you need:

- **Node 22 or later.** The gate uses `fs.globSync` and a Node preload.
- **Git for Windows with Git Bash** – the full installer, not MinGit: the kit's gate scheduler
  needs Git's `ps.exe`, and the tests use its `perl`. The tests find Git Bash from `git.exe` on
  `PATH` and never use WSL's `bash.exe`. In PowerShell or cmd, run the checks through npm –
  `npm run lint`, `npm run gate`, `npm run test:…` – because typing `bash scripts/lint.sh` there
  starts WSL. In Git Bash, every command in the gate list works as written.
- **jq 1.7 or later on `PATH`.** The tests call it with `--binary`, so the Windows build writes LF
  line endings.
- **Developer Mode** (Settings > System > For developers). The tests create real symbolic links
  and never skip them; without Developer Mode they stop with a one-line message saying so.
- **Long paths.** Worktrees and `node_modules` nest deep. Enable Windows long-path support once,
  from an administrator PowerShell, then tell Git to use it:

  ```powershell
  New-ItemProperty -Path "HKLM:\SYSTEM\CurrentControlSet\Control\FileSystem" -Name "LongPathsEnabled" -Value 1 -PropertyType DWORD -Force
  git config --global core.longpaths true
  ```

- **LF line endings.** `.gitattributes` checks text out with LF on every system. A clone made
  before that file existed still holds CRLF files: commit or stash your work, check that
  `git status` is clean, then re-check everything out with
  `git rm -r --cached -q . && git reset --hard -q`.

Expect a full `lint` run to take about 10 seconds on Windows. `test-onboarding-content` runs
lint only in its targeted mode (`--only`, `--files`), so it takes seconds.

The Windows and macOS CI jobs are informational: they report without blocking a merge. A green
gate on Windows proves the kit's logic there – the tests adapt the environment, for example with
Git's tools first on `PATH` – and the cases that start a program the Windows way (`.cmd` shims, Git
Bash, `C:/…` worktree paths) run there for real. The gaps left are listed in
[DECISIONS.md](DECISIONS.md#the-gate-runs-on-native-windows).
