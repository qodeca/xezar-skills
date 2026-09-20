# The preview

Called from step 5. The preview is the last thing this half produces, and in the full skill it is
the gate the writing half passes through.

## Three groups, always all three

| group | meaning |
|---|---|
| **create** | The file does not exist. The setup will write it. |
| **leave alone** | The file exists and is untouched engine-init output, or is outside the setup's scope. |
| **needs your decision** | The file exists and the setup has content for that path. |

The third group should be **empty on a clean project** — the preflight refuses anything else. It
exists for the one legitimate case: untouched engine-init output that is being replaced. Show
what is there and what replaces it, so "replaced without asking" is at least *seen* without
asking.

## Every entry is bound to a digest

Each previewed file records the digest of what was read — including **expected absence** for a
file that does not exist yet. Before any write, the writing half re-reads and compares. Any
intervening edit invalidates the preview: it is regenerated, and the affected decisions are
re-asked.

This is why the preview is a single approval over the whole set rather than a file-by-file walk.
A half-applied opinionated setup cannot exist: either every file is written from one approved,
still-valid preview, or none is.

## What the preview covers

Group the entries the way the owner thinks about them, not by directory:

- **The engine kit** — workflows, check scripts, role skills. Copied, with the gate script's
  command array generated from the confirmed answers.
- **Process and config** — the two config files, the label taxonomy, the tracker descriptor, the
  generated process documents.
- **The leader** — the guide (a shipped half and a generated half), the one `SessionStart` hook
  and its context-loader script, the loops file.
- **Wiring** — the MCP registration at the project root, the gitignored permission file, the
  launcher script.
- **Records and working state** — the campaigns directory with its reserved future-campaign
  folder, the `.local/xezar/` subfolder structure, both halves of the onboarding manifest.

For each group: how many files, what generates rather than copies, and the one line that says
what it is for. A preview nobody reads is a preview that approved everything.

## Say what the preview does not cover

Three things, named explicitly, because they are the ones that surprise people:

- **Branch protection is a repository setting**, not a file. It is the one place the setup
  reaches beyond project files, and it affects everyone on the repository rather than only the
  owner. Say whether this login can apply it, which the preflight already determined.
- **The smoke test creates a real branch and a real pull request**, then closes and deletes them.
- **The interview state file** under `.local/xezar/runtime/` was already written, before this preview.
  It is the only thing written so far, and the owner should know it exists.

## One approval, over the whole set

Ask once, for everything. Not file by file: a partial approval would produce a partial setup,
and the preflight's whole promise is that a half-applied opinionated setup cannot exist.

Anything other than a clear yes ends the run with nothing written into the project. The saved
interview stays, so the owner can come back to it.
