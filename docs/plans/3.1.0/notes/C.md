# Stream C – leader context and settings (#64, #69)

## Changelog

**The leader's context carries the newest timeline entries, and says so when the owner's decisions
are missing (#64).** The leader loader injects the newest timeline as its newest 40 entries (set
`XEZAR_TIMELINE_ENTRIES` in the leader's environment for another number), followed by one line
naming the full file and how many older entries were left out. An entry is one top-level `- ` list
item with its continuation lines, so a multi-line entry is never split; the 64 KiB tail stays as a
backstop. `decisions.md` is still injected whole. When the live campaign's `decisions.md` is
missing, a symlink, not a regular file or unreadable, the context now opens with a `WARNING <nonce>:`
line in its trusted part instead of skipping the file in silence. Found in Erfana, where the bound
cut the injected context from about 90 KB to about 54 KB.

**A project's own `.claude` settings no longer turn the kit's checks red (#69).**
- `leader-context-loading.md` quotes only the kit's own `SessionStart` hook entry, and
  `fenced-quotes.mjs` compares it structurally through a new `#entry:<key.path>` marker. A project
  can add hooks of its own; a change to the kit's entry still fails.
- `catalog-check.mjs` reports a widening Bash rule in the untracked `.claude/settings.local.json`
  as a `WARNING` instead of failing, on that machine too (owner decision D10, recorded in
  `DECISIONS.md`). The same rule in the committed `.claude/settings.json` still fails, and the
  message now says what to do instead.
- The settings check also refuses a chrome-devtools grant outside the kit's tool list (for
  example `emulate` or `evaluate_script`) and a grant naming the whole browser server, in either
  file.

## Upgrade entry

**Symptom.** A project that added its own hook to `.claude/settings.json` fails `fenced-quotes.mjs`
on `.xezar/docs/leader-context-loading.md`. A Bash rule the owner put in
`.claude/settings.local.json` keeps `catalog-check.mjs` red on that machine. A busy campaign day
fills the leader's context with old timeline detail. A leader whose campaign has no readable
`decisions.md` gets no sign of it.

**What to do.** Copy the files below from the kit. Copy `.xezar/checks/fenced-quotes.mjs` **before
or with** `.xezar/docs/leader-context-loading.md`: an older `fenced-quotes.mjs` reads the new
`#entry:` marker as part of a file name and fails. If your `.claude/settings.json` or
`.claude/settings.local.json` grants a chrome-devtools tool outside the kit's list, or
`mcp__chrome-devtools` / `mcp__chrome-devtools__*`, replace it with exact allowed tool names (the
kit's `.claude/settings.local.json` lists them); `emulate` comes from the `qa` and `design-review`
workflows only. Timelines should keep one `- ` line per event at column 0, with continuation lines
indented. The leader picks up the new loader at its next session start.

**What you lose by skipping it.** A project hook of your own keeps the base branch red; a local
permission keeps the repository check red on that machine; the leader's context keeps growing with
the day's timeline; and a missing `decisions.md` still goes unannounced.

```upgrade
Applies-to: <3.1.0
Files: .xezar/checks/fenced-quotes.mjs; .xezar/checks/leader-context.sh; .xezar/checks/documented-output.mjs; .xezar/checks/catalog-check.mjs; .xezar/docs/fenced-quotes.md; .xezar/docs/leader-context-loading.md; .xezar/docs/campaign-notes.md
```

## Compatibility rows

Ledger row (`BACKWARD_COMPATIBILITY.md`, "The ledger of deliberate breaks"):

| Date | What changed | Who it affects | What they must do | Why it was worth it |
|---|---|---|---|---|
| 2026-09-27 | the kit's `catalog-check.mjs` refuses a `permissions.allow` entry in `.claude/settings.json` or `.claude/settings.local.json` that grants a chrome-devtools tool outside the kit's list, or the whole `mcp__chrome-devtools` server | a project onboarded by `xez-onboard-opinionated` that copies the new `catalog-check.mjs` and granted such a tool or the whole server in its settings | list only the exact tool names in the kit's `.claude/settings.local.json`; `emulate` is granted by the `qa` and `design-review` workflows, never by a settings file | a settings grant reaches every step, including reading steps, while the browser server runs outside every runner sandbox, so the exact tool list is the only limit it has |

No new config key. `XEZAR_TIMELINE_ENTRIES` is an optional environment variable of the leader
session, not a config key; unset means 40.
