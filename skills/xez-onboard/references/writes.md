# Minimal preview and writes

Preview a table of path, current digest (or absent), exact proposed key/section changes, reason, authority and verification. Include the chosen mode/client/base and any skipped optional work. If authorization is missing, use the question contract against this preview; do not request generic permission before preparing it.

| Project artifact | When and how |
|---|---|
| `.xezar/config.json` | Only intentional, supported engine choices: e.g. `baseBranch`, `defaultRunner`, `skillsRepos`. Inherit defaults without materializing them. Custom sources use `{ "repo": "…", "ref": "…" }` entries; `skillsRepos: []` explicitly selects no team source, and omitting the key inherits the default. Resolve exact runner identifiers from the installed engine schema. Domain, mode, outputs, QA and design decisions belong in guidance/checkpoint, not invented engine keys. |
| `.xezar/pipeline/config.json` | Software delivery only, explicitly opted in. Read the installed `xez-setup-agent-pipeline` schema and reuse it for the chosen fields. Its standard labels, package-manager examples, browser provisioning, extra process docs and automatic setup are not universal defaults. Use actual project checks and policy; no placeholder validation or fabricated tracker. If required descriptors are missing, report the pipeline as incomplete and leave descriptor installation to a separately scoped setup task. Never claim config alone is an operational pipeline. |
| One guidance file | Prefer updating an existing client-read guidance file, otherwise use the selected client's supported project filename (e.g. `AGENTS.md` or `CLAUDE.md`). Adapt [templates/project-guidance.md](../templates/project-guidance.md) to verified local facts. Link existing policy rather than copying it. Do not create multiple competing instruction documents or install another project's kit. If existing guidance is complete, no edit is needed. |
| Root `.gitignore` (Git projects only) | Add `.local/` once before local evidence/state/backups; verify the entire directory is ignored, without exceptions. Report already tracked local state, never silently untrack it. Preserve other ignore rules. If existing exceptions prevent full ignoring, preview the exact fix and stop dependent local writes until resolved. |
| Selected project MCP file | Leader mode only; use [references/clients.md](clients.md) and its template for that client. Independent mode leaves all MCP configuration untouched. |

Absent pipeline config is a normal minimal setup. Do not invoke pipeline setup just to satisfy its own config-loading preflight. Resolve companion skills by installed name, record their actual revision/digest, and stop only the optional portion if unavailable or if they cannot respect this scope. Do not fetch/install companions, edit tool-managed skill locks, or create additional pipeline artifacts during this onboarding task.

For every write:

1. Reject an out-of-root target, symlink escape, malformed existing config or ambiguous duplicate JSON/TOML key; report the file for repair instead of normalizing it.
2. Compare current bytes with the preview's digest, including expected absence. Any intervening edit invalidates the preview; regenerate and resolve affected choices before applying.
3. Preserve unrelated bytes, comments and custom keys. Use a targeted patch or format-preserving editor; do not reserialize whole existing JSON/TOML files or replace whole Markdown documents. Existing MCP entries under the same name need a reviewed per-key patch, never a second duplicate entry.
4. For Git projects, keep secret-free recovery originals and the per-file application journal in the task's ignored evidence directory. For non-Git work, keep them under `.local/` in the assigned root before overwriting and report that no VCS ignore applies. If a target contains credentials, do not copy it into evidence; stop that dependent edit and report the limitation.
5. Validate proposed bytes before replacing each file; journal applied, failed and pending paths. On partial failure, stop dependent writes, preserve successful changes and offer a precise recovery patch. Never overwrite a later user edit to roll back.

Re-runs find existing sections/settings and do not append duplicates. Do not perform commits, pushes, label creation, publication, client trust/login, home writes, or leader attachment. Report integration as the person's next action when the candidate is an isolated worktree.
