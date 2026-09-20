# xez-unattended-on

> 🧑‍💻 Interactive — acts once, may ask questions, hands control back

Puts a project with a leader into unattended mode, for a stretch when you are unreachable. It reads the contract back to you first — the three decisions that still stop the leader dead (the release go, deleting a record, opening a campaign) and the three it will make alone and park for the morning (a lane switch, a scope trim, a third repair round) — and writes nothing without a clear yes. Then it writes the committed mode file with its three-restart cap, records the decision in the live campaign in your own words, and commits both together. It dispatches no work and never starts the leader; the leader reads the mode file at its next session start.

## Parameters

| Parameter | Required | Description |
|---|---|---|
| `{note}` | No | Free text recorded with the decision, e.g. "back around 08:00". |
| `--force` | No | Re-enter an already-on mode, resetting the clock and the restart counter. Without it, an already-on mode is reported and left untouched. |

The mode ends only through [`xez-unattended-off`](xez-unattended-off.md), never on a timer: it is about you being unreachable, not about the hour.

## Works with

Pairs with [`xez-unattended-off`](xez-unattended-off.md), which clears the mode and asks back every decision the leader parked. Standing rules for the leader are added with [`xez-add-rule`](xez-add-rule.md) — including any change to what the leader may decide alone, which is a rule, not a flag on this run. All three expect the opinionated onboarding setup; without its manifest this skill stops and names it.

---
*Source: [`skills/xez-unattended-on/SKILL.md`](../../skills/xez-unattended-on/SKILL.md)*
