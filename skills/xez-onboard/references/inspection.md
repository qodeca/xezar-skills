# Read-only inventory

Record the task id, assigned root, current branch/head when present, existing decisions and source versions. Do not create a new task branch, use another checkout, or import an unrelated agent profile. Sanitize remote URLs to host/repository identity; never print embedded credentials.

Read file contents rather than executing discovery helpers:

| Evidence | What to infer, with the source path |
|---|---|
| Package manifests and lockfiles | Declared scripts and the matching package manager; conflicting locks remain ambiguous. Include `npm`, `pnpm`, `yarn` and `bun` when evidenced, without assuming one. |
| Python project metadata and tool config | Declared test/lint/type commands and environment requirements. A language alone does not prove a test runner exists. |
| Rust or Go manifests, Makefiles | Declared workspace/targets and CI commands; do not execute make, build hooks or language tools to discover targets. |
| CI definitions and contributing guide | Working directory, required checks, services and pinned runtime versions. A command in CI is detected, not executed. |
| Briefs, research sources, asset lists | Domain, intended artifact, supplied evidence, known constraints and existing review standards. |
| Agent guidance and linked policy | The project's own authority, output locations, quality gates and customizations. A native guidance filename is a client capability, not a required process. |
| Local Git metadata | Current branch/head, configured base and remote default when recorded; no fetch, checkout or remote mutation needed. |
| Executable lookup and supplied capabilities | Available agent binaries, hosted/local restrictions and schema/reference availability. Binary presence proves neither login nor working MCP. |

Unknown stack or no manifest: describe the materials that exist and ask only for the missing outcome/constraints. No Git means no base question, worktree or PR prerequisite. No tracker means local artifacts remain valid. Do not inspect home configuration to infer accounts. No agent binary means files can be prepared, but a live task is pending user installation/login. Offline or read-only capability failures remain explicit and do not prevent ordinary supported work.
