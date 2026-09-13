# xez-setup-agent-pipeline

> 🧑‍💻 Interactive — acts once, may ask questions, hands control back

The one-time configurator for the whole agent PR pipeline, and the first skill to run in a fresh repository. It inspects the repo (default branch, validation scripts, label taxonomy), asks a few questions, then writes `.xezar/pipeline/config.json` — the file every other skill reads — installs the tracker and browser provider descriptors, and generates the missing project docs (SDLC.md, CODE_REVIEW.md, BACKWARD_COMPATIBILITY.md, and an AGENTS.md starter), each derived from the current repository. It also verifies cross-skill coverage and prints the install command for anything missing. Re-run it when the toolchain or label taxonomy changes.

## Parameters

| Parameter | Required | Description |
|---|---|---|
| `--defaults` | Optional | Skip all questions and write the auto-detected config without confirmation. |

## Works with

Produces the shared `.xezar/pipeline/config.json` (base branch, validation gate, label taxonomy, paths, QA gate) plus the tracker descriptor at `.xezar/pipeline/trackers/<tracker>.md` and browser descriptor at `.xezar/pipeline/browsers/<provider>.md` that every other skill in the collection reads. Tracker choices include GitHub end-to-end, Linear issues through `schpet/linear-cli`, and Jira Cloud work items through Atlassian CLI; the two split providers install GitHub beside them for PRs, reviews, CI, and PR labels. Other skills' setup steps auto-run this one when the config is missing; its report points users at entry points such as [xez-auto-create-pr](xez-auto-create-pr.md), [xez-auto-review-pr](xez-auto-review-pr.md), and [xez-merge-buddy](xez-merge-buddy.md).

---
*Source: [`skills/xez-setup-agent-pipeline/SKILL.md`](../../skills/xez-setup-agent-pipeline/SKILL.md)*
