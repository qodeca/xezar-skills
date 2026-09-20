# Config field notes

Long-form notes for the config fields whose full explanation does not belong in the
skill body. The body keeps a one-line bullet per field; this file holds the reasoning,
the failure it prevents, and the worked example.

## `closeKeywords`

Extra words that mark a pull request as closing an issue, for repositories whose PR
bodies are not written in English.

`xez-close-fixed-issues` matches the built-in English keywords — `fix`/`fixes`/`fixed`,
`close`/`closes`/`closed`, `resolve`/`resolves`/`resolved` — plus everything listed
here, case-insensitively and only immediately before a `#N` token. Configured words
**extend** the built-ins; they never replace them, so adding one cannot cost you a match
you already had.

The failure this prevents is silent. The tracker's own closing-reference parser is
English-only as well, so a Polish repository writing `Zamyka #88` gets no closing signal
from either source — the issue simply stays open and nobody is told why. Setting
`["zamyka", "naprawia", "rozwiązuje"]` fixes it. Leave the list empty on an English
repository.

Whatever the setting, a run that finds issue mentions with no recognized keyword
**reports them** rather than passing over them silently. A gap you can see is worth more
than a guess.

## `engine.stepReview`

How often the loop skills code-review landed work mid-run.

| Value | Behaviour |
|---|---|
| `final` (default) | Only the authoritative end-of-run review. |
| `checkpoint` | Review the diff at every checkpoint pass. |
| `per-step` | Review each Step's commit as it lands. |

Blocker and major findings are fixed immediately as `X.Y-review-fix` Steps; minor
findings defer to the final review, which runs in every mode. Raising the frequency buys
earlier detection at the cost of more review passes over the same code.

## `gates.failClosed` and `gates.requireVerdictHead`

Both default to `false`, and both are read from the **base branch's** config, never the
working tree — see `agentic-setup.md` in a gate skill for why.

`gates.failClosed` decides what a gate does when it could not be evaluated at all. With
`false` (the default, and what every existing installation gets on upgrade) a gate that
reports `unknown` is disclosed in the report and the run continues; the merge gate still
refuses, because refusing to merge on unknown evidence was already its behaviour. With
`true`, `unknown` blocks every stage that reads it, not just the merge. Turn it on when
the pipeline's checks are trusted enough that "we could not check" should stop work.

`gates.requireVerdictHead` decides whether a verdict must name the commit it certifies.
With `false`, a report with no `Head:` line is read as `unknown` and the run carries on —
which is what lets a pull request opened before the line existed still merge. With
`true`, a verdict with no `Head:` line is refused. Fresh setups get `true`; upgrades keep
`false` until someone changes it, because turning it on retroactively would refuse work
that was correct when it was done.

Both switches are off-by-default by design: an upgrade must be a no-op until somebody
opts in. Each carries an owner and a review date in `DECISIONS.md`, under the rule that
an off-by-default switch with no expiry quietly becomes permanent.
