# Writing the setup

Called from step 6, after the preview was approved as a whole. Order matters throughout.

## 0. Re-check before anything

Re-read every previewed path and compare against the digest recorded in the preview, including
expected absence. Any mismatch → stop, regenerate the preview, re-ask the affected decisions.
Approval is approval of a state, not of a plan.

**The account registry is re-read here too, and it is not covered by the digests above.**
`.xezar/agent-accounts.json` is git-ignored machine state, so it is never a previewed path — yet
screen 3's answer is a login read out of it, and since engine 0.18.0 a leader may call
`project_config import_global_accounts` and *add* accounts at any moment. So the approval can be of
a list that no longer exists, and nothing else in this section would notice.

Re-read the registry, and compare the account ids against those recorded in
`.local/xezar/runtime/onboarding-interview.json`. Two outcomes, and the difference between them is
the whole point:

- **Accounts appeared.** Not a stop. The owner's chosen login is still there, so write as planned
  and name the new ids in the report, under the assumptions section, so the owner learns they can
  route to them later. Halting a whole setup because the machine gained a login the owner never
  asked about would spend their attention on nothing.
- **A login the owner chose is gone, or its provider changed.** Hard stop, re-ask screen 3. This is
  the same defect `references/verify.md` §3 describes finding in a real test — a default naming a
  login the registry does not contain — and it surfaces as a task that fails at dispatch with
  nothing to point at. Cheap to catch here; expensive to debug later.

Comparing **ids and providers only**. Never a label, and never anything from inside a profile.

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
| `kit/routing.schema.json` | `.xezar/routing.schema.json` |
| `kit/routing.json` | `.xezar/routing.json`, then edited in place by interview screens 3 to 5 (`routing-interview.md`) |
| `kit/mcp.json` | `.mcp.json` — merged into an existing file, never over it |
| `kit/claude/settings.local.json` | `.claude/settings.local.json` (gitignored) |
| `kit/scripts/xezar-leader.sh` | `scripts/xezar-leader.sh`, executable |

**Rewritten during the copy**, routine and not an owner decision: any absolute path becomes the
new project root, and references to the source project's own module layout, issue numbers and
commit hashes are dropped. Product names stay — a project installing a product should see the
product's name.

**Three entries in `kit/xezar.gitignore` that the engine's own copy misses**, and the kit now
carries: the account registry and the two workspace state files. They are machine-level state,
set once per operator — the registry keys its selections by the checkout's absolute path — and
onboarding must never fabricate them either.

**First, before any copy: delete the engine's two example files.** `xezar init` writes
`.xezar/workflows/fix-and-verify.yaml` and `.xezar/skills/project-conventions.md`, and preflight
check 3 accepts them as a clean start. They are **not** overwritten by the copy: no workflow and no
skill in the kit carries either name. So remove both, by path, before the copy — and say in the
report that you did.

Left in place, each one is a small lie the project then lives with. `fix-and-verify.yaml` is a
workflow the leader can legitimately dispatch, generated before any gate command was confirmed, so
it validates against whatever init guessed rather than what the owner settled; and
`project-conventions.md` is an extra skill in a folder where every other skill is a named pipeline
role, which is the kind of thing a reader assumes somebody meant.

Delete only these two, only when their content is still the generated content check 3 recognised.
An **edited** `fix-and-verify.yaml` is somebody's configuration, which is a preflight stop, not
something this step may quietly remove.

**Copy these files with a plain copy, one file per command.** The launcher carries a flag whose
name begins `--dangerously`, and a harness that screens shell commands refuses a command that
*types* such a script — the first test lost the launcher, the permission file and the MCP
registration in one refused heredoc, and the launcher became a second pull request. A copy of a
file that ships in the kit is not that. If the copy of the launcher is still refused, do not work
around it: finish the rest, list it under "not written" with the path to the kit file, and let
the owner copy it.

