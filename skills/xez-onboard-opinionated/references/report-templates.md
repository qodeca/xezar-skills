# Report templates

Called from step 10. Omit any optional line that would say nothing.

## Setup complete

Only after the smoke test passed and protection was re-read.

```markdown
## 🚀 Setup complete — and proved by a real task

<n> files written, merged in <PR>. A throwaway task ran end to end through the new setup:
workflow → pull request → gates green. Its branch and pull request are cleaned up.

| | |
|---|---|
| 🎯 Base branch | `<name>`, protected — <n> required checks, administrators **not** enforced |
| 🧪 Gates | `<command>`, … — run by the smoke test, not only written down |
| 🤖 Leader | <model><, no second login: its own limit ends an unattended stretch> |
| 📋 Routing | <n> rows, chains ending in `wait` |
| 📸 Records | `.xezar/campaigns/` — committed; `future-campaign/` reserved, no campaign opened |

⚠️ **Three things to know before you rely on it**

- Administrators can push directly to the protected branch. That is deliberate — the leader
  commits campaign records at every milestone and routing each through a pull request would make
  the record lag the event. The leader guide limits the bypass to record files, and **that limit
  is a written rule, not an enforced one**.
- The permission file allows the leader's MCP tools by pattern, so unattended runs never stop on
  a prompt. A tool the product adds later is allowed without anyone looking at it.
- Opening a campaign is yours. The leader never opens one, so nothing starts until you do.

🧑‍💻 **Your controls** — <all three installed / `<names>` are not installed yet>

<when all three are present:>
`xez-unattended-on` before a stretch you are away · `xez-unattended-off` when you are back, to
clear what it parked · `xez-add-rule` for anything the leader should always do.

<when one or more is missing — say what is lost, then give exactly one command:>
Until you install <names>, the leader keeps its **full** owner-only list and stops on every one of
the six. Nothing is less safe; it is just less useful overnight.

```bash
npx skills add <collection-source> --skill xez-unattended-on --skill xez-unattended-off --skill xez-add-rule
```

**Next:** open a session with `<launcher>` — the full command, including
`--dangerously-load-development-channels`, so you can see what it turns on before you run it.

PR: #<number> (link: <full PR URL>)
```

## Protection could not be applied

Replaces the protection row above, and the report does **not** say the setup is complete:

```markdown
## ⚠️ Setup written, but the gates are not enforced yet

Everything is installed and the smoke test passed, but this login cannot change repository
settings, so `<branch>` is unprotected. Until somebody with admin rights runs this, every label,
review rule and CI check the setup installed is advisory — a branch can merge with none of them
satisfied:

```bash
<the exact command>
```

Re-run this skill's protection step, or re-read it yourself, once that has run.
```

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
`.local/xezar/runtime/onboarding-interview.json` is already on disk — it is the only thing this run wrote.

**Approve the whole set, or nothing.** A partial approval would produce a partial setup, which
is the one outcome the clean-project rule exists to prevent. Anything other than a clear yes
ends the run with nothing written into the project; the saved interview stays either way.

Use `--section <name>` to change one answer first.
```

## Smoke test failed

The result, reported as the result — not a caveat on a success:

```markdown
## ❌ Setup written, but it cannot run a task

The throwaway task failed at **<step>**: <what the gate or step reported>.

Its pull request is left open on purpose so you can read the output; the branch is not deleted.

<one line: what this most likely means — a missing MCP registration, an account this machine
does not have, a gate command that does not run here.>

The setup files are in place and the configuration is valid. What is not proved is that the
whole thing runs, which is exactly what this step exists to find out while you are still here.
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
