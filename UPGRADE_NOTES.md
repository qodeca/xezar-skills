# Upgrade notes

Upgrading the skills themselves is easy – run `npx skills update -p` (or `-g` for a global
install, or `git pull` in a symlinked local checkout) and the new skill instructions are live on
the next invocation. What does **not** auto-update is everything a skill previously **installed
into your repository**. Those files are yours, they may carry your local edits, and the skills
execute against them – not against the copies shipped in this repo:

| Installed artifact | Installed by | Updated how |
|--------------------|--------------|-------------|
| `.xezar/pipeline/trackers/<tracker>.md` (tracker descriptor – the file every tracker operation executes from) | `xez-setup-agent-pipeline` | Manual re-sync (see below) |
| `.xezar/pipeline/browsers/<provider>.md` (browser automation and autonomous provisioning operations) | `xez-setup-agent-pipeline` | Manual re-sync (see below) |
| `.xezar/pipeline/config.json` | `xez-setup-agent-pipeline` | Re-run `/xez-setup-agent-pipeline`; it preserves answers where it can |
| `SDLC.md`, `CODE_REVIEW.md`, `BACKWARD_COMPATIBILITY.md`, `AGENTS.md` starter | `xez-setup-agent-pipeline` | Regenerated only when missing – edit or regenerate deliberately |
| `.xezar/pipeline/overrides/<name>.md` repo-local overrides | you | Never touched by upgrades; review them against new skill behavior |

`/xez-apply-upgrade-notes` walks the entries below, newest first, and applies the ones whose
symptom matches your repository.

## 2026-09-22 – gate runs collide again after an engine upgrade

Applies to any repository onboarded by `xez-onboard-opinionated` before 3.0.0.

**Symptom – two gate runs load the machine at once**, where they used to take turns. `repo-gates.sh`
checked that the engine can lease a gate slot by matching a line of text the engine prints. Engine
0.19.0 declares that wording not a contract, and publishes a real check instead
(`xezar lease gates --probe`). The kit now uses the published check on 0.19.0 and later, and the old
one on 0.17 and 0.18.

**What to do.**

```bash
K=.claude/skills/xez-onboard-opinionated/kit
cp $K/checks/repo-gates.sh .xezar/checks/
```

If your project edited `repo-gates.sh` (the gate command list at the top is meant to be edited),
copy the lease block only, or re-apply your edits after copying.

**What you lose by skipping it.** Nothing today. The day the engine rewords that line, gate runs stop
taking turns – with no error, just a slower, busier machine.

## 2026-09-22 – my config has `paths.analysis` and an empty `.xezar/pipeline/analysis/`

Applies to any repository set up by `xez-setup-agent-pipeline` before 3.0.0.

**Symptom – a key and a folder that nothing uses.** No skill ever read or wrote `paths.analysis`.
3.0.0 stops writing it and stops resolving it. A config that still has it keeps working.

**What to do (optional).** Delete the `"analysis"` line from `paths` in
`.xezar/pipeline/config.json`, and delete `.xezar/pipeline/analysis/` if it holds only
`.gitkeep`.

**What you lose by skipping it.** Nothing. The key and the folder stay unused.

## 2026-09-22 – my gate fails with "fixture execution failure for leader-context"

Applies to any repository onboarded by `xez-onboard-opinionated` 1.3.0 or later, before 3.0.0.

**Symptom – `repository-checks.sh` fails when it runs outside the leader's session** (in CI, or in
your own terminal). The message is
`documented-output: .xezar/docs/leader-context-loading.md:45: fixture execution failure for
leader-context: script did not print exactly one JSON object`. Nothing is wrong with your project.
The leader loader speaks only when `XEZAR_LEADER=1`, and the check ran it without that flag, so the
loader correctly printed nothing and the check called that a failure.

**What to do.**

```bash
K=.claude/skills/xez-onboard-opinionated/kit
cp $K/checks/documented-output.mjs .xezar/checks/
```

**What you lose by skipping it.** A gate that is red for no reason wherever it runs outside the
leader's session.

## 2026-09-22 – on engine 0.19.0, a review or QA verdict is "refused" on the task record

Applies to any repository onboarded by `xez-onboard-opinionated` before 3.0.0 that runs engine
0.19.0 or later.

**Symptom – the leader sees no verdict from code review, design review or QA,** and the task record
lists the packet as refused. From 0.19.0 the engine accepts a verdict packet only from a workflow
step that declares its role with `verdictRole`, so a packet from an older workflow is refused, as
the engine intends.

**What to do.** Copy the three workflows and the checker that knows the new key:

```bash
K=.claude/skills/xez-onboard-opinionated/kit
cp $K/workflows/code-review.yaml $K/workflows/design-review.yaml $K/workflows/qa.yaml .xezar/workflows/
cp $K/checks/catalog-check.mjs .xezar/checks/
```

If your project has **its own** workflow whose step writes a verdict packet, add
`verdictRole: <role>` to that step, where the role is `code-review`, `design-review`, `qa` or
`architecture-review`.

**What you lose by skipping it.** Every verdict on the task record. The PR comment still lands, so
a person can read it, but the leader has to parse it.

## 2026-09-22 – the tidiness check calls a new engine file "loose"

Applies to any repository onboarded by `xez-onboard-opinionated` before 3.0.0.

**Symptom – `local-tree.sh` reports an engine file at the top of `.local/xezar/` as loose** after an
engine upgrade. Its list of engine names was fixed in the kit. It now also reads the names the
engine publishes (`xezar state-names --json`, engine 0.19.0 and later) whenever `xezar` is on PATH.

**What to do.**

```bash
K=.claude/skills/xez-onboard-opinionated/kit
cp $K/checks/local-tree.sh .xezar/checks/
```

**What you lose by skipping it.** A red gate each time an engine release adds a name, until the next
kit release.

## 2026-09-22 – the onboarding skill says my engine is too old, and it ran yesterday

Applies to anyone running engine **0.18.x** with `xez-onboard-opinionated` 3.0.0 or later.

**Symptom – the preflight refuses and names 0.19.0.** The minimum engine version is now 0.19.0.
It was 0.18.0.

**What to do.**

```bash
npm install -g @qodeca/xezar
xezar --version     # must print 0.19.0 or later
```

**Why the floor moved.** 0.19.0 is the first engine that makes a reading step read-only: on Claude
it removes the Edit and Write tools, and turns the step's `bashAllowlist` into Claude permission
rules. A `permissions.allow` Bash rule in the project's `.claude/settings*.json` still widens those
rules, so the kit's catalog check now refuses one that is not a reading command. The shipped routing
marks the Claude lanes as enforcing because of that, and puts only them on review and release work.
On an older engine those rows would run a reviewer that can still write.

**What you lose by skipping it.** The skill, for now. Staying on xezar-skills 2.1.1 is a real
option if you cannot upgrade the engine yet; it supports 0.18.0 and routes from the old table.

## 2026-09-22 – my leader still reads `model-routing.md`

Applies to any repository onboarded by `xez-onboard-opinionated` before 3.0.0. Your leader keeps
routing from the old table until you do this; nothing breaks meanwhile.

