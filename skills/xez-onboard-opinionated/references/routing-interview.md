# Confirming the routing

Called from step 4, and on its own by `--section routing`. Routing is what the leader consults on
every single dispatch: which lane – a runner plus a model – runs each kind of work, and which login
under it. It ships as data: `kit/routing.json`, written to `.xezar/routing.json`, read by the
leader only through `.xezar/checks/route.mjs` (`kit/docs/routing.md`).

## What is shipped, and what is confirmed here

The shipped file is the owner's own routing, used as the default everywhere:

- **Forty-eight rows over eight classes**, each with the workflows it runs, a written trigger, the
  lanes it may use in order of preference, and its bans. A row without a trigger is a row the
  leader guesses at.
- **The lanes**, each a `<runner>/<model>` with seven tags (vendor, tier, vision, image
  generation, local, enforces tool limits, advisory only). A lane with a missing tag is rejected
  until it is tagged.
- **The global bans**, stated once, and the **security minimums**, which `route.mjs` enforces
  whatever the file says: a security or release row keeps `neverAuthor`, and never takes a cheap,
  local or advisory-only lane.
- **Reserved lanes** – the very-strong models – kept out of ordinary orders and named by hand for
  escalation only, plus the rows a single-purpose one owns (Astra: generated images and diagrams).

What is confirmed with the owner is only what differs on this machine. **A login is not a lane**:
logins are the rotation under a runner (screen 3), and a lane order never names one.

## The three screens

**Screen 3 (`lanes`)** writes each runner's `rotation` and `unlimitedLogins` into
`.xezar/routing.json`. The leader's own login is never in the leader's tool's rotation; another tool
may rotate on its built-in `default`.

**Screen 4 (`routing`)** shows the lanes analysis found against the shipped ones and asks one
question over that list: *which of these models are your daily workhorses, which is escalation
only, which is single purpose, and which should not be used at all?* The answers set:

- a lane's `enabled: false` for a model not to be used here;
- the seven tags for a lane analysis found that the defaults do not have – asked on this screen,
  never guessed, because a wrong `vision` or `enforcesToolLimits` puts it in a row it must not
  reach. `enforcesToolLimits` is asked only for a `claude` or `codex` lane: on any other runner it is
  `false`, and `route.mjs --check` refuses `true`;
- `reservedLanes` for a model kept for escalation or for one purpose.

**Screen 5 (`table`)** shows the result for row-level edits:

```bash
node .xezar/checks/route.mjs --file .xezar/routing.json --table
```

Most rows will be right; the two or three that are not are exactly the ones worth a minute. A
row-level edit changes that row's `lanes` or `never` in place.

**A third take of one screen is a defect, not diligence.** Two takes is a correction; three means
the proposal rested on something the owner knows and was never asked. Stop proposing, ask that one
thing in plain words, and name the screen and the reason in the run report.

## The check that ends the section

The section is done only when this passes on the written file:

```bash
node .xezar/checks/route.mjs --check .xezar/routing.json
```

A refusal names the row and the rule. Fix the file, never the check. Every row must keep at least
one lane this machine has – preflight already stopped the setup if one could not (`preflight.md`).

## Upgrading a project

`--section routing` on a project that already has routing:

- **It has `.xezar/docs/model-routing.md`** (the markdown table from before). Write
  `.xezar/routing.json` from the shipped defaults, carry the rotation lines into `tools.*.rotation`,
  and show the owner the old chain beside the new order for each row, in one table. Apply the edits
  they ask for, run the check, then delete `model-routing.md` in the same pull request.
- **It has `.xezar/routing.json` with an older `defaults.version`.** Do a three-way comparison:
  the project's file, the stored copy of its version
  (`references/routing-defaults/<version>.json`), and the new defaults. A change only the new
  defaults made is offered; a change only the project made is kept; where both changed one field,
  show both and let the owner choose. Never overwrite the file wholesale. Then raise
  `defaults.version`.

Either way the result goes through a pull request: the routing file is a trust boundary, and the
security review sees the change.

## Budget is not in this file

Routing is preference; budget is availability. The leader keeps the budget table in the live
campaign's `README.md`, keyed runner × login, and dispatch filters the order through it: a lane is
available while any login in its rotation has budget. Two rules the interview states because they
decide behaviour at 03:00:

- **Unlimited logins are exempt** from budget tracking entirely.
- **Unknown is never "out" and never "fine".** A quota entry carries a reset time and expires to
  `unknown`, which means the next real dispatch that prefers that lane finds out. Nothing probes
  in a loop: a probe *is* a first use, and a first use opens a fresh window.

## What is committed

`.xezar/routing.json` is committed, rotations included. Login IDs are engine account IDs chosen by
the owner, and `route.mjs --check` refuses one that is an email, a path, or this machine's own user
name. Emails, real names and folder paths are never committed (`rules.md`).
