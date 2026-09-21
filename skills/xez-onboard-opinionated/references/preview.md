# The preview

Called from step 5. The preview is the last thing this half produces, and in the full skill it is
the gate the writing half passes through.

## Four groups, always all four

| group | meaning |
|---|---|
| **create** | The file does not exist. The setup will write it. |
| **delete** | The file exists, is untouched engine-init output, and nothing in the kit takes its place. |
| **leave alone** | The file exists and is outside the setup's scope. |
| **needs your decision** | The file exists and the setup has content for that path. |

Under `.xezar/` the fourth group holds one legitimate case: untouched engine-init output that is
being replaced. Show what is there and what replaces it, so "replaced without asking" is at
least *seen* without asking.

**The delete group is short and it is never empty after `xezar init`.** It holds
`.xezar/workflows/fix-and-verify.yaml` and `.xezar/skills/project-conventions.md`: the two files
init writes, which the kit does not overwrite because it ships nothing by either name
(`references/write.md` §1). A deletion is the one preview entry an owner cannot infer from the
others, so it is listed by path and by reason rather than folded into "replaced".

Outside `.xezar/` it is rarely empty, and preflight check 3 already listed what is there: a
`CLAUDE.md`, an `AGENTS.md`, a pull request template, issue templates, an `.mcp.json`. One rule
per kind, stated in the preview rather than asked file by file:

- a document the project already has (`CLAUDE.md`, `AGENTS.md`) — **append a marked section**,
  never replace;
- a `CONTRIBUTING.md`, a `SECURITY.md` or a `docs/README.md` the project already has — **needs
  your decision**, which is the group the rule above puts it in: the file exists and the setup has
  content for that path. It is never silently replaced. The default proposal is **keep theirs**,
  because these three are addressed to people outside the project and a maintainer who wrote one
  has already said more than any answer in this interview can. Show what the setup would have
  written beside it, so the choice is visible rather than described.

  For an existing `SECURITY.md` say one thing more, because it is the case that matters: if it
  carries no "not a vulnerability" list and no statement of what the project has promised, the
  security-review role's first read gets nothing — that role reads this file as input. Offer those
  two parts as an addition to the owner's file, named as parts 2 and 4 (`references/write.md` §2);
- an issue template — **left alone**, always;
- a pull request template — offer the Design and Risk parts as an addition;
- `.mcp.json` — **merge** the one server entry in;
- a linter or formatter that scans the whole tree — add the new folders to its ignore file, and
  show the line. A setup that turns the project's own format check red has failed its first gate.

Do not warn about a consequence you have not checked. "The licence check will probably fail"
costs the owner a decision; reading the licence config costs one command.

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
  generated process documents. `SECURITY.md` is one of these and is worth naming on its own line:
  it makes a promise to people **outside** the project, which `BACKWARD_COMPATIBILITY.md` also
  does, and unlike that one it is read as input by two role skills. Show its four parts, and show
  the "not a vulnerability" list in full — an over-stated promise there is the one generated line
  an owner should read word by word. `CONTRIBUTING.md` and `docs/README.md` are generated here too;
  name them, because an owner who already has either will want to say so before one is written.
- **The leader** — the guide (a shipped half and a generated half), the one `SessionStart` hook
  and its context-loader script, the loops file.
- **Wiring** — the MCP registration at the project root, the gitignored permission file, the
  launcher script.
- **Records and working state** — the campaigns directory with its reserved future-campaign
  folder, the `.local/xezar/` subfolder structure, both halves of the onboarding manifest.

For each group: how many files, what generates rather than copies, and the one line that says
what it is for. A preview nobody reads is a preview that approved everything.

## Say what the preview does not cover

Six things that are not files in the pull request, named explicitly, because they are the ones
that surprise people:

- **The label taxonomy is created on the tracker**, before the setup pull request opens, so that
  pull request can carry its labels. List the labels by name and group, and mark which already
  exist: those keep their colour and description. Approving the preview approves this — and say in
  the same breath that labels live on the tracker, not in the pull request: **closing the setup
  pull request unmerged does not remove them.**

- **Branch protection is a repository setting**, not a file. It is the one place the setup
  reaches beyond project files, and it affects everyone on the repository rather than only the
  owner. Say whether this login can apply it, which the preflight already determined.
- **Three engine settings are changed for this project**, each read first, recorded with what it
  was, and read back (`references/verify.md` §3): the **default task account** becomes the **login**
  chosen on screen 3; **skill auto-update is switched off**, so skills change when the owner
  updates them and not at an engine start; and **OpenCode is switched off**. For the last, say why
  in one line — it can stall silently after a denied permission and does not enforce a step's tool
  limits — and give the one call that turns it back on. Say where all three live: git-ignored
  engine files **in this project** (`.xezar/workspace.json`, `.xezar/agent-accounts.json`), so no
  other project on this machine is touched — and that the provider switch is skipped, and
  reported, when the engine says it is not in single-project mode or when an existing routing
  table still uses OpenCode.
- **A machine-wide engine change is possible later, and this preview does not cover it.** This
  skill never proposes one. If the owner later names such a change themselves, it is asked in its
  own question that shows the file and the exact values
  (`references/engine-refusals.md`), and it is reported on its own line with its undo.
- **The smoke test creates a real branch and a real pull request**, then closes and deletes them.
- **The interview state file** under `.local/xezar/runtime/` was already written, before this preview.
  It is the only thing written so far, and the owner should know it exists — unless the owner
  accepted the consented account-registry copy earlier, which is then named here as the second.

## One approval, over the whole set

Ask once, for everything. Not file by file: a partial approval would produce a partial setup,
and the preflight's whole promise is that a half-applied opinionated setup cannot exist.

Anything other than a clear yes ends the run with nothing written into the project. The saved
interview stays, so the owner can come back to it.
