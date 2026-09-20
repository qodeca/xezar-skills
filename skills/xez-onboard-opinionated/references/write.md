# Writing the setup

Called from step 6, after the preview was approved as a whole. Order matters throughout.

## 0. Re-check before anything

Re-read every previewed path and compare against the digest recorded in the preview, including
expected absence. Any mismatch → stop, regenerate the preview, re-ask the affected decisions.
Approval is approval of a state, not of a plan.

## 1. Copy what is copied

From this skill's `kit/` into the project:

| from | to |
|---|---|
| `kit/workflows/*.yaml` | `.xezar/workflows/` |
| `kit/checks/**` | `.xezar/checks/` |
| `kit/skills/xezar-*.md` | `.xezar/skills/` |
| `kit/docs/*.md` | `.xezar/docs/` |
| `kit/claude/settings.json` | `.claude/settings.json` |
| `kit/xezar.gitignore` | `.xezar/.gitignore` |
| `kit/github/**` | `.github/` |
| `kit/loops.json` | `.xezar/loops.json` |

**Rewritten during the copy**, routine and not an owner decision: any absolute path becomes the
new project root, and references to the source project's own module layout, issue numbers and
commit hashes are dropped. Product names stay — a project installing a product should see the
product's name.

**Three files in `.xezar/.gitignore` that the source's own copy misses**, added here because a
project that copies it verbatim and commits without checking can commit an account registry:
the account registry and the two workspace state files. They are machine-level state, set once
per operator, and onboarding must never fabricate them either.

## 2. Generate what is generated

Never copied, because each depends on an answer:

- **`.xezar/checks/repo-gates.sh` command arrays** — from the confirmed gate commands. This is
  the file that turns an answer into an enforced gate.
- **`.xezar/config.json`** — the base branch and the system prompt, written for this project.
- **`.xezar/pipeline/config.json`** and **`labels.json`** — this collection's current schema:
  base branch, tracker, validation commands, label taxonomy, QA gate, paths.
- **`.xezar/pipeline/trackers/github.md`** — copied from **this collection's** shipped
  descriptor, not from another project's copy, so a new project starts on the current contract.
- **`.xezar/docs/leader-guide.md`** — built from `kit/leader-guide.template.md`. Everything
  outside a `{{...}}` placeholder ships **verbatim and is never reworded**: who the leader is and
  is not · session start, re-attach and compaction recovery · standing loops · owner-only
  decisions and how unattended mode narrows them · review discipline · what to log where and the
  honesty rule · direct pushes · the owner's three control skills · the one-page checklist. Those
  sections *are* the decisions, and a paraphrase loses the reason.

  Fill the four placeholders from the analysis and the interview: `{{REPOSITORY_SETUP}}`,
  `{{TASK_LIFECYCLE}}`, `{{ROUTING_ACCOUNTS_LIMITS}}`, `{{RELEASE_RUNBOOK}}`. Strip the HTML
  comment header. Never write an absolute path or an account name into the result — both are
  gitignored runtime facts. Leave the trailing "Rules added by the owner" heading in place; it is
  where `xez-add-rule` appends.
- **`.xezar/docs/model-routing.md`** — from the routing interview.
- **`SDLC.md`, `CODE_REVIEW.md`, `AGENTS.md`** — generated together from the confirmed gate list
  so they agree from day one. `CODE_REVIEW.md` names the hook and its loader script as a **trust
  boundary** in plain words, and the routing table sends any diff touching them to the
  security-review row: the risk is not removed, it is made visible and routed.
- **`CLAUDE.md`** at the root, **`.xezar/CLAUDE.md`**, and the gitignored **`.claude/CLAUDE.md`**
  with this project's path and campaign name. An `@`-import of a missing file is a real failure,
  so seed every file it imports in the same step.

## 3. The leader's context loader

`kit/checks/leader-context.sh` is copied **verbatim** with the rest of `kit/checks/**`. Three of
this setup's decisions changed what it must do, and all three are already in the shipped file —
they are **not** hand-edits to remember during the copy:

- it reads campaigns from `.xezar/campaigns/`, not from the gitignored location;
- it picks the live campaign by sorting **digit-prefixed** folder names and taking the last, so
  the reserved `future-campaign/` is never a candidate and touching an old campaign cannot
  promote it to "current";
- it injects `decisions.md` **whole** and keeps a 64 KB tail for the README, the newest timeline
  and `parked.md`. A binding decision must not be invisible; for the narrative files newest
  genuinely matters.

A correction that lives only as prose in this file is a correction that gets skipped on the run
where it matters. The shipped file is the correction.

Carry the adapted test beside it, so the loader's own contract is checked in the project.

## 4. Wiring, all inside the project

- **`.mcp.json`** at the root, committed: registers the server through its published package,
  not through a local source checkout. Clone on a second machine and the leader works with no
  global setup, and the wiring is reviewable like any other file.
- **`.claude/settings.local.json`**, gitignored: `permissions.allow` covering the leader's MCP
  tools, so unattended mode never stops on an interactive prompt. **Accepted cost, recorded in
  the report:** a tool the product adds later is allowed without anyone looking at it.
- **A committed launcher script** that starts the agent with the development-channels flag for
  this server. Without it the leader silently degrades to polling, which its own guide calls the
  fallback rather than the normal path.

## 5. Records and working state

- `.xezar/campaigns/future-campaign/` with all seven file kinds. **No dated campaign is
  created** — opening one is the owner's decision, and an empty campaign whose plan nobody has
  seen is a roadmap choice made by a script.
- `.xezar/loops.json` — the three loops as data, exact schedule and exact prompt. The leader
  compares schedule and prompt at every start and recreates anything missing or drifted; this
  skill cannot create them, because that lives in the session rather than in settings.
- `.local/xezar/` with its named subfolders (`runtime/ tasks/ worktrees/ scratch/ cache/ qa/`), each
  with a stated meaning, plus `kit/checks/local-tree.sh` — which reports a missing subfolder or
  anything loose at the top level, and deletes nothing. It is a check rather than a line in a
  document because a rule about tidiness is exactly the kind that gets skimmed and ignored.
- **Both halves of the manifest.** Committed `.xezar/onboarding.json`: version, date, stack,
  detected facts, the *shape* of the answers, per-file digest and origin. Gitignored
  `.local/xezar/runtime/onboarding-identity.json`: account names, profile values, absolute paths. A
  teammate cloning the repository gets the first and not the second, and a future migration
  reads both when present and degrades honestly when the local half is absent.
- The drift check, which compares the installed setup against the current one and **reports**.
  It never auto-updates: a file installed into a consumer repository never updates itself.

## 6. Commit, and let the owner merge

Commit on a setup branch, open a pull request, and stop. This skill does not merge its own
setup — a change this large to how a project works is reviewed by the person who will live with
it. Protection (step 7) is applied after the merge, because protecting a branch the setup has
not landed on yet only blocks the setup.
