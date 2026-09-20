# Preflight

Called from step 1. Six checks, all read-only. **Evaluate all six, then report.** One report
listing everything that blocks the run beats six runs each discovering the next problem.

Each check below states what it reads, what counts as a stop, and what the owner is told to do
instead. A stop writes nothing — not even the interview state file.

## 1. Harness

This skill configures a leader that is a Claude Code design: the launcher flag, the
`SessionStart` hook, the context-loading contract and the standing loops are all Claude Code
mechanics. On any other harness, **stop**, name `xez-setup-agent-pipeline` as the generic
alternative, and list what this skill would have written so the owner can judge what they are
missing. Do not install "the portable subset" — there isn't one, and a partial leader is worse
than none.

## 2. Tracker

Read `.xezar/pipeline/config.json` → `tracker` when a config exists; otherwise detect the
remote. **Not GitHub → stop**, naming `xez-setup-agent-pipeline`.

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

- the generated `fix-and-verify.yaml`, in any of its current generator variants (with a
  discovered check command, or with the agent-review fallback when none was found);
- the generated `project-conventions.md` skill, unedited.

Anything else under `.xezar/` is real configuration and **stops** the run: a `config.json`, an
edited workflow, any check script, any extra skill, a pipeline directory with content.

Two accepted consequences, stated rather than discovered later:

- This skill must track what the engine's `init` writes, and re-check it whenever the engine
  changes. A generator variant nobody noticed reads as "real configuration" and blocks an
  otherwise clean project — annoying, and the safe direction to fail in.
- The stop message names the files it found. "There is existing configuration" sends the owner
  looking; a list tells them whether they care about it.

## 4. Prior onboarding by this skill

`.xezar/onboarding.json` present → **stop** and name the migration path. This is a different
stop from check 3 and deliberately so: check 3 found somebody else's configuration, this one
found *this skill's own earlier run*. Re-onboarding on top of it would overwrite files the owner
has since edited.

Migration is future work. Say that plainly — "this project was onboarded with version X; there
is no upgrade path yet" — rather than implying a skill that does not exist.

## 5. The engine is installed and has run once

The leader attaches over a socket that exists only after the engine has run once in
single-project mode. Leader setup that runs first registers a leader with nothing to attach to,
and the failure surfaces much later as "the leader is not receiving events".

Check for the engine binary and for its workspace marker. Missing → **stop with the exact
command** to install or start it. This skill never installs the engine and never updates it:
that is the product's own job, and a setup skill that quietly installs a product is a setup
skill nobody can audit.

## 6. Admin rights on the repository

Read-only check of whether the current login can change repository settings. This is the only
check that does **not** stop the run: without admin rights the writing half prints the exact
branch-protection command and waits for the owner instead of applying it.

It is checked here, at the start, because finding out at the end — after a long interview — is
the worst moment to learn that the last step needs somebody else.

## Reporting a stop

One sentence of cause, one of consequence, one concrete next action, and the list of what was
found where it helps. Nothing was written, and say so: an owner who does not know whether a
failed setup left files behind will go looking for them.