**Every file comes from the kit and the answers — never from this repository's git history.** A
project that was onboarded before, and then had the setup removed, still has the old configuration
in its history, and restoring it looks like a shortcut that cannot go wrong. It can: the answers
in this run may differ from the answers in that one, the restored file is a version of the kit
nobody chose, and the run stops being reproducible in a repository with no such history — which
is every first-time project. A second test did exactly this with `.xezar/config.json` and the
routing document. If a previous setup exists in history, read it as **evidence about the project**
if you like, then generate the file anyway.

**Generated scripts are filled from the kit's own arrays, never patched in place.** The gate script
is generated by writing its command arrays (§2), not by editing the copied file with a script. A
patched copy diverges from the kit in ways no digest and no preview records, and the next upgrade
note cannot tell what it is looking at.

**The kit is an adapted copy, not a mirror.** It began as the engine project's own `.xezar/`
folder, and that project's module paths, release names and tracker links do not belong in
somebody else's repository. They are fixed in the kit, once, rather than by every run rewriting
them by hand. `.github/` templates carry five placeholders: `{{REPO_SLUG}}` and `{{PRODUCT}}`
from the tracker's **repo-info**; `{{UI_SCOPE}}` — what counts as a user-visible surface here, from
the design answer (for a CLI: command names, flags, help text, output shapes); `{{RISK_SURFACES}}`
— the two or three areas analysis found most dangerous to change; `{{DESIGNS_DIR}}` — the value
of `paths.designs`, so a contributor's template names the folder this project really uses. No
placeholder survives into a written file. **An issue template the project already has is never overwritten** —
offer only the pull request template's Design and Risk parts, as an addition.

## 2. Generate what is generated

Never copied, because each depends on an answer:

- **`.xezar/checks/repo-gates.sh` command arrays** — from the confirmed gate commands. This is
  the file that turns an answer into an enforced gate. Keep the shape: the install first, the
  security scan second, the confirmed commands next, `repository-checks.sh` last. The phases are
  derived from that shape, so nothing is numbered by hand. Then set `GATE_APPLICATION_LANES`
  beside the arrays — which application gates may run side by side, by position. A gate that
  needs another's output goes after it in the same lane; when unsure, leave it empty, which runs
  them one after another and is never wrong.
