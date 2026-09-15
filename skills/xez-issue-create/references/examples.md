# Three domain examples

These are fictional fixture briefs, not observations of a real project. Destinations, labels, dates, and source revisions must come from the consuming project in real use.

## Software bug — export drops the final record

**Brief:** “Draft a bug: exporting the supplied two-record sample produces one record. Expected both. Reproduced in the supplied build; no permission to publish.”

- Mode: `draft-only`; type: bug. Read the bug form and privacy policy; extract known reproduction before asking for any required environment gap.
- Search both states for “export final record” and “export missing row”; inspect likely bodies. A closed match covering the same build stops with `existing-match`; a demonstrably newer regression needs its distinct evidence recorded.
- Draft: outcome “Export every selected record”; impact “Incomplete export in the supplied sample”; scope export completeness, non-goal new formats; reproduction load the two-record fixture then export; expected two, actual one.
- Proposed AC: export contains both fixture records; an empty input produces an empty export without an error. These remain proposed.
- Evidence: use the actual inspected commit and `tests/export.test.ts:line` only if that file/line exists; otherwise record the reporter's sample reference and unknown revision. Related work lists inspected candidate links. Do not invent a code location.
- Receipt: `draft-only`, no attempted create, local artifact or inline draft. No implementation or remote mutation.

## Agency campaign task — deliver two approved banner variants

**Brief:** “File one task in our existing campaign tracker for two banner variants for the spring campaign, using the supplied sizes and copy, due on the date in the campaign brief. This brief authorizes filing; do not commission production.”

- Mode: `authorized-autonomous-create`; type: task. Resolve the campaign project from existing guidance/tools. No new tracker or login is introduced.
- Search active and archived tasks for the campaign and “banner variants.” A matching task returns its link without a comment.
- Draft: outcome two reviewable variants; impact campaign review readiness; scope supplied sizes/copy, non-goals media buying or launch. Reproduction is N/A for planned delivery.
- Proposed AC: both variants use every supplied size; copy matches the approved brief; review files are accessible to the stated audience by the supplied deadline. Do not invent a budget or deadline.
- Evidence: actual campaign brief title, page, and date; related assets by shareable reference. Unknown optional channel metrics remain non-blocking assumptions.
- Show exact destination/title/body and supported existing labels. Within the recorded filing bounds, create once without an extra approval question, then read back. Receipt says `created` only with a known identifier and states verification separately. No software environment questions.

## Research question — explain divergent survey responses

**Brief:** “Prepare a question about why the two supplied survey summaries disagree; keep it local. Do not recruit participants or publish the raw responses.”

- Mode: `draft-only`; type: question. No tracker is declared, so inspect the existing local issue store and its archive.
- Draft: outcome identify plausible reasons for the discrepancy; impact uncertainty in the report; scope the supplied summaries, non-goals new data collection or causal claims. Reproduction is N/A; the triggering observation is the disagreement.
- Proposed AC: compare population, wording, and collection period using available evidence; list supported explanations and unresolved limitations without treating correlation as causation.
- Evidence: the actual summary titles/pages/dates; exclude identifying responses. Assumptions explicitly mark any missing sampling information.
- Save under the project's convention, otherwise ignored `.local/issues/` using exclusive creation and a safe task-derived name. On collision, reuse the owned identical receipt or report it without overwriting. A read-only directory yields inline Markdown. Receipt remains `draft-only`; no remote filing is claimed.