**Symptom – the leader picks lanes from `.xezar/docs/model-routing.md`.** Routing is now data:
`.xezar/routing.json`, read only through `node .xezar/checks/route.mjs`, which applies every ban a
file can decide and removes a lane this machine lacks. The markdown table has no check, and a ban
in it is a ban the leader has to remember.

**What to do.** First copy what reads the file:

```bash
K=.claude/skills/xez-onboard-opinionated/kit
cp $K/routing.schema.json .xezar/
cp $K/checks/route.mjs $K/checks/verdict-write.sh $K/checks/git-read.sh $K/checks/gh-write.sh \
   $K/checks/catalog-check.mjs $K/checks/repository-checks.sh .xezar/checks/
cp $K/checks/lib/security-scan.mjs .xezar/checks/lib/
cp $K/docs/routing.md $K/docs/README.md $K/docs/account-limits.md $K/docs/leader-context-loading.md .xezar/docs/
cp $K/loops.json .xezar/loops.json
cp $K/workflows/*.yaml .xezar/workflows/
cp $K/skills/xezar-*.md .xezar/skills/
```

Then run the skill's routing section. It writes `.xezar/routing.json` from the shipped defaults,
carries your rotations over, shows your old chain beside the new order for each row, runs
`route.mjs --check`, regenerates the leader guide's routing section, and deletes
`model-routing.md` in the same pull request:

```text
/xez-onboard-opinionated --section routing
```

The new `loops.json` changes the L2 and L3 prompts, so the leader reports them as drifted once and
re-creates them. That is expected.

**What you lose by skipping it.** The checked bans, the security minimums enforced by a script, and
routing read from the base branch rather than from whatever the leader has open. The old table
keeps working as a table.

## 2026-09-22 – a review or triage task changed a file it was only meant to read

Applies to any repository onboarded by `xez-onboard-opinionated` before 3.0.0. Nothing changes
until you copy the files below.

