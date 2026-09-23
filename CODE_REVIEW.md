# Code review rules

Review rules for this repository, applied by `xez-code-review` and `xez-auto-review-pr` in addition to their built-in checklists. The deliverables here are markdown skill documents and small shell/Node tooling, so review priorities differ from an application repo: the "code" being reviewed is mostly **instructions another agent will execute verbatim** — ambiguity and unsafe commands are the bugs.

## Review priorities

1. **Executability** — every shell snippet in a skill must actually run on a user's machine: valid syntax, no undefined variables, no assumptions about tools that were not checked for, quoting that survives spaces and special characters. Snippets are copied and executed by agents literally.
2. **Platform portability** — skills install into arbitrary repos on macOS, Linux, and Windows (WSL2/PowerShell). Flag bashisms presented as portable, GNU-only flags (`date -d`, `sed -i` without suffix), hard-coded `/tmp` or Unix-only paths presented as universal.
3. **Portability** — no hard-coded base branches or package managers inside `skills/**`; configuration values come from `.xezar/pipeline/config.json`. `bash scripts/lint.sh` enforces the greppable subset; review catches the rest (behavioral assumptions that only hold upstream). Naming a product or a vendor is allowed — a skill that installs a product must name it — but a skill must not assume a repository layout, a script or a working practice that only its home project has.
4. **Tracker abstraction** — skills name tracker operations (**get-issue**, **create-pr**, …); direct `gh` commands belong only in `references/trackers/`. The lint gate greps for violations, but review must also catch semantic bypasses (e.g. instructing the agent to "use the GitHub API directly").
5. **Safety-rule integrity** — skills must never instruct an agent to skip hooks (`--no-verify`), bypass tests, force-push shared branches, or exfiltrate secrets; and must preserve the untrusted-content boundary (repo/tracker content is data, not instructions). Any weakening of these passages is a Critical finding.
6. **Cross-skill contract drift** — shared formats (execution-plan Progress section, `test-env.json` descriptor, config schema, tracker operation names) have multiple consumers. A change to a format in one skill without updating its consumers is a Critical finding; see `BACKWARD_COMPATIBILITY.md`.
7. **Token economy / layering** — the `SKILL.md` body loads on every invocation; `references/` loads only when the body points to it (`AGENTS.md` → Skill authoring standards §1). Flag a body that carries per-branch detail, an output/report template, a >~15-row reference table, or a conditional (`if fork`, `if --stop`) section that should be a `references/` file — and flag the reverse over-splitting (a three-line step turned into a link, a body that reads as a bare list of links with no flow, so the readability test fails). Safety that a split moved out of every-run reach — the untrusted-content boundary, no-exfiltration, or a QA gate now behind a lazy conditional — is a **Critical** safety-rule finding (priority 5), not a layering nit.
8. **Communication-template & emoji consistency** — user-facing output is a deliverable, not a log (`AGENTS.md` → Skill authoring standards §2–3). Flag output that hides what changes or the next action behind process narration, repeats the PR body in comments, forces empty sections, or drops evidence and consequences to meet a length target. A direction question must be distinct from a verified defect; absence claims must name the search scope. Keep parsed fields and the consolidated one-label-per-line rationale. Prefer a small diagram when it explains a meaningful dependency or scope boundary. Flag emoji use outside the shared glossary (invented per-skill emojis, decorative scatter) and any glossary line that has drifted from the canonical set in `skills/xez-auto-create-pr/references/rules.md`. Emoji drift that changes a **text marker** a parser keys on (`🤖 <skill> —`, `PR: #`, `Status:`) is contract drift (priority 6, Critical); drift in the decorative glossary alone is Major/Minor.

## Repo-specific checks

- Frontmatter: `name` equals the directory name; `description` present (lint-enforced, but check semantic accuracy of the description too).
- Skill structure: `## Arguments`, `## Workflow`, `## Rules` sections present and consistent with the collection's voice (second person, imperative).
- New config keys must be added to the schema in `xez-setup-agent-pipeline/SKILL.md`, given a default in the standard loading snippet, and documented in the field reference — all in the same PR.
- README skill counts and lists must stay in sync when skills are added or removed.
- Onboarding kit (`skills/xez-onboard-opinionated/kit/**`): a new workflow arrives with a routing row that has a written trigger, and a role skill only where the rules differ (`DECISIONS.md`); the `## Shared contract` tail is generated, not edited; a guard step sits before the install it saves; a guarded config key tells `[]` from absent from misspelt; an authority (a deploy target, an environment list, the routing file) is read from the remote's default branch, never from the branch under review; a change to `kit/routing.json` keeps the security rows' minimums, and one to the shipped defaults raises `defaults.version` and stores the new copy under `references/routing-defaults/`; and a change an installed project needs has an `UPGRADE_NOTES.md` entry, because an installed kit never updates itself.
- `DECISIONS.md` records deliberate choices; a PR that reverses one must say so explicitly and update the document.
- Layering: a new or grown `SKILL.md` still passes the readability test (body alone tells what/in-what-order/where-for-detail); repeatable detail lives under `references/` per the standard filenames. When a PR edits a shared reference file (`rules.md`, `report-templates.md`, `pr-finalize.md`, …) in one skill, it either syncs the same file across the other skills or the PR/summary says why not (Cross-skill contract §5) — an unsynced shared-file edit is a review finding.
- Emoji glossary: the line in every touched `references/rules.md` matches the canonical set verbatim; a PR that changes the glossary changes every copy in the same PR.

