# Questions and continuation

Resolve facts from the request and inspected policy first. Ask one concrete thing per question. Present exactly two options per question, first with `(Recommended)`, plus free text. Pair a single evidence-backed candidate with its concrete alternative (for example, a supported leader client / Independent instead). Do not force four domains into two misleading categories: for an unknown domain, ask “What kind of work is this project for: software, campaign/marketing, research, or another domain?” with two plausible suggestions from evidence; any named domain is accepted as free text. If there is no evidence, suggest software and campaign/marketing, explain the recommendation is provisional, and explicitly invite research or another domain in the question.

| Missing decision | Suggested choices and consequence |
|---|---|
| Domain | Evidence-backed domain / next plausible domain; free text can specify research, campaign/marketing, software or another domain. Never infer software solely because Git exists. |
| Intended outputs | An evidence-backed deliverable / another plausible deliverable; ask for format and constraints in free text when neither fits. |
| Operation | Independent (recommended without a coordination preference) / Leader. Independent creates no MCP file. |
| Leader client, if ambiguous | Two detected supported clients, or one supported client / Independent instead; another can be named in free text. Preserve a client already chosen. |
| Base branch, only with Git and ambiguous intent | Evidenced integration branch / another existing candidate. Never guess from a conventional name; do not write pipeline `auto` as an engine branch. |
| Skills source, if unresolved | Keep existing/default source (recommended) / Customize source. A custom answer can give repository and ref or select no team source. Follow up on missing custom details before writing. |
| Software pipeline, only when applicable | Minimal setup (recommended) / Opt in to delivery configuration. Existing pipeline policy remains in force. |
| QA or design, only where applicable | Keep current gate (recommended) / Clarify its application. For an optional, evidenced gate without policy, offer include / defer; existing mandates cannot be waived here. |

Under an engine task supporting `XEZ:ASK`, batch 1–4 questions per marker; ask the next batch after the answers arrive. Use the engine's exact schema, on ONE line at the end of the final interactive step. Otherwise use the client's own question tool or a plain question with the same two options and recommendation; no dependent writes until answered:

```text
XEZ:ASK {"questions":[{"header":"Operation","question":"Who should coordinate this project's tasks?","multiSelect":false,"options":[{"label":"Independent (Recommended)","description":"You create and coordinate tasks; no MCP setup is needed."},{"label":"Leader","description":"Prepare project files for your chosen coordinating agent; you complete client trust, login and attachment."}]}]}
```

Headers are 1–12 characters, questions end in `?` and are at most 400 characters, option labels at most 60 and descriptions at most 280. Do not emit a completion marker with a question. Do not invent extra JSON fields or an “Other” option. If the host cannot wait for an answer, stop with the unresolved decisions and dependent files listed; do not enter an apply stage.

On resume, restore role, project/task identity, answers, approved preview and source digests, applied/pending files and remaining checks from the engine task checkpoint when available, otherwise from the client conversation. Reconcile newer steering and current bytes first. Ask again only if an answer became invalid or a new choice actually appeared. No elapsed-time default and no success timestamp for an unanswered decision.