**Symptom 1 – a reviewer wrote something.** A code review, security review, architecture review,
business analysis or issue triage is meant to read and post a verdict. Its workflow step lists no
`Edit` and no `Write` tool, and that looked like a guarantee. It was not: every backend still gave
the step a shell, so `git commit`, `> file` or `git diff --output=file` all worked (xezar #849).

**Symptom 2 – after copying only the workflows, the verdict packet stopped arriving.** The five
reading workflows now carry a `bashAllowlist`. Their shell may run only the reading prefixes it
names, so the role writes its verdict packet, `BLOCKED` and evidence through a new helper,
`verdict-write.sh`, posts comments and moves labels through `gh-write.sh`, and reads git through
`git-read.sh`. A role skill from before this entry still tries `mv` or `gh pr comment` and is
refused.

**What to do.** Copy the three helpers, the checks that know about them, the five workflows and
their role skills, together:

```bash
K=.claude/skills/xez-onboard-opinionated/kit
cp $K/checks/git-read.sh $K/checks/gh-write.sh $K/checks/verdict-write.sh $K/checks/catalog-check.mjs .xezar/checks/
cp $K/checks/lib/security-scan.mjs .xezar/checks/lib/
for w in code-review architecture-review security-review business-analysis issue-triage; do
  cp $K/workflows/$w.yaml .xezar/workflows/
done
cp $K/skills/xezar-*.md .xezar/skills/
```

If your project has **its own** workflow with a step that lists neither `Edit` nor `Write`, the
new `catalog-check.mjs` refuses it until you give it a `bashAllowlist` from the table in that
file, or add `Edit`/`Write` if it really writes. It also refuses a Bash rule in the project's
`.claude/settings.json` or `.claude/settings.local.json` that is not a reading command, because
Claude adds that rule to every reading step's shell.

**What you lose by skipping it.** A reviewer that can change what it reviews. Nothing fails, and
that is why this entry exists.

## 2026-09-22 – my gate fails on a `kit` directory, or my gate lease quietly stopped taking slots

Applies to any repository onboarded by `xez-onboard-opinionated` 2.0.0 or earlier, **once you copy
the two checks below**. Until then nothing changes. Both are small and neither is urgent today.

**Symptom 1 – `local-tree` fails with `kit/ (unexpected directory)`.** The engine writes
`.local/xezar/kit` when a repository root is the user's own home directory. That should never be an
onboarded project, so you are unlikely to see this — it is allowed now because the cost of being
wrong about "never" is every gate run going red, and the cost of allowing it is nothing.

**Symptom 2 – there is no symptom, and that is the problem.** The lease probe in `repo-gates.sh`
used to look for the words `usage: xezar lease gates` in the engine's refusal. No test of the
engine's protects that wording. If it is ever reworded, the probe stops matching, the gate lease
silently stops being taken, and gate runs go back to trampling each other with no error and nothing
in the log. The probe now matches `nothing to run` instead — the one phrase the engine's own test
suite asserts for that exact call — so a rewording would turn **their** build red before it reached
you.

**What to do.** Copy the two checks:

```bash
cp .claude/skills/xez-onboard-opinionated/kit/checks/repo-gates.sh .xezar/checks/
cp .claude/skills/xez-onboard-opinionated/kit/checks/local-tree.sh .xezar/checks/
```

**What you lose by skipping it.** Nothing you will notice today. Later, a gate that fails on a
directory you did not create, or a lease that stopped working months ago and never said so.

## 2026-09-22 – the onboarding skill says my engine is too old, and it used to run

Applies to anyone running engine **0.16.x or 0.17.x** with `xez-onboard-opinionated` 1.7.0 or later.

**Symptom – the preflight refuses and names a version you do not have.** The minimum engine version
is now 0.18.0. It was 0.16.0.

**What to do.**

```bash
npm install -g @qodeca/xezar
xezar --version     # must print 0.18.0 or later
```

0.16.0 and 0.17.0 are still published, so an already-onboarded project keeps working exactly as it
did — nothing upgrades itself. This bites only when you next run the skill.

**What you lose by skipping it.** The skill, for now — it will not start against an older engine.
Staying on 1.6.1 is a real option if you cannot upgrade the engine yet; it supports 0.16.0 and is
unaffected by this change.

**Why the floor moved.** 0.18.0 is the first engine that answers a refusal *before* validating
arguments, so a refused call no longer arrives disguised as `Unrecognized keys` — the skill used to
carry a guess for that and now does not. It is also the first that can copy the machine's accounts
into a project through its own tool (`import_global_accounts`) rather than the skill editing a file
on the owner's say-so. Supporting older engines meant keeping fallback paths that no test could
reach, which is the worst kind of code to keep: it runs only for the people you can least help.

## 2026-09-21 – my repository has no CONTRIBUTING.md, SECURITY.md or docs index, and a new setup would have written them

Applies to any repository onboarded by `xez-onboard-opinionated` 1.6.1 or earlier.

**Read the preamble table above before this one.** `SDLC.md`, `CODE_REVIEW.md`,
`BACKWARD_COMPATIBILITY.md` and the `AGENTS.md` starter are *"regenerated only when missing"* —
and the three documents below are generated the same way. So **nothing in an upgrade writes them
into your repository.** They arrive on a fresh setup only. This entry exists because that is easy
to miss, and one of the three closes a pointer you already ship.

**Symptom 1 – your issue template routes a security reporter to a `SECURITY.md` you do not have.**
`.github/ISSUE_TEMPLATE/config.yml` says "Report privately… see SECURITY.md". If that file is
missing, the most sensitive path in your repository ends nowhere. This is the one worth fixing by
hand today.

**Symptom 2 – `docs/` has up to seven folders and no index.** The `paths.*` keys name them and
nothing says which is which.

**Symptom 3 – 37 workflows, a label taxonomy, and no page telling a person how to contribute.** A
first-time contributor opens a pull request, sees none of the 37 workflows run, and reasonably
concludes the CI is broken.

**What to do.** Write the three by hand, or re-run the setup on a scratch branch and copy them
across. What each needs is in
`.claude/skills/xez-onboard-opinionated/references/write.md` §2 — in short:

- **`SECURITY.md`**, four parts: where to report privately (use the same private-advisory route
  your `config.yml` already names, not a second address) and which versions get a fix; what this
  project does **not** treat as a vulnerability; what happens if nobody answers; and what this
  project has promised — its trust boundaries. That last part is not decoration: your
  `xezar-security-review` role is told to read this file before it opens a diff, so what it says
  you promised is what that review defends.
- **`docs/README.md`**, three columns — path, what lands there, who it is for — with the paths
  read from **your** `.xezar/pipeline/config.json`, not from any default list, and one line saying
  a folder appears when its first document does.
- **`CONTRIBUTING.md`**, one page, whose load-bearing sentence is that a contributor triggers none
  of the 37 workflows and that the checks gating their pull request are `ci.requiredChecks` — not
  the gate list in `repo-gates.sh`, which is the agent gate list and never runs on a human's PR.

**What you lose by skipping it.** The security pointer stays dead — that is the real cost. The
other two are conveniences, and nothing in the kit reads them, so nothing will ever tell you they
are missing.

## 2026-09-21 – my gate run says it is waiting for a slot, and two tasks no longer run their gates at once

Applies to any repository onboarded by `xez-onboard-opinionated` 1.6.1 or earlier, **once you copy
the new `repo-gates.sh`**. Until then nothing changes.

**Symptom – a gate run prints `xezar lease: waiting for a gate slot` and sits there.** That is the
new behaviour working, not a hang. Two full gate runs on one machine starve each other badly
enough that the failures show up in suites your change never touched — which reads as flaky tests
rather than as contention, so it usually gets blamed on the change. `repo-gates.sh` now holds one
of the machine's gate slots for the length of its run, and a second run waits.

Every run says what happened: `gate slot 1 of 1 taken`, or `waiting for a gate slot (all 1 busy,
waited 30s)`, or one line saying it could not take a lease and is running anyway.

**Symptom 2 – fanning out several tasks feels slower.** The gate tail is now a queue. The agent
step, which is the large share of a run's clock, is still parallel.

**What to do.** Copy the check:

```bash
cp .claude/skills/xez-onboard-opinionated/kit/checks/repo-gates.sh .xezar/checks/
cp .claude/skills/xez-onboard-opinionated/kit/checks/lib/gate-record.sh .xezar/checks/lib/
cp .claude/skills/xez-onboard-opinionated/kit/docs/parallel-tasks.md .xezar/docs/
cp .claude/skills/xez-onboard-opinionated/kit/docs/README.md .xezar/docs/
```

The two documents matter as much as the check. `parallel-tasks.md` is what your leader reads to
decide how wide to fan out, and the old copy does not know the gate queue exists — so it keeps
advising a fan-out whose gate runs now queue, and the delay gets misdiagnosed as a slow machine.
That misdiagnosis is the thing this change exists to prevent.

It needs no configuration: how many gate runs go together is the engine's own
`resources.gateSlots`, default 1, and the wait is bounded at 20 minutes. It **fails open** — no
engine on your PATH, an engine older than 0.17.0, an engine that cannot run the verb, or a binary
that does not answer each print one line and run the gates anyway, so it cannot turn a working gate
red. Two of those four are checked by the kit before it commits to the engine; the other two are
the engine's own contract.

If the queue costs you more than the contention does on your machine, raise `resources.gateSlots`
in the cockpit (Settings → Resources, 1–16). Raise it deliberately: the default comes from a
measurement on one machine with one test suite, where four to five concurrent runs failed nine
times in ten.

**What you lose by skipping it.** Nothing breaks. You keep the failure mode: a busy machine
produces gate failures in code you did not touch, and the natural reading of those is that your
change broke something, or that your tests are flaky. Both readings cost more than the wait does.

## 2026-09-21 – my release task folds notes into a `dogfooding.md` I do not have

Applies to any repository onboarded by `xez-onboard-opinionated` 1.6.1 or earlier.

**Symptom 1 – every role tells tasks to write a fragment nobody ever folds.** The shipped role
skills ended with "record relevant dogfooding observations as a fragment in
`.xezar/docs/dogfooding.d/<runId8>.md`", and the release role's step 5 folded those fragments into
`.xezar/docs/dogfooding.md`. The kit never shipped that ledger, so the fold had nothing to write
into and the fragments accumulated. You may have a `.xezar/docs/dogfooding.d/` folder with files in
it that nothing has ever read.

**Symptom 2 – `bash .xezar/checks/repository-checks.sh` runs a check you did not ask for.** If that
folder exists, the gate's last command validated the fragments in it.

**What to do.** This was one project's record-keeping habit shipped to every other project, and it
is removed rather than completed. Copy the new files over the installed ones:

```bash
rm -f .xezar/checks/dogfooding-fragments.mjs
cp .claude/skills/xez-onboard-opinionated/kit/checks/repository-checks.sh .xezar/checks/
cp .claude/skills/xez-onboard-opinionated/kit/checks/lib/common.sh .xezar/checks/lib/
cp -R .claude/skills/xez-onboard-opinionated/kit/skills/. .xezar/skills/
cp .claude/skills/xez-onboard-opinionated/kit/docs/phase-record.md .xezar/docs/
cp .claude/skills/xez-onboard-opinionated/kit/docs/close-out.md .xezar/docs/
```

That rewrites all 37 role skills — the sentence lived in their shared contract — and removes the
release role's fold step, which is why `xezar-release-changelog.md` must be among them. Then decide
what to do with `.xezar/docs/dogfooding.d/`: the notes in it are yours. Fold them into a document
of your own once, or delete the folder. Nothing reads it after this.

**What you lose by skipping it.** Your release task keeps trying to fold fragments into a file that
does not exist, and every writing task keeps producing fragments for it. Nothing fails loudly; the
folder simply grows.

**What you lose by applying it.** Honestly: the kit no longer asks any role to record what a task
taught it. Campaign notes stay, but they are the leader's record of decisions, not a per-task
record of lessons. If you had been using the fragments, keep doing it in your own words — nothing
stops you, the kit just no longer asks.

## 2026-09-21 – CI re-runs a failed job by itself, and my integration role reads fields that are gone

Applies to any repository onboarded by `xez-onboard-opinionated` 1.6.1 or earlier.

**Symptom 1 – your integration role reads `outcome.json` for fields that no longer exist.**
`.xezar/checks/ci-watch.sh` no longer writes `knownLoadFlakes` or `failedJobsAreKnownLoadFlakes`.
If you copy the new check without the new role skill, the old role looks for
`failedJobsAreKnownLoadFlakes` and does not find it — and a missing field is not true, so it takes
its own "when it is false" branch and reports the red build instead of rerunning it. **That mixed
state is safe**, which is worth saying plainly rather than implying a breakage there is not. What
it leaves behind is a role whose written text still teaches a human reader that naming a job can
excuse it.

**Symptom 2 – a red CI job is re-run instead of reported.** The old role applied a "one rerun" rule
whenever every failed job was named in `ci.knownLoadFlakes`. That list, and the rerun, are removed.
A job that fails under machine load rather than because of the change is a flaky test, and a flaky
test is rebuilt onto a mechanism that cannot fail on timing — never retried, never waited out,
never excused by a list of names.

**What to do.** Copy all three. The ordering constraint is **one-directional**, so if you can only
do one thing today, copy the role first: the new role reads only `failedJobs`, `supersededBy` and
`outcome`, all of which the old check still writes, so role-ahead-of-check is completely safe. It
is the check that must not lead.

```bash
cp .claude/skills/xez-onboard-opinionated/kit/checks/ci-watch.sh .xezar/checks/
cp .claude/skills/xez-onboard-opinionated/kit/skills/xezar-integration.md .xezar/skills/
cp .claude/skills/xez-onboard-opinionated/kit/workflows/integration.yaml .xezar/workflows/
```

Then delete `ci.knownLoadFlakes` from `.xezar/pipeline/config.json`. Nothing reads it; leaving it
is harmless but misleading.

**What you lose by skipping it.** A real failure of a job whose name is on your list is still
offered as a candidate for a rerun — which is exactly how a genuine defect reaches your base
branch wearing a green tick.

## 2026-09-21 – my check no longer picks up the fake command I set

Applies to a repository onboarded by `xez-onboard-opinionated` 1.6.1 or earlier **whose own
tooling, CI configuration or shell profile sets one of these four variables**. The rename lives in
four kit check files, so nothing changes for you until you copy them — and then it changes all at
once. Copy the files and rename your variables together; doing only the rename is worse than doing
neither, because your installed checks still read the old names.

**Symptom – a `DOGFOOD_*` environment variable you set is silently ignored.** Four variables were
renamed. They fail quietly: no error, the check simply uses its default instead.

| Old | New | What it does |
|---|---|---|
| `DOGFOOD_GH` | `KIT_TEST_GH` | the command used to reach GitHub, default `gh` |
| `DOGFOOD_WORKFLOW` | `KIT_TEST_WORKFLOW` | the workflow name on a gate record |
| `DOGFOOD_GATE_LOG` | `KIT_TEST_GATE_LOG` | exported to the gate command so it can find its own log |
| `DOGFOOD_ALLOW_ROOT_BOOTSTRAP` | `KIT_TEST_ALLOW_ROOT_BOOTSTRAP` | the named-run exception in the worktree preflight |

**What to do.** Copy the four files that carry the new names, then rename your own uses. No other
entry in this document copies three of these, so doing it here is the only place it happens:

```bash
cp .claude/skills/xez-onboard-opinionated/kit/checks/integration-preflight.sh .xezar/checks/
cp .claude/skills/xez-onboard-opinionated/kit/checks/worktree-preflight.sh .xezar/checks/
cp .claude/skills/xez-onboard-opinionated/kit/checks/ci-watch.sh .xezar/checks/
cp .claude/skills/xez-onboard-opinionated/kit/checks/lib/gate-record.sh .xezar/checks/lib/
```

Then search your own scripts, CI configuration and shell profiles for `DOGFOOD_` and use the new
name. The behaviour is unchanged.

**What you lose by skipping it.** Whatever the variable was doing stops happening, without a
message. If you set `DOGFOOD_GH` to a wrapper, the check goes back to calling `gh` directly.

## 2026-09-21 – a whole lane is marked out of budget when one login runs out

Applies to a repository onboarded by `xez-onboard-opinionated` 1.5.0 or earlier.

**Symptom – work waits although a model is still available.** The shipped hourly budget loop (L2
in `.xezar/loops.json`) treated a *lane* as the thing that runs out of tokens. A lane is a tool
plus a model; the thing that runs out is a **login**, and a lane is only out while every login in
its tool's rotation is. With the old wording, one exhausted login parks every lane on that tool.

Fix: open `.xezar/loops.json`, replace the L2 prompt with the one in
`.claude/skills/xez-onboard-opinionated/kit/loops.json`, then start a new leader session
(`./scripts/xezar-leader.sh`, or `XEZAR_LEADER=1 claude --dangerously-load-development-channels
server:xezar`) so the loop is re-created from the new text (the leader compares both fields at
every start).

Skipping it costs throughput, not correctness: nothing runs on an exhausted login either way.

## 2026-09-21 – the leader guide is over 200 lines, or the routing table ranks logins

Applies to a repository onboarded by `xez-onboard-opinionated` 1.5.0 or earlier.

**Symptom 1 – `.xezar/docs/leader-guide.md` is longer than 200 lines.** Count it:
`wc -l .xezar/docs/leader-guide.md`. The shipped template was too long for its own limit, so every
guide written from it is. The guide loads in full at every session start, resume, clear and
compaction, so the extra lines are paid for again and again. An installed guide never updates
itself.

Fix, by hand, because the guide may carry rules you added:

1. Copy the new reasoning document in:
   `cp .claude/skills/xez-onboard-opinionated/kit/docs/leader-guide-detail.md .xezar/docs/`
2. Open `.claude/skills/xez-onboard-opinionated/kit/leader-guide.template.md` beside your guide and
   replace each shipped section with the shorter one, **keeping every heading as it is** and
   keeping every line that ends `(owner <date>)` — those are yours.
3. Leave your four project sections at the end alone.
4. `wc -l .xezar/docs/leader-guide.md` again — it should now be at or under 200, plus whatever
   rules you have added yourself since.

Skipping it loses nothing but tokens: the long guide says the same rules.

**Symptom 2 – the chains in `.xezar/docs/model-routing.md` name logins or accounts** rather than
`<tool>/<model>` entries. A lane is a tool plus a model; logins are only the order a tool's accounts
are tried in when one runs out. A table written the old way still dispatches, so nothing breaks —
but it cannot say "this model is for hard work only" or "this one only makes pictures", and a
login that runs out looks like a lane that is gone.

Fix: run `/xez-onboard-opinionated --section routing` and answer the routing screen again; it now
asks what each model is for before it proposes a ranking.

## 2026-09-21 – the leader has no workflow for a deploy, a UI test suite, an architecture decision…

Applies to any repository onboarded by `xez-onboard-opinionated` 1.4.0 or earlier.

**Symptom – a kind of work the leader cannot route**: a deploy or a rollback, automated UI or
integration tests, the regression suite, a performance check, a hotfix, a refactor, a migration,
a spike, observability, a deprecation plan, localisation, acceptance verification, a security
review of its own, the design system, the visual layer of a design, a figure, or an architecture
decision and its review. Release 1.5.0 added a workflow for each. A workflow already installed
into your repository never updates itself, so an older project has none of them.

**What to do, in this order — the order matters, and half of it is worse than none.** A workflow
file that no routing row names is installed, valid and unreachable: the leader picks work by a
row's trigger sentence.

1. Copy the new files. Name the check files; **do not copy the whole `checks/` folder**, because
   `.xezar/checks/repo-gates.sh` holds *your* gate commands:

   ```bash
   K=.claude/skills/xez-onboard-opinionated/kit
   for f in catalog-check.mjs config-guard.sh deploy-guard.sh ci-watch.sh lib/config-grammar.mjs lib/security-scan.mjs; do cp "$K/checks/$f" ".xezar/checks/$f"; done
   cp -R "$K/skills/." .xezar/skills/
   cp -R "$K/workflows/." .xezar/workflows/
   mkdir -p .xezar/pipeline/browsers .xezar/pipeline/security
   cp "$K/pipeline/security/osv-scanner.md" .xezar/pipeline/security/
   cp "$K/pipeline/browsers/<the one whose tool you have>.md" .xezar/pipeline/browsers/
   node .xezar/checks/catalog-check.mjs .        # must print CATALOG OK
   ```

2. Add the new keys to `.xezar/pipeline/config.json`. `[]` is a real answer — "this project has
   none" — and the guarded workflows refuse on it with a sentence that says so:

   ```json
   "paths": { "designs": "designs", "architecture": "docs/architecture", "spikes": "docs/spikes",
              "runbooks": "docs/runbooks", "deprecations": "docs/deprecations", "performance": "docs/performance",
              "migrations": "docs/migrations" },
   "deploy": { "environments": [], "rollback": [] },
   "performance": { "budgets": [] },
   "localisation": { "locales": [] }
   ```

3. Add the rows to `.xezar/docs/model-routing.md`: one line per new row of
   `references/routing-rows.md` (a 2.x file; 3.0.0 replaced it with `kit/routing.json`), **with its workflow file**, under a chain you choose. There are three
   new classes — `design`, `visuals` and `testing`. The security-sensitive review row (row 24 in
   1.4.0, row 41 now) changed its workflow from `code-review.yaml` to `security-review.yaml`, and the two visuals rows now run `visual-asset.yaml`. Copy the fifth
   global prohibition and the look-alike pairs as well.
4. Add the headings the new roles cite to your `SDLC.md`, a sentence or two each: Security review ·
   Architecture review · Acceptance · Deploy authority.

**What you lose by skipping it.** Nothing breaks: the workflows you have keep working. You lose
the new ones — and if you do step 1 alone, you have thirty-seven workflows of which the leader can
start eighteen, which looks like a complete setup and is not.

## 2026-09-21 – your designs are in `designs/`, and new documents go under `docs/`

Applies to any repository onboarded by `xez-onboard-opinionated` 1.4.0 or earlier.

**Symptom – after updating the kit's role skills, the design role talks about a folder named by
`paths.designs`**, and your designs are in a root-level `designs/`. From 1.5.0 every document the
setup or its workflows commit lives under `docs/`, and the kit reads a `paths.*` key, never a
literal folder.

**What to do.** Nothing has to move. Set `"paths": { "designs": "designs" }` in
`.xezar/pipeline/config.json` and everything keeps working where it is. To follow the new layout,
`git mv designs docs/designs`, change the key, and fix the links inside the moved pages in the same
commit. The `.xezar/checks/fenced-quotes.mjs` check reads both places.

**What you lose by skipping it.** With the key unset, the updated design role has no folder to
write to and says so. Your existing designs are not touched either way.

## 2026-09-21 – a task sent to OpenCode is refused: "OpenCode is disabled"

Applies to a repository onboarded by `xez-onboard-opinionated` 1.5.0 or later.

**Symptom – a dispatch that names the OpenCode runner comes back refused.** The setup switched
that provider off for this project, on purpose: after a denied permission request its session can
go silent for minutes, it does not enforce a step's tool allowlist — which is the only thing that
makes a read-only role read-only — and a resumed session loses its role. `DECISIONS.md` →
"OpenCode is off by default" has the full reasons.

**What to do, if you want it back.** Engine tool `project_config`, action `set_provider_enabled`,
`provider: "opencode"`, `enabled: true`. The state is in `.xezar/workspace.json`, which is
git-ignored; `.local/xezar/runtime/onboarding-engine-settings.json` records what it was before. **Reverting
the setup pull request does not undo it.** Keep it out of read-only and release chains even then:
the fifth global routing prohibition says why.

**A project onboarded earlier is switched only when nothing uses the provider.** Re-running
`--verify` on it switches OpenCode off unless the existing routing table still names an OpenCode
lane, or the engine is not in single-project mode; in both cases it leaves the provider on and
reports that it did.

**What you lose by leaving it off.** One provider's lanes. Nothing else changes.

## 2026-09-21 – a fix to a browser or security descriptor never reached your project

Applies to a repository onboarded by `xez-onboard-opinionated` 1.5.0 or later.

**Symptom – `.xezar/pipeline/browsers/<name>.md` or `.xezar/pipeline/security/<name>.md` differs
from the one this release ships.** Like every installed descriptor, it never updates itself.
`.xezar/onboarding.json` → `descriptors` records the SHA-256 of each file as installed, and
`references/descriptor-digests.json` in the skill holds the digests of the current release, so you
can tell "the file that shipped" from "somebody edited it" before you overwrite anything.

**What to do.** Compare the digests; where the installed file is unedited, copy the new one over
it and update the recorded digest. Where it was edited, merge by hand.

**What you lose by skipping it.** Whatever the fix fixed. A descriptor is literal shell whose exit
status becomes a gate result, so this is the one kind of installed file worth checking on every
upgrade.

## 2026-09-21 – `--section leader` says there is no such screen

Applies to anyone who learned this skill's arguments before the interview was shortened.

**Symptom – `/xez-onboard-opinionated --section leader` (or `branching`, `design`, `seeding`) is
not a screen any more.** The interview used to be seven sections holding eighteen separate asks.
It is now five screens: `facts`, `gates`, `lanes`, `routing`, `table`.

**What to do.** Nothing, unless you have the old names written down somewhere. They still work:
`branching`, `design` and `leader` resolve to `facts` and say so, and `seeding` tells you the
question is gone. Update a note or a runbook that names them, so the alias does not have to live
forever.

**What you lose by skipping it.** Nothing today. The aliases exist so a habit does not break; the
one thing they will not do is re-ask a screen that no longer exists, which is why `seeding` reports
rather than silently doing nothing. `seeding` asked whether the routing table started with day-one
preferences filled in, and nothing in the setup ever read the answer.

## 2026-09-21 – your `.xezar/` names the engine project's own files

Applies to any repository onboarded by `xez-onboard-opinionated` 1.2.0 or 1.3.0.

**Symptom – a comment or a prompt in `.xezar/` points at a path your repository does not have**,
for example a module path under `packages/xezar/`, a design system under `docs/design-system/`, or
a CI job named after somebody else's pipeline. Two of those are not just confusing:

- `.xezar/checks/integration-preflight.sh` carried a hard-coded list of required CI check names.
  Yours are different, so every merge through that gate is refused with `checks.absent`.
- `.xezar/checks/ci-watch.sh` carried two job names as "known load flakes". A real failure of a
  job with one of those names would have been offered as a candidate for a rerun.

> **Later change, read this before you copy the block below.** This entry originally told you to
> add a third key, `"knownLoadFlakes": []`. That key was removed from the kit on 2026-09-21 — see
> the entry keyed "CI re-runs a failed job by itself, and my integration role reads fields that are
> gone". Do not add it. If your config already carries it, nothing reads it any more and it is safe
> to delete.

**What to do.** Add the two keys to `.xezar/pipeline/config.json` — your required check names
exactly as GitHub reports them, and your design-system folder if you have one:

```json
"ci": { "requiredChecks": ["<your check name>"] },
"paths": { "designSystem": "" }
```

Then copy the fixed scripts over the installed ones:

```bash
for f in integration-preflight.sh ci-watch.sh worktree-preflight.sh worktree-setup.sh \
         catalog-check.mjs lib/common.sh; do
  cp ".claude/skills/xez-onboard-opinionated/kit/checks/$f" ".xezar/checks/$f"
done
cp -R .claude/skills/xez-onboard-opinionated/kit/skills/. .xezar/skills/
cp -R .claude/skills/xez-onboard-opinionated/kit/workflows/. .xezar/workflows/
```

**From 1.5.0 those last two lines bring more than fixes.** They now also copy nineteen new
workflows, three of which call a check this list does not copy, and none of which your routing
table names. Follow the entry "the leader has no workflow for a deploy…" above instead: it copies
the three new check files and adds the routing rows, the config keys and the `SDLC.md` headings
that make the new workflows reachable. It also replaces `ci-watch.sh` and `lib/security-scan.mjs`,
which the deploy workflow and the deploy trust boundary need. `node .xezar/checks/catalog-check.mjs .` tells you at once
whether the copy was complete.

**What you lose by skipping it.** The integration gate keeps refusing merges on check names that
do not exist in your repository, and a genuinely failed job may be excused as a known flake.
Reviewers and agents keep reading paths that lead nowhere. Nothing becomes less strict by applying
it: an empty required-check list means the gate still compares everything your branch rules
enforce.

## 2026-09-21 – `.xezar/checks/repo-gates.sh` exits 1 with "no run id"

Applies to any repository onboarded by `xez-onboard-opinionated` 1.2.0 or 1.3.0.

**Symptom – you run the gates by hand, as the kit's own role skills tell you to, and nothing
runs.** The output is:

```
gate-record: no run id — cannot locate the evidence directory
GATES ABORTED: the attempt could not be recorded, so nothing here could become evidence.
```

An engine-dispatched task sets a run id; you, in the primary checkout, do not. So the gates
refused before running a single command. The same fault is why an onboarding smoke test could
never finish its second tier.

**What to do.** Copy the two fixed library files over the installed ones:

```bash
cp .claude/skills/xez-onboard-opinionated/kit/checks/lib/common.sh .xezar/checks/lib/common.sh
cp .claude/skills/xez-onboard-opinionated/kit/checks/lib/gate-record.sh .xezar/checks/lib/gate-record.sh
bash .xezar/checks/repo-gates.sh --fast
```

The run now prints `run id none — standalone attempt` and gives you a pass or fail. Its log lands
under `.local/xezar/scratch/standalone-gates/`, which is gitignored.

**What you lose by skipping it.** Nothing breaks, but you have no way to run the gates yourself:
the only way to see a gate verdict stays "dispatch a task and wait". **Nothing is made less
strict.** A standalone attempt is outside the evidence roots and its producer is `author`, so a
merge can never be certified by one — the same two refusals that were already there.

## 2026-09-21 – every Claude Code session in an onboarded project acts as the leader

Applies only to a repository onboarded by `xez-onboard-opinionated` 1.2.0.

**Symptom – you open Claude Code in the project to ask a question, and it starts checking
campaigns, loops and open pull requests.** Your `.xezar/checks/leader-context.sh` has no line
testing `XEZAR_LEADER`, so the `SessionStart` hook hands the leader guide to every session in
the checkout, not only to the one the launcher started.

**Symptom – the task gate fails on `.local/xezar/` entries you never created**, such as
`mcp-operations.ndjson` or `mcp-owner-claims/`. Your `.xezar/checks/local-tree.sh` predates the
list of files the engine writes in single-project mode.

**What is lost by skipping this.** Two sessions believing they lead one project, with one leader
slot between them; and a gate that is red on a healthy tree, so every task fails it.

**How to apply.** Copy `kit/checks/leader-context.sh` and `kit/checks/local-tree.sh` from the
skill over your `.xezar/checks/` copies, and `kit/scripts/xezar-leader.sh` over
`scripts/xezar-leader.sh` — or add `export XEZAR_LEADER=1` above its `exec` line if you have
edited it. Refresh their digests in `.xezar/onboarding.json`. From then on, start the leader with
`./scripts/xezar-leader.sh`, or by hand with
`XEZAR_LEADER=1 claude --dangerously-load-development-channels server:xezar`. A session started
without `XEZAR_LEADER=1` is an ordinary session.

## 2026-09-21 – a project onboarded with 1.2.0: skills out of git, labels on the tracker

Applies only to a repository onboarded by `xez-onboard-opinionated` 1.2.0. Everything it installed is
yours and never auto-updates.

**Symptom – `git status` is dirty after the engine starts, and the format check fails on `.agents/`.**
The skills collection was committed as copies under `.claude/skills/xez-*`. The engine updates installed
skills when it starts, and its updater writes the link layout: real files in `.agents/skills/`, links in
`.claude/skills/`. Committed copies and the updater fight, and an untracked, un-ignored `.agents/`
appears.

**Symptom – pull requests carry no pipeline labels.** `.xezar/pipeline/labels.json` lists the taxonomy,
and the tracker has almost none of it. Nothing in 1.2.0 created the labels.

**What is lost by skipping this.** Every engine start dirties the tree again, the local gate stays red,
and every label step in every skill logs a skip – so the QA and design gates are advice, not gates.

**How to apply.**
1. Put the skills in the link layout: `npx -y skills add qodeca/xezar-skills --skill '*' --agent claude-code --agent codex --yes`.
2. Take them out of git: `git rm -r --cached .claude/skills/xez-*` and `git rm --cached skills-lock.json`.
3. Ignore them – in `.gitignore`: `/.agents/skills/xez-*`, `/.claude/skills/xez-*`, `/skills-lock.json`,
   `/.xezar/agent-accounts.json`. No trailing slash: a slash pattern does not match a link. Add `.agents`
   to the ignore file of every formatter and linter that scans the repository.
4. Tell the next clone how to get them: one line in `AGENTS.md` with the command from step 1.
5. Create the labels: run the tracker operation **ensure-label-taxonomy** from `labels.json`, then
   **list-labels** to read back. Existing names keep their colour.
6. Refresh the digest of every edited file in `.xezar/onboarding.json`.
7. If the repository checks licences (a `REUSE.toml`): the kit folders are MIT – add `LICENSES/MIT.txt`
   and an override annotation for `.xezar/checks`, `workflows`, `skills`, `docs`, `loops.json`,
   `pipeline/trackers`, `pipeline/toolchains`.
After the merge, pull and check that the skills are still on disk; repeat step 1 if they are not.

## 2026-09-21 – the leader's context loader, corrected

Applies only to a repository onboarded by `xez-onboard-opinionated`. Everything it installed is
yours and never auto-updates, so these corrections do not reach you by upgrading the skills.

**Symptom – standing decisions vanish from the leader's context, and a finished campaign loads as
the live one.** Your `.xezar/checks/leader-context.sh` has `NOTE_TAIL_BYTES=8000` and reads
campaigns from `.local/xezar/campaigns`. Three things follow, none of which announces itself:

- `decisions.md` is cut to its last 8 KB. The owner's oldest decisions still bind, and they are
  the ones that disappear — silently, with the file still present and still labelled complete.
- The campaign lookup takes the last folder by name with no digit filter, so the reserved
  `future-campaign/` sorts above every dated one and wins every time.
- Campaign records are read from a gitignored path, so a rebuild loses them entirely.

**What is lost by skipping this.** The leader keeps working from a truncated decision file. That
is not a visible failure: it looks like ordinary work, and the first sign is the leader doing
something the owner ruled against months ago.

**Also corrected, same file.** The loader now wraps campaign content in an untrusted-content
boundary, refuses symlinked campaign folders and notes, and will not elect a campaign folder that
carries no readable note. Campaign records are committed, so their content arrives from anyone who
can open a pull request; an older loader prints it into a privileged session as if the owner had
written it, and a committed symlink reads any file on the machine into that session.

**How to apply.** Copy the current `leader-context.sh` and `local-tree.sh` from the skill's
`kit/checks/` over your `.xezar/checks/` copies, move `.local/xezar/campaigns/` to
`.xezar/campaigns/` and commit it, and re-read `.xezar/docs/campaign-notes.md` — the campaign
contract changed from a gitignored file that splits when it grows to a committed folder with seven
file kinds.

## 2026-09-21 – branch-protected, a new tracker operation

Additive: nothing that works today stops working. You need this only if you want a skill to be
able to turn branch protection on, which until now nothing in the contract could do.

**Symptom – a setup reports success while its gates enforce nothing.** Your
`.xezar/pipeline/trackers/<tracker>.md` has a **get-required-checks** section and no
**branch-protected** section. `get-required-checks` only *reads*, so a repository whose base
branch has no protection passes every label, review and CI step and still merges anything: the
labels are decoration and the QA gate is advice. A skill that wants to fix that has no operation
to call.

**Fix:** copy the **branch-protected** section from this release's shipped descriptor into your
own copy, next to **get-required-checks**. The shipped GitHub version is in
`skills/xez-setup-agent-pipeline/references/trackers/github.md`; Jira and Linear delegate to it,
because branch protection belongs to the code host rather than to the issue tracker.

Two things to read before you paste it. It takes `enforce_admins` from the caller and does not
default it — a setup whose leader pushes its own record files straight to the base branch needs
it `false`, a repository where nobody may bypass needs it `true`, and guessing is wrong for half
of callers. And on `403`/`404` it refuses and prints the command for someone with admin rights
rather than reporting a postcondition nobody reached.

Until you apply it, skills that need protection print the command and wait for you instead of
applying it. Nothing breaks; you do that step by hand.

## 2026-09-20 – merge-pr pins the head commit, list-issue-comments paginates

Two fixes to the GitHub tracker descriptor. Both are in the file your repository owns, so an
upgrade of the skills alone does not deliver them.

**Symptom 1 – a merge can land a commit no gate checked.** Your
`.xezar/pipeline/trackers/github.md` has a **merge-pr** section whose command ends
`gh pr merge {prNumber} --squash`, with no head-commit parameter. `xez-approve-merge-pr` checks
the review decision, the required checks and the labels against the PR's head commit, and then
asks the tracker to merge. Without the pin, a push in that window merges a commit no gate saw.

**Fix 1:** replace that command, and add the sentence above it:

```bash
gh pr merge {prNumber} --squash --match-head-commit {headSha}
```

Until you apply it, `xez-approve-merge-pr` falls back to re-reading the head immediately before
merging and aborting on any change. That narrows the window; it does not close it.

**Symptom 2 – a re-run posts a duplicate comment instead of updating its own.** Your
**list-issue-comments** section runs `gh api repos/{owner}/{repo}/issues/{number}/comments`
without `--paginate`. GitHub returns the first 30 comments and the request **succeeds**, so on a
busy PR a marker further back reads as absent. Every marker-idempotent comment — label rationale,
claim, verification — then duplicates instead of being rewritten in place.

**Fix 2:** add `--paginate`:

```bash
gh api --paginate repos/{owner}/{repo}/issues/{number}/comments --jq '.[] | {id,user:.user.login,body}'
```

Sibling operations in the same file (`label_exists`, **list-review-comments**) already paginate,
so this was an inconsistency rather than a deliberate bound.

**Symptom 3 – two repositories on the same pipeline have labels that mean different things.**
Your `.xezar/pipeline/trackers/github.md` has an **ensure-label-taxonomy** section that resolves
colours and descriptions "from the authorized local taxonomy". In practice that meant whoever ran
it, so `qa-self-verified` ended up green in one repository and purple in another, and with no
description a reader had no way to learn what it was for.

**Fix 3:** the taxonomy is now data. Copy `.xezar/pipeline/labels.json` from this collection
(`xez-setup-agent-pipeline` ships it as `references/labels.md` and installs it for new software setups), adjust the colours if you like,
and replace the first sentence of **ensure-label-taxonomy** with the shipped wording, which names
the file and states the fallback when it is absent.

This one is optional. Without it nothing breaks: the operation keeps asking for colours and
descriptions instead of reading them.

**Symptom 4 – a gate run leaves nothing behind for the next reader.** Your
`.xezar/pipeline/trackers/github.md` has no **put-verification-record** or
**get-verification-record** section. Skills that evaluate gates can then report what they found
only in a chat transcript that nobody keeps.

**Fix 4:** copy both sections, and the "Verification records" preamble above them, from this
collection's `github.md`. They post and re-read one marker-idempotent comment per skill.

Also optional, and deliberately so: the record is a **published record, never an authority**.
Anyone who can comment on a pull request can write text that looks like one, so no gate is ever
satisfied by a record — every gate re-derives from the authenticated API at the head commit.
Without the operations you lose the written trail, not the checking.

**Symptom 5 – no dependency or supply-chain operations are available.** Your repository has no
`.xezar/pipeline/toolchains/` or `.xezar/pipeline/security/` directory. Skills that want to
restore dependencies, build, check for outdated packages or scan for vulnerabilities have no
descriptor to execute.

**Fix 5:** copy the providers you want from this collection's
`skills/xez-setup-agent-pipeline/references/toolchains/` and `references/security/`, then add the
config keys:

```json
"toolchain": { "providers": ["npm"] },
"security": { "provider": "osv-scanner" }
```

Nothing changes until you do. `toolchain.providers` absent or empty means no lifecycle operation
applies, and `security.provider` absent means every supply-chain operation is `not-applicable`
and nothing executes — which is the deliberate default, so that an upgrade never silently gains a
stage that runs descriptor commands.

**Symptom 6 – PR bodies and issues ignore your repository's own templates.** Your
`.xezar/pipeline/trackers/github.md` has no **get-pr-template** or **get-issue-templates**
section, so skills write bodies in the collection's shape rather than the one your reviewers
expect, and issue forms with required fields get a free-form body instead.

**Fix 6:** copy both sections from this collection's `github.md`. They read the checkout, so on
a gate path read them from the base branch ref.

Optional. Without them a skill writes a plain body and says so; with them it fills the template
and asks about a required field it cannot answer, rather than inventing one.

**Symptom 7 – under a coding agent, installing agent-browser is refused before it starts.**
The agent prints something like "rm -f style commands are not permitted" and the browser is
never installed, although nothing in the run actually tried to delete anything. Several agent
harnesses scan a script's *text* for a forced delete and reject the whole block on sight; the
old `.xezar/pipeline/browsers/agent-browser.md` carried one on its checksum-mismatch path,
which never runs on a good download. The block was refused wholesale for a line it would not
have reached.

**Fix 7:** in your `.xezar/pipeline/browsers/agent-browser.md`, replace the forced delete of the
partial download with a truncation — `: > "$TMP"` in place of the `rm -f` line. The file has not
been made executable at that point, so a zero-byte leftover is inert.

Optional, and only if you use the agent-browser provider under an agent that blocks deletes.
Without it the provider still works wherever the binary is already installed; what you lose is
the autonomous first install on those machines.

## 2026-09-13 – migrating from open-mercato/skills

This collection is the continuation of `open-mercato/skills`, renamed and relaid out. The skill
bodies are the same; three things changed: the skill prefix (`om-` → `xez-`), the source
(`qodeca/xezar-skills`) and the pipeline directory (`.ai/` → `.xezar/pipeline/`, runtime QA
state → `.local/qa`). This is the only document in the repository that names the old collection.

- **Symptom of a stale installation:** `/om-…` commands still resolve to the old skills, `.ai/agentic.config.json` is still the config every skill reads, and `.xezar/pipeline/` does not exist. Xezar's updater reports "Installed skills come from another source" and stops updating them.
- **Fix:** follow the four steps below in order. Every step is idempotent.

### 1. Remove the `om-*` skill set

From the project directory (`-p`), or with `-g` for a global install:

```bash
npx skills remove om-apply-upgrade-notes om-approve-merge-pr om-auto-continue-pr om-auto-continue-pr-loop om-auto-create-pr om-auto-create-pr-loop om-auto-fix-issue om-auto-fix-pr om-auto-implement-spec om-auto-manage-issues om-auto-qa-pr om-auto-review-pr om-auto-update-changelog om-auto-write-spec om-brainstorm om-check-and-commit om-close-fixed-issues om-code-review om-create-skill om-discover om-fix om-followup-issue-from-pr om-integration-tests om-merge-buddy om-open-pr om-pipeline-retro om-pr-autopilot om-prepare-issue om-prepare-test-env om-review-prs om-root-cause om-setup-agent-pipeline om-spec-writing om-ux-review-pr om-ux-setup om-ux-shape om-verify-in-repo -p
```

A symlinked local checkout of the old repository is removed with its own `npm run uninstall-skills`.

### 2. Install this collection

```bash
npx skills add qodeca/xezar-skills --skill '*'
```

### 3. Re-run the setup

```text
/xez-setup-agent-pipeline
```

It writes `.xezar/pipeline/config.json` from your answers and installs the tracker and browser
descriptors at their new paths. If you would rather keep your edited copies, do step 4 first and
answer "keep" when the setup finds them.

### 4. Move the pipeline files from `.ai/` to `.xezar/pipeline/`

| Old path | New path |
|---|---|
| `.ai/agentic.config.json` | `.xezar/pipeline/config.json` |
| `.ai/trackers/<tracker>.md` | `.xezar/pipeline/trackers/<tracker>.md` |
| `.ai/browsers/<provider>.md` | `.xezar/pipeline/browsers/<provider>.md` |
| `.ai/skills/<name>/SKILL.md` (repo-local override) | `.xezar/pipeline/overrides/<name>.md` – one flat file, `om-` prefix renamed to `xez-` |
| `.ai/specs/`, `.ai/runs/`, `.ai/analysis/`, `.ai/scripts/` | `.xezar/pipeline/specs/`, `runs/`, `analysis/`, `scripts/` |
| `.ai/qa/` | `.local/qa/` (runtime state, not committed) |

```bash
mkdir -p .xezar/pipeline .local
git mv .ai/agentic.config.json .xezar/pipeline/config.json
for d in trackers browsers specs runs analysis scripts; do [ -d ".ai/$d" ] && git mv ".ai/$d" ".xezar/pipeline/$d"; done
if [ -d .ai/skills ]; then
  mkdir -p .xezar/pipeline/overrides
  for s in .ai/skills/om-*/SKILL.md; do n=$(basename "$(dirname "$s")"); git mv "$s" ".xezar/pipeline/overrides/xez-${n#om-}.md"; done
fi
[ -d .ai/qa ] && mv .ai/qa .local/qa
grep -qx '.local/' .gitignore 2>/dev/null || printf '.local/\n' >> .gitignore
```

Then update the `paths` block of the moved config so it points at the new directories (the setup
in step 3 writes these defaults for you):

```json
"paths": {
  "runs": ".xezar/pipeline/runs",
  "analysis": ".xezar/pipeline/analysis",
  "specs": ".xezar/pipeline/specs",
  "scripts": ".xezar/pipeline/scripts",
  "qa": ".local/qa"
}
```

Finally, replace every `om-` skill name and every `.ai/` path inside the moved override files,
your `SDLC.md`, `CODE_REVIEW.md` and `AGENTS.md`, and delete the now-empty `.ai/` directory. Any
old `.gitignore` rule for `.ai/qa` can go.

## Re-syncing the tracker descriptor

The shipped descriptors live in `skills/xez-setup-agent-pipeline/references/trackers/`
(`github.md`, `linear.md`, `jira.md`, plus `TEMPLATE.md` for custom providers). Your installed copy is
`.xezar/pipeline/trackers/<tracker>.md` in the consuming repository.

```bash
# 1. See what changed (installed vs shipped)
diff .xezar/pipeline/trackers/github.md <path-to-skills>/xez-setup-agent-pipeline/references/trackers/github.md

# 2a. No local edits (the diff shows only additions from the template): just copy
cp <path-to-skills>/xez-setup-agent-pipeline/references/trackers/github.md .xezar/pipeline/trackers/github.md

# 2b. Local edits present: merge the new operation sections into your copy,
#     keeping your customized commands – the operation headings (#### <name>)
#     are the merge units.
```

`<path-to-skills>` is wherever the skills are installed for your agent, e.g.
`~/.claude/skills`, `~/.codex/skills`, or a vendored checkout inside your repo.
Re-running `/xez-setup-agent-pipeline` also refreshes the descriptor, but plain-copies it –
prefer the diff-and-merge route when you have customized operations.

For the shipped `linear` or `jira` split provider, substitute its filename in the commands
above and repeat the diff for the companion `.xezar/pipeline/trackers/github.md`. The primary descriptor owns
issues; the companion owns repository, PR, review, CI, and PR-label operations, so both copies must
stay current.

For a **custom tracker** (`.xezar/pipeline/trackers/<name>.md` written from `TEMPLATE.md`): diff the new
`TEMPLATE.md` against the version you built from, and implement any newly added operations for
your tracker.

Browser descriptors use the same process. Shipped copies live under
`skills/xez-setup-agent-pipeline/references/browsers/`; installed copies live at
`.xezar/pipeline/browsers/<provider>.md`. Diff and merge by `### <operation>` section, or
re-run `/xez-setup-agent-pipeline` to choose and install a provider while
preserving the rest of the config.
