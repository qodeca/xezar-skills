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
