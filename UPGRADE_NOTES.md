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
