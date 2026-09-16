# Setup interview questions

The questions step 3 of `xez-setup-agent-pipeline` asks the user (skipped with `--defaults`, which writes the auto-detected config without confirmation):

1. Confirm or edit the detected validation commands.
2. Which tracker provider matches the project and available capabilities (`github`, `linear`, `jira`, or custom; no remote setup is also valid):
   - `github` — issues, PRs, reviews, CI, and labels through the `gh` CLI.
   - `linear` — Linear issues through `schpet/linear-cli`, with GitHub as the required PR/review/CI companion. Setup installs both `linear.md` and `github.md`.
   - `jira` — Jira Cloud work items through Atlassian CLI (`acli`), with GitHub as the required PR/review/CI companion. Setup installs both `jira.md` and `github.md`.
   - a custom provider — scaffold from `TEMPLATE.md`; stop tracker-driven work until every required operation is filled in.

   This sets the config's `tracker` field to the selected primary descriptor. Before accepting a split provider, confirm its issue CLI and the companion `gh` CLI are installed/authenticated, and explain the provider-specific environment/config prerequisites from its descriptor.
3. Which browser provider to install (default: `agent-browser`; `playwright` is
   the compatibility choice). Explain that the selected descriptor owns
   autonomous CLI/browser provisioning and that repository-native E2E suites
   remain authoritative.
4. Labels: use established local names and meanings from project/tracker evidence. Ask only about unresolved mappings; with no local workflow, leave labels disabled unless a new taxonomy is explicitly authorized.
5. QA gate on or off. Recommend on when the repo ships user-facing changes.
6. Where specs live (`paths.specs`, default `.xezar/pipeline/specs`) — confirm or point at an existing design-doc directory.
7. Optional repo-local review checklist path.
8. Guidance: which missing, locally useful content is requested, at which project-selected path? Existing guidance is linked and preserved. No document type or filename is mandatory; unattended defaults create no unrequested docs.
