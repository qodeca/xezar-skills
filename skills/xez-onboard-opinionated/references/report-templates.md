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
| 📋 Routing | <n> rows, chains ending in `wait`; tasks that name no account run on `<lane>`, not the leader's login |
| 🏷️ Labels | <n> on the tracker, read back<; <n> already existed and kept their colour> |
| 🧪 Smoke test | engine task on `<lane>`: <tokens> tokens · gates + labelled pull request + CI: green |
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
npx skills add <collection-source> --skill xez-unattended-on --skill xez-unattended-off --skill xez-add-rule --agent claude-code --agent codex
```

**Next:** from tomorrow, open the leader with `<launcher>` — the full command, including
`--dangerously-load-development-channels`, so you can see what it turns on before you run it.
One leader per project: to move it to a new session, exit this one first.
<when push was not seen:> Events are read by polling, not pushed: <the reason found>.

PR: #<number> (link: <full PR URL>)
```

## Setup pull request open

Ends step 6. Not a completion report: say what is still owed and give the exact lines.

```markdown
## 📋 Setup written — <n> files in <PR>, not proved yet

Protection and the smoke test come after the merge. <One of:>

<the engine's tools are loaded in this session AND every required check is green — ask, do not
wait; this is the one question that decides whether the setup finishes today:>
**<PR> is green: <n> required checks passed.** Shall I merge it and finish here — protection, the
smoke test and the checklist, about five more minutes — or do you want to read the diff first?

<the tools are loaded but a check is red or still running — name it and do not offer:>
**Next:** <PR> is waiting on `<check>` (<failing / still running>). Tell me when it is green and I
merge and carry on here, or merge it yourself.

<they are not — this session started before the MCP registration existed:>
**Next, in this order:**
1. Merge <PR>.
2. `git switch <base> && git pull`
3. `<launcher> "/xez-onboard-opinionated --verify"` — the full command, including
   `--dangerously-load-development-channels`, so you can see what it turns on before you run it.
   Claude Code shows its development-channel warning on every launch; accept it.
4. Approve the `xezar` MCP server when Claude Code asks.

Keep the engine running in its own terminal the whole time. Closing this session does not
stop it; closing that terminal does.

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

<n> files would be created, <n> deleted (the engine's two init examples), <n> left alone, <n> need your decision.

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
🔁 **Resumed** an interview started <when>: <n> of 5 screens already answered.
Changed on this run: <screens, or "nothing — continued from `<screen>`">.
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

Use this shape for every hard stop: wrong harness, non-GitHub tracker, existing configuration, a
finished prior onboarding by this skill. All are ordinary outcomes, not failures, and a refusal
that explains itself at length reads like one.

## Waiting on a fix

For the fixable stops — engine missing, too old or never run, tracker login, a dirty tree. The
run is paused, not ended:

```markdown
## ⚠️ <n> thing(s) to fix before I start — nothing written

| | | |
|---|---|---|
| ❌ | <what is missing, in plain words> | `<the exact command>` |

<for the engine start line: own terminal, leave it open, answer its one question.>

Tell me when that is done and I check again — only what failed, not the whole list.
```
