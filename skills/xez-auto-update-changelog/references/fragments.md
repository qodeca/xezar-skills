# Changelog fragments

An optional convention that removes a whole class of merge conflict. Use it when the
repository has a `changelog.d/` directory; fall back to editing `CHANGELOG.md` directly
when it does not.

## The problem it solves

Every open pull request that touches the changelog edits the same unreleased section, at
the same place in the same file. The first one merges; every other one now conflicts. On
some code hosts a content conflict also stops CI from running on those requests at all,
so one merge can stall a queue.

The conflicts are not about anything: no two of those changes disagree. They collide
because they were written into shared bytes.

## The convention

One file per pull request, in `changelog.d/`, named for the request number — `123.md`.
No two branches ever touch the same bytes, so no two can conflict.

A fragment holds one entry, in whatever shape `CHANGELOG.md` already uses:

```text
### Fixed
- Login no longer drops the return URL when the session expires mid-form.
```

A release step folds every fragment into the new version section and deletes them **in the
same commit**, so a fragment that was folded cannot be folded twice.

Detect the convention rather than imposing it: `changelog.d/` exists → write a fragment;
it does not → edit `CHANGELOG.md` as before. Creating the directory is a repository
decision, not this skill's.

## Four evidence levels, never mixed

When a changelog entry makes a claim about something being verified — a fix confirmed, a
workaround validated, a recommendation — say which of these it is. They are ordered, and
the rule is that **copying, or a green fixture, is never enough for a recommendation**.

| Level | What it means |
|---|---|
| **adapted** | Installed and statically checked. It is present and it parses. Nothing was run. |
| **fixture-tested** | An isolated case passed. The behaviour works where it was set up to work. |
| **real-task verified** | Observed in an actual run, with evidence a reader can go and look at. |
| **recommended** | Reviewed guidance, justified by real results **and** stated limits. |

Never mix two levels in one claim, and never let a lower one wear a higher one's words.
"Verified" for something that only passed a fixture is the common case, and it is the one
that costs trust: the next person acts on a guarantee that was never made. When a claim
sits between levels, take the lower one and say what is missing from the higher.

An entry that makes no verification claim needs none of this. Most do not.
