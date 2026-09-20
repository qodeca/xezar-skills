# Report templates

Called from step 6. One template per outcome. Omit any optional line that would say nothing.

## Mode entered

```markdown
## 🌙 Unattended mode is on

The leader keeps working while you are away. Entered <time>, recorded in `<campaign>/decisions.md`
and committed as <sha>.

**Three things still stop it dead** — it writes a `BLOCKED` record and waits for you:
⛔ the release go · ⛔ deleting a record (issue, branch, campaign file, tag, label) · ⛔ opening a campaign.

**Three it decides itself and parks for the morning:**
an account or provider lane switch · a scope trim · a third repair round.
Each lands in `<campaign>/parked.md` with what it chose, why, the alternative, and how to undo it.

⚠️ Two costs you accepted, repeated here because nobody will be watching:
a metered provider can accumulate spend overnight, and the three stops are instructions in the
leader guide, not a hook — if the leader misreads one at 03:00, nothing catches it until you read this back.

🔁 Restart budget: 0 of 3 used. After three resumes in this stretch the leader stops resuming and waits.

**To end it:** run `xez-unattended-off`. It clears the mode and walks you through every parked
decision one at a time.
```

## Already on

```markdown
## 🌙 Unattended mode was already on

Entered <time>, <n> of 3 restarts used. Nothing was written.

<parked count> decision(s) are already waiting in `<campaign>/parked.md`.

Re-run with `--force` to reset the clock and the restart counter — that buys three more resumes,
which is the part worth knowing before you do it. To end the mode instead, run `xez-unattended-off`.
```

## Stopped before writing

```markdown
## ⛔ Unattended mode not entered

<one sentence: what was missing or what the owner answered>

Nothing was written or committed.

<the one concrete next action — install the opinionated onboarding skill, open a campaign, or clear the working tree>
```

Use the `⛔ Stopped` shape for every refusal: a missing onboarding manifest, no open campaign,
a dirty working tree, an unreadable mode file, and an answer in step 2 that was not a clear yes.
In all five cases the body is one sentence of cause and one of remedy — a refusal that explains
itself at length reads like a failure, and this is an ordinary outcome.
