# Preflight

Called from step 1. Eight checks, all read-only. **Evaluate all eight, then report.** One report
listing everything that blocks the run beats eight runs each discovering the next problem.

Each check below states what it reads, what counts as a stop, and what the owner is told to do
instead. A stop writes nothing — not even the interview state file.

## Two kinds of stop

**A hard stop ends the run**: the wrong harness, the wrong tracker, somebody else's configuration.
Nothing the owner does in the next minute changes it.

**A fixable stop waits.** A missing login, a dirty tree, an engine that is not installed or has
not run yet: the owner fixes each in a minute, in another terminal. Report it with the exact
command, then ask one question — "fixed, check again?" — and **re-run only the checks that
failed**. Do not end the run and do not ask for the skill to be invoked again: a first test of
this skill cost three invocations and seven minutes that way, each reloading the whole skill to
re-check one line. Two re-checks that still fail become a hard stop, with everything found.

Probe with plain POSIX shell and quote every pattern. An unmatched glob aborts a whole compound
command under zsh, and the checks after it silently never run.

## 1. Harness

This skill configures a leader that is a Claude Code design: the launcher flag, the
`SessionStart` hook, the context-loading contract and the standing loops are all Claude Code
mechanics. On any other harness, **stop**, name `xez-setup-agent-pipeline` as the generic
alternative, and list what this skill would have written so the owner can judge what they are
missing. Do not install "the portable subset" — there isn't one, and a partial leader is worse
than none.

## 2. Tracker

Read `.xezar/pipeline/config.json` → `tracker` when a config exists; otherwise detect the
remote. **Not GitHub → stop**, naming `xez-setup-agent-pipeline`. No remote at all is the same
stop with a kinder next action: create the repository on GitHub, push, and run this again.

The reason is narrow and worth stating honestly: branch protection, the PR-and-label flow, the
label taxonomy and the smoke test are GitHub mechanics, and none of them was designed or tested
against another tracker. The collection ships `trackers/jira.md` and `trackers/linear.md`, so
the file exists — but each of those pieces needs a designed equivalent per tracker, and claiming
support that was never proved is how a collection earns a reputation for not working.

## 3. Clean project — judged by content, not by directory

**The single most destructive thing this skill could do is merge into a setup somebody already
has.** So: any real prior configuration stops the run.

Untouched engine-init output counts as **clean** and is replaced without asking, because that is
how most people arrive — the getting-started guide tells them to run init first. Recognise it by
content, not by presence:

- the generated `fix-and-verify.yaml`, in any of its current generator variants: with a
  discovered check command, with the agent-review fallback when none was found, or — from engine
  0.18.0 — the discovered-check variant that ends with a third, agent step. Recognise that last
  one by its shape rather than its wording: step ids `implement`, `verify`, `report`, the last of
  them an agent step named "Report the result". A variant you do not recognise is somebody's
  configuration and stops the run, so a new engine release needs this list extended first;
- the generated `project-conventions.md` skill, unedited.

Equally clean, because **the engine writes them by itself on its first single-project start** —
which check 7 requires, so treating them as configuration would make checks 3 and 7 impossible to
pass together:

- `.xezar/workspace.json`, `.xezar/workspace-ui.json` and `.xezar/agent-accounts.json`;
- `.xezar/config.json` **when it holds no settings** (`{}`). A `config.json` with keys in it is
  somebody's configuration and stops the run;
- the engine's short-lived `*.lock` and `*.tmp` files beside them.

Anything else under `.xezar/` is real configuration and **stops** the run: a `config.json` with
settings in it, an edited workflow, any check script, any extra skill, a pipeline directory with
content.

**Look at the root too.** The writing half creates files outside `.xezar/` — the process
documents, the agent guide files, the tracker's templates, the MCP registration, the launcher.
List which of those already exist. They are **not** a stop: they go to the preview's "needs your
decision" group, and finding them now is what keeps that group honest. Two are expected and say
nothing about a prior setup: an `xezar` entry in an MCP registration, and the `xez-*` skill
folders of this collection.

**Never tell the owner to delete `.xezar/` or `.local/` to get a clean project.** The engine keeps
its socket and its state there; removing them under a running engine leaves it alive and
unreachable. When this check stops, it names the files and lets the owner judge them.

Two accepted consequences, stated rather than discovered later:

- This skill must track what the engine's `init` writes, and re-check it whenever the engine
  changes. A generator variant nobody noticed reads as "real configuration" and blocks an
  otherwise clean project — annoying, and the safe direction to fail in.
- The stop message names the files it found. "There is existing configuration" sends the owner
  looking; a list tells them whether they care about it.

## 4. Prior onboarding by this skill

**Either** `.xezar/onboarding.json` **or** `.local/xezar/runtime/onboarding-pending.json` present
means *this skill's own earlier run*. Check both, and check the pending file even when the other
is absent: `onboarding.json` is committed on the **setup branch**, so an owner who deferred the
merge and came back on the base branch has the pending file and nothing else. Keying this check on
`onboarding.json` alone silently starts that owner over. Two cases, told apart by the pending
file:

