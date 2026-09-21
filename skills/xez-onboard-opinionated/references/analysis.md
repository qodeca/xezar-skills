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

**Infer from the branch set, and show the inference.** One long-lived branch is trunk-based, two is
a two-branch flow; say which you concluded and from what, on the confirmation screen, so the owner
corrects a wrong reading in one click. What must **not** happen is inferring the model from an `if:`
condition in a release workflow: that is a description of one job, not a rule, and it was the
reason this was an interview question for one release.

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

Look for signs of a user interface: web routes, components, a stylesheet, a frontend build step —
**and a command line**. A CLI's command names, flags, help text, output shape and exit codes are
the surface its users touch, and they are designed or they are accidents. So a project that ships
a CLI proposes the gate **on**, the same as one that ships screens. Then let the owner confirm,
because only they know what is coming.

**The whole design half is installed regardless of the answer**: the gate, its four labels, the
designs directory, the design skill and the design review workflow. A backend can gain a UI
later and the configuration should already be complete.

**Where documents live is read here too.** Every document the setup or its workflows commit goes
under `docs/` — the design system, the designs, architecture, spikes, runbooks, deprecations,
performance notes. Look for folders the project already uses for any of these, at the root as well
as under `docs/`, and propose what was found; where nothing was, propose the default from
`references/write.md` §2. An existing folder is never moved by this skill: the key records where
it is, and moving it is the owner's change.

The accepted cost is real and is handled by writing, not by omission: on a UI-less project part
of the setup sits inert, and inert configuration invites the belief that it is enforcing
something. So the generated process document states the position in one plain sentence, says all
the parts are installed regardless, and gives the one line that flips it. Nobody should be able
to read a sleeping rule as an active one.

## 4. What wakes the sleeping workflows

Four readings, each a proposal for the facts screen and nothing more. Finding none is ordinary and
is written down as `[]` or as the default, never as a guess.

- **The browser tool.** Probe for each tool the kit ships a browser descriptor for
  (`kit/pipeline/browsers/`). One found → propose it. Both → the owner picks. None → say so: design
  review and the browser half of UI-test authoring will report "not verifiable here" on this machine.
- **Deploy and rollback workflows.** File **names** in `.github/workflows/` that say deploy,
  release-to or rollback. Beside each name, two mechanical facts: whether it declares
  `workflow_dispatch`, and whether that trigger has a `sha` input (`references/write.md` §2 says
  why the guard needs both). Nothing else in the file is evidence of anything.
- **Locales.** Locale folders or files the project already has (`locales/`, `i18n/`, `*.po`,
  `messages.<tag>.json`). Propose the tags found; never a tag the project does not have.
- **Documents.** Covered in §3. Performance budgets are never read off anything: they start `[]`.

## 5. Agent tools, accounts and models

Three steps, in order:

1. **Which agent tools are installed** — probe each candidate for its version. Absent is
   ordinary; record it and move on.
2. **Which accounts or profiles each tool has**, and **which models each supports** — ask each
   tool to **list its models**, not only for its version and its default. Seen working:
   `opencode models` and `pi --list-models`. Claude Code and Codex had **no** list command when
   this was written — for those, read the model names the tool's own `--help` and config file
   mention, and put them on the facts screen marked "read from config, please confirm". Never run
   a bare subcommand to find out: on one tool `models` was not a command and opened a chat
   instead. Record each result as `<tool>/<model>`, cloud or local, sees pictures or not — that
   list is what the routing screen ranks. The first test classed
   two tools as "local, advice only" from their default model; both also reached a cloud model,
   and the routing question had to be asked twice. Note **which login this session itself runs
   on**: it is the likeliest leader login, and a list of candidates that leaves it out makes the
   owner type it. Read the engine's account registry for ids and providers — the project's **and** the machine's
   global one, because the first can be empty while the second is not (`references/interview.md`
   screen 3). A tool's built-in login has no registry record, so an id with no record is a
   question for the owner, not an error. Note that not every tool can hold multiple
   profiles — at least one keeps its credentials outside the profile directory, so it has
   exactly one account whatever the registry suggests.
   **OpenCode is recorded and not proposed.** When the probe or the registry finds it, note that
   it is there; it is never offered as a lane or put in a chain, and `references/verify.md`
   switches it off for this project. The report says "found, switched off" with the call that
   turns it back on, so the owner meets a decision and not a disappearance.
3. **Nothing is read from a credential store.** Which profiles exist and which models they
   support is configuration; what is inside them is not. Record ids, providers and model names,
   and no value from either.

The routing table is then **generated from the owner's answers** rather than copied from
anywhere. Shipping a table naming accounts that exist on one machine guarantees a first dispatch
to an account that does not exist on this one.

## 6. The state the setup lands on

Four read-only looks at the project as it is today. Each one is a finding for the preview, and
each was found the hard way in the first test:

- **Is the base branch green right now?** Tracker operation **list-runs** on the base branch, and
  the jobs of the latest run. A check that is already red — an audit step that fails on a new
  advisory, say — is not this setup's fault, and it will fail the setup pull request, then block
  every later one the moment protection requires it. Say so in the preview, and propose fixing it
  in its own small pull request **first**.
- **What runs in CI but not in the proposed gates?** A step CI runs and no local command covers
  (a dependency audit, a licence check) is where "green here, red there" comes from. List them.
- **Does a linter, a formatter or a licence check scan the whole tree?** The setup adds
  `.xezar/`, `.claude/`, `.agents/` and `.local/`. A formatter that scans them turns the
  project's own format check red on day one; a licence tool that needs a declaration per file
  needs one for the kit's folders, which keep the collection's licence, not the project's.
- **Does an update bot target the default branch while work lands on another?** Note it; the
  owner decides.

## 7. What analysis must not do

- **No writes.** Not a directory, not a placeholder, not a `.gitkeep`.
- **No network calls** beyond reading the repository's own remote.
- **No claim beyond what was read.** "I did not find a frontend build in the files I read", not
  "this project has no UI". The difference decides whether the owner checks the proposal or
  trusts it.
