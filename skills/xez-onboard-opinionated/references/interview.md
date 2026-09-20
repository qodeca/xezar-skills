# The interview

Called from step 3. Seven sections, asked in this order. Every answer is saved the moment it is
given.

## State, and why it is saved after every answer

The interview state lives at `.local/xezar/runtime/onboarding-interview.json` — a named subfolder,
because the setup this skill installs enforces that local artifacts live in named subfolders
under `.local/xezar/`, and a skill that breaks its own rule on its first run is not worth much.

```json
{
  "version": 1,
  "startedAt": "2026-09-21T09:02:11Z",
  "updatedAt": "2026-09-21T09:14:40Z",
  "detected": { "…": "the analysis proposals, so a resumed run does not re-derive them" },
  "answers": { "branching": { "…": "…" }, "gates": { "…": "…" } },
  "pending": ["design", "leader", "lanes", "routing", "seeding"]
}
```

**Why after every answer, not at the end.** An interview this long will be interrupted, and the
alternative to resuming is starting over. Nobody re-answers forty questions carefully — they
push through, and the ones they push through are the late ones. The late ones here are the
unattended-safety ones.

**This file is interview state, not configuration.** The clean-project check never looks at it,
or a resumed run would refuse itself. It is also the reason the check must look at the three
installed surfaces instead: the engine kit, the MCP registration and the hook.

On a re-run: show what is already answered, offer to change any of it, and continue from the
first pending section. `--restart` discards it and is never implied.

## The seven sections

### 1. `branching`
The default branch's real name, any second long-lived branch, and which model is in use. The
proposal comes from the remote; the model comes from the owner.

### 2. `gates`
The proposed typecheck, lint, test and build commands. Confirm or correct. "No validation
command found" is a legitimate state and is asked, never filled with a placeholder.

### 3. `design`
The design gate on or off, with the UI evidence that produced the proposal. State in the
question that the whole design half installs either way, so the answer is about enforcement, not
about what gets written.

### 4. `leader`
Two questions:

- **Which model the leader runs on.** It runs on the strongest available and on nothing else:
  when its own account runs out it finishes what is in flight, commits the campaign record, and
  **stops** rather than falling back to a weaker model. The leader is the component that decides
  what is safe to do without the owner and writes the record being audited in the morning — a
  weaker model doing that unattended is the one failure nobody can audit, because the record it
  wrote *is* the thing being audited.
- **Whether a second leader login exists.** The real fix for the leader running out is a second
  login, not a downgrade. Ask, record the answer, and say plainly when there is none: the
  leader's own limit then ends the night.

The leader's agent tool is always Claude Code. That is not re-derived from the routing table and
is not an interview question.

### 5. `lanes`
Which accounts are task lanes, which single account is the leader's reserved login, and which
lanes are unlimited.

Two rules that are not negotiable and are stated in the question:

- **The leader's login never runs tasks.** It is reserved, which is why a task may never be
  dispatched to it.
- **A missing login is a hard stop at dispatch, never a fallback to the reserved one.** Offer
  only logins this machine actually has — an account offered here that does not exist is a
  first dispatch that fails.

Unlimited lanes are exempt from budget tracking, so ask which they are rather than discovering
it from a rate limit that never arrives.

### 6. `routing`
Handled in `references/routing-interview.md` — enough questions that it is its own step.

### 7. `seeding`
Whether the routing table starts with day-one preferences filled in or empty. The owner decides;
this skill does not impose one. An empty table means the leader asks more in week one; a seeded
one means it starts with preferences nobody has tested here.

## How to ask

- **Proposals carry their evidence.** "The remote says the default branch is X" — so the owner
  can tell a reading from a guess.
- **Two options and free text**, with the recommended one first and the reason it is
  recommended. A question with five options is a question nobody answers carefully.
- **One topic at a time.** Batch only genuinely independent questions within a section.
- **Never imply a decision is already made.** Everything here is a proposal until the owner
  answers, including every detected fact.