- **`.xezar/config.json`** — the base branch and the system prompt, written for this project.
- **`.xezar/pipeline/config.json`** and **`labels.json`** — this collection's current schema:
  base branch, tracker, validation commands, label taxonomy, QA gate, paths. Set
  `paths.qa` to `".local/xezar/qa"` rather than leaving the `.local/qa` default: every local
  artifact belongs in the one tree, and the tidiness check only looks inside it. This is a config
  value, set per project — the shipped default is unchanged, so nothing breaks for anyone else.

  Two more keys the kit's checks read, and neither may be left to a script's own default:

  - **`ci.requiredChecks`** — the required CI check names, spelled exactly as the check-runs API
    reports them, which is not always the job id. The integration gate compares against this list;
    a name that no run reports is a refusal, correctly, so a name inherited from another project's
    CI would block every merge. A project with no CI gets `[]`, and the gate then compares only
    what the branch rules enforce. Take the names from the confirmed gate answers, and read them
    back from a real head rather than from the workflow file.
  - **`paths.designSystem`** — the folder holding this project's design system. A project that
    already has one gets **its** path. A project with none gets `docs/design-system`: nothing is
    created there by this skill, the design workflows find no `README.md` in it, judge a mockup
    against the screens that already exist and say so, and the `design-system` workflow is what
    fills it. The design gate itself is a separate answer and is unaffected.

  **Every document this setup or its workflows commit lives under `docs/`.** A project's root
  belongs to its code. So the remaining `paths.*` keys name a folder each, the kit reads the key
  and never a literal path, and the defaults are:

  | key | default | what lands there |
  |---|---|---|
  | `paths.designs` | `docs/designs` | one folder per designed feature, and the index `README.md` |
  | `paths.architecture` | `docs/architecture` | decision records, architecture pages, structure diagrams |
  | `paths.spikes` | `docs/spikes` | the findings page of a spike; never its prototype code |
  | `paths.runbooks` | `docs/runbooks` | what to do when an alert fires, how a deploy is rolled back |
  | `paths.deprecations` | `docs/deprecations` | what goes, its replacement, the dates |
  | `paths.performance` | `docs/performance` | how a number was measured, and the baselines |
  | `paths.migrations` | `docs/migrations` | one page per schema, data or format move, each with a `reversibility:` line the rollback guard reads |

  A project that already keeps one of these somewhere else keeps it: analysis proposes the folder
  it found, on the facts screen, and the key records the owner's answer. A project onboarded
  before these keys existed keeps its root-level `designs/` the same way — point `paths.designs`
  at it, or move the folder and then the key. None of them is created empty; a workflow creates
  its folder with its first document. (The designs folder is the one this skill writes into
  itself: its index is a document, written below.) **Write every key in this table explicitly.** A kit role never
  guesses a folder: with its key unset it says which key is missing and stops, which is what a
  project onboarded before the key existed sees until its owner adds it (`UPGRADE_NOTES.md`).

  Three honest limits on "under `docs/`". The root process documents — `AGENTS.md`, `SDLC.md`,
  `CODE_REVIEW.md` and their siblings — stay at the root, because that is where agents and people
  look for them. **`SECURITY.md` and `CONTRIBUTING.md` stay at the root too**, and they are not
  process documents, so they need naming separately: GitHub's advisory flow and its contributor
  prompts look for them there and nowhere else, and the kit's own issue templates point at the
  root path. And feature specifications stay where `plan-and-spec` has always put them.

  **Four lists wake a workflow up.** Deploy, rollback, performance and localisation are installed
  everywhere and run only where the owner has said something first. Each reads a list, its first
  step after the preflight is `.xezar/checks/config-guard.sh <key>`, and that guard refuses
  **before the dependency install** with one of three different sentences: the list is `[]`, the
  key is absent, or the config is malformed. A typo must never read as "none configured", so the
  grammar is closed — an unknown key beside these, a value that is not a list, or an element of the
  wrong shape is a fault, not an empty answer (`kit/checks/lib/config-grammar.mjs`).

  | key | one element | the honest answer for a new project |
  |---|---|---|
  | `deploy.environments` | `<environment>=<workflow file>` — `staging=deploy.yml`; a file name, never a path | `[]` unless the project already has a deploy workflow the owner confirms (it needs a `workflow_dispatch` trigger **and a `sha` input** — see below). Never a name copied from another project: it would dispatch something here |
  | `deploy.rollback` | the same shape, naming the workflow that rolls back | `[]` unless such a workflow exists. An empty list means rollback refuses and says so; it does not mean "use the deploy workflow" |
  | `performance.budgets` | `<metric>=p<percentile><<limit>@n=<runs>` — `cold-start-ms=p95<400@n=20`; at least five runs | `[]`, always. A budget is a promise the owner makes about their product; this skill never proposes a number |
  | `localisation.locales` | a locale tag — `pl`, `pt-BR` | the locale folders analysis found, or `[]` |

  Write all four keys explicitly, `[]` included: `[]` is the owner's recorded "this project has
  none", and an absent key is "nobody has answered". Propose `deploy.*` only from workflow **file
  names** read in `.github/workflows/` — `deploy*.yml`, `release-to-*.yml`, `rollback*.yml` — and
  show each as a reading the owner confirms. The proposal never rests on what a file's contents
  *say* (a comment, a job name, a description). Two mechanical facts are read and shown beside the
  name, because the deploy guard will refuse without them and the owner should hear it now: does
  the file declare `workflow_dispatch`, and does that trigger declare an input named `sha`.

  **`deploy.*` is a trust boundary.** The deploy workflow reads both keys from the **remote's
  default branch** (`origin/HEAD`), never from the branch under review and never from the branch
  the checkout's own `.xezar/config.json` names — that file is in the worktree, so a branch could
  repoint it; the guard refuses when the two disagree. It requires each named file to exist there
  with a `workflow_dispatch` trigger and a `sha` input: `gh workflow run --ref` takes a branch or a
  tag and never a commit, so the reviewed workflow always runs from the base branch and the commit
  to deploy travels as that input. A project whose deploy workflow has no `sha` input adds one
  (`inputs: sha:` and `actions/checkout` with `ref: ${{ inputs.sha }}`) before listing it. The kit's
  security scan names `.xezar/pipeline/config.json`, `.xezar/config.json`, `.github/workflows/`,
  `.xezar/workflows/`, `.xezar/checks/` (with its `documented-output.allowlist.json`),
  `.xezar/routing.json`, `.xezar/routing.schema.json`, `.xezar/loops.json`, `.xezar/docs/`,
  `.xezar/skills/`, `.claude/settings.json`, `.claude/settings.local.json` and `.env.example` as
  trust boundaries, so a change
  to any of them sets `reviewerRequired` by machine, not by memory. Say so in the generated
  `CODE_REVIEW.md`, beside the hook and its loader: a change to `deploy.*`, to the base branch, to a
  workflow file, to a check script or to the routing file is routed to the security-review row.
