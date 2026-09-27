# Stream G – #70 project trust boundaries

## Changelog

**A project can name its own trust-boundary paths.** `security.trustBoundaries` in
`.xezar/pipeline/config.json` – `[{ "pattern": "tools/example/**", "why": "<what the path
decides>" }]` – adds paths to the security scan's machine-routed list, so a change to them sets
`reviewerRequired` by machine instead of by a line in `CODE_REVIEW.md` that a reviewer has to
remember. The list only adds: the kit's own entries always apply. It is read from the base branch
tip (`origin/<baseBranch>`), never from the branch under review, so a branch that drops its own
path from the list is still routed. Patterns hold literals, `?`, `*` and `**` only, matched by a
small hand-written matcher (no glob library, no regular expression built from config); negation,
braces, extglobs, character classes and regex characters are refused, and the list is capped at 64
entries of at most 256 characters. Each match in `security.json` now names its `list` (`kit` or
`project`). A project list that cannot be read or is invalid is never read as "no entries": a new
`trust-boundary-config` check records `unknown` with the reason, `reviewerRequired` is set, and
that check counts in the stage status. The four `packages/xezar/src/...` entries, which described
the engine repository's own layout and matched nothing in a consumer project, are gone from the
kit's list.

## Upgrade entry

**Symptom.** A project's `CODE_REVIEW.md` lists its own sensitive paths (deploy folders, build
tooling CI trusts, generated files) as "not yet in the scanner's machine-routed list", or the
project carries a local patch to `.xezar/checks/lib/security-scan.mjs` that adds them.

**What to do.** Copy the files below from the kit. To route paths of your own, add
`security.trustBoundaries` to `.xezar/pipeline/config.json` – each entry a `pattern` and a
one-line `why` – and merge it to the base branch; the scan reads the list only from there. Drop
any local patch that added paths to `TRUST_BOUNDARIES`, and move those paths into the key. Nothing
is needed when the project adds no paths: an absent key means no project entries. The security
stage now reads the pipeline config from `refs/remotes/origin/<baseBranch>`; a checkout where that
ref does not resolve records `unknown` and requires a reviewer on every non-empty change, so keep
the base branch fetched. A project that relied on the removed `packages/xezar/src/...` entries adds
them to the key.

**What you lose by skipping it.** Project paths stay routed by memory, or by a local patch to a
copied kit file that every later upgrade has to carry by hand.

```upgrade
Applies-to: <3.1.0
Files: .xezar/checks/lib/security-scan.mjs; .xezar/checks/lib/config-grammar.mjs; .xezar/docs/phase-record.md
Actions: config-key=security.trustBoundaries
```

## Compatibility rows

`BACKWARD_COMPATIBILITY.md` §2, a row in the kit-only key table:

| Key | Written for a new project as | Read by |
|---|---|---|
| `security.trustBoundaries` | absent (no project entries); elements `{pattern, why}`, `pattern` of literals, `?`, `*` and `**`, at most 64 entries of at most 256 characters | `kit/checks/lib/security-scan.mjs`, grammar in `kit/checks/lib/config-grammar.mjs` – always from the base branch tip |

And the sentence under the table:

`security.trustBoundaries` arrived in 3.1.0 and has a meaning when absent: no project entries, the
kit's list unchanged. So it is additive for every existing project. It can only add to the kit's
list. An invalid list – a refused pattern, a missing `why`, an unknown field, more than 64 entries
or an entry over 256 characters – routes the change to review and is never read as "no entries";
loosening that, letting the list remove a kit entry, or reading it from the working tree or the
merge-base, is breaking.

Ledger of deliberate breaks:

| Date | What changed | Who it affects | What they must do | Why it was worth it |
|---|---|---|---|---|
| 2026-09-27 | the kit's security scan dropped its four `packages/xezar/src/...` trust-boundary entries, and now reads `security.trustBoundaries` from `refs/remotes/origin/<baseBranch>`, recording `unknown` and requiring a reviewer when that ref does not resolve or the list is invalid | a project whose own layout matched `packages/xezar/src/{server,agent-config,mcp,workspace}/`; a checkout that runs the gates without the base branch fetched | add the removed paths to `security.trustBoundaries`; fetch the base branch before running the gates | the entries described one repository's layout and matched nothing elsewhere; a project list read from anywhere but the base tip could be removed by the branch it is meant to route |
