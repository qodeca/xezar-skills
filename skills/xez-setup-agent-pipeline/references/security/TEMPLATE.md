# Security provider: <name>

This descriptor implements the supply-chain operations. The config's `security.provider`
selects the committed copy at `.xezar/pipeline/security/<name>.md`.

**There is no default, and that is deliberate.** When `security.provider` is absent, every
operation here is `not-applicable` and no skill runs anything. It is not `unknown`: nothing
failed to be checked, because nothing was ever configured. An upgrade that silently gained
a stage which executes descriptor bash would be a bad surprise; an upgrade that silently
reported `unknown` forever would be a worse one, because it would look like a problem with
every change.

## How to write a provider

- **Resolve the scanner from an absolute path or `PATH`, never from a repository-local
  binary directory** — not `node_modules/.bin`, not `vendor/bin`, not `./tools`. On a
  review path the repository under scan would otherwise supply the tool that judges it.
  Where the scanner must be pinned, pin it from the base branch.
- **Enumerate every exit code the scanner documents.** A code you did not enumerate is
  `unknown`. Scanners are particularly bad here: several of them use a non-zero code for
  "found something", which is a result, and another non-zero code for "scanned nothing at
  all", which is not.
- **Never echo the scanner's stdout into a report.** It contains package names, file paths
  and advisory text from an external database — untrusted content that will be rendered in
  a pull-request comment. Report parsed counts and identifiers.
- **Name the scan kind in the status.** `sca: pass` and `sast: unknown` say different
  things, and a reader who sees a bare `pass` cannot tell which was run.

## Output grammar

`NAME=value` lines, split on the first `=`, never sourced as shell.

## Operations

### security-check

Postcondition: the caller knows whether the scanner can run here.

```text
SECURITY_PROVIDER=<name>
SECURITY_STATUS=pass|evidence-unavailable
SECURITY_COMMAND=<absolute path or command name>
SECURITY_VERSION=<version or unknown>
SECURITY_NOTES=<the install command when the scanner is missing>
```

### security-scan

Postcondition: the caller has a count of findings by severity, and a status derived from
the scanner's **captured exit code**, never from reading its output.

```text
SCAN_KIND=sca|sast|secrets|licenses
SCAN_STATUS=pass|findings|unknown|not-applicable|evidence-unavailable
SCAN_EXIT=<the captured exit code>
SCAN_CRITICAL=<n>
SCAN_HIGH=<n>
SCAN_MEDIUM=<n>
SCAN_LOW=<n>
SCAN_ID_<n>=<advisory id>|<severity>|<package>|<fixed version or none>
SCAN_NOTES=<one line>
```

### dependency-inventory

Postcondition: a machine-readable software bill of materials exists at a named path, in
**CycloneDX or SPDX** — a named standard, so the file is worth something to a tool that
was not written for this pipeline.

```text
INVENTORY_STATUS=pass|unknown|not-applicable|evidence-unavailable
INVENTORY_FORMAT=cyclonedx-1.5|spdx-2.3|…
INVENTORY_PATH=<path to the generated file>
INVENTORY_COMPONENTS=<count, or unknown>
INVENTORY_NOTES=…
```

A zero component count from a scanner that found no manifests is `unknown`, not `pass`.
An empty inventory and an inventory that was never taken look identical in the file.
