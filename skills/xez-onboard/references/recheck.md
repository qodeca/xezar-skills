# Re-check after an update

An engine/kit change offers **Re-check / Later**. Offering is not permission to launch an agent, edit files or update a successful-check timestamp. Accepting Re-check authorizes inspection and preview only; applying needs an explicit choice against the concrete preview through the question mechanism in [questions.md](questions.md), unless the brief names the exact files and keys. Ordinary tasks continue without accepting the offer. The engine owns offer scheduling and disposable state; this skill reports its outcome to that caller and does not invent an API or background updater.

The integration state at `.local/xezar/onboarding-state.json` has four fields:

```json
{
  "engineVersion": "<observed engine identity>",
  "kitDigest": "<observed pinned content digest>",
  "lastOfferedAt": null,
  "lastCheckedAt": null
}
```

Identities are non-empty strings; timestamps are UTC ISO-8601 strings or null. They describe the current observed pair. On identity change the caller resets both timestamps for that pair; an offer records only `lastOfferedAt`. Only a completed successful re-check can set `lastCheckedAt`; failures, missing required evidence and partial application leave it unset. Report-only completion is explicitly marked in the task result, not disguised as applied changes. First use has no prior baseline. Absent/corrupt/read-only state must not block boot or ordinary tasks; missing state is not proof of successful setup.

The four-field record cannot reconstruct previous template bytes or distinguish every report outcome. Keep those in the existing task checkpoint/evidence and supply them as inputs; do not infer them from a version string or add hidden state fields. Engine versions and kit digests are separate identities. A downgrade/development identity is a change to review, not proof that a migration should run.

1. Compare current task identity, decisions, engine/kit pair and input digests to the completed checkpoint. Same version/digest and unchanged inputs after a completed check: return quietly without writes, questions, another offer or timestamp churn. A prior failure remains retryable, and an explicit manual re-check or changed local inputs still gets inspected.
2. Obtain the previous known template, current local bytes and new **pinned** defaults. Record exact revisions/digests. Missing baseline or unavailable new sources means unknown provenance: preserve local files and report the missing comparison, never substitute a moving default branch for the pinned candidate.
3. Classify each key/section/file:

   | Old / local / new | Proposal |
   |---|---|
   | All identical | No change. |
   | Local equals old; new changes it | Show the upstream change as a candidate, not an automatic write. |
   | Old and local lack it; new adds it | Add only if relevant and authorized. |
   | Local differs; new equals old | Preserve local customization. |
   | Local and new changed identically | Already current; no duplicate. |
   | Local and new differ from old and each other | Conflict: recommend retaining local; offer reviewed merge as the second option. |
   | Upstream removed it | Report removal; preserve local file/section. No automatic deletion. |
   | Missing baseline or incompatible schema/provider | Preserve and report unknown/conflicting input; require a scoped decision. |

4. For an existing software pipeline only, invoke the installed `xez-apply-upgrade-notes` by name with `--dry-run` and pinned sources. It owns the operation-section upgrade diff; do not duplicate it here or run its descriptors. Its pipeline/provider defaults apply only to projects already using that software workflow. Preserve legacy provider behavior. If the companion would fetch an unpinned log, write artifacts, or bypass the preview boundary, stop that portion and report why. No pipeline means skip the companion; do not bootstrap one to perform a re-check.
5. Preview selected changes using the write reference. Bind the preview to all local and source digests; changed bytes before apply invalidate it. Re-inspect, regenerate and resolve affected choices. Limit application to onboarding's allowed files; descriptor or extra artifact changes found by the companion are separately scoped follow-up work.
6. After interruption, compare actual files with the intended per-file patch journal. Record applied, pending, failed and externally changed files. Do not blindly replay writes or roll back someone else's edits. Verify completed patches and report partial success honestly. Advance successful-check status only when the promised scope and required checks complete; a report-only result must explicitly say that nothing was applied and list any follow-ups.
