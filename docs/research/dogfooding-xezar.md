# What dogfooding taught us: ideas to bring into this collection

**Written:** 2026-09-20. **Source:** the `qodeca/xezar` product repository at commit `f416e1ae`.
**Status:** findings only. Nothing here is decided, and recording a candidate authorises no work.

## Read this first

This collection ships 39 skills that install into any software project. The Xezar product
repository is where those skills get used on real work every day. That daily use is called
**dogfooding** – eating your own cooking.

Over months, the product repository grew a stricter way of working than this collection
ships. It did not come from a design session. It came from things going wrong: a merge that
took someone else's test results, a review that approved code nobody had run, an agent that
retried the same broken fix six times, 180 test processes starving each other on one laptop.
Each time, somebody wrote down a short rule and the incident behind it.

Most of those rules are not about the product. They would help any team.

This report lists all of them. It says what goes wrong without each one, what Xezar does,
**what we have today**, and what it would cost us here. It is ranked, so you can start at the
top and stop when you run out of time.

Two warnings before you read on.

- Some items clash with decisions we already made on purpose. Those are marked. A clash is
  not a reason to skip the item; it is a reason to decide again, out loud.
- Some items would break a promise we made to every repository that already installed these
  skills. Those are marked too. See "Contract warnings" near the end.

## The five ideas behind all of it

Forty-odd items is a list. Five ideas is something you can hold in your head. Almost every
item below is one of these five, applied somewhere.

1. **Unknown is never a pass.** A command that was skipped. A log that went missing. A
   scanner that could not run. A check nobody could decide. None of these is green. They are
   unknown, and unknown blocks.
2. **Evidence belongs to one commit and one named source.** A verdict is about one exact set
   of bytes. No commit named, no evidence. No link, no claim.
3. **Write it down where the next session will look.** Memory does not survive a new session,
   a compaction, or a switch to a different model. A rule that lives only in a chat is not
   recorded.
4. **Two copies of one fact get checked, not trusted.** Wherever the same thing is written
   twice, something asserts the two copies agree.
5. **Every rule carries the incident that produced it, including the cost.** That is why
   these documents survive. A future reader can judge whether a rule still applies, instead
   of deleting it as noise.

## Jump index

