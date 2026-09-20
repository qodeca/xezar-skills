# Analysis

Called from step 2. Read-only from beginning to end: it reads files and asks the machine what it
has, and writes nothing. Everything it produces is a **proposal** carried into the interview
with the evidence behind it.

## 1. The branching model

Never assume a default branch name. Three things to establish:

- **The default branch's real name**, read from the remote. It may be `main`, `master`, or
  something else entirely. Read it; do not guess it from a workflow file.
- **Whether a second long-lived branch exists** (an integration branch, a staging branch, a
  release series) and which one pull requests actually target.
- **Which model is in use** — trunk-based, a two-branch flow, release branches. This decides
  what `baseBranch` means in both config files, which branch gets protected, and where a release
  runs from.

**Ask, do not infer.** A project's branching convention often exists only inside an `if:`
condition in a release workflow, which is a description of one job rather than a rule. Propose
what the remote says and let the owner state the model.

Whatever is settled goes into config. It never becomes literal text in a skill or a generated
instruction, because a hard-coded branch name is exactly what the portability gate rejects.

## 2. Gate commands

Read whatever build files exist — a package manifest, a Python project file, a Rust manifest, a
Go module file, a Makefile, or others — and derive the likely typecheck, lint, test and build
commands. Then **show the list and ask**.

Three rules:

- **Propose, never impose.** On an unusual or mixed-language repository the proposal will be
  wrong; the owner corrects it before it is written, not after.
- **Never invent a placeholder.** Nothing derivable → "no validation command found", and ask.
  An echoed suggestion pretending to be a check is a gate that enforces nothing while looking
  like one.
- **Detection is never trusted on its own.** The writing half's smoke test proves the confirmed
  commands actually run. That is the check; this is the proposal.

The confirmed list is later written to every place the project binds it — the pipeline config's
validation commands and the gate script's command array — **generated in one pass from one
answer**, so a new project starts with those files agreeing. In the source project that list is
bound by convention across roughly eight files, and convention drifts.

## 3. The design gate's starting position

Look for signs of a user interface: web routes, components, a stylesheet, a frontend build step.
Propose the design gate on or off accordingly — then let the owner confirm, because only they
know whether a UI is coming.

**The whole design half is installed regardless of the answer**: the gate, its four labels, the
designs directory, the design skill and the design review workflow. A backend can gain a UI
later and the configuration should already be complete.

The accepted cost is real and is handled by writing, not by omission: on a UI-less project part
of the setup sits inert, and inert configuration invites the belief that it is enforcing
something. So the generated process document states the position in one plain sentence, says all
the parts are installed regardless, and gives the one line that flips it. Nobody should be able
to read a sleeping rule as an active one.

## 4. Agent tools, accounts and models

Three steps, in order:

1. **Which agent tools are installed** — probe each candidate for its version. Absent is
   ordinary; record it and move on.
2. **Which accounts or profiles each tool has**, and **which models each supports**. Read the
   engine's account registry for ids and providers. Note that not every tool can hold multiple
   profiles — at least one keeps its credentials outside the profile directory, so it has
   exactly one account whatever the registry suggests.
3. **Nothing is read from a credential store.** Which profiles exist and which models they
   support is configuration; what is inside them is not. Record ids, providers and model names,
   and no value from either.

The routing table is then **generated from the owner's answers** rather than copied from
anywhere. Shipping a table naming accounts that exist on one machine guarantees a first dispatch
to an account that does not exist on this one.

## 5. What analysis must not do

- **No writes.** Not a directory, not a placeholder, not a `.gitkeep`.
- **No network calls** beyond reading the repository's own remote.
- **No claim beyond what was read.** "I did not find a frontend build in the files I read", not
  "this project has no UI". The difference decides whether the owner checks the proposal or
  trusts it.
