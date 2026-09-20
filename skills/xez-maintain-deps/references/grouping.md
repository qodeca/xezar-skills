# Deciding what to propose

One pull request per group. The grouping is the whole judgement of this skill, so it is
written down rather than left to the run.

## Why groups and not one PR

A single pull request carrying forty updates is unreviewable: when the gate fails, nobody
can tell which member broke it without splitting it by hand, and when it passes, the
reviewer approves a blast radius they cannot see. One per group keeps each PR answerable.

Equally, one PR per dependency drowns the tracker. Patch updates across twenty packages
are one decision, not twenty.

## The groups

| Group | What goes in | Default |
|---|---|---|
| `security` | Anything with a known advisory **and** a fixed version to move to. | proposed |
| `patch` | Version change in the patch position only. | proposed |
| `minor` | Version change in the minor position. | on request (`--group minor`) |
| `major` | Version change in the major position. | on request |
| `uncomparable` | Versions that cannot be ordered — a git dependency, a date-based version, a pre-release tag. | **never auto-grouped** |

`security` and `patch` are the defaults because for those two the risk of moving is
usually smaller than the risk of not moving. That is a default, not a law: a patch release
can still break you, which is what step 6's gate run is for.

## Rules that override the table

- **A security update with a fixed version is proposed even when it crosses a major
  boundary.** It moves to its own PR, labelled `risk-high`, with the major bump stated in
  the first line of the body. Leaving a known vulnerability in place because the fix is a
  major version is a decision for a human, and it cannot be made by someone who was never
  told.
- **An advisory with no fixed version is reported, never proposed.** There is nothing to
  update to. It belongs in the report and, if it matters, in a tracker issue — not in a
  pull request that pretends to fix it.
- **`uncomparable` is never grouped automatically.** A git dependency pinned to a commit,
  or a version scheme this skill cannot order, is listed in the report for a human to look
  at. Forcing it into `patch` because the strings look similar is how an unreviewed major
  change gets proposed as a patch.
- **One member breaking the gate splits the group, it does not sink it.** Re-run the gate
  without that member, propose the rest, and name the one that broke it with the failure.
  A whole group abandoned because of one package wastes every other update in it.
- **A dependency already proposed in an open PR is skipped**, not proposed twice. Find it
  through **search-prs** and say in the report that it is already in flight.

## What the reviewer needs in every group

- Each member: name, from-version, to-version, and why it is in this group.
- `UPDATE_OTHERS_MOVED` — how many transitive dependencies moved as a side effect. One
  requested bump routinely moves several; a reviewer who is shown "1 package updated" for
  a change that moved thirty has been misled by omission.
- The gate result, in full. "Tests pass" with no command named is not evidence.
- For a security group: the advisory id and severity per member, and nothing else from the
  scanner's output.
