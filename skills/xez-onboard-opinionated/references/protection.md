# Branch protection

Called from step 7, after the setup pull request has merged.

## Why this step exists at all

Without protection the CI jobs, the QA gate and the design gate are **not enforced by the host**.
Every label, every review rule and every check the setup just installed becomes advisory: a
branch can merge with none of them satisfied. A setup that reports success while enforcing
nothing is worse than no setup, because now somebody believes they have gates.

This is also the one place the skill reaches beyond project files. It changes a **repository
setting**, which affects everyone on that repository rather than only the owner — stated in the
preview, and stated again here.

## What is applied

Tracker operation **branch-protected**, on the branch the owner confirmed, with:

- **required status checks** = the confirmed gate commands' CI job names;
- **no direct pushes** for ordinary work;
- **administrators not enforced.**

That last one is a deliberate choice and the reason is worth reading. The leader writes campaign
files at every milestone — a merge, a task launch, an owner decision — and commits them as the
last act of handling that event, before reporting. Those are record files, and routing each one
through a pull request would mean several tiny pull requests an hour and a record that lags the
event it records. So the owner's admin login may push directly, and the leader guide limits that
bypass to record files: the campaigns directory, the leader guide, the mode file.

**The limit is a written rule, not an enforced one.** Anyone with admin rights can push anything
directly. That is the accepted cost of keeping the record honest and immediate, and it is stated
in the report rather than left for someone to discover.

## Without admin rights

Do **not** skip, and do not report protection as on. Print the exact command for someone who has
the rights, say which checks it requires and that administrators are excluded, and wait.

## Verify, always, on both paths

Re-read with **get-required-checks** afterwards. A write that returned success and a branch that
is actually protected are different claims, and an unreadable protection API answering `404`
reads as "no requirements" to anything that does not check — which is the exact fail-open shape
this collection exists to prevent.

**The skill does not report the setup finished while protection is off.** It says protection is
off, what that means for the gates, and the one command that fixes it.
