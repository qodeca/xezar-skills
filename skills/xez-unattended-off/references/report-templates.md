# Report templates

Called from step 6. Omit any optional line that would say nothing.

## Mode off, interview done

```markdown
## ☀️ Unattended mode is off

Mode cleared <time>. The leader is back on the full owner-only list.

**<n> parked decision(s), all asked back:**

| what the leader decided | you said | where it landed |
|---|---|---|
| <one line> | ✅ kept / 🔁 changed / 🔁 deferred | `decisions.md` <sha> |

<only when something was overturned>
**<n> reversed.** <one line each: what has to happen now, and whether the recorded undo still works.>

<only when something was deferred>
🔁 **<n> still parked**, first asked <date>. A second deferral usually means the decision needs
a different conversation, not another morning.

Committed as <sha>. `parked.md` is empty.
```

## Nothing was parked

```markdown
## ☀️ Unattended mode is off

Mode cleared <time>. Nothing was parked — the leader hit no decision it had to make on your behalf.

<only when the stretch did real work> <n> merge(s) overnight; the campaign timeline has the detail.
```

## Contract exceeded

Leads the report, above everything else, whenever a hard stop appears in `parked.md`:

```markdown
## ⚠️ The leader decided something it should have stopped on

**<which of the three: the release go / deleting a record / opening a campaign>** — <what it did>, <when>.

It should have written a `BLOCKED` record and waited. Read this first; the rest of the interview follows.

**Undo as recorded:** <the leader's own undo step, or "none recorded" — say which>.
```

## Mode only, interview skipped

```markdown
## ☀️ Unattended mode is off

Mode cleared <time>. ⚠️ **<n> decision(s) are still waiting** in `<campaign>/parked.md` — they were
not read back on this run.

Run `xez-unattended-off` again without `--mode-only` when you have ten minutes. They stay parked
until you do, and they do not expire.
```
