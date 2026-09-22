# xez-onboard-opinionated

> 🧑‍💻 Interactive — acts once, may ask questions, hands control back

Configures a clean project the opinionated way: a project leader running on Claude Code, the task engine with its workflows and gates, a campaign record, and the rules that hold them together. [`xez-onboard`](xez-onboard.md) asks what you want; this one already knows, states it, and lets you correct it.

Three limits, all stated before anything is touched. **Claude Code only** — the leader design is a Claude Code design, and on any other harness it stops and names [`xez-setup-agent-pipeline`](xez-setup-agent-pipeline.md). **GitHub only** — branch protection, the label flow and the smoke test are GitHub mechanics and were never designed against another tracker. **Clean projects only** — it refuses rather than merging into a setup somebody already has, so a half-applied opinionated setup cannot exist. Gate commands are detected from whatever build files exist, so any stack can onboard; TypeScript/npm is the only stack tested so far, and the skill says so rather than refusing the rest.

It analyses the repository read-only (the real branching model, the gate commands, the design signal, which agent tools and accounts this machine actually has), interviews you in five screens — one confirmation of every detected fact, each carrying its evidence, then the gate commands, the task logins, the routing classes and the expanded table — builds the routing table from the lanes that exist here rather than shipping one — a lane is a tool plus a model, and your logins are only the rotation under a tool — and previews every file bound to a content digest before anything is written.

Nothing reaches the project until the interview finishes and you approve the preview as a whole — the one file written before that is the saved interview under `.local/xezar/runtime/`, so an interrupted run resumes instead of restarting. Then it writes the setup on a branch and opens a pull request for you to merge, turns on branch protection and **re-reads it** rather than trusting the call, and finally dispatches one throwaway task end to end — workflow, pull request, gates — before it reports success. Every part of a setup can pass its own check while the whole cannot run a task, and that failure is otherwise found by the first real piece of work, when nobody is watching.

## What the leader can route afterwards

A workflow for every kind of work a project meets, each with a role skill that says what it owns and what it never does, and a routing row that says how the leader recognises it:

| Stage | Workflows |
|---|---|
| Decide | business analysis · research · plan and spec · **architecture** and **architecture review** · **spike** · **deprecation plan** |
| Design | UX design · **UI design** · **design system** · design review · **visual asset** |
| Build | feature implementation · bug fix · **hotfix** · **refactor** · **migration** · **observability** · **localisation** · dependency maintenance · docs maintenance |
| Test | testing and verification · **UI tests** · **integration tests** · **regression suite** · **performance** · QA · **acceptance verification** |
| Review | code review · **security review** · address review findings |
| Ship | integration · root-sync · release prep · release · **deploy and rollback** · issue triage |

The ones in bold arrived in 1.5.0. Three of them — deploy (which also serves rollback), performance and localisation — are installed everywhere and run only where you have said something first: a deploy or rollback environment, a budget, a locale. With an empty list they refuse in their first seconds and say why, before any dependency is installed.

**Every document the setup or a workflow commits lives under `docs/`** — the design system, the designs, architecture, spikes, runbooks, deprecations, performance notes. The kit reads a `paths.*` key and never a literal folder, so a project that already keeps one of these elsewhere keeps it. A generated `docs/README.md` says which folder is which, built from your own keys; each folder appears when its first document does, so none of them is there on day one.

**Three of the documents are written for people rather than agents.** `SECURITY.md` says where to report a vulnerability privately, what this project does not treat as one, and what it has promised — the security-review role reads that last part before it opens a diff. `CONTRIBUTING.md` is the human path through the same process, and its most useful sentence is the one that is easy to get wrong: a contributor triggers **none** of the 37 workflows, and the checks gating their pull request are the ones in `ci.requiredChecks`, not the gate list the agents run. Any of the three that your project already has is left alone.

**When the engine refuses a call**, the skill stops calling, tries the engine's own tool, then points you at the place a person does it — and only on your yes to one question showing the exact change does it make a backed-up edit of one of two named engine files (a recorded exception in `SECURITY.md`). **When you want to read the setup pull request before merging**, that is a normal answer: its body sorts the files by origin so you can see which dozen to read, and the run ends cleanly with the one line that resumes it.

**OpenCode is switched off for the project**, and the preview says so before you approve anything: it can stall silently after a denied permission, and it does not enforce a step's tool limits, which is the only thing that makes a read-only role read-only. The switch lives in a git-ignored file inside the project, touches no other project on your machine, and the final report prints the one call that undoes it. It is left on, and reported, when the engine is not in single-project mode or when an existing routing table still uses it.

## Before you run it

Three things, each of which otherwise stops the run in its first minute:

```bash
npm install -g @qodeca/xezar          # the engine, 0.18.0 or later
xezar --single-project --no-open      # in its own terminal, in the project folder – leave it open
gh auth login                         # if you are not logged in
```

The engine's first start asks one question – whether to copy your global setup in. Answer it: it is asked once, and only in a real terminal. A stop you can fix in a minute does not end the run; the skill waits and checks again.

The smoke test needs the engine's tools inside the Claude Code session, and Claude Code loads them only when a session starts. So a run usually has two halves: the setup pull request, then – in a session started with the launcher it installed – `/xez-onboard-opinionated --verify`.

## Parameters

| Parameter | Required | Description |
|---|---|---|
| `--resume` | No | Continue an interrupted interview. Also the default when a saved interview is found; the flag only skips the "continue?" question. |
| `--restart` | No | Discard the saved interview and start over. Never implied. |
| `--section <name>` | No | Re-ask one answered screen: `facts`, `gates`, `lanes`, `routing`, `table`. The pre-1.4 names still work — `branching`, `design` and `leader` resolve to `facts`; `seeding` reports that the question is gone. |
| `--verify` | No | Finish a run whose setup pull request is open or merged: branch protection, the smoke test, the report. A plain re-run does the same when it finds an unfinished run. |

This skill has **no unattended-defaults switch**: every default it could take alone is a decision about how a project will be run for the rest of its life.

## Works with

The generic alternative is [`xez-setup-agent-pipeline`](xez-setup-agent-pipeline.md) for a PR pipeline without a leader, and [`xez-onboard`](xez-onboard.md) for non-software work. It checks for the leader's day-to-day controls and gives you one command to install any that are missing: [`xez-unattended-on`](xez-unattended-on.md) and [`xez-unattended-off`](xez-unattended-off.md) for stretches when you are unreachable, and [`xez-add-rule`](xez-add-rule.md) for standing rules that survive a compaction.

---
*Source: [`skills/xez-onboard-opinionated/SKILL.md`](../../skills/xez-onboard-opinionated/SKILL.md)*
