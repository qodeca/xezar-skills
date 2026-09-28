# Upgrade report (step 5)

Report the upgrade's effect and remaining decision. A clean run usually needs
3–6 lines. This skill emits no `PR:` or `Issue:` chaining lines.

```markdown
🔁 `xez-apply-upgrade-notes`: {already current / applied, left uncommitted / dry-run preview / blocked}.
{Changed descriptor or config path}: {operations/defaults changed and behavior restored}.
Checked: {config parses, provider resolves, required operations present; disclose failed/incomplete checks}.
{Material local conflict, custom-provider gap, or unavailable upgrade log, when present.}
{Onboarded project only: each kit entry not applied, and the path that applies it – `upgrade/UPGRADE-PROMPT.md`, or the ordered hand path ending with `verify.mjs`.}
{Onboarded project with a version-2 manifest only: the tracker descriptor's digest refreshed in `.xezar/onboarding.json`, or the descriptor skipped with the digest mismatch named; each kit-shipped descriptor skipped, pointing to `upgrade/UPGRADE-PROMPT.md`.}
**Next:** {review/commit diff, resolve conflict, implement missing operation, or no action needed}.
```

For independent changes use a path/change/effect table. Show changes and actionable
exceptions, not sections saying each unchanged artifact is current. Name local
customizations when they explain an unresolved conflict. Custom-provider gaps
retain every required operation's contract in collapsed detail below a short
summary of what cannot work yet.

Mark dry-run changes as proposed and distinguish checks on current artifacts
from checks on the proposal. An already-current run needs no commit recommendation.
