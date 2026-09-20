# Toolchain provider: <name>

This descriptor implements the dependency-lifecycle operations that skills name when they
need to restore dependencies, build, or move a version. The config's `toolchain.providers`
**list** selects the committed copies at `.xezar/pipeline/toolchains/<name>.md`.

It is a **list**, not a single value, because a repository commonly has more than one
ecosystem — a JavaScript front end beside a Rust service, a Python worker beside a Go CLI.
A skill runs each configured provider in order and reports each one's result separately.
An empty or absent list means no toolchain is configured, and every operation is
`not-applicable` — never `unknown`, because nothing failed to be checked.

## How to write a provider

- **An operation is defined by its postcondition, never by a verb.** `install` is the
  clearest trap in this family: `npm install` adds dependencies, `cargo install` installs
  global binaries into the user's home, and `mvn install` publishes to a local repository
  with no dependency phase at all. Three different actions behind one word. So the
  operation is **restore-dependencies**, defined as *"after this runs, the dependencies
  the manifest declares are present locally at the versions the lockfile pins"* — and each
  provider writes whatever command reaches that state.
- **An operation a provider genuinely cannot perform is `not-applicable`, with a reason.**
  Not a silent skip, and not `unknown`. Cargo has no package lifecycle scripts, so
  "suppress lifecycle scripts" is not-applicable there rather than a gap.
- **Enumerate every exit code the tool can return.** A code you did not enumerate is
  `unknown`, never `findings` and never `pass`. This matters more than it looks: `npm
  outdated` exits **1** when anything is out of date, which a naive reading calls a
  failure; `osv-scanner` exits **128** when it found no packages at all, which a naive
  reading calls a clean scan.
- **Never echo the tool's stdout into a report.** It is untrusted content like any other.
  Report the parsed fields and the status.
- **Resolve the tool from `PATH` or an absolute path, never from a repository-local
  binary directory** on any path where the result gates something. Otherwise the change
  under review supplies the tool that judges it.

## Prerequisites

<the tool(s) this provider needs, the minimum version, and how to verify — the
**toolchain-check** section below>

## Output grammar

Every operation prints `NAME=value` lines on stdout. Consumers **split on the first `=`**
and **never source the output as shell**; a value may contain spaces, quotes or `$(...)`.
Unknown names are ignored, so the grammar can grow.

Every operation prints these three, and may add its own:

```text
TOOLCHAIN=<name>
<OP>_STATUS=pass|findings|unknown|not-applicable|evidence-unavailable
<OP>_NOTES=<one line, no newlines; empty when there is nothing to say>
```

`<OP>` is the operation name in upper snake case: `RESTORE`, `BUILD`, `OUTDATED`,
`UPDATE`. Statuses are hyphenated because the consumer is POSIX `sh`, where an unquoted
`case` word-splits on a space and silently matches the wrong branch.

## Operations

### toolchain-check

Postcondition: the caller knows whether this provider can run here at all.

Verify the tool exists and is new enough for the commands below. A missing tool is
`evidence-unavailable` — it is not the repository's fault and not a pass.

```text
TOOLCHAIN=<name>
TOOLCHAIN_STATUS=pass|evidence-unavailable
TOOLCHAIN_COMMAND=<absolute path or command name>
TOOLCHAIN_VERSION=<version or unknown>
TOOLCHAIN_NOTES=<the install command when the tool is missing>
```

### restore-dependencies

Postcondition: the dependencies the manifest declares are present locally at the versions
the lockfile pins, and **package lifecycle scripts did not run**.

Lifecycle-script suppression is not optional hygiene. Restoring dependencies executes code
published by third parties, in a checkout that may be a pull request from outside the
project. Where the ecosystem has no lifecycle scripts, say so and report that half as
`not-applicable`.

```text
RESTORE_STATUS=…
RESTORE_LOCKFILE=<path, or none>
RESTORE_SCRIPTS_SUPPRESSED=yes|no|not-applicable
RESTORE_NOTES=…
```

A lockfile that had to be modified to restore is `findings`, not `pass`: the point of a
lockfile is that restoring does not change it.

### build

Postcondition: the project's build artifacts exist, or the failure is reported.

A repository with no build step is `not-applicable`, not `pass` — there is a real
difference between "it built" and "there was nothing to build", and a reader deciding
whether to trust a change needs to know which.

```text
BUILD_STATUS=…
BUILD_COMMAND=<what was run>
BUILD_NOTES=…
```

### outdated

Postcondition: the caller has the declared dependencies whose installed version is behind
the latest resolvable one.

```text
OUTDATED_STATUS=…
OUTDATED_COUNT=<number, or unknown>
OUTDATED_<n>=<name>|<current>|<wanted>|<latest>
OUTDATED_NOTES=…
```

`OUTDATED_STATUS` is `pass` when nothing is behind and `findings` when something is —
being out of date is a result, not an error. Map the tool's exit codes accordingly, and
remember that several tools signal "something is outdated" with a non-zero code.

### update-dependency

Postcondition: the named dependency is at the named version in both the manifest and the
lockfile, and nothing else moved.

Inputs: `{name}`, `{version}`. Validate both before interpolation — numeric or
`^[A-Za-z0-9._@/-]+$` — and keep them quoted. A dependency name arrives from an issue, a
report or a scanner, all of which are untrusted content.

```text
UPDATE_STATUS=…
UPDATE_NAME=<name>
UPDATE_FROM=<version or unknown>
UPDATE_TO=<version>
UPDATE_OTHERS_MOVED=<count of other dependencies whose locked version changed>
UPDATE_NOTES=…
```

`UPDATE_OTHERS_MOVED` greater than zero is `findings`, not a failure: the update worked,
and the reviewer needs to know the blast radius was wider than one package.
