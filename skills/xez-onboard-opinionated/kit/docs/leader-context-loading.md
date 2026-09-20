# Leader-context loading: the committed guide a leader session reloads itself from

This is the standard for giving the AI session that **leads** a project its own durable context: a
committed **leader guide**, loaded automatically by a committed client hook, together with the live
campaign notes the guide points at. It exists because a leader's rules and current state must
survive a new session and a context-window compaction, and because the same mechanism has to be
installable in any project xezar leads — this repository is the dogfooding case, not the target.

Owner decision, 2026-09-18 20:57 (verbatim): "comprehensively document this entire mechanism as we
will be using it probably in many different project. Remember that dogfooding Xezar on xezar
project is to prepare standards for other projects and improve new project onboarding to Xezar
later." Refs #600.

Related: [campaign-notes.md](campaign-notes.md) for the campaign note's own contract,
[worktrees.md](worktrees.md) for the worktree rules the guard depends on, this project's own
observation ledger for how observations are classified, and `AGENTS.md` § Generic instructions
for the product-neutrality rule the user-guide half follows.

## Purpose

A leader session is long-lived but not continuous. It starts, it is resumed, its context is cleared
or compacted, and each time the client may hand the model an empty conversation. Three things must
be re-established without a person retyping them:

- **Standing rules** — how tasks are routed, which gates are mandatory, the merge order and the
  attribution rules. These change rarely and must not be re-derived from scratch.
- **Live state** — the current release, open pull requests with their heads and verdicts, running
  tasks per account, and the single next action per item. These change hourly.
- **Owner decisions** — the exact words that authorize a deviation, kept so a later session can
  quote the authority instead of paraphrasing it.

The guide holds the first and third as durable text; the campaign notes hold the second. The hook
is what makes the client reload both without a prompt.

## The moving parts

| Path | What it is | Committed? |
| --- | --- | --- |
| `.xezar/docs/leader-guide.md` | The leader guide: rules, patterns, recovery steps, owner-only decisions, brief rules and a checklist. 377 lines in this repository. | yes |
| `.claude/settings.json` | The Claude Code `SessionStart` hook that runs the loader. Un-ignored by `.gitignore`, alongside the committed `.claude/skills/design-system/` skill. | yes |
| `.xezar/checks/leader-context.sh` | The loader. Prints one JSON object when it should; prints nothing when it should not. | yes |
| `.xezar/checks/leader-context.test.mjs` | The fixture case: loud in the primary, silent in each agent shape. | yes |
| `.xezar/campaigns/<release>/README.md` | Live campaign state, rewritten at every milestone. | no — runtime |
| `.xezar/campaigns/<release>/decisions.md` | Owner decisions in the owner's exact words, append-only. | no — runtime |

The loader's documented JSON shape is checked by its allowlisted fixture. Values can vary with the
guide and campaign notes, while these keys are its stable output contract:

<!-- documented-output:leader-context -->
```json
{
  "hookSpecificOutput": {
    "hookEventName": "SessionStart",
    "additionalContext": "fixture-dependent text"
  }
}
```

The loader is deliberately tiny and dependency-free: a shell script that reads the guide and the
newest campaign folder, checks the guard, and prints one JSON object. It reads no configuration, so
a project that has the three committed files needs nothing else. The newest folder is chosen by
**name**, not by modification time: a restore or a `cp -r` can make an old folder look newest, while
slugs (`release-<version>`, dated names) sort stably in reverse.

## The guard, and why each rule exists

Claude Code reads a project's `.claude/settings.json` for **every** session started under that
project folder, and it finds project instructions by walking parent folders. A task worktree lives at
`.local/xezar/worktrees/<runId>`, inside the primary checkout, so a hook committed in the primary is
discovered by a task session too. That is the failure the guard closes: a task agent must never
receive leader rules. (Observed 2026-09-18: a local `.claude/CLAUDE.md` at the repository root was
loaded by every worktree session through the parent-folder walk, and there was no per-worktree way
to mute it.)

`leader-context.sh` prints nothing when any of these is true, and prints the block only when none is:

1. **Linked worktree** — `git rev-parse --git-dir` differs from `git rev-parse --git-common-dir`.
   In the primary checkout the two are equal; in a linked worktree they differ, because a task's
   worktree shares the primary's common git directory. A checkout where neither command resolves a
   repository is silent too: the rule requires the two to be equal *and* present.
2. **A path under `.local/xezar/worktrees/`** — a belt-and-braces check that does not depend on git
   being installed or on either git command succeeding.
