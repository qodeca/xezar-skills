# Label taxonomy template

An **example** taxonomy, not a required one. Software setups that adopt the pipeline label
flow copy it to `.xezar/pipeline/labels.json` and edit it; general-purpose setups do not
need labels at all, and this skill never imposes one (see `DECISIONS.md` -> "Generic
applicability").

What the file adds over the label names in `.xezar/pipeline/config.json` is a colour per
group and a one-line description per label, so **ensure-label-taxonomy** creates the same
labels meaning the same things in every repository that adopts it. Keep the two files in
step: a label named in the config with no entry here gets neither a colour nor a
description.

It is deliberately not fatal on missing. A label that does not exist in a repository still
degrades to a logged skip.

<!-- example:start -->

```json
{
  "$comment": [
    "The label taxonomy as data, so creating it is reproducible instead of remembered.",
    "config.json lists the label NAMES a pipeline uses; this file adds the colour and the",
    "one-line description each label needs at creation time. `ensure-label-taxonomy` reads",
    "it, and scripts/check-label-taxonomy.mjs keeps the two files in step.",
    "",
    "This is deliberately NOT a fatal-on-missing list. A label that does not exist in a",
    "consumer repository degrades to a logged skip (the descriptor's label guard), because",
    "a collection that refuses to run in a repository whose labels it did not create is a",
    "collection nobody installs. What must never happen is the reverse: an ABSENT label read",
    "as a satisfied gate. That is handled in the merge gate, not here."
  ],
  "colors": {
    "pipeline": "0e8a16",
    "category": "1d76db",
    "meta": "5319e7",
    "priority": "d93f0b",
    "risk": "b60205"
  },
  "labels": {
    "review": { "group": "pipeline", "description": "Waiting for a review verdict." },
    "changes-requested": { "group": "pipeline", "description": "A reviewer asked for changes; the author owns the next move." },
    "qa": { "group": "pipeline", "description": "In the QA stage." },
    "qa-failed": { "group": "pipeline", "description": "QA found a defect; the change goes back to the author." },
    "merge-queue": { "group": "pipeline", "description": "Approved and queued to merge." },
    "blocked": { "group": "pipeline", "description": "Cannot proceed until something outside this change is resolved." },
    "do-not-merge": { "group": "pipeline", "description": "Must not merge, whatever the checks say." },

    "bug": { "group": "category", "description": "Fixes behaviour that is wrong today." },
    "feature": { "group": "category", "description": "Adds behaviour that did not exist." },
    "refactor": { "group": "category", "description": "Changes structure without changing behaviour." },
    "security": { "group": "category", "description": "Affects a security property." },
    "dependencies": { "group": "category", "description": "Changes third-party dependencies." },
    "documentation": { "group": "category", "description": "Changes documents only." },

    "needs-qa": { "group": "meta", "description": "QA must sign this change off before it merges." },
    "skip-qa": { "group": "meta", "description": "QA is not required, with the reason stated on the change." },
    "qa-approved": { "group": "meta", "description": "QA signed off. Never applied by automation." },
    "qa-self-verified": { "group": "meta", "description": "The agent verified its own work under the documented self-QA exception." },
    "in-progress": { "group": "meta", "description": "An agent holds an active claim on this change." },
    "ci-monitoring": { "group": "meta", "description": "A finished run still owes a CI-result comment. Not a claim." },
    "needs-design": { "group": "meta", "description": "The flow and its states must be settled before the code is written." },
    "design-approved": { "group": "meta", "description": "The design was reviewed and accepted by a named authority." },

    "priority-low": { "group": "priority", "description": "Can wait behind everything else." },
    "priority-medium": { "group": "priority", "description": "Normal queue position." },
    "priority-high": { "group": "priority", "description": "Ahead of normal work." },
    "priority-extreme": { "group": "priority", "description": "Interrupt whatever is in flight." },

    "risk-low": { "group": "risk", "description": "Contained; a mistake is cheap to undo." },
    "risk-medium": { "group": "risk", "description": "Affects a shared surface; reversible with effort." },
    "risk-high": { "group": "risk", "description": "Hard to undo, or affects data, security or a public contract." }
  }
}
```

<!-- example:end -->
