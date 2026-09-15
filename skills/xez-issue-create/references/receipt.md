# Questions and operation receipt

Use the project's existing evidence convention; no new service or configuration is required. Start one stable operation record, retain the exact approved artifact, and update the same record on resume. If durable writing is unavailable, return a draft and inline receipt; do not begin remote creation.

## Question set

Ask only unresolved required items: requested outcome, destination/template choice, required facts (including bug reproduction/expected/actual when required), conflicting scope, or what makes a candidate regression distinct. Optional unknowns do not prompt. The final interactive Create/Revise checkpoint is separate from fact gathering and is omitted when exact approval or bounded autonomous authority already exists.

Where supported, emit one `XEZ:ASK` line with a JSON object containing `questions`. Each question uses `header` (1–12 characters), `question` (ending in ?), `multiSelect: false`, and exactly two `options`, each with `label` and `description`. The host supplies free text; do not add an Other choice. Use the native question channel otherwise. Example after presenting the full artifact:

```text
XEZ:ASK {"questions":[{"header":"File issue","question":"Create the exact issue shown above?","multiSelect":false,"options":[{"label":"Create","description":"Publish this title, body, and labels to the shown destination."},{"label":"Revise","description":"Keep the draft and describe the changes; free text can also cancel."}]}]}
```

A pending question is not approval, even if a workflow advances or an automatic continuation arrives. Record pending decisions in the consuming project's blocked evidence convention and stop dependent work.

## Receipt fields

This is a task artifact, not an engine API. Unknown fields remain null/unknown, never invented.

```json
{
  "operationId": "stable-task-derived-id",
  "authority": {"mode": "draft-only", "source": "trusted assignment reference", "bounds": "one described issue", "answer": null},
  "destination": {"tracker": "github", "project": "owner/repo"},
  "type": "bug",
  "draft": {"title": "literal title", "bodyPath": "relative artifact path", "labels": [], "digestAlgorithm": "sha256-json-array-v1", "digest": null},
  "approval": {"source": null, "digest": null},
  "searches": [],
  "candidates": [],
  "attempt": {"startedAt": null, "attempted": false, "created": "unknown", "verified": false},
  "result": {"status": "draft-only", "id": null, "url": null, "actualLabels": [], "reason": "No publication grant", "nextAction": "Review the draft"}
}
```

Each search records query/tool, destination, states, time, limit/pages, count, truncation, and success/error. Candidate records include ID/link/state/overlap and disposition. Keep the approved body bytes with the receipt; paths alone are not recoverable evidence after cleanup. `created` is true, false (only on affirmative evidence), or unknown. `verified` is true only after matching readback; report partial creation without disguising it as verified.

Results: `created` (known issue, verification explicit), `existing-match` (candidate links, zero creates), `draft-only` (artifact plus reason, including cancelled/blocked), or `unknown-outcome` (attempt unresolved, no retry). Record missing labels and unresolved facts. For a verified GitHub subject, the collection-compatible line is `Issue: #<number> (link: <full URL>)`; a host supporting `XEZ:ISSUE=<number>` may additionally consume that subject marker. Never emit candidate IDs as the task's subject.
