# Stream B – routing and leader guide (#50, #65)

## Changelog

**`route.mjs` takes the author chain and lists only lanes independent of it (#50).**
`node .xezar/checks/route.mjs <row> --author <lane> [--repair <lane>]…` removes every lane that
shares a model (`engineModel`) with anyone in the chain, every lane that shares a vendor with it on
a security or release row, and every lane of a vendor that the new optional `vendorExclusions`
key in `.xezar/routing.json` names. Each removal prints `removed=<lane> reason=author-chain:
shared model|shared vendor with <lane>`. An escalation lane that passes every ban and the chain is
printed in the order as `lane=` followed by `escalation-eligible=<id>`, so the leader takes it
without parking the choice; when nothing is left the answer is `wait=no-independent-lane`. An
unknown lane in the chain exits 2. Without `--author` the output is byte-identical to before. The
shipped defaults move to version 4 and name `anthropic` in `vendorExclusions`: Claude declines to
review work a Claude model wrote or repaired, which left a leader in one consumer project parking 7
of 12 overnight decisions as "owner decisions" that were only lane switches.

**The leader guide ships the dispatch, quota and merge-queue rules consumers added by hand
(#65).** The leader dispatches at once when ready work and headroom exist – that turn counts as
an L3 run, never an L1 or L2 tick, so L3 stays the only dispatcher with at most one pending wake.
It reads quota with `read_quota` before every dispatch and picks the login from that answer. With
a GitHub merge queue on the base branch it merges with `gh pr merge --auto` instead of looping on
update-branch; `.xezar/docs/close-out.md` states both paths and how to tell which applies, and
`.xezar/docs/leader-guide-detail.md` gives the reasoning.

## Upgrade entry

**Symptom.** The leader parks lane switches as owner decisions because every lane it may use for
a Claude-written PR is a Claude lane that declines the work; or headroom sits idle until the next
L3 tick after a verdict; or a task starts on a login that ran out since L2's hourly read; or open
PRs cycle through update-branch and a full CI run again and again while a merge queue is on.

**What to do.** Copy `.xezar/checks/route.mjs` **first**, before the docs, loops and leader guide:
an older `route.mjs` reads `--author` as a row id and refuses the call. Then merge
`.xezar/routing.json` from defaults version 3 to 4 (the only change is the `vendorExclusions` key
and the version number; keep your own edits), copy the schema, the three docs and `loops.json`,
and merge the fixed part of the leader guide – the checklist line about the lane, the dispatch
and quota line under "Standing loops", the merge-queue sentence under "Review discipline", and
the quota item in the checklist – keeping your "Owner's rules" section as it is. Restart the
leader so it re-creates the L1 and L3 loops from the new `loops.json`.

**What you lose by skipping it.** The leader keeps working out independence by hand and parks
lane switches the owner never needed to see; idle headroom after each verdict; dispatches on
logins read from an old table; and repeated update-branch cycles that cost CI time.

```upgrade
Applies-to: <3.1.0
Files: .xezar/checks/route.mjs; .xezar/routing.json =merge; .xezar/routing.schema.json; .xezar/docs/routing.md; .xezar/docs/leader-guide-detail.md; .xezar/docs/close-out.md; .xezar/loops.json; .xezar/docs/leader-guide.md =merge
Actions: restart-leader
```

## Compatibility rows

For `BACKWARD_COMPATIBILITY.md`, the routing-file bullet in "Protected surfaces" (additive, no
break):

- `.xezar/routing.json` gains an optional top-level key `vendorExclusions`: a list of
  `{ vendor, why? }`; missing means none. It is read only by `route.mjs <row> --author …`. Its
  shape is checked by `route.mjs --check`.
- `route.mjs <row id>` gains the optional `--author <lane>` and repeatable `--repair <lane>`
  arguments. Only with `--author` does it print the new lines `escalation-eligible=<id>`,
  `wait=no-independent-lane` and `removed=<lane> reason=author-chain: …`, and it prints eligible
  escalation lanes as `lane=` instead of `escalation=… by=hand`. Without `--author` every line is
  unchanged (pinned by a golden test in `scripts/test-kit-catalog.mjs`).
- Shipped routing defaults are now version 4 (`references/routing-defaults/4.json`).

For the ledger of deliberate breaks:

| Date | What changed | Who it affects | What they must do | Why it was worth it |
|---|---|---|---|---|
| 2026-09-27 | `route.mjs --check` refuses a `vendorExclusions` that is not a list, names a vendor twice, or names a vendor no lane has | nobody with a file written before 3.1.0: the key did not exist | fix or drop the entry | an exclusion that matches no lane is a ban that silently does nothing |
| 2026-09-27 | `route.mjs` exits 2 on an `--author` or `--repair` lane that is not in `routing.json`, and on `--repair` without `--author` | only callers of the new arguments | run without `--author` and check independence by hand, as before | an unknown author must never read as "independent of everything" |