- **`.xezar/pipeline/trackers/github.md`** — copied from this skill's own
  `references/trackers/github.md`, which a gate keeps byte-identical to the collection's
  canonical descriptor, so a new project starts on the current contract.
- **`.xezar/pipeline/toolchains/<name>.md`** — copied from this skill's own
  `kit/pipeline/toolchains/`, choosing the one that matches the stack the analysis found. Copy
  from the kit and **never from another skill's `references/`**: a skill that reaches into its
  neighbour's files works only where that neighbour happens to be installed, and the first run
  that tried it produced a project whose descriptor came from whatever version was on the machine.
  No descriptor for this stack → write none and say so, rather than installing one that describes
  a different package manager.
- **`.xezar/pipeline/browsers/<name>.md`** and **`.xezar/pipeline/security/<name>.md`** — copied
  from `kit/pipeline/browsers/` and `kit/pipeline/security/` under the same rule. The design
  review and the browser-test role both read the browser descriptor, and a project without one
  has a review that cannot look at a screen. Install **one** browser descriptor — the one whose
  tool this machine already has, asked on the facts screen when both are there — and the security
  descriptor as shipped. **Copying the security descriptor never sets `security.provider`**: that
  key has no default, permanently, and choosing a scanner is the owner's act.
- **The digests of what was installed.** `references/descriptor-digests.json` holds the SHA-256 of
  every descriptor this release ships. Record the digest of each descriptor actually copied in
  `.xezar/onboarding.json` under `descriptors`, as `{ "<path>": "<sha256>" }`. A descriptor is
  literal shell whose exit status becomes a gate result, and an installed one never updates itself
  — so the record is how anybody later tells "this is the file that shipped" from "somebody edited
  it", and which release it came from.
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
  paid on every one of those events. Keep the whole file at or under **200 lines**, as you write it; the
  shipped template's fixed part is 145, which leaves 51 for the four sections together and about
  four lines spare. Those numbers are counted, not estimated — `scripts/test-kit-facts.mjs` adds
  the template's fixed lines to the four budgets below and fails above 200, because for one
  release the limit was arithmetically impossible and every run reported a cross it could do
  nothing about. **The limit is about what this skill writes, not a cap forever**: a rule the
  owner later adds with `xez-add-rule` grows the guide, and that is the product working. Budget
  them:

  | Placeholder | Must state | Lines |
  |---|---|---|
  | `{{REPOSITORY_SETUP}}` | the base branch; the gate command list; where source, tests and docs live; the one command that runs the gate | ≤ 12 |
  | `{{TASK_LIFECYCLE}}` | the stages a task passes through, in order, and which of them a label marks | ≤ 12 |
  | `{{ROUTING_ACCOUNTS_LIMITS}}` | that routing is `.xezar/routing.json`, read only through `route.mjs` (`.xezar/docs/routing.md`); **which login is the reserved leader login and that it runs no tasks**; where the budget table lives and how a login being out is recorded | ≤ 12 |
  | `{{RELEASE_RUNBOOK}}` | who authorises a release, the steps in order, and what proves each one | ≤ 12 |

  A section with nothing true to say gets one honest line — "this project has no release process
  yet" — not invented content. The guide is read after every compaction, so a padded section costs
  tokens forever.
