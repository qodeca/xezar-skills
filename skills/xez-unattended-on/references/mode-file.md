# The mode file

Called from step 3. This is the only file that decides whether the leader is in unattended
mode. It is committed, it is small, and it is the single source of truth — the leader never
holds the mode only in context, so a compaction cannot silently end it.

## Shape

```json
{
  "mode": "on",
  "since": "2026-09-20T23:14:05Z",
  "enteredBy": "xez-unattended-on",
  "note": "back around 08:00",
  "restarts": 0,
  "maxRestarts": 3
}
```

| Field | Meaning |
|---|---|
| `mode` | `on` or `off`. Anything else is unreadable, and unreadable is **not** `on` — see below. |
| `since` | When the mode was entered, UTC, ISO-8601. |
| `enteredBy` | The skill that wrote it, so a hand-edited file is visible as one. |
| `note` | The owner's `{note}`, or omitted. |
| `restarts` | How many times the leader has resumed inside this stretch. Written by the leader, not by this skill. |
| `maxRestarts` | Fixed at 3. |

## Rules for reading it

- **Absent is not `off`, and unreadable is not `on`.** A missing file means the mode was never
  entered — ordinary, report it plainly. A file that is present but will not parse means
  something wrote it that should not have: say so and stop, rather than guessing a mode in
  either direction. Guessing `on` hands the leader a narrower stop list nobody agreed to;
  guessing `off` silently ends a night the owner asked for.
- **`restarts` belongs to the leader.** This skill sets it to `0` on entry and never touches it
  again. Reaching `maxRestarts` is the leader's cue to stop resuming and wait; this skill only
  reports the budget.

## Writing it

Write the whole file, do not merge into an existing one. With `--force` on an already-on mode,
the new file resets `since` and `restarts` — that is the point of the flag, and the report says
so, because a reset restart counter buys three more resumes that the owner should know about.

The file is committed in the same commit as the `decisions.md` entry. They are two halves of
one act: the file is the state the leader reads, the entry is the record of who chose it.
Committing one without the other leaves either a mode nobody decided or a decision that does
not take effect.
