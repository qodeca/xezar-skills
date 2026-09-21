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

- **required status checks** = the **CI job names** that run the confirmed gate commands, read
  from the base branch's latest run with **list-runs** / **get-run** — never the commands
  themselves, and never a name copied from a workflow file that has not run. No CI at all → no
  required checks, and the report says "review rules only" rather than pretending;
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

## Never require a check that is red today

Before applying, read each candidate check's latest conclusion **on the base branch**. One that
is failing there would block every pull request from the moment it is required — including the
fix for it. In the first test that cost a second pull request and two CI waits.

Red on the base branch → do not require it silently, and do not drop it silently. Tell the owner
which check, why it fails, and offer: fix it first (recommended), or require the green ones now
and come back for this one. Whatever is left out is named in the report as not enforced.

## The other long-lived branch

In a two-branch flow the base branch is not the release branch. Ask once whether the release
branch is already protected, and report what was found by reading it. This skill protects the
base branch it was asked to; it does not quietly leave `main` open and say "protected".

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