- **`.xezar/routing.json`** — copied from `kit/routing.json`, then edited in place by the routing
  screens: rotations, unlimited logins, switched-off lanes, tags for lanes the defaults lack, and
  the owner's row-level edits. It is never generated from scratch and never rewritten as prose; the
  leader reads it only through `route.mjs`. `node .xezar/checks/route.mjs --check` must pass on it
  before the commit. No `.xezar/docs/model-routing.md` is written any more.
- **`SDLC.md`, `CODE_REVIEW.md`, `AGENTS.md`** — generated together from the confirmed gate list
  so they agree from day one. `CODE_REVIEW.md` names the hook and its loader script as a **trust
  boundary** in plain words, and `.xezar/routing.json` sends any diff touching them to the
  security-review row: the risk is not removed, it is made visible and routed.

  The kit's workflows and role skills cite `SDLC.md` sections **by name**, so the generated file
  carries each of these headings, with this project's position under it in a sentence or two:
  The QA gate · The design gate · Review loop · Self-review inside the author phase, and the
  repair counters · The QA and design self-verification exceptions · Security review ·
  Architecture review · Acceptance · Deploy authority. A heading the kit cites and the file lacks
  is a dead reference in every run that reaches it. Under each conditional one — the design gate,
  deploy, performance, localisation — say in one plain sentence whether it is awake in this
  project, that its parts are installed either way, and the one line that flips it
  (`references/analysis.md` §3 has the reason).

  **Two rules go in verbatim in substance**, one in each file. They are not about this project, so
  nothing in the analysis changes them; they are here because both describe a failure that passes
  every gate a new project has.

  In `AGENTS.md`, **changing a mechanism that already works**: name what the old mechanism was
  load-bearing **for**, not what it was for, and grep for everything that reaches a terminal state
  *because* of it. A replacement that ships off is not a replacement — diff the **default path**,
  not the feature. Enumerate the transitions out of every state you add or keep; "who fires this?"
  finds the missing ones in one pass. The failure it describes is the one nobody catches: the new
  mechanism is correct, the tests are green, the spec is thorough, and the default path quietly
  lost a guarantee nobody had written down.

  In `SDLC.md`, under the review loop, **naming the break**: a new or changed behaviour test names
  a concrete regression — the file, the line, and the change that would cause it — and the author
  records an actual failing run, quoting the assertion that failed. A test written after the
  diagnosis passes against the bug more often than anyone expects, and a green-either-way test is
  how the same regression ships twice. Guard tests that pass both ways are fine and worth keeping;
  the record just says which kind each one is.

  **Copy the technique, never a number.** The project this comes from pairs the second rule with a
  per-file coverage floor and says in the same breath that the technique generalises and the
  number does not. Do not write a coverage percentage into a generated file for a project whose
  test suite you have not seen.
