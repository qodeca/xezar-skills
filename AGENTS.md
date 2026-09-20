# Agent instructions

This repository is the source of the **Xezar Skills** collection: forty-one agent skills (`skills/<name>/SKILL.md`) that run a full PR pipeline — plan, implement, review, QA gate, merge — installable into any repo via [skills.sh](https://skills.sh). The deliverables here are markdown skill documents plus a small amount of shell/Node tooling; there is no application code.

## Which document wins

Rules are only useful when a reader knows which one to follow when two of them differ. In
this repository, later entries override earlier ones:

1. **`SECURITY.md`** and the safety rules inside a skill. Nothing overrides these — not a
   repo-local override, not a process document, not a reviewer.
2. **`BACKWARD_COMPATIBILITY.md`** — the protected surfaces and the required migration
   paths. A change that breaks one of these is wrong even when every other document
   approves of it.
3. **This file (`AGENTS.md`)** — how work is done here, and the cross-skill contract.
4. **`CODE_REVIEW.md`** — what a review looks for. It applies the rules above; it does not
   create exceptions to them.
5. **`SDLC.md`** and `.xezar/pipeline/config.json` — the process and its settings.
6. **`DECISIONS.md`** — why things are the way they are. It records decisions rather than
   imposing them, so it loses to anything above it; a conflict between it and a rule means
   the decision was superseded and the entry needs updating.

A repo-local override (`.xezar/pipeline/overrides/<skill>.md`) extends a skill and loses to
every level above: it can never relax a safety or quality rule, expand tool or network
access, or redirect output. A directive that tries is skipped and reported.

**Keep each rule short enough to hold in your head.** A rule nobody can recall is a rule
nobody applies, and the failure mode of a long one is worse than the failure mode of a
missing one: people skim it, act anyway, and everyone believes it was followed. When a rule
needs a page of reasoning, the rule is the one sentence and the reasoning goes in
`DECISIONS.md` underneath it.

## Adding a new skill

Eight places, and the gates will tell you about most of them — but not before you have
written the skill, so here they are up front:

1. `skills/<name>/SKILL.md` — frontmatter `name` equal to the directory, a `description`
   under 500 characters, and the mandatory local-override preflight line.
2. `skills/<name>/references/` — its **own** copies of the standard step files it actually
   uses (`agentic-setup.md`, `rules.md`, and whichever of `pr-finalize.md`,
   `report-templates.md`, `claim-pr.md`, `worktree-setup.md`, `review-report.md`,
   `ci-followup.md` apply). Carry only what the skill performs.
3. The shared blocks — run `node scripts/sync-shared-blocks.mjs`, which writes them for you.
   A skill that legitimately carries none of a block needs an entry in
   `scripts/allowlists.json` with a reason, an owner and an expiry.
4. The coverage roster in `xez-setup-agent-pipeline/references/skill-coverage.md`.
5. `docs/skills/<name>.md`, and its row in `docs/skills/README.md`.
6. The skill table in `README.md`, and the "you run / you get" table when a user invokes it
   directly.
7. The skill count, in `README.md` and in the first line of this file.
8. `docs/coverage.md`, if the skill adds a behaviour worth a row.

Then decide the one thing the gates cannot: **does the name carry `auto`?** `xez-auto-*` is
a behavioural contract, not decoration — autonomous, non-interactive, safe on a schedule,
making the most reversible call itself instead of stopping to ask. Without `auto` the skill
is interactive: it acts once, may ask, and hands control back. Never add a mid-run question
to an `xez-auto-*` skill.

## Task routing

| When the task involves… | Read first | Key rules |
|---|---|---|
| Editing or adding a skill (`skills/<name>/SKILL.md`) | `DECISIONS.md`, `scripts/lint.sh`, the **Cross-skill contract** section below, the skill's own `references/` dir if present | Frontmatter `name` must equal the directory name and `description` must be present (≤500 chars — lint-enforced; aim for ≤350). Content must stay product-agnostic: no product or brand references (README, DECISIONS.md and LICENSE may name Qodeca/Xezar; `skills/**` may not), no hard-coded base branch or package manager (the lint gate greps for these). All tracker state management goes through named tracker operations, never direct `gh` commands (only `references/trackers/` may contain them). Config values (`baseBranch`, paths, labels, validation commands) always come from `.xezar/pipeline/config.json`, never hard-coded. New `xez-auto-*` skills MUST implement the Cross-skill contract. |
| Cross-skill contracts (tracker operations, config schema, Progress format) | `skills/xez-setup-agent-pipeline/SKILL.md`, `skills/xez-setup-agent-pipeline/references/trackers/TEMPLATE.md`, `BACKWARD_COMPATIBILITY.md` | Multiple skills parse each other's outputs (execution-plan Progress sections, `test-env.json`, tracker descriptors). Changing a shared format requires updating every consumer in the same PR. |
| Installer / tooling scripts (`scripts/*.sh`, `scripts/*.mjs`) | `package.json`, the script itself, `.github/workflows/` | Keep scripts POSIX-portable where they run in CI (ubuntu) and locally (macOS). `scripts/lint.sh` is the CI gate — changes to it change what every PR must pass. |
| CI workflows (`.github/workflows/*.yml`) | `scripts/lint.sh`, `scripts/audit-skills.sh` | `lint.yml` runs the frontmatter + product-agnosticism gate on every PR. `skills-audit.yml` is informational (skills.sh third-party audit surfacing). |
| Process / pipeline configuration | `.xezar/pipeline/config.json`, `SDLC.md`, `.xezar/pipeline/trackers/github.md` | Config and `SDLC.md` describe the same process — change them together. |
| README, DECISIONS.md, LICENSE | `DECISIONS.md` | These MAY name Qodeca/Xezar; `skills/**` may not (the agnosticism gate is scoped to `skills/**` only). Read `DECISIONS.md` before proposing structural changes — most "obvious" restructurings were already considered and decided. |

## Cross-skill contract (rules for every skill — binding for `xez-auto-*`)

These invariants make the auto skills composable; every new or edited skill must preserve them (they are also the review bar for skill PRs):

1. **Autonomous and chainable.** An `xez-auto-*` skill runs unattended end-to-end — when a decision is needed mid-run it makes the recommended, most-reversible call itself and documents it (in the plan/spec and as a PR/issue comment where sensible) instead of stopping to ask; the only hard stops are claim conflicts without `--force` and `⚠ NEEDS HUMAN CONFIRMATION` defaults. It documents a `## Chaining` section: which params it accepts (`{prNumber}`, `{issueId}`, `--spec`, …), what it consumes from the previous skill, and what it emits. A previous skill may already have created the PR — detect it (**search-prs**, the body's `Tracking plan:` line) and continue on that PR; **never open a duplicate**. PR-producing/-driving skills end their report with the chaining reference lines, one per line, exact shape: `PR: #<number> (link: <full PR URL>)` — plus `Issue: #<number> (link: <full issue URL>)` when the run has a subject issue and `Spec: <repo-relative path>` where a skill defines it. Consumers parse these exact line-anchored shapes (`^PR: #([0-9]+) \(link: (\S+)\)$` and friends) and, for output from older skill versions, still accept the legacy `PR_URL=<url>` / `PR_NUMBER=<n>` / `SPEC_PATH=<path>` lines — but skills only ever emit the new form.
2. **SDLC compliance, always.** Every skill that touches PRs/issues follows `SDLC.md` through the tracker descriptor's guards (`apply_label`, `set_pipeline_label`, `labels.enabled`). PR creation applies the full set — one pipeline label, category, QA meta (`needs-qa`/`skip-qa`, never both), exactly one priority, exactly one risk — per the canonical label rules (`xez-open-pr` step 6; each PR-producing skill carries them in its own `references/pr-finalize.md`). Pipeline PRs open **ready for review**; draft only for explicitly incomplete work (spec-only design PRs, interrupted hand-offs, `⚠ NEEDS HUMAN CONFIRMATION` guards). `qa-approved` is never applied by automation (self-QA sign-off in `xez-auto-qa-pr` is the one documented exception). **Reporting is decoupled from CI verification:** labels, reviews, comments, and the draft→ready promotion land the moment the work is done, never held back for a green run — a review submitted over pending checks discloses that in its body — and a skill that then watches CI swaps `in-progress` for the `ci-monitoring` meta label (not a claim; other skills may act on the PR) for at most `ci.maxWaitMinutes`. Merging is the exception that keeps its gate: a merge skill still requires genuinely green required checks.
3. **Standard communication.** Tracker comments use stable markers — `` 🤖 `<skill-name>` — <purpose> `` (the skill name is always a backtick-wrapped code span; this holds for every skill name in user-facing output — comments, PR bodies, reports) — and are idempotent: a re-run finds its marker and updates in place, never duplicates. The standard set: claim comment, consolidated label rationale (exactly one marker-idempotent comment covering the whole applied label set — one label per line with its emoji and a full-sentence reason, rewritten in place via **update-comment** on every later label change; never one comment per label and never a `·`-concatenated one-liner), assumptions (autonomous defaults), run summary (the skill's handoff template), evidence (screenshots via **attach-image-evidence**), release/handback. A skill posts exactly the subset relevant to its role, in that format. User-facing output leads with the behavior, consequence, and decision. A skill's report/comment shapes live in its own references; omit empty optional sections and repeated explanations while preserving evidence and parsed fields (Skill authoring standards §2). All user-facing output (PR bodies, comments, reports) uses the shared emoji glossary consistently: 🤖 agent comment marker · 🎯 goal · 📋 plan/tracking · 📝 spec/design · 🏷️ label rationale · 📸 UI evidence · 🔍 review findings · 🧪 tests/QA · 💥 breaking changes · ✅ pass/approved · ❌ fail/changes-requested · ⚠️ needs human/risk · ⛔ blocked · 🔁 resume/continuation · 🚀 merge/release. Emojis decorate; parsers key on the text markers (`🤖 <skill> —`, `PR: #`, `Status:`), never on emojis alone — and the canonical marker-parse pattern matches BOTH the backticked `` 🤖 `<skill>` — `` and the legacy bare `🤖 <skill> —` form, so re-run marker detection on older comments never breaks. Each skill carries this glossary and the other shared communication rules in its own `references/rules.md`.
4. **Dependencies = invocation, files = own copies.** Skills compose by invoking each other **by name**; there is no install-time dependency mechanism. Every cross-skill call either has an inline fallback so the skill works standalone (preferred — documented in the skill's own `references/pr-finalize.md` for PR opening) or stops cleanly naming the missing skill (`xez-setup-agent-pipeline`'s coverage check prints the install command for anything missing). A skill never points into another skill's `references/` directory — the one exception is `xez-apply-upgrade-notes`, whose job is reading the shipped descriptor templates in `xez-setup-agent-pipeline/references/trackers|browsers/`.
5. **Standard step files, duplicated per skill — and kept in sync by asking.** Repeatable steps live in each skill's own `references/` under standard names: `agentic-setup.md` (config load + repo-local override contract + untrusted-content boundary), `worktree-setup.md`, `claim-pr.md`, `pr-finalize.md` (open/reuse, labels, body + summary templates, markers), `review-report.md`, `report-templates.md` (the skill's user-facing report/comment templates — emoji-structured, full-sentence), `ci-followup.md` (report-before-CI ordering, the pending-CI disclosure, the `ci-monitoring` swap, and the bounded `ci.maxWaitMinutes` wait — carried only by skills that wait on CI), `rules.md` (shared rules incl. the emoji glossary, label commentary, and reporting style). Every skill has its **own copy** so it installs standalone; `xez-auto-create-pr` holds the canonical text; a skill only carries the files for steps it actually performs, and skill-specific behavior goes under a marked "specifics" section, not into the shared part. The deliberate cost is duplication, managed in two layers. **The invariant part is generated, not retyped:** the untrusted-content boundary in every `agentic-setup.md` sits between `<!-- shared:untrusted-content:start -->` markers and is written from `xez-auto-create-pr` by `scripts/sync-shared-blocks.mjs`. Edit the canonical copy, run the generator; CI re-runs it and fails on a drifted copy, and a clause floor rejects any attempt to make the check pass by narrowing or emptying the block. **Outside the markers the binding rule still holds:** whenever you edit one of these standard files (or the shared part of a step) in any skill, diff the same file in the other skills and ask the user whether to sync the change across them — list the skills that would change. SKILL.md itself keeps only the numbered main algorithm with direct instructions; repeatable detail stays behind `references/<step>.md` so unused steps cost no tokens.

## Skill authoring standards

Three standards every skill in this collection follows. They are the coding
standards for skill documents: a new skill that ignores them is not done, and a
reviewer rejects a PR that breaks them (`CODE_REVIEW.md` carries the matching
checks). Each has one canonical source — this section distills the rule and
points there; **never re-explain the detail here**, or the copy drifts.

1. **Token economy — granulate into `references/`.** A skill pays layer-2 tokens
   (the `SKILL.md` body) on *every* invocation and layer-3 tokens (a
   `references/<name>.md` file) only when the body points to it. So the body is a
   **router + map**, not the terrain: keep the numbered main algorithm and the
   premises that pick a branch; push per-branch detail, output/report templates,
   reference tables over ~15 rows, and conditional (`if fork`, `if --stop`)
   sections down into `references/`. Safety always loads on every run — the
   untrusted-content boundary, no-exfiltration, and QA gates live in the body or
   the step-0 `references/agentic-setup.md` the body loads first, never behind a
   lazy conditional. Don't over-split either: skills under ~150 lines usually stay
   whole, and a step describable in three lines stays three lines. The readability
   test is the gate — after the split, the body alone must still tell **what** the
   skill does, **in what order**, and **where** to find detail. Canonical source
   and the up/down decision procedure: `skills/xez-create-skill/references/philosophy.md`;
   the enforced completeness/readability gate: `skills/xez-create-skill/references/gates.md`.

2. **Decision-oriented communication.** Lead with what changes for whom, why it
   matters, and the decision or next action. The PR/issue body explains the change;
   reviews add evidence-backed findings; later comments report changes, blockers,
   or handoffs without repeating the body. Separate direction questions from
   verified defects. Omit empty sections, repeated label lists, and process logs;
   keep actionable findings, evidence limits, and exact machine fields. Use a small
   diagram when it makes scope or dependencies easier to understand. Repeatable
   output lives in each skill's own standard reference files so it installs
   standalone. Canonical writing rules and length guidance:
   `skills/xez-auto-create-pr/references/rules.md`; role-specific shapes:
   each skill's report templates. Sync shared edits under Cross-skill contract §5.

3. **Consistent emoji usage.** All user-facing output draws from **one shared
   glossary**, reproduced verbatim in every skill's `references/rules.md`:

   > 🎯 goal · 📋 plan · 📝 spec · 🏷️ labels · 📸 evidence · 🔍 review · 🧪 tests · 💥 breaking · ✅ pass · ❌ fail · ⚠️ needs-human · ⛔ blocked · 🔁 resume · 🚀 merge/release

   plus the 🤖 comment marker (`` 🤖 `<skill-name>` — <purpose> ``). Emojis
   **decorate**; parsers key on the text markers only (`🤖 <skill> —`, `PR: #`,
   `Status:`), never on an emoji alone — so the glossary can grow but a marker's
   text never changes. Use an emoji only for its glossary meaning; don't invent
   per-skill emojis or scatter decorative ones through prose. The glossary line is
   canonical and identical across all skills — change it in one place and you must
   sync every copy in the same PR (Cross-skill contract §3, §5). (Cross-skill
   contract §3 lists the same emojis with fuller descriptive glosses for readers;
   the short line above, exactly as it appears in `rules.md`, is the canonical
   form to reproduce.)

## Validation

Run before every PR (also the full CI gate):

```bash
bash scripts/lint.sh
```

## Conventions

- Skills are written in second person, addressed to the executing agent, with `## Arguments`, `## Workflow` (numbered steps), and `## Rules` sections. Match this structure when editing.
- Skill names keep the upstream `xez-` prefix deliberately (see `DECISIONS.md` → Naming).
- **The `xez-auto-*` prefix is a behavioral contract, not decoration:** an `xez-auto-*` skill is autonomous and non-interactive — it runs end-to-end without a user in the loop, makes the recommended most-reversible call itself (documented for override) instead of stopping to ask, and is safe for schedules/CI (full contract: Cross-skill contract §1). A skill **without** the `auto` prefix is interactive: it acts once, may ask the user questions, reports, and hands control back. Name new skills accordingly, and never add mid-run questions to an `xez-auto-*` skill.
- Shell snippets inside skills must be POSIX-ish bash and platform-portable; they run on whatever machine the installing user has.
- Cross-references between skills use the skill name (e.g. "the `xez-code-review` skill"), and the name must be one this collection actually ships — `scripts/lint.sh` fails on an `xez-` name left behind by a rename or a merge, since a stale name reads as an optional dependency and simply never fires at run time. Paths into another skill's `references/` directory are not allowed (Cross-skill contract §4–5); the sole exception is `xez-apply-upgrade-notes` reading `xez-setup-agent-pipeline`'s shipped descriptor templates.

## Process documents

- `SDLC.md` — the ticket flow the skills automate (stages, labels, QA gate, claim protocol).
- `CODE_REVIEW.md` — review rules applied by `xez-code-review` / `xez-auto-review-pr`.
- `BACKWARD_COMPATIBILITY.md` — the protected contract surfaces of this collection.
- `.xezar/pipeline/config.json` — machine-readable pipeline settings; `.xezar/pipeline/trackers/github.md` — tracker operation implementations.
