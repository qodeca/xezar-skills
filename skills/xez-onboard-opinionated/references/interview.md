# The interview

Called from step 3. **Five screens**, asked in this order, and the preview in step 5 is the sixth
and last thing the owner answers. Every answer is saved the moment it is given.

**Five screens, not eighteen questions.** The first version of this interview asked eighteen
separate things, and a real run took fourteen of them one at a time. Most were confirmations of
facts `references/analysis.md` had already read off the repository and the machine — the branch
name, the gate commands, the design evidence, the strongest model, which login this session runs
on. A confirmation is worth asking **once, for all of them together**; asking each on its own
screen buys nothing and spends the owner's attention before the questions that need it.

## State, and why it is saved after every answer

The interview state lives at `.local/xezar/runtime/onboarding-interview.json` — a named subfolder,
because the setup this skill installs enforces that local artifacts live in named subfolders
under `.local/xezar/`, and a skill that breaks its own rule on its first run is not worth much.

```json
{
  "version": 2,
  "startedAt": "2026-09-21T09:02:11Z",
  "updatedAt": "2026-09-21T09:14:40Z",
  "detected": { "…": "the analysis proposals, so a resumed run does not re-derive them" },
  "answers": { "facts": { "…": "…" }, "gates": { "…": "…" } },
  "pending": ["lanes", "routing", "table"]
}
```

`answers.facts` holds one key per fact on screen 1, each with the value and whether the owner
changed it — a corrected fact and a confirmed one are not the same evidence, and the report says
which is which.

**Why after every answer, not at the end.** An interview will be interrupted, and the alternative
to resuming is starting over. Nobody re-answers carefully the second time — they push through, and
the ones they push through are the late ones. The late ones here are the unattended-safety ones.

**This file is interview state, not configuration.** The clean-project check never looks at it,
or a resumed run would refuse itself. It is also the reason the check must look at the three
installed surfaces instead: the engine kit, the MCP registration and the hook.

On a re-run: show what is already answered, offer to change any of it, and continue from the
first pending screen. `--restart` discards it and is never implied.

**`--section <name>`** takes `facts`, `gates`, `lanes`, `routing` or `table`. The four names this
skill used before — `branching`, `design`, `leader` and `seeding` — are still accepted: the first
three resolve to `facts` and say so, and `seeding` reports that the question is gone and why. A
stale name that silently re-asked a screen which no longer exists would be worse than an error.

## The five screens

### 1. `facts` — confirm what was detected, in one screen

Everything `references/analysis.md` read, listed with its evidence, and **one** answer: all
correct, or change one of them. Say plainly that changing one is normal and costs nothing.

| Fact | Where the proposal comes from |
|---|---|
| The default branch's real name | the remote |
| A second long-lived branch, or "none found" | the branch list |
| The branching model | **inferred** from the two above — one long-lived branch is trunk-based, two is a two-branch flow — and shown as an inference, not a reading |
| The design gate, on or off | the UI signals analysis found, quoted |
| The browser tool design review and UI tests drive | which of the kit's browser descriptors this machine already has the tool for; asked only when it has both |
| Deploy and rollback workflows, locales, or "none found" | workflow file names, each shown with whether it has a manual trigger and a `sha` input, and locale folders — readings, each confirmed; performance budgets are never proposed and start empty |
| Where committed documents go | the `docs/` folders analysis found, or the defaults in `references/write.md` §2 — one line, all of them under `docs/` |
| The model the leader runs on | the strongest this machine has |
| A second leader login, or "none" | the engine's account registry |
| The login reserved for the leader | **the login this session itself runs on**, which is what almost every owner means |
| The task lanes available | the account registry, minus the reserved login |

Four of these carry a consequence the owner cannot see from the fact alone, so state it beside the
fact rather than in a question of its own:

- **The leader runs on the strongest model and on nothing else.** When its own account runs out it
  finishes what is in flight, commits the campaign record, and **stops** rather than falling back
  to a weaker model. The leader decides what is safe to do without the owner and writes the record
  being audited in the morning; a weaker model doing that unattended is the one failure nobody can
  audit, because the record it wrote *is* the thing being audited.
