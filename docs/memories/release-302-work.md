---
name: release-302-work
description: 3.0.2 in progress on branch fix/3.0.2 (2026-09-24) – fixes from 8cli leader problems; owner said do NOT release until they give more info
metadata:
  node_type: memory
  type: project
  originSessionId: efbd9dc4-1e83-495c-a1bf-e6800f1e9346
  modified: 2026-09-24T15:55:19.699Z
---

Branch `fix/3.0.2` in xezar-skills, uncommitted as of 2026-09-24. All 21 gates are green.

Done in kit: (1) the reviewer `$` fix – Claude dontAsk never matches a prefix rule to a command holding `$`, proven by a `claude -p` test; now JSON-literal bodies with `$`/`'`, via the shared contract; (2) `xez-add-rule` writes to one `## Owner's rules` section (FACT 6 + guard updated); (3) new `issue-filing` workflow and row, routing defaults v3; `xezar-issue-create` cleaned of `qodeca/xezar`; (4) `route.mjs` prints `workflow=`; routing.md and the guide say dispatch with `source: workflow`, never a bare xez-* skill. UPGRADE_NOTES has 4 entries. DECISIONS has 2.

Done after owner said "write the leader merge settings file" (was blocked as Self-Modification): wrote `kit/scripts/xezar-leader-settings.json` (autoMode.allow for `gh pr merge` + launcher `--settings`), write.md row, UPGRADE note, DECISIONS entry. Owner decisions: the note lives in the leader launch only, and the leader merges EVERYTHING (no risk limit).

Still to do: updating the 8cli installed copy (owner chose kit + 8cli); CHANGELOG + version at release. Wait for the owner's extra info first. See [[routing-json-plan]] and [[feedback-focused-patches]].

cmplus audit (m1, 2026-09-24): new 3.0.2 candidates identified but NOT applied yet (owner said list only): reviewers cannot read `$XEZ_TASK_ID` (verdict-write.sh should fill it); browser-qa row lists codex/gpt-5.6-terra first but Codex cannot open a browser in its sandbox; bootstrap copies the kit from the primary checkout's working tree ("existing task asset differs"); worktree-setup.sh assumes one root npm project (cmplus has 5 yarn apps); integration conflict repair ends `target.missing`; L2 budget loop never scheduled (cadence "3600s", not cron) + contradicts the "read quota first" rule; Codex sandbox corepack EPERM.

Update 2026-09-24 (later): the approved plan (~/.claude/plans/giggly-honking-mochi.md) is implemented on fix/3.0.2, uncommitted. The cmplus fixes, chrome-devtools (Claude and Codex, pinned 1.10.1, exact tools, Codex `default_tools_approval_mode = "approve"` – proven live), monorepo `dependencies.units` (read from base; adoption = PR 1 units only, PR 2 scripts + commands[0]), and one ordered UPGRADE_NOTES block are all in. 23 gates green and the guard suite caught 141/141 (run by me). Still open: live checks on cmplus (needs its upgrade), real dotnet test on m1, commit/PR, CHANGELOG, release (owner go). Known on the owner's machine: ~/.codex-cli config has its own chrome-devtools entry (may drop the project's server), and a user allow `mcp__chrome-devtools` widens Claude's tool list.

Merged 2026-09-24: PR #44 squash-merged as 7140051, fix/3.0.2 branch deleted (local and remote). Not released (no CHANGELOG/version yet).

RELEASED 2026-09-24: PR #45 (version + CHANGELOG) merged as 28f2bae, tag v3.0.2, GitHub release published as Latest. Next: upgrade cmplus (two-PR path) + live checks incl. real dotnet on m1, then 8cli.

cmplus upgrade 2026-09-24: PR #54 (entries 1–9 + units) merged as 9449263f. PR #55 (monorepo part 2) merged as fc885299 after owner approval; m1 primary checkout now on develop at fc885299, test worktree removed. Left for the owner: leader restart + L2/mcp/verdict checks. m1 cannot reach GitHub over SSH (keychain locked), so all git/gh work runs from a laptop clone in the scratchpad, moved to m1 by git bundle. Live on m1: install 34 s, 6 stamps, --fast gates 17/17 passed, real-tool test 89/89 after a test fix (SDK 10 `dotnet new sln` makes .slnx) held uncommitted on xezar-skills branch `fix/3.0.3`. m1 primary checkout holds an unpushed leader commit 3d38e84c (campaign records, branch chore/campaign-records-release-0.10.0-6) – leave it. Engine Codex home on m1 is ~/.codex.qodeca.priv (cmplus already trusted); Claude runs use ~/.claude.*.priv (no chrome-devtools widening).

8cli upgrade 2026-09-24: xezar-skills test fix committed on fix/3.0.3 as 2c427ad (not pushed). 8cli PR #66 (entries 1–9; entry 10 skipped, single root) green, gates 9/9 locally; merged as 1944169 after owner approval; ~/Projects/8cli pulled. Owner declined cleaning ~/.codex-cli config. Laptop 8cli .claude/settings.local.json now has the browser tools (backup in scratchpad). Found: 8cli GitHub default branch is main but base is develop (primary's origin/HEAD set to develop locally, so config-guard passes there only); ~/.codex-cli/config.toml has a user-level [mcp_servers.chrome-devtools] @latest table plus a leftover trust entry for my scratchpad/cdp probe dir – reported, not changed.

3.0.3 2026-09-24: fix/3.0.3 pushed, PR #47 opened (test-only .sln fix). No release until owner says.
#46 fixed in PR #47 as 9ef379e (tree nonce+inode in unit stamps; .sln + listed projects in dotnet fingerprint/ownership; 5 negative tests; UPGRADE note). Guards 141/141. test-gate-status fails locally on macOS on main too (upper-case gate name), passes in CI. Real-dotnet mode for new sln parsing not yet run on m1. cmplus/8cli need the deps.mjs copy after 3.0.3.

**3.0.3 RELEASED 2026-09-24**: PR #47 squash-merged as ec856f8 (version + CHANGELOG in the same PR), tag v3.0.3, GitHub release Latest, #46 closed. Next: cmplus + 8cli copy deps.mjs (top UPGRADE_NOTES entry), real-dotnet run on m1 (`XEZ_DEPS_REAL=1 node scripts/test-deps-units.mjs`).
