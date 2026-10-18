# Report templates

Two shapes: the **final report** to the user (step 8) and the **summary comment** on each
group's pull request (step 7, `references/pr-finalize.md`). Lead with what you propose and
the decision waiting on the user. Every section the run was asked to answer (`--scope`)
appears, even when its answer is "could not check" – a dropped section reads as a clean
result. Report parsed fields only; never paste scanner or registry output.

## Final report

```markdown
🔍 `xez-maintain-deps`: {n} pull request(s) proposed {/ dry-run – nothing opened, nothing changed}; {n} vulnerable, {n} behind, {n} could not be checked.

📋 Inventory: {format} at `{path}` – {count} components {/ ⚠️ unknown: {why}}.
📋 Behind: {n} major · {n} minor · {n} patch · {n} uncomparable (listed below for a human, never grouped).
🔍 Vulnerable: {n} advisories ({n} with a fixed version, {n} without – reported, not proposed) {/ not-applicable: no `security.provider` configured}.

| Group | PR | Packages | Others moved | Gate |
|---|---|---|---|---|
| {security / patch / minor / major} | #{number} {new / updated} | {n} | {total UPDATE_OTHERS_MOVED} | {✅ / ❌ split – `{package}` broke it} |

⚠️ Could not check: {provider or question} – {evidence-unavailable / unknown}: {reason}.
⚠️ Left for you: {uncomparable versions, advisories with no fix, a range that blocks an update, a member already in flight in #{number}}.
**Next:** {review and decide on each PR – this skill never merges / install `{tool}` and re-run / no action needed}.

PR: #{number} (link: {full PR URL})
PR: #{number} (link: {full PR URL})
```

- **One `PR:` line per group pull request** opened or updated in this run, in the table's
  order, exact undecorated shape (`references/pr-finalize.md`, Marker emission). This skill
  has no subject issue, so it emits no `Issue:` line. A dry run, or a run that proposes
  nothing, emits no `PR:` line.
- **Stopped at step 1** (`TOOLCHAIN_PROVIDERS` empty): one line – `not-applicable`, the
  config key to set – and **Next:**. Nothing else ran, so no other section appears.
- **Dry run:** the table's PR column says *would open*, and nothing is described as opened
  or changed.
- Drop the table when no group was proposed; keep the ⚠️ lines whenever they have content.

## Summary comment on a group PR

Posted once per PR via **comment-pr** with a body file and updated in place on a re-run.
The PR body holds the package table, the blast radius and the gate; do not repeat them.

```markdown
🤖 `xez-maintain-deps` — {group} update summary

🎯 {n} packages in the {group} group, gate {✅ passed / ✅ passed after removing `{package}`}; {n} transitive packages moved with them.
⚠️ {Anything that could not be checked, when present.}
**Next:** a maintainer decides whether to take these versions; this skill does not merge.
```
