# xez-onboard-opinionated

> 🧑‍💻 Interactive — acts once, may ask questions, hands control back

Configures a clean project the opinionated way: a project leader running on Claude Code, the task engine with its workflows and gates, a campaign record, and the rules that hold them together. [`xez-onboard`](xez-onboard.md) asks what you want; this one already knows, states it, and lets you correct it.

Three limits, all stated before anything is touched. **Claude Code only** — the leader design is a Claude Code design, and on any other harness it stops and names [`xez-setup-agent-pipeline`](xez-setup-agent-pipeline.md). **GitHub only** — branch protection, the label flow and the smoke test are GitHub mechanics and were never designed against another tracker. **Clean projects only** — it refuses rather than merging into a setup somebody already has, so a half-applied opinionated setup cannot exist. Gate commands are detected from whatever build files exist, so any stack can onboard; TypeScript/npm is the only stack tested so far, and the skill says so rather than refusing the rest.

It analyses the repository read-only (the real branching model, the gate commands, the design signal, which agent tools and accounts this machine actually has), interviews you with every detected fact shown as a proposal carrying its evidence, builds the routing table from the lanes that exist here rather than shipping one, and previews every file bound to a content digest before anything is written.

**This release ships the analysis and interview half only.** It writes nothing into the project — the one file it writes is the saved interview under `.local/runtime/`, so an interrupted run resumes instead of restarting.

## Parameters

| Parameter | Required | Description |
|---|---|---|
| `--resume` | No | Continue an interrupted interview. Also the default when a saved interview is found; the flag only skips the "continue?" question. |
| `--restart` | No | Discard the saved interview and start over. Never implied. |
| `--section <name>` | No | Re-ask one answered section: `branching`, `gates`, `design`, `leader`, `lanes`, `routing`, `seeding`. |

This skill has **no unattended-defaults switch**: every default it could take alone is a decision about how a project will be run for the rest of its life.

## Works with

The generic alternative is [`xez-setup-agent-pipeline`](xez-setup-agent-pipeline.md) for a PR pipeline without a leader, and [`xez-onboard`](xez-onboard.md) for non-software work. It installs the leader's day-to-day controls alongside itself: [`xez-unattended-on`](xez-unattended-on.md) and [`xez-unattended-off`](xez-unattended-off.md) for stretches when you are unreachable, and [`xez-add-rule`](xez-add-rule.md) for standing rules that survive a compaction.

---
*Source: [`skills/xez-onboard-opinionated/SKILL.md`](../../skills/xez-onboard-opinionated/SKILL.md)*