3. **`XEZ_HANDOFF_FILE`, `XEZ_TODOS_FILE` or `XEZ_TASK_ID` is set** — the engine sets these for a
   task, including a **Worktree-OFF** task running in the primary checkout, which neither of the
   first two rules catches. A silent rule that only understood worktrees would leave that task loud.
   `XEZ_TASK_ID` is the one that is unconditional and always non-empty. `XEZ_TODOS_FILE` is not its
   equal: when follow-ups are off the engine sets it to an **empty string**, and an empty value reads
   as absent, so that variable alone is not a signal. The loader tests all three with
   `[ -z "${VAR:-}" ]`, which silences a non-empty value and lets the empty one fall through.
4. **The guide is missing** — a project without a guide gets silence, not an error and not a
   half-loaded block.

Everything else is loud. The silent cases matter as much as the loud one: they are what makes it safe
to commit the hook at all, and the test pins each of them.

Committing the hook is a trust-boundary change, and `CODE_REVIEW.md` § Security records it as one: a
diff that touches `.claude/settings.json` or `.xezar/checks/leader-context.sh` needs a
security-minded reviewer, because a branch that changes either file gets code execution in every
Claude Code session opened on that branch — including a reviewer's own task worktree.

## The hook output shape

A `SessionStart` hook prints nothing on stdout in the silent cases, and one line of JSON otherwise:

```json
{"hookSpecificOutput":{"hookEventName":"SessionStart","additionalContext":"=== .xezar/docs/leader-guide.md (project leader guide) ===\n\n# Leader guide\n…\n\n=== /…/.xezar/campaigns/v0.16.0/README.md (campaign live state) ===\n…"}}
```

`additionalContext` is one string holding three labelled blocks in a fixed order: the guide, the
newest campaign `README.md`, then its `decisions.md`. Order matters — a rule that a decision
overrides is read after the rule, and the live state is read last, nearest to the work. The guide's
block heading is the literal relative path; each campaign block heading is the file's absolute path,
which is also how a truncated note names itself (see the cost model below). The hook is
registered in `.claude/settings.json` with the four matchers a leader has to survive:

<!-- from: .claude/settings.json -->
```json
{
  "hooks": {
    "SessionStart": [
      {
        "matcher": "startup|resume|clear|compact",
        "hooks": [
          {
            "type": "command",
            "command": "bash \"$CLAUDE_PROJECT_DIR/.xezar/checks/leader-context.sh\"",
            "timeout": 15
          }
        ]
      }
    ]
  }
}
```

`$CLAUDE_PROJECT_DIR` is the project root Claude Code provides, so the hook still resolves when the
session was opened in a subdirectory of the project — a relative command would resolve against that
subdirectory and fail. The explicit `bash` means the copied script does not depend on its executable
bit surviving the copy, and `"timeout": 15` bounds a hook that runs on every session start and
compaction.

## The test

`leader-context.test.mjs` builds a primary-shaped checkout with a guide and both campaign files, then
runs the loader in the primary, in every agent shape, and in the degraded cases, and asserts the
outcome:

- the **primary** prints one parseable object whose `additionalContext` contains the guide and both
  campaign files, guide first;
- the committed `.claude/settings.json` command **run from a subdirectory** with `CLAUDE_PROJECT_DIR`
  set still prints the payload — the case the `$CLAUDE_PROJECT_DIR` form exists for;
- a **linked worktree**, a **path under `.local/xezar/worktrees/`**, and a primary with
  **`XEZ_HANDOFF_FILE`**, **`XEZ_TODOS_FILE`** or **`XEZ_TASK_ID`** set each print **nothing at all**;
- a **missing guide** and a **checkout git cannot resolve** print nothing;
- an oversized `decisions.md` loses its head and carries the truncation line, and the newest campaign
  folder is picked **by name** when an older one has a newer mtime.

"Nothing at all" is the assertion, not "an empty object": a loader that prints `{}` still wakes the
client and still risks a future field. Run the case directly or through the kit's isolated suite:

```sh
node --test .xezar/checks/leader-context.test.mjs
bash .xezar/checks/infra-tests.sh
```

## The cost model

The hook runs on `startup`, `resume`, `clear` **and** `compact`. Compaction is triggered by a full
context window, so a large block loaded at compaction makes the next compaction come sooner and the
guide's size compounds. Three caps follow, and all are requirements rather than style:

- The guide stays bounded — **377 lines** in this repository. Everything durable and leader-only
  belongs there; anything that is really project documentation belongs in a linked file the guide
  names.
- The campaign `README.md` stays at about **120 lines** (see [campaign-notes.md](campaign-notes.md)).
  The loader loads the newest campaign folder's `README.md`, its newest `timeline-*.md`, its
  `parked.md` and its `decisions.md`. A plan or an archive is never loaded; the leader reads those
  on demand.
