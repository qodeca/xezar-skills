# Stream E – #53 install freshness

## Changelog

**An install edited in place no longer counts as current, and a resume no longer reuses evidence
over stale dependencies (#53).** In a repository with `dependencies.units`, each unit's stamp now
also carries a metadata digest of everything in its `node_modules`: every entry's path, type and
inode, a link's target, and a file's size, mtime and ctime. A package folder replaced, a file
edited or a `.bin` entry swapped after stamping makes the unit stale, so the fast gate installs
again instead of recording `deps-verified-current`. Build caches the gates write directly inside a
`node_modules` (`.cache`, `.vite`, `.vite-temp`, `.vitest`) are left out while they hold no
`package.json`, no `.bin` and no link; a link into one, a tree that cannot be read and a digest
slower than `XEZ_DEPS_DIGEST_TIMEOUT_MS` (default 60000) each count as not fresh.
`resume-complete.sh` now reuses sealed evidence only when the dependencies are fresh; a stale or
unknown freshness check re-runs the gates, which install first. Measured on a 195,756-entry tree
(three apps' `node_modules`, Apple M1 Max, Node 24, a heavily loaded machine): the stat walk
alone takes 3–4.5 s, and `deps.mjs fresh` goes from about 0.9 s to about 5 s. The limit, stated in
`.xezar/docs/worktrees.md`: anyone inside the task who can run `deps.mjs stamp` can re-stamp any
tree, so the stamp is not a seal. A single npm root (no `dependencies.units`) gets the same
digest; see the entry on single npm roots.

## Upgrade entry

Applies to a repository onboarded by `xez-onboard-opinionated` that sets `dependencies.units`
(3.0.2 or later). The `resume-complete.sh` part applies to every onboarded project.

**Symptom.** The fast gate records `deps-verified-current` although a package inside a unit's
`node_modules` was replaced or edited after the install; and `resume-complete.sh` reports the
dependencies as stale yet reuses the sealed evidence without re-running the gates.

**What to do.** One PR:

```bash
K=.claude/skills/xez-onboard-opinionated/kit
cp $K/checks/lib/deps.mjs .xezar/checks/lib/
cp $K/checks/resume-complete.sh .xezar/checks/
cp $K/docs/worktrees.md $K/docs/recovery.md .xezar/docs/
```

Every task's first run after the merge installs once: stamps written before this change carry no
tree digest, so they no longer count as fresh. On a very large install, check that one
`deps.mjs fresh --root <task>` finishes well inside 60 s; if not, set
`XEZ_DEPS_DIGEST_TIMEOUT_MS` on that machine (a slower digest counts as not fresh, so the gates
install every time, which is safe but slow).

**What you lose by skipping it.** A `node_modules` changed in place after the install is still
certified by the fast gate, and a resumed run can finish on evidence judged against dependencies
that are no longer on disk.

**Rollback.** Revert the PR.

```upgrade
Applies-to: <3.1.0
Files: .xezar/checks/lib/deps.mjs; .xezar/checks/resume-complete.sh; .xezar/docs/worktrees.md; .xezar/docs/recovery.md
```

## Compatibility rows

None. No config key is added and no protected format changes:

- the unit stamps under `.local/xezar/cache/deps/` are private to `deps.mjs` and gain one line;
  an older stamp is simply not fresh, which costs one install;
- `XEZ_DEPS_DIGEST_TIMEOUT_MS` is a new optional per-machine environment variable with a
  documented default (60000);
- no new refusal: a tree that is no longer fresh makes the fast path install, and a resume over
  stale dependencies runs the gates instead of reusing. That gate run applies the refusals it
  always had (a dirty tree, a spent `gate-return` counter), so no ledger row is needed.
