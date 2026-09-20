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
  base branch, tracker, validation commands, label taxonomy, QA gate, paths. Set
  `paths.qa` to `".local/xezar/qa"` rather than leaving the `.local/qa` default: every local
  artifact belongs in the one tree, and the tidiness check only looks inside it. This is a config
  value, set per project — the shipped default is unchanged, so nothing breaks for anyone else.
- **`.xezar/pipeline/trackers/github.md`** — copied from **this collection's** shipped
  descriptor, not from another project's copy, so a new project starts on the current contract.
- **`.xezar/docs/leader-guide.md`** — built from `kit/leader-guide.template.md`. Everything
  outside a `{{...}}` placeholder ships **verbatim and is never reworded**: who the leader is and
  is not · session start, re-attach and compaction recovery · standing loops · owner-only
  decisions and how unattended mode narrows them · review discipline · what to log where and the
  honesty rule · direct pushes · the owner's three control skills · the one-page checklist. Those
  sections *are* the decisions, and a paraphrase loses the reason.

  Fill the four placeholders as specified below. Delete all three HTML comments — the header
  block, the "Everything below is GENERATED" marker and the `---` rule above it. **Keep every
  section heading exactly as written:** `xez-add-rule` matches them by name to decide where a new
  owner rule goes, so a reworded heading sends the rule nowhere. Never write an absolute path or
  an account name into the result — both are gitignored runtime facts.

  The guide is injected **in full** at every start, resume, clear and compaction, so its size is
  paid on every one of those events. Keep the whole file under **200 lines**; the shipped template
  is about 190, which leaves roughly 60 for the four sections together. Budget them:

  | Placeholder | Must state | Lines |
  |---|---|---|
  | `{{REPOSITORY_SETUP}}` | the base branch; the gate command list; where source, tests and docs live; the one command that runs the gate | ≤ 15 |
  | `{{TASK_LIFECYCLE}}` | the stages a task passes through, in order, and which of them a label marks | ≤ 15 |
  | `{{ROUTING_ACCOUNTS_LIMITS}}` | the path to `.xezar/docs/model-routing.md`; **which login is the reserved leader login and that it runs no tasks**; how a lane being out is recorded | ≤ 20 |
  | `{{RELEASE_RUNBOOK}}` | who authorises a release, the steps in order, and what proves each one | ≤ 15 |

  A section with nothing true to say gets one honest line — "this project has no release process
  yet" — not invented content. The guide is read after every compaction, so a padded section costs
  tokens forever.
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

The loader's own contract is checked by the fixture built into `kit/checks/documented-output.mjs`,
which `repository-checks.sh` runs as part of the gate. There is no separate `leader-context.test.mjs`
to carry — do not invent one, and do not tell the owner to run one.

## 4. Wiring, all inside the project

- **`.mcp.json`** at the root, committed: registers the server through its published package,
  not through a local source checkout. Clone on a second machine and the leader works with no
  global setup, and the wiring is reviewable like any other file.
- **`.claude/settings.local.json`**, gitignored: `permissions.allow` covering the leader's MCP
  tools, so unattended mode never stops on an interactive prompt. **Accepted cost, recorded in
  the report:** a tool the product adds later is allowed without anyone looking at it.
- **A committed launcher script** that starts the agent with the
  `--dangerously-load-development-channels` flag for this server. **Say the flag's full name in
  the report, including the word `dangerously`.** A vendor puts that word in a flag name to force
  a decision; paraphrasing it away in the install instruction takes the decision from the person
  installing. What it does: it lets the server push events straight into the session. Without it
  the leader silently degrades to polling, which its own guide calls the fallback rather than the
  normal path. Committing a script that carries the flag is the accepted cost, and it is named
  here so it can be refused.

## 5. Records and working state

- `.xezar/campaigns/future-campaign/` with all seven file kinds. **No dated campaign is
  created** — opening one is the owner's decision, and an empty campaign whose plan nobody has
  seen is a roadmap choice made by a script.
- `.xezar/loops.json` — the three loops as data, exact schedule and exact prompt. The leader
  compares schedule and prompt at every start and recreates anything missing or drifted; this
  skill cannot create them, because that lives in the session rather than in settings.
- **The project's root `.gitignore` gains `/.local/`.** Write this, and verify it, before anything
  else in this section. Everything below depends on it: the preflight a task runs refuses to start
  unless `.local/xezar/` and its subfolders are genuinely ignored, and the agent's own autosave
  will otherwise commit scratch, runtime state and the gitignored identity half of the manifest
  into the first branch it touches. `kit/xezar.gitignore` lands at `.xezar/.gitignore` and its
  paths are rooted there, so it **cannot** cover a repo-root path — this is a separate write.
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