- **No second leader login means the leader's own limit ends the night.** That is the real fix for
  a leader running out — not a downgrade.
- **The design gate answer is about enforcement only.** The whole design half installs either way.
- **The leader's agent tool is always Claude Code.** Not derived from the routing table, and not a
  question.

The branching *model* was an interview question once. It fed one later question — whether the
other long-lived branch is protected, which `references/protection.md` asks at the moment it
matters — and one line of the report. Inferring it from the branch set and showing the inference is
honest; the case the old rule guarded against was inferring a policy from a workflow file, which
this is not.

### 2. `gates` — the commands, alone on their own screen

The proposed typecheck, lint, test and build commands. Confirm or correct. This screen is **not**
folded into screen 1, deliberately: it is the most-consumed answer in the whole setup — it becomes
the gate script, the required checks, the protection contexts and the smoke test — and it is the
one most likely to be wrong on a stack nobody has tested here.

"No validation command found" is a legitimate state and is asked, never filled with a placeholder.
A placeholder that echoes a suggestion looks like a configured gate and enforces nothing.

### 3. `lanes` — one table: what runs what

The accounts from screen 1, as a table the owner marks up in one pass: which are task lanes, which
are unlimited, and which single lane is the engine's default for a task that names no account.
These are three columns of one decision, not three topics.

Two rules that are not negotiable and are stated on the screen:

- **The leader's login never runs tasks.** It is reserved, which is why a task may never be
  dispatched to it — and why the unnamed-task default may not be it either. The engine's own
  default out of the box is whatever the owner logged in with first, usually exactly that login,
  which breaks this rule on the first task dispatched without an explicit account. So the default
  is **validated on this screen, not asked**: offer only lanes that are not the reserved one.
- **A missing login is a hard stop at dispatch, never a fallback to the reserved one.** Offer only
  logins this machine actually has — an account offered here that does not exist is a first
  dispatch that fails.

**OpenCode accounts are not offered as task lanes.** The setup switches that provider off for this
project (`references/verify.md` §3 has the four reasons and the one call that undoes it), so a lane
on it would be a lane whose every dispatch is refused. Say so on the screen in one line when the
registry holds such an account, rather than leaving the owner to wonder where it went.

Unlimited lanes are exempt from budget tracking, so they are marked here rather than discovered
from a rate limit that never arrives.

With a single login there is nothing to choose: say so, carry the warning into the report, and skip
the screen. The answer is *set*, not only recorded — `references/verify.md` does it once the
engine's tools are there, and reports what the default was before.

### 4. `routing` — eight classes, one screen

Handled in `references/routing-interview.md`: a proposed chain per task class, all eight classes
confirmed or reordered together — mechanical, writing, design, visuals, implementation, testing, review,
security and release.

### 5. `table` — the expanded rows

The routing table as it expands, reviewed and edited. Most rows will be right; the two or three
that are not are exactly the ones worth a minute. This is a review screen, not an interrogation,
which is why it survives the diet.

**Gone: `seeding`.** Whether the routing table started seeded or empty was asked and then read by
nothing — not `write.md`, not `preview.md`, not `verify.md`, not the report. The table is written
from the routing answers, and the leader asks about anything it does not find there. Say in the
report that no day-one preferences were seeded.

## How to ask

- **Proposals carry their evidence.** "The remote says the default branch is X" — so the owner can
  tell a reading from a guess.
- **Two options and free text** per item, with the recommended one first and the reason it is
  recommended. An item with five options is an item nobody answers carefully.
- **One screen per decision, not per fact.** Facts that were read off the repository belong on one
  confirmation screen; a question that needs thought gets its own. The test is whether the owner
  would answer them in the same breath.
- **Never imply a decision is already made.** Every detected fact is shown with the evidence behind
  it and can be changed before anything is written, and a confirmation screen says so in as many
  words. Confirming every fact on one screen is still confirming them; what it is not is one
  interrogation per fact.