- [Tier 1 – do first](#tier-1--do-first) (items 1–7): small, local to this repo, breaks nothing.
- [Tier 2 – the core](#tier-2--the-core-of-what-dogfooding-taught) (items 8–19): the real lessons.
- [Tier 3 – things we cannot do at all](#tier-3--things-we-cannot-do-at-all) (items 20–25).
- [Tier 4 – worth doing, no rush](#tier-4--worth-doing-no-rush) (items 26–53).
- [Tier 5 – generic, but probably not worth it for us](#tier-5--generic-but-probably-not-worth-it-for-us).
- [What not to copy](#what-not-to-copy).
- [Contract warnings](#contract-warnings).
- [If you ever sync the two repos](#if-you-ever-sync-the-two-repos-go-one-direction-only).
- [Glossary](#glossary).

## How to read an item

Every item answers four questions, in this order:

1. **The problem** – what goes wrong without it.
2. **What Xezar does** – with the file it lives in.
3. **Today here** – what this collection already has. Sometimes the answer is "most of it".
4. **What it would cost** – where the change lands, and what it would break.

---

## Tier 1 – do first

Small, local to this repository, and none of them changes a promise we made to anyone.

### 1. A link checker

**The problem.** We cross-link 39 skills, 40 skill cards, and hundreds of pointers into
`references/` files. Nothing checks that those links still resolve. A moved file breaks a
skill silently.

**What Xezar does.** `scripts/check-links.mjs` – 38 lines, no dependencies, no network, runs
in about 50 milliseconds. It walks the docs tree and fails on a broken relative link or a
missing heading anchor. It is wired into the repository check step.

**Today here.** `scripts/lint.sh` resolves `references/` pointers, but only for four file
types, and it checks nothing else. No general link check exists.

**What it would cost.** One new script and one line in the CI workflow. Nothing else moves.

### 2. Harden the CI workflow

**The problem.** Our only workflow runs with default permissions, has no timeout, no
cancel-on-new-push, and pins its checkout action to a moving tag. Any of those is a bad day
waiting to happen.

**What Xezar does.** Pins every action by full commit hash with a version comment beside it.
Sets explicit permissions and a concurrency group. Justifies each timeout from a real
measurement in a comment. Two more habits worth stealing: untrusted values are passed through
an `env:` block rather than substituted straight into a shell line, because a repository path
is content someone else wrote; and a **job name is treated as a claim** – one job was renamed
because its old name promised browser coverage that job did not actually run.

**Today here.** `.github/workflows/lint.yml` has none of the four. The checkout action is
unpinned.

**What it would cost.** One file. Our own workflows are explicitly outside the compatibility
contract, so nothing downstream notices.

### 3. Check the copies instead of trusting them

**The problem.** Our list of validation commands is written **three** times: in
`.xezar/pipeline/config.json`, as eight steps in `.github/workflows/lint.yml`, and in
`SDLC.md`, which itself says to keep them in step. Nothing binds them. The day they drift,
CI runs a different gate than the skills do, and nobody finds out.

**What Xezar does.** Two things. A test asserts the gate list equals the configured command
list, in order. And its catalog check byte-compares a **marked section** – it splits each
skill file on a `## Shared contract` heading and fails when one copy differs, while leaving
the rest of each file completely free.

**Today here.** Nothing binds the three copies. As for the duplicated step files, our rule is
to *ask a human* to sync them. Worth knowing before anyone proposes a whole-file check: our
38 `rules.md` copies are 27 different files, and all 37 `agentic-setup.md` copies differ from
each other. That is by design – each carries a "specifics" section. The only thing uniform
across 37 copies today is the emoji glossary line. So the marked-section idea fits us
exactly; whole-file sameness does not.

**What it would cost.** A small test. One caution: a `.mjs` file placed under `references/`
is invisible to our lint's pointer check, which only handles `.md`, `.py`, `.sh` and `.png`.

### 4. Say what a review is allowed to look at

**The problem.** A review that does not name a commit is not evidence. Neither is one that
leans on a gate run taken at an earlier commit, or on a command whose log nobody kept.

**What Xezar does.** Its review rules open with what a review **consumes**: the exact commit,
the gate result for *that* commit, and the security result. A gate run at an earlier head, a
skipped command, or a missing log is **unknown, not green**.

**Today here.** Our review rules open straight into priorities. Nothing says the verdict must
name its commit.

**What it would cost.** One document. No parsed format changes. Note that
`xez-setup-agent-pipeline` also writes a review-rules file into consumer repositories, so the
template copy needs the same edit.

### 5. Define the dispositions we already demand

**The problem.** A review finding with no recorded outcome leaves the review open forever,
and nobody can tell "we fixed it" from "we decided not to" from "nobody looked".

**What Xezar does.** It names a closed set for minor findings and nits: *fixed in `<commit>`*,
*disputed, with the evidence*, or *proposed for deferral, naming the issue that will carry
it*. Plus two rules: **silence is not a disposition**, and **the author disposes, the reviewer
confirms**. Blockers and majors follow a different rule – they are fixed and re-checked at a
named commit before the verdict flips.

**Today here.** Twelve of our files already tell a skill to "preserve each finding's
disposition". Nowhere do we say what a disposition may be. So the gap is narrower than it
looks, and easier to close: write down the closed set.

**What it would cost.** Our review rules plus the `review-report.md` file, which exists in
seven skills. Our contract says an edit to a shared step file asks about syncing the others.

### 6. Label hygiene, without making labels fatal

**The problem.** A process document that tells someone to apply a label the repository never
created sends them into an error.

**What Xezar does.** Keeps a reproducible list that creates the whole label set, and refuses
to name a label before that list creates it.

**Today here.** We have the guards. What we lack is the create-list habit.

**What it would cost.** Small. But do **not** copy the second half of the product's rule –
that a missing label stops the flow. We deliberately decided the opposite: a missing label is
a logged skip, and turning labels off means no label work at all. Copying the strict version
would break that.

### 7. Never kill a process by matching its command line

**The problem.** A skill's entire text is passed to the agent as one long argument. So a
pattern match against running command lines hits **every** agent on the machine, not just
yours. Somebody found this out the hard way.

**What Xezar does.** States the rule with the reason, and uses a saved process ID instead.

**Today here.** Nothing says it.

**What it would cost.** One paragraph. It is tiny, it applies to every project, and it is a
safety rule.

---

## Tier 2 – the core of what dogfooding taught

### 8. Unknown is never a pass

**The problem.** Each of these looks like success if you squint: a scanner that could not reach
the network, a test suite that could not start a browser, a check that ran on the wrong machine,
a scan that read nothing and found nothing. Treating any of them as green ships the bug.

**What Xezar does.** Five mechanisms, one idea.

- The security scan has **four** outcomes – pass, findings, unknown, not applicable – and only
  the first is a pass. Unknown is never rewritten to clean.
- It runs as **gate 2**, straight after install and ahead of every gate that produces a quality
  signal. So "security was resolved first" is the order the runner executed, not a claim the
  author typed. Sealing refuses a run carrying no security result.
- A scan that produced nothing must not count clean. There is a test named for exactly that
  case, `empty-scan-green`.
- A checker that cannot decide in this environment exits with its own code, distinct from pass
  and from fail.
- A browser suite that could not start reports "skipped", loudly, with a banner saying **this is
  not a pass** – and CI keys on that marker string, not on the exit code.
- A read-only auditor answers "is this evidence valid" and "is it usable here" separately.

**Today here.** We already use a distinct exit code for "cannot decide" in one place:
`xez-pipeline-retro/references/classify-runs.sh` exits 3 when `jq` is missing. The idea is
present; it is not a rule.

**What it would cost.** Mostly writing. Our tracker and browser operations have published exit
behaviour, so this is a convention inside our own scripts, not a change to those operations.

### 9. Tie the evidence to one commit, and merge only that commit

**The problem.** A green result belongs to one set of bytes. Push once more and the result
describes code that no longer exists. Two runs finishing at the same time can silently
overwrite each other's verdicts.

**What Xezar does.** Records which commit each gate ran against, and the merge step re-checks
that the branch still points there. When two runs finish together, each claims its slot by
**creating a directory** – the operating system lets exactly one of them win, so two runs can
never claim the same slot. Reading back always takes the newest slot, so a later failure
cannot hide behind an earlier pass. The squash commit then records who reviewed, which run,
which labels and why, and which CI run.

**Today here.** Our PR bodies carry status lines. Nothing binds a verdict to a commit, and
nothing re-checks the head at merge time.

**What it would cost.** Real work. It is the foundation the next few items sit on.

### 10. Acceptance criteria are an input, not something you invent at the end

**The problem.** If the author writes the criteria after the code, the criteria describe the
code. That is a test that cannot fail.

**What Xezar does.** Each accepted criterion carries an ID and the name of whoever accepted
it. The rule is blunt: *a file that exists, a shipped template and a changeable label are not
acceptance.* Two different questions follow, and neither stands in for the other – **did we
build what was accepted**, and **is the solution sound**. The author records the mapping from
each criterion to its evidence. The reviewer does the independent half, and says so when the
record is missing rather than inferring it from the diff.

**Today here.** Acceptance criteria appear in our definition of ready and in the spec skills.
Nothing records a mapping, and nothing splits the two questions.

**What it would cost.** A section in our process document, and a step in the review skills.

### 11. Size the work and the inputs on two different rulers

**The problem.** "Small change" gets used to mean both "few lines" and "we already know
everything we need". They are different, and confusing them is how a one-line change to
authentication ships without a plan.

**What Xezar does.** Two rulers.

- **Depth** sizes the work: *small* (one bounded surface, known behaviour), *standard* (a
  feature, or several components), *high-risk* (a trust boundary, a data migration,
  concurrency, or broad impact). Example: a typo fix is small; adding a new tracker provider
  is standard; changing how sessions are stored is high-risk.
- **Maturity** describes what the run was handed: *issue only*, *accepted analysis*,
  *complete spec*, *spec plus approved design*. Example: an issue saying "search is slow" is
  issue-only; the same issue plus a written spec with accepted criteria is a complete spec.

The rule that makes it work: **depth scales the weight of each phase, never whether a phase
happened.** And: a spec that exists but has no readable criteria and no named accepting
authority is not a complete spec. A file's existence is not maturity.

**Today here.** We have priority and risk labels, which size the *change*, not the *process*.
No depth, no maturity check.

**What it would cost.** Process document plus a check in the auto skills.

### 12. Write down what the run did, as it does it

**The problem.** A ticket has a lifecycle and we document it. One agent run inside that ticket
also has a lifecycle, and nothing records it. So when a run is resumed, or handed to a
different model, or replaced, the next one has to guess what already happened.

**What Xezar does.** Each run writes short notes as it goes: how big the job is, what it was
handed, what it decided, whether it reviewed its own work, whether it is stuck. The notes live
in a folder that survives the working copy being deleted. **One command writes them and the
same command reads them back**, so the gate that asks "is this ready" and the code that wrote
the notes can never disagree. A step that does not apply still writes a line saying so and
why – otherwise silence and "not applicable" look identical.

The shape: twelve phases; **eight** notes the readiness gate refuses to run without; four more
with their own rules.

**Today here.** Nothing like it.

**What it would cost.** A per-run folder outside our pipeline directory needs a new path key.
That is an additive change, which our contract allows, but it is not free.

### 13. Repair counters, and the clause that makes them work

**The problem.** An agent that keeps retrying the same broken fix burns money and ends up
lowering a threshold to get past the gate.

**What Xezar does.** Three budgets, two rounds each: self-review fix rounds, gate-repair
returns, and repairs of the same failing check. Each round is recorded **before** it is
applied. A retry, a model switch, a resumed run and a replacement run all **continue** an
existing count – none of them starts a fresh allowance.

The load-bearing part is the clause, not the numbers: **never bypass a counter, and never
lower a severity, a threshold or a mandatory check to get past it.** Without that sentence the
counters just teach the agent to cheat.

This also fixes a hole we share. When a run is resumed, the tool appends a step and re-runs no
command steps – so a resumed run can reach "done" having run no gates at all. Xezar has one
entry point that re-establishes identity, inputs and gates before finishing.

**Today here.** No repair budget anywhere. No resumed-run gate check.

**What it would cost.** State plus a config key. One warning to weigh: the product's rule that
*missing history blocks* would add a third hard stop to our autonomous skills, which have
exactly two today, and it would block on **absent** state – the opposite of our
degrade-gracefully habit. Adopt it as a loud warning rather than a stop.

### 14. Use fragment files instead of files every PR touches

**The problem.** A changelog is appended at the top, so every open PR edits the same lines.
The first merge conflicts all the others – and on GitHub a content conflict stops CI from
running on them at all. The same shape applies to any shared log file.

**What Xezar does.** One file per PR in a `changelog.d/` directory, named for the PR number.
No two branches ever touch the same bytes. A release step folds them all into the new version
section and deletes them in the same commit. A checker refuses a direct edit to the unreleased
section – and the refusal is about the state at the current commit, not history, so fixing a
branch never needs a rewrite.

The product applies the identical pattern a second time to its dogfooding log. That log is
worth a look on its own: it uses **four evidence levels, never mixed** – adapted (installed and
statically checked), fixture-tested (an isolated case passed), real-task verified (observed in
an actual run with evidence), and recommended (reviewed guidance justified by real results and
known limits). Its rule: *copying, or a green fixture, is not enough for a recommendation.*

**Today here.** `xez-auto-update-changelog` edits the file directly. Our own `CHANGELOG.md`
has one release and no unreleased section, so this matters more for the repositories we install
into than for us.

**What it would cost.** A convention plus a folding step. The reference version is
npm-flavoured and needs generalising before it could reach `skills/**`.

### 15. Separate the recipe from the expertise

**The problem.** This is the biggest structural difference between the two repositories, and
it explains a cost we already pay. Our workflow instructions live *inside* each skill, which is
why the same step files are duplicated up to 37 times and why our own contract calls that
duplication a "deliberate cost".

**What Xezar does.** Keeps 18 small workflow files that say what runs, in what order, and what
happens on failure. The skill says only *how to do the work*. And a review step is read-only
for a mechanical reason: it is simply **not given write tools**. Nobody has to be asked to
behave.

**Today here.** Everything is prose inside the skill. Read-only is a promise, not a mechanism.

**What it would cost.** This does not mean we should adopt workflow files. It means naming the
seam, so that the next time we duplicate a step across 37 skills we do it knowingly.

### 16. The design gate

**The problem.** QA answers "does it work". It does not answer "is this the right screen for
the job". A green QA pass hides the second question.

**What Xezar does.** A second hard merge gate beside QA, with labels for *needs design*,
*skip design*, *design approved* and *design self-verified*, plus a *design debt* backlog. The
evidence is a comment with fixed fields: reviewed commit, reviewer role, what was checked (both
themes, phone width), a verdict, and one disposition per finding – reusing item 5's closed set.
A self-verification exception mirrors our self-QA one and requires filing a debt issue.

The principle to copy is **"UI in scope is decided by the diff, not by the title"** – not the
product's concrete file paths.

The debt loop is the part most teams skip, and it is the reason the backlog does not rot. A
recorded gap becomes a real issue on three named triggers: a PR touches the files it names, two
reviews cite the same entry, or release preparation reaches it. *An entry with no date and no
issue after a release is a triage miss.*

**Today here.** We ship the UX *skills* – `xez-ux-shape`, `xez-ux-review-pr`, `xez-ux-setup`.
We do not ship the *gate*: our `SDLC.md` says the design pass "is advisory – it informs the
review, it does not hold the merge", and none of the five labels exists in the collection.

**What it would cost.** Three things must not stay vague. **Who applies "design approved"** –
our automation never applies `qa-approved`, so a second gate defaulting the other way would be
a review blocker. **A missing label degrades to a logged skip** – so the gate would be silently
off in every existing installation, looking enforced while enforcing nothing. And the label
taxonomy is a protected surface.

### 17. A merge policy small enough to check

**The problem.** Our merge rules are prose. Prose cannot be run, so nothing catches the case
where a PR carries two labels that contradict each other.

**What Xezar does.** Fourteen lines. Reads a PR's labels on standard input, writes one of three
answers: passed, refused, or **unavailable** when the labels could not be read at all. It
refuses conflicting pairs, refuses a gate label without its approval, and refuses a handful of
labels **the repository deliberately does not define** – a fail-safe for anyone who forks it
and does define them.

**Today here.** `xez-merge-buddy` and `xez-approve-merge-pr` carry the same rules as paragraphs.

**What it would cost.** Small, but see the shipping caution in item 3.

### 18. Collect every gate failure, do not stop at the first

**The problem.** A gate that stops at the first failure makes the author fix one thing, wait,
and discover the next. Three rounds where one would do.

**What Xezar does.** *Ordinary command failures do not skip later commands; every outcome is
collected and any failure prevents a passing verdict.* The same idea appears in its review
rules: a failing check and a merge conflict are collected as findings and reported **together**
with the full code review, never instead of it.

**Today here.** Our gate runs stop at the first non-zero exit.

**What it would cost.** A change to how the validation gate is run and reported.

### 19. A committed config must not carry machine-specific values

**The problem.** A config file that is committed travels to every checkout. A memory ceiling or
a parallelism cap is a property of one machine.

**What Xezar does.** Refuses both keys in its committed config. One because the scheduler
ignores per-repository values anyway, the other **even though it is honoured** – the reason
given is simply that a memory ceiling belongs to a machine, not to a repository.

**Today here.** Our config has no machine-shaped keys yet. Writing the rule down now is how it
stays that way.

**What it would cost.** A line in our decisions document and a check.

---

## Tier 3 – things we cannot do at all

Four of these want a new skill. Two are just rules for documents we already have.

### 20. Long-running coordination state (new skill)

**The problem.** A campaign of related issues runs over many sessions. Session memory does not
survive a new session or a context compaction. So standing rules, live state and the owner's
decisions get rebuilt from memory, badly.

**What Xezar does.** One note per campaign, kept where a deleted working copy cannot take it
with it. **Reading it is the first act of a new session and the first act after compaction,
before dispatching any work** – and the session says which file it read. **Updating it is the
last act of handling an event, before reporting to the owner.** Agent memory may hold a
*pointer*, never the only copy. Say "unknown" rather than leaving a field out. The note is a
coordination aid, never evidence.

When one file gets too big it becomes a folder: live state rewritten and length-bounded,
history append-only, only the small files auto-loaded. The reason is stated – the file is
reloaded whole at every compaction, so its size compounds.

A session-start hook loads it, carefully guarded: silent for subordinate agents, printing
**nothing** rather than an empty object, and always exiting 0 so a broken hook cannot break
session start.

**Today here.** Nothing. "Campaign" in this collection means a marketing campaign.

**What it would cost.** A skill plus a template. Caveat: the hook is a Claude Code feature and
this collection installs for many agents, so the note is the portable half.

### 21. Release execution (new skill)

**The problem.** We draft a changelog and stop. The actual release – tag, publish, verify – is
unwritten, which means it is done by hand, differently each time.

**What Xezar does.** Never publish by hand, never push to the base branch, never force-push.
Append the evidence trail **as you go**, so a killed session can resume. Every wait on a remote
system has a bounded deadline and a named resume point. Publishing is dispatch-only behind a
reviewer gate, uses token-free publishing, and re-runs the full gate on the exact revision
before packing and installing the artifact as a test.

The detail worth stealing: the publishing trust binds the repository **and the workflow
filename**. Rename that file, or copy the publish step somewhere else, and the publish breaks
instead of quietly succeeding from an unexpected place.

**Today here.** `xez-auto-update-changelog` only.

**What it would cost.** A skill, and heavy generalising – the reference version is npm-specific
throughout.

### 22. Dependency maintenance (new skill)

**The problem.** Dependency bumps are the most frequent change class nobody has a procedure for.

**What Xezar does.** Attributes an update to the workspace that actually imports it.
Fingerprints the whole dependency surface – lockfile, manifests, registry config, patches,
runtime versions – before and after. Uses a reproducible install. Refuses broad upgrades.

**Today here.** Nothing. We have a `dependencies` label and no skill behind it.

### 23. Business analysis as a read-only gate (new skill)

**The problem.** Work starts before anyone has decided it should.

**What Xezar does.** A read-only pass before implementation with five fixed outcomes: analyse
further, implement, spec first, defer, reject.

**Today here.** `xez-brainstorm` is a divergent conversation, not a structured verdict.

### 24. Research with citations (rule, not a skill)

**The problem.** A language model asked to research will produce confident, well-formatted,
invented sources. It is the failure mode most likely to reach a decision-maker unchallenged.

**What Xezar does.** Three rules. **Say whether web access worked** – the first line of the
document says so, and if it did not, every claim is marked unverified rather than quietly
becoming repository-only work under a research title. **No link, no claim** – every external
claim carries the exact address fetched and the date read, and a search-result snippet is not a
read. **Never invent** a source, address, title, date, version, quote or number, because a
fabricated citation is worse than an admitted gap – nobody downstream can tell it from a real
one.

**Today here.** Nothing states it.

### 25. Docs maintenance (rule, not a skill)

**The problem.** Someone edits a generated file, and the next build erases the edit.

**What Xezar does.** Find which documents are canonical and which are generated, and never edit
a generated copy. Also: historical numbered specs are labels, not live paths.

---

## Tier 4 – worth doing, no rush

### Review discipline

#### 26. Name a falsifiable experiment before the reviewer opens the diff

The product's own record says that over one period, **every** real defect found came from a
reviewer running an experiment the brief had named in advance: break a different link, count
the hunks, reproduce the red proof on a different file. Reviews without one found nothing.
Today here: none of our review skills asks for an experiment.

#### 27. A finding from a reading task is a claim until reproduced

On one day, two of three findings produced by reading alone were false. A merge-blocking claim
is re-proven on the base branch with a throwaway test. A claim that already carries its own
proof needs a careful read, not a second proof. Today here: our review skills emit findings
from reading and present them as facts.

#### 28. Separate the owner's exact words from your reading of them

Never attribute a state – parked, approved, deferred – unless the owner said that word. In a
question put to the owner, the option **label** is theirs; its description is yours. This
applies directly to the assumptions comments our autonomous skills post.

#### 29. Two review rules we lack

**Graceful degradation.** Write down what the product still promises to do when something is
missing – no network, no tracker, no repository – and treat a diff that turns one of those
paths into an error as a blocker.

**The absent-default rule.** Changing what an **absent** key resolves to is a behaviour change
for every file already on disk. There is no parse error, no failing test and no diff. Two
questions make it safe: does an explicit stored value still survive, and is the new default the
safer of the two?

### Testing

#### 30. Prove the test fails without the fix, and name the break

Every new behaviour test names a concrete break – the file, the line, and the change: a flipped
condition, a swapped operator, a deleted call – and quotes the assertion that actually failed.
A test written after the diagnosis passes against the bug more often than anyone expects, and a
green-either-way test is how the same regression ships twice. Guard tests that pass both ways
are worth keeping; the record says which kind each one is.

Today here: `xez-issue-create/references/verification.md` already has a "named break that must
turn it red" column. The gap is that it lives in one skill instead of our review rules.

One hazard to fix before this reaches any skill: the product's recipe stashes the source files,
runs the test, then unstashes. A run that dies in the middle leaves the user's work stashed.
Use a separate working copy or a saved diff instead.

#### 31. Verify fixtures against the real shape, never your own assumption

Real recorded input plus exact expected output, replayed the way production drives the code,
round-tripped through JSON so a stray undefined value fails loudly, compared strictly. And:
when adding a fixture, cite the source it came from. A fixture that encodes your guess is worse
than no fixture, because it makes the bug green. Our `test-browser-providers.mjs` and
`test-tracker-providers.mjs` are a weaker version of this already.

#### 32. A parity matrix as a test

Capabilities down one axis, implementations across the other, asserted – so degradation is
recorded per capability, never per implementation, and *a new provider is not done until it
produces every row*. Our tracker and browser provider abstractions are exactly this shape.

#### 33. Rank coverage by behaviour, not by file percentage

Measured coverage is supporting evidence, never the ranking. A behaviour no gate protects
outranks a behaviour a suite covers but CI never runs. The inventory carries a **"runs in CI?"**
column – that column is what caught 35 browser tests that existed and CI never ran. Tag every
claim as measured or inferred, and scope every absence claim to what was actually searched.

The copyable policy: coverage is measured and deliberately **not** a gate, with exactly one
high-risk area carrying a hard floor, and exemptions written down or they do not exist.

#### 34. A mock mode so a contributor needs no credentials

The product ships a dry-run mode that replaces the agent tools with a mock, so someone can
exercise the whole application with no login. For this collection the equivalent is a
fake-tracker mode that exercises the pipeline without a real repository.

### Guards and allowlists

#### 35. An allowlist entry costs four fields and a negative test

Name the exact location and text fragment, the matching rule, the reason, and the review
reference. Add a negative test proving a violation sitting right beside it still fails. Never
exempt a whole file or paragraph, and never widen a shrinking allowance. Today here:
`scripts/lint.sh` asks only for "a reason".

#### 36. Test the guards by deliberately breaking them

Each break is named so it can be re-run: security-after-quality, stale-security-head,
empty-scan-green, phase-hole, template-is-acceptance, forged-counter. A guard nobody has seen
refuse is a guard nobody has tested.

### Documents

#### 37. Every document names which other document wins

One line. *Where they disagree, the code wins – the fixtures and the parity test are
executable, the prose is not.* Elsewhere: *where they disagree, the requirements win.* Our
`AGENTS.md`, `SDLC.md` and config triangle states no precedence at all.

#### 38. Keep rules short and park the stories elsewhere

The best structural idea in the whole product repository, and it is one sentence: *the rules
live there because a session needs them; the narratives live here because a session only needs
them when a rule is disputed.* That is why our `AGENTS.md` keeps growing – it carries both.

#### 39. Seven rules for changing something that already works

Replacing working behaviour is the highest-risk change there is, and it fails the same way
every time: the new thing is correct, the tests are green, and the default path quietly lost a
guarantee nobody wrote down.

1. **Name what the old mechanism was load-bearing *for*,** not what it was for. Before deleting
   a timer, lock, cap or timeout, find everything that reaches a finished state *because* of it.
2. **A replacement that ships off is not a replacement.** Diff the default path, not the
   feature. With every new switch at its shipped default, what does the old scenario do now?
3. **Enumerate the exits from every state you add or keep.** "Who fires this?" finds these bugs
   in one step. A state whose only default exit is a human typing something is a dead end.
4. **Grep the type, not the field.** When you add a field a delivery path reads, add it at every
   construction site in the same commit, or route them all through one helper.
5. **A fail-open helper needs a guarantee that its input was populated, or it lies.** Against
   empty input, "we never loaded the list" and "no match" are the same branch.
6. **Prove the regression test fails without the fix.** See item 30.
7. **Read the run history before theorising, and cite it.** "It worked in the last version" is
   a testable claim, not an opinion.

#### 40. Zero config as a design law

*When a feature seems to need configuration, the design is wrong. Discover it, or default it.*
Never trade a working default for a switch. New state may be **written**, never **required** –
state a user must author, migrate or repair is not state, it is configuration, and it needs a
reason. Features that widen exposure or cost are off by default, so the zero-config default is
also the safe default. Degrade to a smaller working product; never fail to start. And any
change to an environment variable updates the example file in the same commit, because an
undocumented variable is a bug.

#### 41. An improvement register with a bar for getting in

A candidate needs a current reproduction or a named gap, the affected area, expected versus
actual, the impact, a bounded proposed change, and **a trigger to revisit**. Five statuses:
already present, qualification needed, demonstrated gap, deferred, rejected. Recording a
candidate authorises no work. The companion rule: every scope item at close-out gets exactly
one disposition – implemented, validated, deferred with a reopening trigger, qualification
needed, or rejected with a reason.

This report is itself an instance of that register, which is why every deferred item below
carries a trigger.

#### 42. A "how to add another one" checklist, written from the last real time you did it

Ten steps, each naming the exact file, with a note on which steps a gate now enforces so you
cannot forget them. Ours would be "adding a new skill":
`xez-create-skill/references/gates.md` covers about half, and there is no single registration
list.

#### 43. State the general rule once, then keep a ledger of deliberate breaks

Our compatibility document restates the required path under each protected surface. The
product states the general rule once at the top, then keeps a **dated ledger** of every
deliberate break: what changed, why it is a break rather than a migration, what did *not*
change, and what a user will actually notice. Plus a "when in doubt" escape hatch that routes
uncertainty to the high-risk label and the gates.

Small patterns from that ledger worth copying verbatim: *an older server never sends this, so a
newer client must read an absent value as false*; *omitted rather than empty, so an old consumer
sees no change*; *the condition widened, the effect did not.*

#### 44. Small documentation conventions that cost nothing

- A **status banner** at the top of a stale document that supersedes the body without rewriting
  it, plus a repository-wide rule saying which trees are not current documentation.
- A **documentation map** – one table of path, what it holds, and *who it is for*. The audience
  column is what makes it work.
- **Task-shaped headings** in a user guide ("To install", "To use the composer"), a uniform
  closing block of related settings on every page, and a version stamp per page.
- **Screenshot filenames** carrying surface, theme and width, with the version in the directory
  name – and a rule that a capture of unreleased work says so rather than pretending.
- A runbook that **opens with what your monitoring cannot see**, then gives the probe, then the
  recovery.

#### 45. Model routing is governance, not a documentation convention

Three rules, and the first is universal: **a model never approves its own work.** Nothing a
weaker model wrote merges before a strong review. A blocking claim from a weaker model does not
reach the owner unproven. Our process says automation never grants QA approval; it says nothing
about who reviews whom.

#### 46. A "you do not need the automation" table

A short table mapping each process stage to the human path, ending with *you never apply labels
yourself.* Directly relevant to us: this collection installs into other people's repositories,
and a contributor there should never need to know our skill names.

#### 47. Intake forms that feed triage

A pull-request template asking what changed, why, **how it was verified**, a three-way design
checkbox (not in scope / in scope, label applied / skipped, with the reason), and risk with its
definition written inline. Issue forms with structured fields, including a "does this change
the UI?" answer whose help text tells the **maintainer** to apply the design label at triage.

Two honest notes. The routing is a human step, not automation – the forms' own labels are fixed
literals. And issue forms are a GitHub feature our Linear and Jira providers cannot express, so
this belongs in a tracker descriptor, not in a skill.

Today here: we ship no PR template and no issue forms at all.

#### 48. A rename must not rewrite dated records

Two rename PRs in the product each had exactly one defect, and it was the same one both times.
The rule: *a dated log entry is a record of what was true then; only present-tense instructions
about where something lives now may change.* We renamed off a predecessor collection and ship
`xez-apply-upgrade-notes`, so this is ours to get wrong too.

#### 49. Derive the style guide from what the code already does

Count it and record the count as evidence: "58 of 60 headings", "130 of 130 button labels",
"134 to 1". That turns a style rule from a matter of taste into something auditable. Companion:
evidence-honesty lines a reviewer can borrow – a green source scan cannot prove target size,
contrast, focus or absence of clipping; a documented row is inventory, not proof; a screenshot
alone is not approval.

#### 50. An admission gate for anything shared

Five criteria before something enters a shared system – useful, unique, usable, consistent,
versatile – each with a "where to check" column, and *an unanswered criterion is a reason to
reject, not a formality.* Plus two-step deprecation, because *a deprecation with no replacement
is a gap, not a deprecation.*

#### 51. Worktrees do not isolate the machine, and neither does the shell

Four incidents, one shape: a real failure produced a narrow rule.

Concurrent gate runs each spawned one test worker per core. Ten runs on an 18-core machine meant
roughly 180 worker processes. Unrelated suites timed out at 909 seconds on a single file and 17
different files failed every run – which reads as flaky tests, not as starvation. The fix was a
worker cap, deliberately a no-op on smaller CI machines.

The companion rule: an agent's git helper has exactly two verbs, commit and push, and it pushes a
**named branch reference, never bare HEAD**. It was written after a push landed on the base
branch in the primary checkout.

#### 52. A security policy shaped as two lists

*Not a vulnerability – working as designed*, each entry naming the accepted risk. *A vulnerability
– a boundary we claim to hold*, **each entry naming the exact code meant to hold it.** Plus a
reporting checklist and a fourteen-day clause: if nobody answers, open a public issue whose
entire content is that you are waiting, with no details and no reproduction in it.

Today here: no `SECURITY.md`, no `CONTRIBUTING.md`, no code of conduct at all.

#### 53. Configuration and ignore files as documentation

An environment-variable example file where **every key is commented out** and each one is
preceded by prose giving the default, the precedence order, and the failure mode of a bad value –
organised into banner sections, with a dedicated section about secrets.

And an ignore file where every non-obvious rule carries a why, including **the miss that made
someone widen it** ("a narrower pattern let a hand-named log get swept into a commit"). Best of
all: a rule that protects secrets is backed by a test that fails if such a file becomes tracked.
An ignore rule is advice; a test is a gate.

---

## Tier 5 – generic, but probably not worth it for us

These would work anywhere. They are just more than we should carry.

- **The full design-system corpus** at 17 documents. A team without a dedicated design reviewer
  will produce the documents and never run the loop. *Trigger to revisit: we hire or assign a
  standing design reviewer.*
- **The 20-section design handoff skeleton.** Keep the five-status lifecycle and the
  open-questions-with-a-recommendation idea – that one is genuinely clever, because the mockup is
  already built on the recommendation, so "yes" costs nothing and "no" is a named, bounded change.
  Drop the skeleton. *Trigger: we start shipping designs ahead of implementation.*
- **The nightly nine-shard mutation testing machinery.** *Trigger: we ship executable code, not
  markdown, in a scope where a test suite could be silently wrong.*
- **A features tree of decision records.** *Trigger: our decisions document passes about 500 lines.*

## What not to copy

Take the mechanism, leave the content.

- **The agent-protocol internals** – the runner seam, event mappers, backend identifiers. Pure
  product. *Trigger to revisit: never, unless we ship a runtime.*
- **The 80 % per-file coverage number.** The product itself says the technique is general and the
  number is not. Take item 33's policy instead.
- **The concrete "UI in scope" file paths.** Take the principle in item 16; the paths are theirs.
- **The dev launcher and state-migration scripts, and the UI preferences file.** Product-shaped
  throughout.
- **The code of conduct** – standard upstream text; only the reporting contact generalises.

## Contract warnings

Several items above, if built carelessly, break a promise to every repository that already
installed these skills. Neither repository can migrate those for them.

- **The label taxonomy is protected.** Adding labels is allowed. Adding a new **hard merge gate**
  changes what merge means for every existing installation – and because a missing label degrades
  to a logged skip, the gate would be silently off there. Affects item 16.
- **Config keys ship with defaults, and nothing becomes required.** Affects items 12, 13, 16, 19.
- **Tracker and browser operations may not change inputs, outputs or exit codes.** Consumer
  repositories hold hand-edited copies of those descriptors. Affects item 8.
- **Cross-skill formats change producer and every consumer in one PR.** Affects items 4, 5, 16.
- **A new skill lands in the coverage roster in the same PR**, or lint fails. Affects items 20–23.
- **Autonomous skills have exactly two hard stops today.** Any item that proposes a third says so
  out loud. Affects item 13.
- **Skill bodies have a 20 000-character budget**, and six bodies sit within 350 bytes of it. Every
  item above that wants words lands in a `references/` file, not in a skill body. And when it lands
  in a shared step file, the blast radius is real: `agentic-setup.md` exists in 37 skills,
  `rules.md` in 38, `report-templates.md` in 29, `review-report.md` in 7.

## If you ever sync the two repos, go one direction only

**This repository is canonical** for the tracker descriptors, the label taxonomy, and the standard
`references/` step files. Our GitHub tracker descriptor is 422 lines and six operation groups to
the product's 378 and five, and carries a deprecation section the product copy does not have.

The product has also **deliberately diverged**: it collapsed our four-level priority and
three-level risk scales into single opt-in flags, with "unset means ordinary". That is a
considered decision on their side, not drift to correct.

So: read this report as a source of ideas, never as a diff to apply.

## Glossary

- **Dogfooding** – using your own tool on your own real work.
- **Gate** – a check that must pass before work moves on.
- **Head** – the commit a branch currently points at.
- **Seal** – binding a set of evidence to the exact commit it was taken at.
- **Disposition** – the recorded outcome of a review finding.
- **Depth** – how heavy the work is: small, standard or high-risk.
- **Maturity** – how complete the inputs to a run were.
- **Fragment** – one small file per PR, folded into a bigger file at release.
- **Protected surface** – something an outside repository depends on, which we may not break
  silently.
- **Blast radius** – how many files a single change has to touch.
