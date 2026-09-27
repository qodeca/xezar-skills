# Stream H – #54 repair pushes pass one check

## Changelog

**A repair's fix reaches GitHub only after the gates checked it, and only through one check
(#54).** `address-review-findings` (review repairs and conflict repairs) used to push the fix to
the pull request's branch from inside the agent step, before any gate, and record the push as
`DELIVERED`; the gates then ran on the run's own, unchanged branch, so code nobody had gated landed
on the PR. Now the repair moves its own `xez/<id>` branch onto the PR head and commits there, so
readiness, the gates and the seal judge the real fix. The handoff pushes that sealed commit only
through the new `.xezar/checks/push-check.sh --pr <n> --branch <head branch>`, which refuses unless
HEAD is the sealed commit (`verify-evidence.sh --require-current` answers ELIGIBLE and the sealed
sha is HEAD), the PR – read live with `gh pr view` – is open and in this repository (not a fork),
the target is its head branch and not HEAD, `main`, `master`, `release/*`, the configured base or
the PR's base, and the push is a fast-forward or a `--force-with-lease=refs/heads/<head>:<sha>`,
never a bare force. It confirms the new tip with a live `git ls-remote`. Readiness now refuses a
`DELIVERED` record and says what to do instead. No workflow step, config key or leader record is
added. The known limit – two runs repairing one PR at once, and a same-user process pushing by
other means – is signed in `SECURITY.md` and `DECISIONS.md` (D12).

## Upgrade entry

**Symptom.** A review or conflict repair pushes its fix to the pull request before any gate runs,
then its `gates` step passes on an unchanged branch, so the PR carries code nobody checked; or a
repair run is refused with `branch.has-own-commits` unless it writes a `DELIVERED` record; or the
project added a local patch to get repairs past readiness.

**What to do.** Copy the files below from the kit (`push-check.sh` is new). Drop any local patch
that let a repair push before the gates or skip readiness. Nothing to configure: the script reads
the base branch from `.xezar/config.json` and the PR live through `gh`, which the handoff already
uses. A repair already in flight that wrote `DELIVERED` is refused at readiness after the upgrade;
re-dispatch it.

**What you lose by skipping it.** Repairs keep pushing ungated code to pull requests, and nothing
stops a repair pushing to the wrong PR's branch, a protected branch, or with a bare force.

```upgrade
Applies-to: <3.1.0
Files: .xezar/checks/push-check.sh =new; .xezar/checks/worktree-preflight.sh; .xezar/workflows/address-review-findings.yaml; .xezar/skills/xezar-review-response.md; .xezar/skills/xezar-handoff-draft-pr.md; .xezar/docs/phase-record.md
```

## Compatibility rows

`BACKWARD_COMPATIBILITY.md` – no new config key and no file format change. `push-check.sh` is a new
kit script; its arguments (`--pr`, `--branch`, `--force-with-lease=`, `--dry-run`), its exit codes
(0 pushed, 1 refused, 2 usage) and its refusal tags (`push.sealed-head`, `push.pr-open`,
`push.pr-same-repo`, `push.pr-head-branch`, `push.protected-ref`, `push.no-bare-force`,
`push.preflight`, `push.rejected`, `push.remote-tip`) are new.

Ledger of deliberate breaks:

| Date | What changed | Who it affects | What they must do | Why it was worth it |
|---|---|---|---|---|
| 2026-09-27 | readiness (`worktree-preflight.sh --readiness`) refuses a `DELIVERED` record with `scope.delivery-record`, and a repair's push goes through `push-check.sh`, which refuses an unsealed or changed HEAD, a closed or fork PR, a branch other than the PR head, a protected branch and a bare force push | every project whose repairs pushed to the PR branch before the gates and recorded `DELIVERED`; a repair in flight at upgrade time | move the run's own branch onto the PR head and commit there, as `xezar-review-response` now says; re-dispatch a repair that already wrote `DELIVERED` | a repair that pushed freely put ungated code on pull requests and could push anywhere; now only the sealed commit reaches the PR's own head branch |
