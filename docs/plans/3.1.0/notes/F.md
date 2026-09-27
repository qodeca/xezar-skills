# Stream F – #57 changelog formats

## Changelog

**The changelog check and fold understand Keep a Changelog, and find the base branch from
config.** A project whose `CHANGELOG.md` uses `## [Unreleased]` and `## [1.2.3] - YYYY-MM-DD`
headings now gets the same protection as the house format: a pull request that edits
`## [Unreleased]` directly is refused and a `changelog.d/` fragment is accepted, so parallel pull
requests stop conflicting on the same lines. The format is detected from the file, or set with
`changelog.format` (`auto`, `house`, `keep-a-changelog`) in `.xezar/pipeline/config.json`. In that
format the release fold merges the fragments into the Unreleased content under `### Added`,
`### Changed`, … (house headings map onto those groups), renames it to the new version and opens a
fresh, empty `## [Unreleased]`. A new `changelog-fragments.mjs --verify` step, also run inside every
fold before it writes, proves that no fragment was left behind and no line was lost.
`changelog-check.sh --diff-base auto` now uses the configured `baseBranch`, then the remote's
default branch, and never falls back to a hard-coded `main`. The house format behaves as before.
(#57)

## Upgrade entry

**Symptom.** A project that uses Keep a Changelog has pull requests that keep conflicting on
`CHANGELOG.md`, because the check never saw its `## [Unreleased]` section. Or a project whose base
branch is not `main` gets a changelog refusal for commits that are already on its base.

**What to do.** Copy the three check files and the release role skill below from the kit. A Keep a
Changelog project needs nothing else: the format is detected. To pin it, add
`"changelog": { "format": "keep-a-changelog" }` to `.xezar/pipeline/config.json`. The protection
still needs a `changelog.d/` folder, as before.

**What you lose by skipping it.** A Keep a Changelog project keeps the conflicts and has no fold
for its fragments; a project whose base is not `main` keeps measuring direct edits from the wrong
branch; and no release gets the verify step that catches a lost entry.

```upgrade
Applies-to: <3.1.0
Files: .xezar/checks/changelog-check.sh; .xezar/checks/changelog-fragments.mjs; .xezar/checks/repository-checks.sh; .xezar/skills/xezar-release-changelog.md
Actions: config-key=changelog.format
```

`changelog.format` has a documented default (`auto`, detect from the file), so the upgrade may leave
it unset.

## Compatibility rows

`BACKWARD_COMPATIBILITY.md` §2, the kit-only key table:

| Key | Written for a new project as | Read by |
|---|---|---|
| `changelog.format` | absent (`auto`: detected from the file's headings); `house` or `keep-a-changelog` to pin it | `kit/checks/changelog-fragments.mjs`, and through it `kit/checks/changelog-check.sh` |

Prose under that table: `changelog.format` arrived in 3.1.0 and has a meaning when absent –
detect, which reads every file written before 3.1.0 as `house`, exactly as before. An unknown value
is refused, not read as "detect". Removing a value or changing what `auto` detects is breaking.

The ledger of deliberate breaks:

| Date | What changed | Who it affects | What they must do | Why it was worth it |
|---|---|---|---|---|
| 2026-09-27 | `changelog-check.sh` refuses a direct edit of `## [Unreleased]` in a Keep a Changelog file, and `changelog-fragments.mjs` refuses a fragment heading that format has no group for (`## Highlights`, `## 👥 Contributors`) there | a Keep a Changelog project with a `changelog.d/` folder, whose pull requests edited `CHANGELOG.md` directly and passed | write `changelog.d/<pr-or-branch>.md` instead, under a Keep a Changelog group or a house heading that maps onto one | that project's pull requests all conflicted on the same lines (about eight conflict repairs in one project) |
| 2026-09-27 | `changelog-check.sh` and `changelog-fragments.mjs` exit 2 on an unknown `changelog.format` or an unparseable `.xezar/pipeline/config.json` | a project with a typo in that key, or a broken config | fix the value (`auto`, `house`, `keep-a-changelog`) or the JSON | a typo must not silently pick the other format |
| 2026-09-27 | `--diff-base auto` no longer falls back to `origin/main` or `main`: it uses the gate base, then `baseBranch` from `.xezar/config.json` or `.xezar/pipeline/config.json`, then the remote's default branch; a configured base that does not resolve leaves the rule unchecked and says so | a project whose base is not `main`, running the check outside a gate run | fetch the configured base branch | `main` is the wrong base there and turned the base's own commits into a false refusal |
| 2026-09-27 | the fold verifies itself before it writes, and refuses a fold that would leave a fragment line out of the new section or drop a changelog line | nobody in practice – the fold never did either | nothing | a lost entry is now caught before the file is written, not after the release |
