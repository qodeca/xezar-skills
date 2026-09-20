# Choosing the section

Called from step 3. The leader guide is read at every session start and every compaction, and a
rule is applied at the moment its section is read. Placement is therefore about *when* the rule
fires, not about tidiness.

## The five sections a rule can go in

| Section | Takes rules about | Fires when |
|---|---|---|
| **Who the leader is, and is not** | scope — what the leader does itself and what it hands to a task | every read, as framing |
| **Session start, re-attach and compaction recovery** | what to read, in what order, before doing anything | at the start of every session and after every compaction |
| **Standing loops** | the loops, their pacing, their ceilings | when a loop fires |
| **Review discipline** | what a review must check, who may approve what | at every review |
| **Owner-only decisions, and how to ask** | what stops the leader, and how it asks | when a decision comes up |
| **What to log where, and the honesty rule** | what gets written, where, and how truthfully | at every write |

Six rows for "five sections" — the last two are frequently confused and are listed separately
on purpose: a rule about *asking* belongs in owner-only decisions; a rule about *recording* an
answer belongs in what-to-log.

## How to propose

Read the rule and name the section whose *moment* it belongs to, with a one-line reason:

> "Always check the CI result before saying a task is done" → **Review discipline**, because it
> constrains what counts as a finished verdict.

> "Never start more than two gate runs at once" → **Standing loops**, because the pacing loop is
> what would break it.

Then let the owner correct it. They know which moment they were thinking of, and the cost of a
wrong guess is a rule read at a moment when it does not apply.

## When nothing fits

Two honest outcomes, and no third:

- **It is not a leader rule.** A rule about how code should be written belongs in the repository's
  own conventions, not in the leader guide. Say so and stop — the guide is loaded on every single
  session, and filling it with rules that belong elsewhere is how it becomes too expensive to load.
- **It needs a new section.** Rare, and a real change to a shipped document. Propose the heading
  and where it would sit, and get an explicit yes before writing it.

## The insertion itself

At the **end** of the chosen section, on its own line, in the guide's existing convention:

```markdown
- Always check the CI result before calling a task done (owner 2026-09-21).
```

Nothing more: no preamble, no rationale paragraph, no restatement of what the rule already says.
The reasoning lives in the campaign's `decisions.md` if it is worth keeping. Every line here is
paid for on every session start and every compaction.
