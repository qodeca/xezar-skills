# The smoke test

Called from step 8, and it runs before the final report. Nothing here is optional.

## Why one real task, and not a checklist

Every part of this setup can pass a part-by-part check while the whole still cannot run a task.
The failures this catches are each invisible to a per-part check and fatal together:

- the MCP server registered but never loaded into a session, so no leader tool exists;
- the permission file missing, so the first tool call waits on a prompt nobody answers;
- the base branch unprotected, so the gates are decoration;
- an account configured that this machine does not actually have, so the first dispatch fails;
- gate commands that were detected, confirmed, written — and never run.

Each of those passes its own check. The first real piece of work fails on them, by which point
nobody is watching. So the last thing onboarding does is *be* that first piece of work, while
the owner is still here.

## What it does — two tiers, because a full workflow is the wrong price

The first test ran the throwaway task on a real delivery workflow: two full agent sessions, five
and a half minutes, and **287,000 tokens to change one line**. Those workflows are built for real
work. What needs proving splits cleanly in two, and only one half needs an agent.

**Tier 1 — the engine can run a task here.** `task_create` with **inline steps**, not a named
workflow: the kit's worktree preflight, then **one** agent step on the first lane
`node .xezar/checks/route.mjs --file .xezar/routing.json evidence-pass` lists – that row's order
starts with the cheapest lanes – told to append one line to a scratch file under `.local/xezar/scratch/`, then the
evidence step. Give each step only `runner` and `model`: with inline steps the engine refuses `agentProfile`, `worktree` and `autonomous`.
So the agent step runs on the login this project selected for that step's tool (`get_account` →
`accounts`). Read the agent step's `profileId` from `task_read view=task` and name it in the report.
This proves dispatch, the worktree, the account, the permission file, and — when the
task changes state — one pushed event (`references/verify.md` §2).

Then, with no tokens spent: for each tool with `usesLogins: true`, call `project_config
check_account_status {provider, accountId, refresh: true}` for every other login of its rotation.
Any status other than `connected` is ❌ — a login nobody signed in to fails here, not on the first
real task.

**Tier 2 — the gates and the tracker flow work.** No agent. On a scratch branch with a one-line
change: run `.xezar/checks/repo-gates.sh` as a plain command — it prints `run id none — standalone
attempt`, which is the expected shape here and not a fault: the primary checkout has no engine run
id, so the attempt is a verdict rather than sealable evidence — open a draft pull request through
**create-pr**, apply the full label set through the descriptor's guards — one pipeline label, a
category, a QA label, a priority, a risk — read them back, and wait for CI. A setup whose labels
do not exist fails **here**, not on the first real task.

Then **clean up, in this order**: the engine's worktree first (through the engine — a branch
that a worktree still holds cannot be deleted), then close the pull request and delete the
remote branch, then the local branch. **Then** report "setup complete". Not before. Print what
tier 1 cost in tokens: it is the owner's first real number for what a task costs.

**One retry, announced, for one reason.** A dispatch refused for a usage limit says nothing
about the setup. Say so, take the next `lane=` line `route.mjs` printed, dispatch once more. Any other
failure is the result.

## Cleaning up is not a rule violation

The leader may never delete a record without the owner — an issue, a branch, a campaign file, a
tag, a label. This cleanup is not that, for three reasons stated together: this skill is not the
leader; it is interactive with the owner present; and it deletes only the branch it created
seconds earlier in the same run. The rule governs the leader acting unattended on records it did
not create.

## When it fails

Report the failure as the result. Do not retry silently, do not report success with a caveat,
and do not delete the evidence — leave the pull request open so the owner can read the gate
output, and say which step failed and what it means.

A setup that cannot run a task is not finished, and saying so is the entire value of this step.
The accepted cost of running it at all is stated up front: onboarding takes several minutes
longer and briefly creates a branch and a pull request on the owner's repository.