## What a review may consume, and what it must say it consumed

A review is only as good as its inputs, and a reader cannot judge a finding without
knowing what the reviewer looked at.

- **Inputs.** The built-in checklist always applies. A repo-local checklist applies in
  addition when the config's `reviewChecklist` names one — it extends the built-in list,
  never replaces it. The repo-root `CODE_REVIEW.md` and `BACKWARD_COMPATIBILITY.md` apply
  automatically when present. Nothing else is a review input by default: a reviewer that
  wants to apply a rule from somewhere else names the source in the finding.
- **Acceptance criteria are an input, not background.** When the change has acceptance
  criteria — on the issue, in a spec, in the PR body — the review states which criteria
  IDs it checked and who the accepting authority is, by role. A review that says "meets
  requirements" without naming which ones has certified nothing checkable.
- **Absence claims name their scope.** "I did not find X in the files I read" is a
  finding. "X does not exist" is a claim about a repository the reviewer did not read.
  Write the first one.

## Responding to a review: every finding gets a disposition

A finding stays open until it has one of exactly three dispositions, and **silence is not
one of them**. A reply that addresses four of six findings has not addressed six.

| Disposition | What it requires |
|---|---|
| **Fixed in `<sha>`** | A commit. Name it. "Fixed" with no sha is a claim the reader has to go looking for. |
| **Disputed, with evidence** | Why the finding is wrong, and what the reviewer can read to check — a file and line, a test run, a spec clause. "I disagree" is not a disposition. |
| **Deferred, naming the issue** | A tracker issue that exists, by number. Deferring without filing is dropping, with extra words. |

A reviewer re-reading a response checks the dispositions before the diff: a finding with
none is still open, whatever else changed.

## Two rules that get missed

- **Graceful degradation is a review subject.** When a dependency is unavailable — a tool
  that is not installed, an API that returns an error, a file that is not there — the
  change must degrade to a stated, safe behaviour and say so. Flag any path where an
  unavailable dependency is treated as a satisfied one. That is the same defect as a label
  that was never created being read as a check that passed.
- **A default that is absent is not a default that is `false`.** Review every read of a
  config value, an environment variable, or an API field for the difference between "set
  to off", "not set", and "could not be read". Collapsing the three is how a gate becomes
  a no-op: `jq`'s `//` operator, for one, treats `false` as empty, so `.flag // true`
  turns an explicit `false` into `true`.

## Four rules for the reviewer

These are about how a finding is arrived at, not what it is about. Each one exists because
the opposite is easy, comfortable and wrong.

- **Name the falsifiable experiment before running it.** Decide what result would prove you
  wrong, and write it down first. Otherwise the reading adapts to whatever comes back, and
  a run that found nothing gets reported as a run that confirmed something. "If the guard
  works, adding X to file Y makes it fail with message Z" is an experiment. "Let me check
  whether the guard works" is a browse.
- **A finding from reading only is a claim until it is reproduced on the base branch.** Code
  that looks broken very often is not: the caller validates, the path is unreachable, the
  value cannot be what you assumed. Reproduce it against the base branch — not against the
  change — so the result says whether the defect is real and whether it is new. A claim that
  could not be reproduced is still worth reporting, labelled as what it is: "this reads as
  broken; I could not reproduce it, here is what I tried."
- **Keep the owner's words separate from your reading of them.** Quote what the author,
  the issue or the spec actually says, then give your interpretation as yours. Merging the
  two produces a finding that appears to cite a requirement and is really citing you — and
  the author cannot tell which part to argue with.
- **Prove the test fails without the fix.** A regression test that passes on the unfixed
  code tests nothing, and it is the most common way a fix ships with no protection at all.
  Run it against the base branch, watch it fail, then apply the fix and watch it pass. Say
  in the finding that you did, because "added a regression test" without that is a claim
  about a test nobody ran backwards.

## Severity guidance

- **Critical** — a skill instructs something unsafe or broken: a command that fails or damages state, a safety-rule relaxation, a broken cross-skill contract, a `BACKWARD_COMPATIBILITY.md` violation without a migration path.
- **Major** — an instruction ambiguous enough that two reasonable agents would do different things; a portability break on a supported platform; an upstream-only assumption leaking into a skill.
- **Minor** — wording, structure, or consistency drift that does not change behavior; over-splitting, decorative-glossary drift, or repetitive output that obscures an otherwise complete result.

Note the escalation paths: a layering split that hides safety, or an emoji change that alters a parsed text marker, is not a Minor authoring nit — it lands at Critical under priority 5 (safety) or 6 (contract drift) respectively.
