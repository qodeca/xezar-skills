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

## What it does

1. **Dispatch one throwaway task** through the leader's MCP server: a trivial change to a
   scratch file, on the standard workflow, so it exercises the real path rather than a shortcut.
2. **Watch it** — the workflow steps, the check scripts, the pull request it opens, the gates.
3. **Clean up**: close that pull request and delete the branch it created.
4. **Then** report "setup complete". Not before.

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
