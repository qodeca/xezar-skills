# Finding the mode file and the live campaign

Called from step 1. Read-only: this file locates things and decides whether the run may
continue. It writes nothing.

## The three paths

| What | Path | Committed? |
|---|---|---|
| Onboarding manifest | `.xezar/onboarding.json` | yes |
| Mode file | `.xezar/unattended.json` | yes |
| Campaign folders | `.xezar/campaigns/<yyyymmdd>-<code-name>/` | yes |

All three are committed on purpose. A mode that lives only in a running session ends silently
at the first crash, with no record it was ever on; in git, the history shows exactly when the
mode was entered and left.

## Is this an opinionated setup?

`.xezar/onboarding.json` absent → stop. Say that this skill configures a leader that the
opinionated onboarding skill installs, name that skill, and change nothing. A generic pipeline
repository has no leader to hand a contract to.

## Finding the live campaign

```bash
LIVE=$(ls -1 .xezar/campaigns 2>/dev/null | grep -E '^[0-9]' | sort | tail -n 1)
```

Two rules are doing work in that one line, and both matter:

- **Sort by name, not by modification time.** Campaign folders carry a compact start date
  (`20260817-amber-ridge`), so the name itself is the sort key. Reading, grepping or copying an
  old campaign's files no longer promotes it to "current" — which is exactly what a
  newest-modified lookup does, and it silently loads a finished campaign as the live one.
- **Only digit-prefixed names are candidates.** The reserved `future-campaign/` holds work
  aimed at a campaign that has not opened yet. It sorts after every `2026…` name, so an
  unfiltered lookup would pick it every single time. Excluding it by shape rather than by
  remembering is why the filter is `^[0-9]` and not a name comparison.

Two campaigns started on the same day tie, and the tie breaks alphabetically by code name
rather than by real start order. Both are live that day, so the outcome is harmless.

`$LIVE` empty → stop. Parked decisions live inside a campaign, so with no campaign open there
is nothing to read back; opening one is owner-only and this skill never does it.

## What the campaign folder must contain

The live campaign carries seven file kinds. This skill touches two of them:

- `parked.md` — the leader's own calls while the owner was away. **Absent or empty is an
  ordinary outcome**, not an error: it means the leader never had to decide anything alone.
  Report "nothing was parked" and finish; do not create the file.
- `decisions.md` — the owner's exact words, dated, channel named, **append-only**. Every answer
  from the interview is written here as a new entry. A past entry is never edited, so a
  reversal names the decision it reverses rather than rewriting it.

The other five (`README.md`, `merges.md`, `plan.md`, `timeline-<date>.md`, `archive-*.md`) are
not read here.
