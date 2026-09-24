# Where the rule goes

Called from step 3. Every rule goes into one section of the leader guide:

| Section | Takes |
|---|---|
| **Owner's rules** | every standing rule the owner adds, in the order they were added |

One section, not the section a rule governs. Spread through the guide, the owner's rules were hard
to find and hard to tell from the shipped text, and a reader could not see at a glance what the
owner had decided. In one place they are read together, at every session start and every
compaction, and they bind the leader exactly as hard as anything shipped.

## When the section is missing

A guide written before 3.0.2 has no `## Owner's rules` heading. Create it once, directly before
`## One-page checklist`, or at the end of the file when that heading is absent too, with the
template's one-line intro under it:

```markdown
## Owner's rules

Standing rules the owner added with `xez-add-rule`, each in their exact words with `(owner <date>)`. Each binds you exactly as hard as anything shipped above.
```

Show the new heading in the step-4 preview. Leave rules an earlier version wrote into other
sections where they are: moving them is an edit to the owner's record, and it is the owner's call.

## When it is not a leader rule

A rule about how code should be written belongs in the repository's own conventions, not in the
leader guide. Say so and stop — the guide is loaded on every single session, and filling it with
rules that belong elsewhere is how it becomes too expensive to load.

## The insertion itself

At the **end** of the section, on its own line, in the guide's existing convention:

```markdown
- Always check the CI result before calling a task done (owner 2026-09-21).
```

Nothing more: no preamble, no rationale paragraph, no restatement of what the rule already says.
The reasoning lives in the campaign's `decisions.md` if it is worth keeping. Every line here is
paid for on every session start and every compaction.
