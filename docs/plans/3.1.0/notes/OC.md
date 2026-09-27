# Stream OC – the owner's 3.1.0 confirmations (#50, #53, #55, #89)

Three owner decisions applied after streams B, E, U1 and R merged. The routing decision changes
only files that streams B and R already ship and upgrade (their fragments now state the final
rule), so it has no upgrade entry of its own here.

## Changelog

**A reviewer of the author's vendor may judge on every row, security and release included, when
it runs a different model (#50, #89).** `route.mjs --author` removes every lane that shares a
model with the author chain, and a whole vendor only where `vendorExclusions` names it (shipped:
`anthropic`). So when DeepSeek Flash wrote the work and Claude has no budget, DeepSeek V4 Pro may
review it on every review row. The schema's `neverAuthor`, `.xezar/docs/routing.md`, the ban texts
and row notes in the routing defaults, and `DECISIONS.md` say the same thing. Work a pi lane wrote
still merges only after a review on `claude/sonnet` or `codex/gpt-6-astra`; a V4 Pro review of it
alone does not clear the merge. To keep a vendor's other models out of its reviews, name the
vendor in `vendorExclusions`.

**A package changed after install is now caught in a single npm root too (#53).** The tree
digest that 3.1.0 adds for `dependencies.units` now also covers a project with one root
`package.json`: `node_modules/.xezar-deps-stamp` holds the input fingerprint and then a
`contents=<digest>` line, the same metadata digest of `node_modules` (the stamp file itself left
out). A package folder replaced or a file edited after the install makes the fast gate install
again. Each `--fast` check now walks `node_modules`, which costs seconds on a large install.

**Onboarding stops when it cannot tell the kit's version (#55).** Before writing anything,
`xez-onboard-opinionated` needs a release tag or a commit id for the kit. With neither, it stops
and asks the owner to install the skills from a release or a git checkout, instead of recording
`version: "unknown"` in `.xezar/onboarding.json`. An older manifest that already says `unknown`
still upgrades: the upgrade tool treats it as no version, applies every upgrade entry, and writes
the target version.

## Upgrade entry

Applies to every project onboarded by `xez-onboard-opinionated` that has a single npm root (no
`dependencies.units`).

**Symptom.** The fast gate records `deps-verified-current` although a package inside the root
`node_modules` was replaced or edited after the install.

**What to do.** One PR:

```bash
K=.claude/skills/xez-onboard-opinionated/kit
cp $K/checks/lib/deps.mjs $K/checks/lib/common.sh .xezar/checks/lib/
cp $K/docs/worktrees.md .xezar/docs/
```

Every task's first run after the merge installs once: a stamp written before this change has no
digest, so it reads as not fresh. On a very large install, check that one `--fast` gate run's
freshness check finishes well inside 60 s; if not, set `XEZ_DEPS_DIGEST_TIMEOUT_MS` on that
machine (a slower digest counts as not fresh, so the gates install every time: safe but slow).

**What you lose by skipping it.** A single-root project's fast gate keeps certifying a
`node_modules` changed in place after the install.

**Rollback.** Revert the PR.

```upgrade
Applies-to: <3.1.0
Files: .xezar/checks/lib/deps.mjs; .xezar/checks/lib/common.sh; .xezar/docs/worktrees.md
```

## Compatibility rows

None for the routing and freshness decisions: `route.mjs --author` is new in 3.1.0 (stream B),
and its lines are unchanged – `reason=author-chain: shared vendor with <lane>` now appears only for
an excluded vendor. The single-root stamp `node_modules/.xezar-deps-stamp` is private to the kit
and gains a second line; an older stamp is simply not fresh, which costs one install.

For the ledger of deliberate breaks:

| Date | What changed | Who it affects | What they must do | Why it was worth it |
|---|---|---|---|---|
| <release date> | `xez-onboard-opinionated` stops before writing anything when the kit's version cannot be told (no release tag and no commit id), where it used to write `version: "unknown"` | anyone onboarding from a copy of the skills that carries neither, such as a hand-copied folder | install the skills from a release or a git checkout of the collection and run onboarding again; the saved interview answers resume | an unknown version leaves the upgrade tool guessing what a project is upgrading from; the owner decided a setup must name its version |
