# The morning interview

Called from steps 3–5. This is the substance of the skill.

## What a parked entry looks like

The leader appends one block per decision it made on the owner's behalf:

```markdown
## 2026-09-20T02:41Z — lane switch on the review row

**Decided:** moved code review off the primary lane to the next lane in the routing table.
**Why:** the primary lane's window was spent at 02:38; four tasks were waiting on review.
**Alternative:** wait for the window to reset at 07:00 and let the queue sit for four hours.
**Undo:** put the review row back to its first lane in `model-routing.md`; nothing else changed.
```

Four fields, always: **Decided · Why · Alternative · Undo**. An entry missing one is still
asked — report the gap rather than skipping the question, because a decision with no recorded
undo is the one most worth reviewing.

## The loop

For each entry, oldest first:

1. **Show it whole.** What was decided, why, what the alternative was, how to undo it, and when.
   Do not summarise it — the owner is deciding, and a summary is your reading of the decision.
2. **Ask one question**, with the leader's choice as one option and the alternative as the
   other, plus room for free text. Two options and the owner's own words: that is the shape.
3. **Take the answer verbatim.** Write it to `decisions.md` as a dated, append-only entry
   naming the channel. Nothing is tidied.
4. **Mark the entry resolved** in the working copy of `parked.md`, and move on. Do not write
   `parked.md` until the whole loop finishes — a half-emptied parked list after an interrupted
   interview loses the unanswered questions.

**Never batch.** Not two at a time, not "here are the six, which do you want to change". The
failure this mechanism is known to have is the owner clicking through a list as `parked.md`
grows, and every shortcut here is a step toward it. One at a time is the defence, and it is the
only one there is.

## Three answers that are not "keep" or "overturn"

- **Defer.** The entry stays in `parked.md`, moved to the top, carrying the date it was first
  asked. A second deferral is then visible as a second one — which is the signal that the
  decision needs a different conversation, not another morning.
- **"That was not yours to make."** When the owner says the leader should have stopped, record
  the answer *and* say plainly in the report that the contract was exceeded. If the entry is
  one of the three hard stops (the release go, deleting a record, opening a campaign), lead the
  report with it.
- **A question back.** The owner asks what else was affected. Answer from the campaign timeline
  and `merges.md`, then re-ask. Do not write an entry from a conversation that did not end in a
  decision.

## Writing the answers

One entry per decision in `decisions.md`:

```markdown
## 2026-09-21 — review lane (asked back after unattended mode, owner in chat)

> Leave it on the second lane, I do not want the queue sitting for four hours. Put it back when
> the limit resets.

Parked by the leader 2026-09-20T02:41Z; owner confirmed with a change.
```

The owner's words are quoted; everything else is one line of provenance. `decisions.md` is
append-only, so a reversal of an earlier decision is a **new** entry that names the old one,
never an edit to it.

## Emptying `parked.md`

After the loop, write `parked.md` with its heading and nothing else — except deferred entries,
which stay. Commit the emptied file together with the `decisions.md` entries, so the record and
the cleared list move as one. An emptied parked list committed without the answers would lose
every decision that was just made.
