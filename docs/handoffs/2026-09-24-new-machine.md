# Handoff – xezar-skills, continuing on a new machine (2026-09-24)

## Where things stand

- **3.0.3 is released.** PR #47 squash-merged as `ec856f8`, tag `v3.0.3`, release
  https://github.com/qodeca/xezar-skills/releases/tag/v3.0.3. It fixed issue #46 (closed) and the
  real-.NET test fixture. Details: `CHANGELOG.md` (3.0.3), the top entry of `UPGRADE_NOTES.md`.
- **PR #48 (`docs/memories`) is open.** It adds the previous machine's Claude Code session notes
  under `docs/memories/`. The owner chose to publish them in this **public** repo. CI was pending
  when this was written. If it is green and not merged: `gh pr merge 48 --squash --delete-branch`.
- Nothing else is unpushed. No other branches, stashes or open PRs.

## First steps on the new machine

1. `git clone https://github.com/qodeca/xezar-skills.git ~/Projects/xezar-skills` (same path keeps
   the Claude memory folder name the same).
2. Once PR #48 is merged, restore the notes as this machine's Claude memory:
   ```bash
   mkdir -p ~/.claude/projects/-Users-<user>-Projects-xezar-skills/memory
   cp ~/Projects/xezar-skills/docs/memories/*.md ~/.claude/projects/-Users-<user>-Projects-xezar-skills/memory/
   ```
   The folder name is the project path with `/` replaced by `-`. Check it with
   `ls ~/.claude/projects/` after the first Claude session in the repo.
3. Read `docs/memories/MEMORY.md` (index) and `docs/memories/release-302-work.md` (latest state).
4. Ask the owner whether `docs/memories/` should stay in the repo after the move. It is public.

## Open work (owner decides the order)

- **Upgrade cmplus and 8cli to 3.0.3.** Each copies one file, `.xezar/checks/lib/deps.mjs`, and
  refreshes its digest in `.xezar/onboarding.json` (top entry in `UPGRADE_NOTES.md`). The owner has
  not yet said to open these PRs – ask first. Previous upgrade paths and quirks (8cli base branch is
  `develop`; m1 cannot push over SSH, work moved by git bundle) are in `docs/memories/release-302-work.md`.
- **Real .NET run on the m1 machine:** `XEZ_DEPS_REAL=1 node scripts/test-deps-units.mjs`. The new
  solution parsing in `deps.mjs` (lists `.sln`/`.slnx` projects, also from outside the unit) has
  only run against stubs.
- **Known local-only failure:** `node scripts/test-gate-status.mjs` fails on macOS on `main` too
  (case "an upper-case gate name"); it passes in CI. Not investigated. Likely a case-insensitive
  file system – unverified.

## Working rules learned this session

- Run gates one at a time (see `AGENTS.md` → Validation). Do not edit any file while
  `scripts/test-guards.mjs` runs – it fails with "the suite changed the working tree".
- Releases here: version bump + `CHANGELOG.md` entry in the PR, squash-merge, annotated tag
  `vX.Y.Z`, `gh release create --latest` with the changelog section as notes.
- Only release when the owner says go. Patches are minimal line-level fixes
  (`docs/memories/feedback-focused-patches.md`).
- The owner reads replies in plain ELI5 / simple English: result first, short sentences, max two
  options with a recommendation, decisions via `AskUserQuestion`.

## Suggested skills

- `using-my-tools` – before any `gh`/outbound work on the new machine.
- `xez-onboard-opinionated` – reference for the kit when upgrading cmplus / 8cli.
- `code-review` – before merging any new fix PR.
