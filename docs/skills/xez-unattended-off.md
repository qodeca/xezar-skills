# xez-unattended-off

> 🧑‍💻 Interactive — acts once, may ask questions, hands control back

Ends unattended mode and runs the morning interview. Clearing the mode takes one line; the reason this skill exists is the parked list. While you were away the leader made calls it would normally have asked about, and this skill walks them **one at a time** — what it decided, why, what the alternative was, how to undo it — and writes your answer into the campaign record in your own words, never a tidied paraphrase. Then it empties the parked list and commits the answers with it. A decision you defer stays, moved to the top with the date it was first asked, so a second deferral is visible as one.

Batching is deliberately impossible here: a list you scroll past is how a parked decision quietly becomes permanent.

## Parameters

| Parameter | Required | Description |
|---|---|---|
| `--review-only` | No | Read back parked decisions without ending the mode — for when you are briefly reachable and going away again. |
| `--mode-only` | No | End the mode and skip the interview. The report states how many decisions are still waiting. |

An absent or already-off mode file is not a failure: parked decisions outlive the mode that produced them, so the interview runs anyway.

## Works with

The other half of [`xez-unattended-on`](xez-unattended-on.md). When an answer should bind the leader from now on rather than settle one case, record it with [`xez-add-rule`](xez-add-rule.md), which puts it in the leader guide where every session reads it. Finding one of the three hard stops in the parked list means the leader acted outside its contract — this skill leads the report with that rather than asking it as an ordinary question.

---
*Source: [`skills/xez-unattended-off/SKILL.md`](../../skills/xez-unattended-off/SKILL.md)*