- **The cap depends on the file's role, and one file has no cap at all.** The narrative notes —
  `README.md`, the newest timeline, `parked.md` — are bounded in the payload to their last
  **65 536 bytes** (`NOTE_TAIL_BYTES`), because they grow for the life of a campaign while the
  leader reads the tail anyway. A note over the cap is preceded by a visible line naming the file
  and its size, so a partial note is never mistaken for the whole.
- **`decisions.md` is injected whole and is never cut.** It is the authority file: the owner's exact
  words, append-only, and the oldest entry binds the leader exactly as hard as the newest. Cutting
  its head would silently drop standing decisions the leader is still required to follow, and it
  would do so with no visible failure — which is the worst shape a defect can take. The guide is
  likewise **not** capped; it is always loaded in full.

A silent case costs one process spawn and no tokens. A loud case costs the guide, the whole
decisions file, and the bounded narrative notes.

## The Codex and pi fallback

Codex and pi have no Claude Code `SessionStart` hook, so nothing reloads the guide for them. Their
leaders load it because the guide orders it: its session-start section says to read the live campaign
state — the newest campaign `README.md`, then `decisions.md` — immediately after every start and every
compaction, before dispatching any task, and its standing-loops section tells Codex and pi leaders
(which have no cron) to check the same three loops at every start. A Codex or pi leader that skips that
order is not covered by the hook, which is why the session-start section is a requirement of the
guide, not a nicety.

## Standing loops the leader runs

Three recurring checks keep a campaign moving when no push arrives. They are **session state**: a
hook runs once per event and cannot schedule, and a machine cron cannot talk to the session, so a
loop dies when the session ends or its context is cleared.

**The loops ship as data, not as prose.** `.xezar/loops.json` carries each loop's id, mechanism,
exact schedule and exact prompt. At every start, resume and compaction the leader lists what is
actually scheduled, compares it against that file **by schedule and by prompt**, and re-creates
anything that is **missing or drifted**. Comparing the file as a whole rather than loop by loop is
deliberate: a partial comparison lets a drifted prompt survive because its schedule still matches.

Prose alone was the old design and it failed in a predictable way — a prompt copied by hand drifts,
and nothing notices, because there is nothing to compare against.

### L1 — unblock — every 10 minutes, cron `*/10 * * * *`

> Check whether anything is waiting on you: a task in a blocked or question state, a review verdict
> you have not acted on, a PR that is mergeable now, or a finished task whose result you have not
> read. Act on what you find, one item at a time. **Never start new work here** — that is the
> pacing loop's job alone. If work finished and there is ready work to follow it, wake the pacing
> loop now instead of waiting for its clock; keep at most one such wake pending, replacing any
> earlier one. If nothing is waiting, do nothing and say so.

### L2 — budget — every hour, a self-paced wake-up of 3600 s

> Walk the budget table. Move any metered lane whose reset time has passed from `out` to `unknown`.
> Do not probe — the next real dispatch that prefers that lane is the probe. If work is paused only
> because every preferred lane was out, and a lane is now `unknown` or available, resume that work.
> Skip unlimited lanes entirely. If nothing changed, do nothing and say so.

### L3 — pace — every 30 minutes

> Decide whether to start more work. Count what is running: full gate runs, total tasks, tasks on
> the metered agent tool, and machine load. Start another task only while **all** of these hold: at
> most 2 gate runs, at most 10 tasks, at most 4 metered-tool tasks, machine load at or below 18.
> If there is ready work and headroom, pick the next item **by least file overlap against every
> running task**, using priority only to break a tie, then route that item through the routing
> table to choose its lane and model. If you are at a ceiling, queue and name which ceiling. If
> there is no ready work, do nothing and say so.

The ceilings are measured, not guessed: attempt failure runs about 20 % at one concurrent gate run,
37 % at three, and 100 % at six or more.

### Two rules that make the loops safe

**L3 is the only loop that may dispatch.** L1 unblocks what is stuck and, when it finds ready work,
**wakes** L3 rather than starting anything itself. At most one such wake is pending, and re-waking
replaces the pending one instead of queuing another. L2 is likewise a non-dispatcher: it resumes
paused work only by waking L3. A double dispatch is therefore impossible **by construction**, not by
timing — which matters, because L1 and L3 fire together every thirty minutes.

The rejected alternative was a lock file either loop may take. A loop that crashes while holding the
lock stalls all dispatching silently, with no way to tell a held lock from a busy one, and clearing
it needs a human.

**Selection is by file overlap, not by priority.** The leader keeps a file-ownership table of what
each running task owns (`<runId first 8> owns <path glob>`) and refreshes it at every dispatch. The
next item is the ready one with the least overlap against that table; priority breaks ties only.

