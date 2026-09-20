# Folding the changelog

Two paths, chosen by what the repository already has. Detect; never impose.

## Fragment mode (`changelog.d/` exists)

Each file in `changelog.d/` is one entry, written by the pull request it came from, named
for that request's number.

1. **Read every fragment**, in numeric order of the filename, so the release section is
   ordered the way the work landed.
2. **Group them** under the headings the existing changelog already uses. Match the
   repository's shape exactly — its headings, its line form, its emoji conventions. A
   release that suddenly reads differently is a worse release note than a plain one.
3. **Write the new version section** above the previous top section.
4. **Delete every fragment you folded, in the same commit as the fold.** Not before, not
   after. In the same commit, the fold and the deletion are one atomic fact: a fragment
   that exists has not been folded, and a fragment that was folded does not exist. Split
   them and a failed run leaves fragments that will be folded twice, or a changelog missing
   entries whose fragments are already gone.
5. **Leave a fragment you did not fold in place**, and say so in the report.

### A malformed fragment

Report it and leave it. Do not guess at what it meant, and do not drop it silently — a
dropped entry is a change that shipped with no record, which is worse than a release note
that says one fragment could not be read.

The run continues with the rest: one bad fragment must not cost every other entry.

## Direct mode (no `changelog.d/`)

Write the new version section directly above the previous top section, in the existing
format. Nothing is deleted.

## Both modes

- **Never rewrite a released section.** A published version's entry is a record of what
  shipped; correcting it retroactively means two people reading the same version see
  different histories. Fix it in the next version, with a note.
- **Never invent an entry.** If a merged change left no fragment and no changelog line, the
  release note does not mention it, and the report says how many merged requests had no
  entry. That number is worth seeing.
- **The version heading's date is the date the tag is created**, not the date of the last
  merge. It is the date the release exists.