- **`BACKWARD_COMPATIBILITY.md`** — the kit's checks, workflows and role skills point at it from
  twenty-odd places, so a project without one gets dead references in every review. Generate it
  from what analysis found: the public surfaces this project must not break (a CLI's commands and
  output, a library's exports, a config format), one honest line each. It is in the preview like
  every other generated file.
- **`SECURITY.md`** — six places in the kit point at it, so a project without one gets a dead
  reference on its most sensitive path. Two of the six are roles that read it as **input**, not
  reporters: `xezar-security-review` is told to read it "so you know what this project has
  promised" before it opens the diff, and `xezar-architecture` weighs a change against it. A file
  holding only reporter instructions makes the security review's first read a no-op. So four
  things, each one or two sentences:

  1. **Where to report privately, and which versions are covered.** The private address is already
     decided: `.github/ISSUE_TEMPLATE/config.yml` routes a reporter to this repository's own
     security advisories. Name that same route — never invent a second address, or the two
     documents disagree and the reporter picks one. **Which versions get a fix is the owner's to
     say, not yours**: it is a support commitment, and "Detected is never decided" applies to it
     like everything else. Propose "the latest release" as the default, which is a real answer,
     and let the interview confirm or change it.
  2. **What this project does not treat as a vulnerability.** From the interview. A report that
     names designed behaviour costs a reviewer a day; a project that never writes this down gets
     that report more than once.
  3. **What happens if nobody answers.** Blank issues are enabled in the kit's templates *because*
     this escalation fallback exists (`xezar-issue-create` says so), so the fallback has to be
     real: who to reach, and after how long. Write it as an escalation of last resort and say in
     the same line that it is **not a second reporting route** — part 1 forbids one, and a
     contact named here without that sentence reads as exactly that.
  4. **What this project has promised** — its trust boundaries and the surfaces it will not weaken.
     Parts 2 and 4 are built from **`references/analysis.md` §7**, which exists for them: the entry
     points input arrives through, the boundaries the project already names, and the behaviour it
     already documents as designed. Do not source them from the answers that generate
     `CODE_REVIEW.md` and `BACKWARD_COMPATIBILITY.md`; those cover review routing and protected
     config surfaces, and neither enumerates a public surface or a trust boundary. This is the half
     the security-review role actually consumes.

  Write what analysis found and nothing more. A promise this project has not made is worse than a
  missing line: the review role will spend its verdict defending a boundary nobody built. It is in
  the preview like every other generated file.

  **If the project already has one of these three files, it is never replaced.** `SECURITY.md`,
  `CONTRIBUTING.md` and `docs/README.md` each go into the preview's **needs your decision** group
  when a copy exists, with keep-theirs as the proposal (`references/preview.md`). Write only what
  the owner approved there: the whole file when there was none, the approved additions when there
  was one, and nothing at all when they kept theirs. These three are addressed to people outside
  the project, and overwriting a maintainer's own words is the one mistake here that cannot be
  taken back from the reader who already read them.
- **`docs/README.md`** — the index for the seven document folders: `paths.designs`,
  `paths.architecture`, `paths.spikes`, `paths.runbooks`, `paths.deprecations`,
  `paths.performance` and `paths.migrations`. Without it a project gets seven document folders and
  nothing saying which is which.

  **Those seven keys and no others.** The written config also carries `paths.qa`, which is
  gitignored working state and does not belong in an index of committed documents, and
  `paths.designSystem`, which has its own index and its own row in the table above. Generating a
  row per `paths.*` key would list a scratch folder to contributors.

  It has a correctness condition, so it is not free. **Generate the rows from the `paths.*` values
  you just wrote into `.xezar/pipeline/config.json`, never from the default table above.** A
  project that already keeps its designs somewhere else has a key pointing there, and an index
  built from the defaults would be wrong for exactly the projects those keys exist to serve.

  And say, in one line at the top, that **a folder appears when its first document does**. None of
  the seven is created empty — a workflow creates its folder with its first page — so on day one
  this index lists paths that are not there yet. A reader who does not know that reads the index
  as a description of a broken setup.

  Three columns: the path, what lands there, and who it is for. "What lands there" is written for
  each of the seven in the table above; the third column is the one that earns the file.
- **`CONTRIBUTING.md`** — one page from idea to merge, for a **person**. Unlike every other file
  in this list it closes no dead pointer: nothing in the kit references it, so nothing will notice
  if it goes stale. It is here for one reason — this setup installs 37 workflows and a label state
  machine, and a repository that has all that and no human path tells a first-time contributor
  nothing. Read the answers, not the defaults:

  1. **How many of the 37 workflows a contributor can start: none.** They are dispatched by the
     leader. Say it in the first paragraph, or the first person to open a pull request assumes the
     CI is broken because none of them ran.
  2. **Which checks actually gate their pull request** — `ci.requiredChecks`, spelled as the
     check-runs API reports them. **Not** the gate list in `repo-gates.sh`: that is the agent gate
     list and it does not run on a human's pull request. Naming the wrong one sends a contributor
     chasing a command that was never going to run.
  3. **The label taxonomy, split in two**: which labels a person may set, and which are applied by
     the pipeline. End it the way the kit's own rules do — you never apply the pipeline's labels
     yourself.
  4. **Where a new document goes** — under `docs/`, by `paths.*` key, and a one-line pointer to
     `docs/README.md`.
  5. **Conventional Commits, with the reason attached** — the pipeline squash-merges, so the pull
     request title becomes the commit on the base branch. Say it as the pipeline's merge method,
     which is what it is: this setup configures required checks, never the repository's merge
     settings, so asserting the repository squash-merges would be stating something nobody here
     made true. A rule with its reason survives; a rule without one gets argued about.
  6. **A security problem goes to `SECURITY.md`, never a public issue**, matching the issue
     templates rather than restating them.
  7. **A closing table: every stage of the process, and what a person does at that stage**, under
     a heading that says plainly they do not need the kit workflows.

  Keep it to a page. The failure mode here is a second `SDLC.md` written for the wrong reader.
- **`<paths.designs>/README.md`** — the designs index, written **always**: the design half installs
  whatever the design gate's answer (`references/analysis.md` §3), and the design skill takes every
  feature README's headings from this file, so a project without it has a design workflow with
  nothing to follow. Headings: Purpose · Screens · States · Open decisions · Developer handoff ·
  Design review. The `design-system` workflow owns the list from then on.
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
  global setup, and the wiring is reviewable like any other file. **The package is not pinned to
  a version, on purpose.** The bridge serves its own tool list and refuses an engine that speaks
  a different protocol version, so a bridge pinned older than the installed engine hides tools or
  refuses every call. Version discipline lives in the preflight minimum and in the version
  `health` reports.
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
  here so it can be refused. The launcher also exports `XEZAR_LEADER=1`, which is what makes the
  `SessionStart` hook load the leader guide: **every other Claude Code session in the checkout
  gets nothing**. Without that, the first test's owner opened a second session to continue the
  onboarding and it began leading the project instead.

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
- `.local/xezar/` with its named subfolders (`runtime/ tasks/ worktrees/ scratch/ cache/ qa/`).
  **Create the folders and nothing else — no README beside them.** What each one is for is printed
  by `kit/checks/local-tree.sh` itself, and that check reports any file at the top level as loose,
  a README included: the first audited run wrote one and failed its own gate on it. Beside them,
  `kit/checks/local-tree.sh` — which reports a missing subfolder or
  anything loose at the top level, and deletes nothing. It is a check rather than a line in a
  document because a rule about tidiness is exactly the kind that gets skimmed and ignored.
- **Where this collection's skills live.** They are installed per machine and **never
  committed**: the engine updates installed skills when it starts and writes them as real files
  under `.agents/skills/` with links under `.claude/skills/`; committed copies fight that and
  dirty the tree at every start. Write three lines to the root `.gitignore` —
  `/.agents/skills/xez-*`, `/.claude/skills/xez-*`, `/skills-lock.json` — **without a trailing
  slash**, because a slash pattern does not match a link. `.claude/skills/` itself stays
  tracked: a project's own skills belong in git. Add **all four** folders the setup brings — `.xezar`,
  `.claude`, `.agents` and `.local` — to every formatter and linter ignore file analysis found
  (`references/analysis.md` §6); naming only one of them leaves the project's own format check
  red on day one. Then **run the project's own formatter over the root files this step generated
  or edited** (`AGENTS.md`, `CLAUDE.md`, the ignore files, any config it touched) before the gate:
  they are the project's files now and answer to its style, and the first audited run failed its
  format check on exactly those. Put one "get the skills" section in the generated `AGENTS.md` with
  the install command and **two** `--agent` values (`claude-code` and `codex`): one value makes
  copies, two make the link layout. This skill **names** that command and never runs it; when
  the skills are not installed in the project, say so in the report.
- **Both halves of the manifest.** Every date and time in them comes from
  `date -u +%Y-%m-%dT%H:%M:%SZ`, run at that moment — never typed. Committed `.xezar/onboarding.json`: version, date, stack,
  detected facts, the *shape* of the answers, per-file digest and origin. Gitignored
  `.local/xezar/runtime/onboarding-identity.json`: account names, profile values, absolute paths. A
  teammate cloning the repository gets the first and not the second, and a future migration
  reads both when present and degrades honestly when the local half is absent.
- The drift check, which compares the installed setup against the current one and **reports**.
  It never auto-updates: a file installed into a consumer repository never updates itself.

## 6. Commit, open the pull request, and offer the merge

**Labels first, so the setup pull request can carry them.** Tracker operation
**ensure-label-taxonomy** from the `labels.json` just written, then **list-labels** to read back.
The owner approved this in the preview, where the taxonomy is listed by name — it is a change to
the repository, not to a file, and it is never made unasked. Existing labels keep their colour
and description. **Write down which labels this run created and which already existed**, in the
pending file below: a later session cannot tell them apart, and the report for a rejected setup
has to name the ones it would be undoing. `.xezar/pipeline/labels.json` is this skill's own `references/labels.json`,
which carries the three design labels the kit's policy needs; the tracker descriptor is this
skill's own `references/trackers/github.md`. Neither is read from another skill's folder.

Commit on a setup branch and open a pull request. The pull request carries the full label
set the pipeline itself demands — one pipeline label, a category, a QA label, one priority, one
risk — through the descriptor's guards. This skill does not merge its own
setup — a change this large to how a project works is reviewed by the person who will live with
it, and the offer below is how that person is asked.

**Write the pull request body for the person who has to review a hundred files.** Use
`references/report-templates.md` → "Setup pull request body". It sorts every file by **origin**,
because origin decides how much reading a file needs: copied unchanged from the kit (a count per
folder, and the one `diff -r` line that proves it), adapted during the copy (each named, with what
changed), **written for this project** (the short list to actually read), and the owner's own
files that were edited (each with its one-line reason). A flat list of 114 paths is a review
nobody does, and an unreviewed setup pull request is how the first audited run ended. Protection (step 7) is applied after the
merge, because protecting a branch the setup has not landed on yet only blocks the setup.

**Leave the way back in.** Steps 7 to 10 run after the merge, and often in a later session: the
MCP registration this step wrote is read by Claude Code only when a session starts, so a session
that began before it existed has no engine tools and cannot run the smoke test. Write
`.local/xezar/runtime/onboarding-pending.json` — the pull request number, the base branch, the
labels this run created and the ones that already existed, and the time from
`date -u +%Y-%m-%dT%H:%M:%SZ` — and end the step with the exact lines from
`references/report-templates.md` →
"Setup pull request open". It is also the only marker on a base branch where the setup has not merged, which is why
preflight check 4 looks for it even when `.xezar/onboarding.json` is absent. Without the file a
second run finds `.xezar/onboarding.json`, reads it
as a finished onboarding, and refuses; the first test of this skill ended exactly there.

**Then offer the merge — once, and only on green.** Write the pending file first, so a declined
offer resumes cleanly, then read the pull request's checks through tracker operations and act on
what they say:

- **Every required check green** → ask one question: merge now and finish here, or leave it for
  the owner to review? **"I will read it first" is a normal answer, not a failure**: end with the
  *owner defers* branch of the report, once, and do not ask again in this run. On yes, merge, `git switch <base> && git pull`, and continue into
  `references/verify.md` in this session. That is the whole point of asking: steps 7 to 10 cannot
  run before the merge, and an owner who has to come back for them usually comes back without the
  engine's tools loaded, which is a second session and a `--verify` run.
- **Any check red, or still running** → do **not** offer. Name the check, say whether it is failing
  or pending, and hand back. A question whose honest answer is "not yet" is noise.
- **No CI at all** → say the pull request has nothing to wait for, and offer the merge on that
  basis, naming it.

The offer is an offer. This skill never merges its own setup unasked — a change this large to how
a project works is reviewed by the person who will live with it — and it **never merges red**: if
the owner asks for a merge over a red or pending check, say which check and why, and merge only on
a second, explicit answer.

The same condition applies whenever the owner says "merge it" later, in this session or another.
