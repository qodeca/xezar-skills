# Report templates

Called from step 6. Omit any optional line that would say nothing.

## Interview complete, preview printed

```markdown
## 📋 Setup previewed — nothing written yet

<n> files would be created, <n> left alone, <n> need your decision.

**What you settled**

| | |
|---|---|
| 🎯 Base branch | `<name>` (<model> flow) |
| 🧪 Gates | `<command>`, `<command>`, … |
| 📝 Design gate | on / off — <the UI evidence behind it>; the whole design half installs either way |
| 🤖 Leader | <model>, second login: yes / **none — its own limit ends the night** |
| 🔀 Lanes | <n> task lanes, <n> unlimited; leader's login reserved and never dispatched to |
| 📋 Routing | <n> rows across 5 classes, each chain ending in `wait` |

**The preview**

<the grouped file list from references/preview.md>

**Three things the preview does not cover:** branch protection is a repository setting rather
than a file and affects everyone on the repo<, and this login <can / cannot> apply it>; the
smoke test creates and then deletes a real branch and pull request; and the saved interview at
`.local/runtime/onboarding-interview.json` is already on disk — it is the only thing this run wrote.

⚠️ **The writing half is not installed yet.** Nothing here has been applied, and this preview is
not an approval you are being asked for — it would be stale by the time the writing half exists.

Re-run to continue from the saved interview, or `--section <name>` to change one answer.
```

## Resumed

Open with what was found before the rest of the report:

```markdown
🔁 **Resumed** an interview started <when>: <n> of 7 sections already answered.
Changed on this run: <sections, or "nothing — continued from `<section>`">.
```

## Stopped in preflight

```markdown
## ⛔ Not onboarded — <the one-line cause>

<one sentence: what this means for the owner.>

<what was found, when a list helps — the configuration files, the tracker, the missing engine.>

**Instead:** <the one concrete next action, naming the skill or the command.>

Nothing was written. <Only when several checks failed:> Two other things would also have blocked
this run: <…> — listed now so you are not discovering them one re-run at a time.
```

Use this shape for every preflight stop: wrong harness, non-GitHub tracker, existing
configuration, a prior onboarding by this skill, and an engine that is missing or has never run.
All five are ordinary outcomes, not failures, and a refusal that explains itself at length reads
like one.