- **The run is unfinished** — `.local/xezar/runtime/onboarding-pending.json` exists. The writing
  half leaves it behind when it opens the setup pull request, because protection and the smoke
  test cannot run until that pull request is merged. **Do not stop: skip to
  `references/verify.md`**, which finishes steps 7 to 10. This is also what `--verify` does.
- **The run finished** — no pending file. **Stop** and name the migration path. Re-onboarding on
  top of it would overwrite files the owner has since edited. Migration is future work. Say that
  plainly — "this project was onboarded with version X; there is no upgrade path yet" — rather
  than implying a skill that does not exist. `UPGRADE_NOTES.md` in the collection carries the
  corrections that do exist, keyed by symptom.

The pending file lives under `.local/` and nowhere else. `.xezar/onboarding.json` is read by the
owner's control skills, so "is the smoke test done" never becomes a key in it.

## 5. The engine is installed and has run once

The leader attaches over a socket that exists only after the engine has run once in
single-project mode. Leader setup that runs first registers a leader with nothing to attach to,
and the failure surfaces much later as "the leader is not receiving events".

Three facts, each with its own fix. All three are **fixable stops**:

| Pass when | Otherwise tell the owner |
|---|---|
| `command -v xezar` finds the binary | `npm install -g @qodeca/xezar` |
| `xezar --version` is 0.18.0 or later — the version this kit was tested against | the same command; it upgrades |
| `.xezar/workspace.json` exists — the engine's single-project marker | the start line below |

```bash
xezar --single-project --no-open
```

Say three things with that line, because each one cost a run when it went unsaid:

- **Run it in its own terminal and leave it open.** An engine started from inside the agent
  session ends when that session ends.
- **The first start asks one question** — whether to copy the owner's global setup in. It asks
  only in a real terminal and only once, it reads `[y/N]`, and **the default is No**: an owner
  who presses Enter has declined. Say all of that **before** the window opens, not after — the
  first audited run sent "answer y" a minute after the question appeared, and it had already been
  answered No. Answered No, answered from a background process, or never answered, the project
  starts with no agent accounts and the lanes interview has nothing to offer. Where the engine's
  `--help` lists `--import-global`, start it with that flag instead and there is no question.
- **`xezar init` does not import accounts.** Owners expect it to. Say so in one line.
- **`xezar init` is not needed.** Its two example files are harmless (check 3) and the write step
  **deletes** them — nothing in the kit is named after either one, so they are removed, not
  overwritten (`references/write.md` §1).

**Then read `.xezar/agent-accounts.json` and count the accounts**, rather than trusting that the
question was answered. None or one is not a stop, and it is not a fault either — it may simply be
one login on this machine — but say which you think it is, because the lanes and routing interviews
are about to offer what that file contains. A run that only *told* the owner to answer `y`, and
never looked, reaches the routing table before anybody notices the import did not happen.
**Empty or defaults-only here while the machine's global registry lists more is the declined
import**, and it is never asked twice: offer to bring them in through
`references/engine-refusals.md` **here**, not at screen 3 of the interview. This step owns that
offer — screen 3 needs its answer to draw its table, and screens 1 to 3 go out together. An owner
who says the project registry is meant to be empty is recorded in the interview state and never
asked again in this run.

Whether the engine is *running right now* is not a preflight fact: nothing before step 8 needs
it. `references/verify.md` checks it where it matters.

This skill never installs the engine and never updates it: that is the product's own job, and a
setup skill that quietly installs a product is a setup skill nobody can audit. Naming the
command is not installing it.

## 6. The tracker login

Tracker operation **auth-check**. Not logged in, or a client too old for the operations this
setup uses → a **fixable stop** with the login command the descriptor names. Found here rather
than at the first tracker write, which comes after the whole interview.

## 7. A clean working tree

Uncommitted changes → a **fixable stop**: commit or stash them. The writing half commits the
setup on its own branch, and somebody's half-finished work must not ride along in that commit.
Ignored files do not count.

## 8. Admin rights on the repository

Read-only check of whether the current login can change repository settings. This is the only
check that does **not** stop the run: without admin rights the writing half prints the exact
branch-protection command and waits for the owner instead of applying it.

It is checked here, at the start, because finding out at the end — after a long interview — is
the worst moment to learn that the last step needs somebody else.

## Said at the start, not discovered at the end

None of these stops the run. Each changes what the run can promise, so each is one line in the
preflight report, where the owner can still walk away:

- **No CI on the base branch.** Protection has no check names to require. The setup still
  installs; the protection step will say "review rules only, no required checks" rather than
  pretending.
- **The base branch already requires an approval** and the owner works alone. The setup pull
  request cannot merge without a second person or an administrator's merge. Name that now.
- **One agent account, or none.** The rule "the leader's login never runs tasks" cannot hold
  with a single login. Carry on, and record the warning in the report.
- **Windows.** The launcher is a shell script and the engine's socket is a Unix socket: WSL only.
- **A monorepo.** The setup installs at the repository root and knows nothing of the packages.
## Reporting a stop

One sentence of cause, one of consequence, one concrete next action, and the list of what was
found where it helps. Nothing was written, and say so: an owner who does not know whether a
failed setup left files behind will go looking for them.
