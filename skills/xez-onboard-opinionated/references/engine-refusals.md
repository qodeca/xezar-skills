<!-- loaded: only when an engine tool refuses a call, or the project's account registry is empty while the machine's is not -->
# When the engine says no

Loaded on demand. The engine keeps some actions for a person: it answers them with
`Refused (<boundary>): <action> — <reason> Nothing was changed.` Which actions those are differs by
engine version, so never assume — read the answer.

## The order, every time

1. **A refusal is a finding, not an error to retry.** Read it once and stop calling. Do not guess
   argument shapes either: an "Unrecognized key" answer means read the tool's own description for
   that action, and one corrected call is the limit. The first audited run sent four shapes of one
   call and learned only on the fourth that the action was refused whatever the shape.
2. **Try the engine's own way first.** A newer engine may allow what an older one refused — adding
   an account with its account tool, switching a provider off for *this project* in
   single-project mode (`references/verify.md` §3). An engine tool that works is always preferred
   over a file edit: it validates, and the running engine sees the change at once.
3. **Then the person's way.** Give the owner the exact place: the cockpit address when the engine
   reports one, otherwise the command the refusal names. Wait, then read back.
4. **Then, and only if the owner wants it, the consented edit below.**

## The consented edit

The owner decided this path exists because it is kinder than sending a first-time user into a
settings page mid-interview, and because the decision stays theirs: nothing here happens without
their answer to one plain question. It is a recorded exception in `SECURITY.md`, and it is narrow.

**What it may touch — two files, nothing else:**

| Case | Reads | Writes |
|---|---|---|
| The project's account registry is empty because the engine's one-time import was declined | the machine's global account registry (`~/.xezar/agent-accounts.json`) | the project's own `.xezar/agent-accounts.json`, which the kit's ignore file keeps out of git |
| The owner asks for a machine-wide switch the engine will not let an agent make | — | the machine's `~/.xezar/config.json`, one key |

The first case writes **inside the project** and is the common one. The second reaches every
project on the machine: it is never proposed by this skill, only carried out when the owner asks
for it in their own words, and the rule in `references/verify.md` — never reach for a machine-wide
setting from a per-project setup — still decides what the skill *proposes*.

**One question, and it shows everything:** the file, the exact change (the keys, not a summary),
whether it reaches this project or every project on the machine, that a backup is taken, and the
person's way as the other option. The account registry holds ids, labels, providers and folder
paths — no token — and the question says so rather than leaving the owner to wonder.

**On yes, in this order:**

1. Back up the target beside itself as `<name>.pre-<what>.bak`. A backup inside `.xezar/` is
   removed again before the commit; one under `~/.xezar/` stays, and the report names it.
2. Make the smallest edit that does the job. Never a rewrite of the file.
3. **Do not repair what the copy brought with it.** A copied default that names an id with no
   record is most likely the tool's built-in login (`references/interview.md` screen 3) — ask,
   do not fix.
4. Read back **through the engine** (`get_account`, `get_capabilities`), because the file
   changing proves nothing about what the engine uses. An engine that does not show the change
   needs a restart: say so, and let the owner restart it — the engine window is theirs.
5. Record it in the engine-settings record under `.local/xezar/runtime/` with the time read from
   the clock, and carry it into the run report under its own line, with the undo: the backup's
   path, or the one call that reverses it.

**Never:** a file that holds a secret; any path outside the two in the table; a change the owner
did not see in full; a second edit to "tidy up" the first.
