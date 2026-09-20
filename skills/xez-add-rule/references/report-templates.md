# Report templates

Called from step 6. Omit any optional line that would say nothing.

## Rule added

```markdown
## 📋 Rule added

> <the rule exactly as written, with its dated attribution>

Section: **<section name>** — <one line: the moment it fires>.
Committed as <sha> on `<base branch>`.

It takes effect at the leader's **next** session start, resume, clear or compaction, because
that is when the guide is injected. A session running right now has not read it.

<only when --replaces was used>
🔁 Supersedes: "<old rule>", marked superseded <date>. The old line stays in the guide as a record.

<only when the guide passed 40 KB>
⚠️ The leader guide is now <size>. It loads whole at every session start and every compaction,
so each rule is a permanent running cost. Nothing prunes it today.
```

## Refused

```markdown
## ⛔ Rule not added

<one sentence: what the rule would have relaxed — a gate, a test, a push protection, a tool
boundary, or one of the unattended hard stops.>

Writing it into the leader guide would give it more authority than a repo-local override, which
is not allowed to relax a safety rule either. Nothing was written.

<the nearest thing that can be done: a narrower version of the rule, or the place this belongs instead>
```

## Not a leader rule

```markdown
## ⛔ Rule not added — this is not a leader rule

<one sentence: what it is about — code style, repository convention, CI — and where it belongs.>

The leader guide loads on every session; a rule that belongs in the repository's own conventions
costs context on every single run and is read at the wrong moment. Nothing was written.
```

## Stopped before anything

Used when the project is not an opinionated setup, or the guide is missing. One sentence of
cause, one of remedy, and the name of the skill that installs it. Nothing was written.