The accepted cost is real: a high-priority item can wait behind a lower-priority one that sits in a
clean part of the tree, and the ownership table is state the leader must keep current. The rejected
alternative — dispatch strictly by priority — is worse, because two tasks on one file means the
second one rebases, conflicts, or fails its gate at merge.

**A tick that changes nothing is a noop**, and each prompt says so explicitly. A loop with no defined
way to do nothing invents work.

**A cron job expires after seven days** and must be re-created, which is one more reason the schedule
and the prompt live in a file rather than in the job's own memory.

Why not a hook: hooks fire once per event and cannot schedule, and an operating-system cron cannot
reach into the session. The re-create-from-file order is the only durable mechanism.

## How to install it in a NEW project

1. **Copy the loader.** Put `leader-context.sh` at the project's own kit path (`.xezar/checks/` in a
   xezar kit) and keep its guard logic unchanged. Change only the paths it reads if the project uses
   different ones; the four guard rules are the mechanism and travel as they are.
2. **Add the hook.** Create `.claude/settings.json` with the `SessionStart` block above: the four
   matchers `startup|resume|clear|compact`, and a command that runs the loader through
   `$CLAUDE_PROJECT_DIR`, so a session opened in a subdirectory still finds it.
3. **Un-ignore exactly that one file.** The project's `.gitignore` ignores `.claude/*`; add
   `!.claude/settings.json` and nothing else, so per-machine `.claude/` state (locks, worktrees,
   `settings.local.json`) stays uncommitted while the hook travels with a clone.
4. **Write the guide from the template outline.** Start with the Codex/pi first section, then:
   standing rules and patterns; recovery steps for a restart or a compaction; owner-only decisions;
   how to write a task brief; and a short pre-dispatch checklist. Cite the source of every rule
   (issue number, dated decision) instead of asserting it, and keep the whole file under the cap.
5. **Put campaign notes under `.xezar/campaigns/<release>/`.** `README.md` is live state,
   rewritten at every milestone; `decisions.md` is append-only owner words with date and channel.
   Both are runtime and stay uncommitted.
6. **Write the standing loops into the guide's checklist.** Record each recurring check the owner
   asked for with its prompt and its cadence, plus the re-create order (list, compare, re-create),
   so a new session restores them instead of relying on the loop's own memory.
7. **Verify with the test.** Run the loader's fixture case and confirm the primary is loud and every
   agent shape is silent. If the project's docs changed, run its link checker as well.

## How to keep it honest

- **The guide cites its sources.** A rule without a source is an assertion; the next session cannot
  tell whether it is current. Link the issue, the decision record or the dated owner words.
- **Owner words stay verbatim in `decisions.md`.** Quote, date and name the channel; never paraphrase
  an authority and never edit or reorder a past entry. The guide may summarize a decision, but the
  authority lives in the decision file.
- **Update the guide when a rule changes.** The guide is part of the change, not a follow-up task: a
  session that reads a stale rule will act on it. A decision that changes the product also belongs in
  the project's own decision log or issue — the campaign file is a coordination aid, never the only
  copy.
- **The older campaign path is reconciled.** [campaign-notes.md](campaign-notes.md) now describes a
  `.xezar/campaigns/<date-slug>/` folder, matching the owner rule of 2026-09-18 that puts
  everything uncommitted and xezar-related under `.local/xezar/`, and the loader reads the newest
  folder under `.xezar/campaigns/<release>/`. The layout and the loader agree, so no silent
  override is left to reconcile.

## What this dogfooding proved

- **2026-09-18 — a root `CLAUDE.md` leaked into task worktrees.** A local `.claude/CLAUDE.md` at the
  repository root was picked up by every worktree session through Claude Code's parent-folder walk,
  so a task agent received leader instructions it must not have, and there was no per-worktree way to
  mute it. This is why the guide is loaded by a hook with an explicit guard rather than by an
  imported instruction file.
- **2026-09-18 — the MCP bridge needed `/mcp` after the mode switch.** Switching the project into
  single-project mode invalidated the running Claude Code session's MCP connection; the leader could
  not attach again until the bridge was reconnected with `/mcp` and a new session was started. The
  guide's recovery section records the step, because a mode switch is exactly the kind of change that
  otherwise costs a session.
- **2026-09-18 — a committed hook is what travels.** A local-only hook (in the uncommitted
  `settings.local.json`) works on the machine that wrote it and does not travel with a clone; a
  memory file lives on one machine and on one tool. Only a committed `.claude/settings.json` plus a
  committed script gives a new clone the same leader context, which is what makes this a standard for
  onboarding a project rather than a personal convenience.
