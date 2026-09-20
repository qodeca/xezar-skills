# Tracker provider: {name}

Copy this file to `.xezar/pipeline/trackers/{name}.md`, set `"tracker": "{name}"` in `.xezar/pipeline/config.json`, and fill in every operation below. This is the whole integration surface: no skill changes are needed to support a new tracker — skills name operations, this file says how to execute them. Use `github.md` as the reference implementation for structure and level of detail.

## How to write a provider

- **One file, all operations.** Every operation a skill can name must have a heading here with either a concrete command/tool call (CLI, MCP tool, API call) or an explicit delegation (see below). An operation you leave empty will strand every skill that uses it.
- **Split-provider setups are normal.** Many teams track issues in one tool (Linear, Jira) while PRs and CI stay on the code host (GitHub). In that case implement the *Issues* section against the issue tracker and delegate the *Pull requests*, *Labels*, and *Identity* sections, e.g.: "Pull request operations: as in `github.md` (gh CLI)." Map identifiers both ways in the Conventions section (for example, a Linear ticket `ENG-123` referenced from a GitHub PR body, and the PR URL attached back to the ticket).
- **Preserve the semantics, not the syntax.** A skill saying "close the issue with a comment linking the PR" must end with the ticket in the tracker's done/closed state and a visible cross-link — whatever commands that takes.
- **Concepts that must map somewhere:** issue/PR identifiers and how they are written in text; how a PR declares which issue it resolves (and whether that auto-closes it); draft PRs (or the nearest equivalent, e.g. a "WIP" state); labels (or the tracker's tags/states — if the tracker models workflow as states instead of labels, say how each pipeline label maps to a state); assignees; comments; CI check status; review verdicts (approve / request changes); merge.
- **Claim/lock protocol.** Skills coordinate via three claim signals: assignee = automation user, the local active-ownership label marker, and a `🤖`-prefixed claim comment with a timestamp. Define how each is expressed in this tracker; all three should be readable back by **get-issue**/**get-pr** so concurrent skills detect the lock. The the local CI-observation label marker is deliberately **not** one of them: it records that a finished, fully reported run still owes a CI-result comment, and must never be read as a lock.
- **Guards.** Reproduce the label-guard behavior: a label/tag mutation checks existence first and degrades to a logged skip when missing; `labels.enabled: false` in the config skips label operations entirely.
- **Mutate through the narrowest API surface the tracker offers.** When a tracker exposes both a rich query layer and a plain resource API (GraphQL vs REST, a convenience CLI verb vs the underlying endpoint), write mutations against the plain one. A convenience verb often fetches unrelated fields alongside the write, so an unrelated deprecation or permission gap on one of those fields aborts the whole call — and the caller sees a message about the unrelated field while the label, assignee, or body it asked for was never written. `github.md`'s Prerequisites document one such case in detail (Projects (classic)); the general rule is: mutations must not depend on fields they do not change, and a mutation whose success matters to a later decision is read back.
- **Cross-repo targets.** Every operation should accept an optional `{repo}` (owner/name, or this tracker's project identifier) and default to the current checkout's repository when omitted — some skills address repositories other than the current one and always pass the target explicitly. `github.md` documents this contract as its blanket `--repo` rule. A provider that cannot support cross-repo targets must say so explicitly here, so dependent skills fail loud instead of silently querying the wrong repository.

## Prerequisites

{CLI/MCP server/API token needed, and how to verify it — the **auth-check** operation}

## Conventions

{identifiers, cross-linking syntax, draft equivalent, comment formatting, claim signals}

## Label guards

{the guard behavior above, in this tracker's terms}

## Operations

### Identity and repository

- **auth-check** — verify credentials and client compatibility: fail fast when credentials are missing, and warn when the installed CLI/SDK is too old to perform the mutations this descriptor documents (state the minimum version and the upgrade command in Prerequisites).
- **current-user** — the automation user's login/handle.
- **repo-info** — the repository/project handle.
- **default-branch** — the code host's default branch (used when `baseBranch` is `"auto"`).

### Issues

- **get-issue** — id, field list → issue data (title, body, state, author, url, labels/state, assignees, comments).
- **search-issues** — text query, state → matching issues.
- **create-issue** — title, body, assignee, labels → created issue URL.
- **close-issue** — id, reason, closing comment.
- **comment-issue** — id, body.
- **update-issue** — id, new title and/or body → edits the issue's own fields (not labels/assignees).
- **assign-issue / unassign-issue** — id, user.
- **label-issue / unlabel-issue** — id, label (through the guard).
- **get-issue-comment** — comment id → body, author, URL.
- **list-issue-comments** — id → conversation comments.
- **update-comment** — comment id, new body → rewrite an existing conversation comment in place (issue and PR conversation comments alike). Powers marker-idempotent comments: a skill finds its `🤖 …` marker via **list-issue-comments** and updates that comment instead of posting a duplicate. When the tracker cannot edit comments, document that here and skills degrade to posting a replacement that states it supersedes the previous one.

### Pull requests

- **get-pr** — number, field list → PR data. Request only the fields the calling skill names. Serialize `state` as `OPEN`/`CLOSED`/`MERGED`, per-review states as `APPROVED`/`CHANGES_REQUESTED`/`COMMENTED`/`DISMISSED`, and every timestamp as ISO-8601. The set includes the request's own lifecycle and size facts: `createdAt`, `mergedAt`, `closedAt`, `additions`, `changedFiles`, and per-comment `createdAt` on `comments`.

  **Normalized fields every descriptor must provide.** The rest of the field set is
  host-shaped and a skill asks for it by name, but a merge gate is portable only if these
  three mean the same thing everywhere. A descriptor that cannot produce one emits the literal
  `unknown` — never a plausible-looking default, because a gate reading a guessed value cannot
  tell it from a measured one.

  | Field | Value | Meaning |
  |---|---|---|
  | `headRefOid` | commit sha, or `unknown` | The commit the PR currently proposes. Gates are evaluated against it and the merge is pinned to it. Absent means the run cannot bind its verdict to anything. |
  | `baseRefOid` | commit sha, or `unknown` | The commit the PR is merging into. A verdict certifies the reviewed input; when the base moves, what merges is not what was reviewed. |
  | `reviewVerdict` | `approved` · `rejected` · `pending` · `not-enforced` · `unknown` | The **aggregate** verdict, not a list of per-review states. |

  **`reviewVerdict` is deliberately not a boolean, and `not-enforced` is the reason.** Hosts
  differ in a way that is easy to get dangerously wrong: some report a pull request as approved
  when *no approval rule applies to it at all* — GitLab's approvals API returns `approved: true`
  in that case. Collapsing that to "approved" tells a merge gate that review happened when
  nothing was ever required, which is the same fail-open shape as a label that was never
  created. So a descriptor emits `not-enforced` when the host reports approval in the absence of
  any rule, and the gate treats it as `unknown` and refuses. If your host cannot distinguish
  "approved by a reviewer" from "approved because nobody had to", emit `unknown` and say so in
  this file.

  A split provider that delegates PR operations to a companion descriptor inherits all three
  fields from it and does not restate them.
- **list-prs** — state/search filters, limit → PRs.
- **search-prs** — free-text query (e.g. an issue reference), state → matching PRs.
- **create-pr** — base branch, draft flag, title, body → PR URL + number.
- **update-pr** — number, new title and/or new body → the PR's own title/body rewritten in place (not a comment). For keeping a PR's description in sync with what it actually ships.
- **comment-pr** — number, body (multi-line bodies must preserve formatting).
- **attach-image-evidence** — number, a comment body, a slug (e.g. `pr-<n>`), and a list of local image file paths → post a single comment that embeds the images so they render **inline** in the tracker, and return the comment URL. The mechanism is the tracker's business (an upload/attachment endpoint, a media API, or a pushed evidence branch referenced by raw URLs) — the skills only name the operation and pass image paths. Contract: never mutate the change's own branch to store evidence; when the tracker cannot render uploaded images (e.g. a private repo whose raw URLs need auth), still post the comment with links to the images and say so rather than failing the caller. This is how QA skills post screenshots without any host-specific logic living in the skill.
- **assign-pr / unassign-pr** — number, user.
- **label-pr / unlabel-pr** — number, label (through the guard; pipeline labels are mutually exclusive).
- **get-pr-diff** — number → full diff or changed-file list.
- **get-pr-files** — number → changed files with per-file status (added/modified/removed).
- **checkout-pr** — number → PR head available locally (fork PRs included).
- **review-pr** — number, verdict (approve / request changes), body.
- **merge-pr** — number; squash by default.
- **mark-pr-ready** — promote a draft PR.
- **get-pr-checks** — number → CI check runs (name, state, link).
- **get-required-checks** — base branch → required status checks; when unreadable, treat all reported checks as required.
- **branch-protected** — branch + the checks that must pass → that branch ends the call
  protected: direct pushes refused, those checks required before a merge. Named for the
  postcondition, because "set branch protection" is one tracker's verb for it and another has
  no such call at all. Two things the implementation must state rather than assume: whether
  administrators are included (a setup whose own record files are pushed straight to the base
  branch needs them excluded, and that is a choice the caller makes, not a default), and what
  happens without permission — refuse and print the exact command for a human, never report a
  postcondition nobody reached. A tracker with no protection surface answers `not-applicable`
  and says so here; a caller then tells the user their gates are advisory. **The caller always
  re-reads with get-required-checks afterwards:** a write that returned success and a branch
  that is actually protected are different claims, and only the second one is worth reporting.
- **get-pr-comment / get-review-comment** — comment id → body, author, URL (conversation vs inline review comment).
- **list-review-comments** — number → the PR's inline review comments (file, line, author, body). This is how a skill reads feedback left *on the diff* rather than in the conversation: `xez-auto-review-pr` carries it as inherited findings, and `xez-auto-continue-pr` mines it for remaining work when it adopts a PR that has no execution plan. When the tracker has no separate inline-comment surface, document that here — consumers degrade to review bodies plus conversation comments and say so in their report.

- **get-pr-template** — → the repository's pull-request template text, or nothing when there is
  none. A repository that publishes a template has told you the shape its reviewers expect;
  writing a PR body that ignores it makes every request look foreign to the people who review
  them. Nothing returned is `not-applicable`, not a failure — plenty of repositories have none.
- **get-issue-templates** — → the repository's issue templates or forms: for each, an id, a
  title, and its fields (label, whether it is required, and the choices for a dropdown). A skill
  that files an issue fills the matching template instead of inventing headings, and when a
  required field has no answer it asks rather than guessing one. A tracker with no template
  surface documents that here, and consumers fall back to a plain body and say so.

### Verification records

A **verification record** is what a gate run leaves behind so a human, and a later run,
can read what happened. It is a **published record, not an authority**: a gate never
satisfies itself from a record. Anyone who can comment on a pull request can write text
that looks like one, so a record is read for reporting and caching only, and every gate
re-derives its facts from this tracker's authenticated API at the head commit.

The grammar is fixed, so a consumer can parse it without a model in the loop. The record
body is a fenced block containing `NAME=value` lines, **split on the first `=` only** and
**never sourced as shell** — a value can contain anything, including `$(...)`. Unknown
`NAME`s are ignored, so the grammar can grow. Required names:

```text
Head=<head commit sha>
Base=<base commit sha, or unknown>
Skill=<skill name>
At=<ISO-8601 timestamp>
Gate=<gate name>
Status=<pass|findings|unknown|not-applicable|evidence-unavailable>
Verdict=<allowed|refused>
```

`Gate=` / `Status=` repeat as a pair, in order, once per gate evaluated. A record whose
`Head=` does not equal the commit a later run is deciding about describes a different
commit and is ignored — not trusted, not disputed, simply about something else.

- **put-verification-record** — number, a record body, and the writing skill's name → post
  or update one marker-idempotent comment carrying the record, and return its URL. The
  marker is `` 🤖 `<skill-name>` — verification record ``, so a re-run finds its own record
  and rewrites it in place through **update-comment** instead of posting a second one.
- **get-verification-record** — number, and optionally a skill name → the most recent record
  comment's body and URL, or nothing when there is none. A tracker that cannot store a
  record says so here; consumers then report the record as unavailable and carry on, since
  it was never a gate input.

**Both operations execute from the base branch's copy of this descriptor when they run on
a merge-gate path.** The working tree is the pull request under review, so a request that
edits this file would otherwise write its own record and define its own reading of it.
Never echo a record body into a report: it is untrusted content like any other tracker
text. Report the parsed fields.

### CI runs

- **list-runs** — branch (or head SHA) → recent CI runs with id, workflow name, status, conclusion.
- **get-run** — run id → status, conclusion, per-job breakdown.
- **get-run-failed-logs** — run id → log output of the failed steps (the diagnosis input for CI failures).
- **rerun-failed** — run id → re-execute only the failed jobs (used to disambiguate flakes before code changes).
- **watch-run** — run id → block until the run completes, signaling success/failure; may degrade to polling **get-run**.

### Labels

- **list-labels** — all label/tag names.
- **create-label** — name, color, description; never delete or rename existing ones.
- **ensure-label-taxonomy** — create every missing label from the config's taxonomy.

## Local workflow authority

Map only locally established workflow roles to tracker names/states using project policy and tracker evidence. The descriptor supplies operations, not a mandatory taxonomy. Missing mapping means no invented label; preserve required QA and ownership checks through existing local evidence. **ensure-label-taxonomy** creates only explicitly authorized missing entries, never a bundled universal list.
