## 🐛 Fixes

- 🐛 **A kit check no longer hangs on a flag given without its value.** `ci-watch.sh`,
  `integration-preflight.sh`, `root-sync-preflight.sh` and `merge-recovery.sh record-intent`
  looped forever when their last flag had no value; they now exit 2 naming it.
- 🐛 **`gh-write.sh` refuses an over-limit comment instead of posting it cut.** It measured
  characters but read bytes, so a long non-ASCII comment was cut mid-character and posted with
  exit 0. It now counts bytes against GitHub's 65,536 limit and refuses a longer comment whole.
- 🐛 **`repository-checks.sh` never reads a background check's status before it is written**, and
  reads an empty one as a failure.
- 🐛 **`worktree-git.sh` refuses `master` and the configured base branch again**, as the engine's
  copy does; the vendored copy read `main | main | HEAD`.
- 🐛 **The upgrade verifier's TOML check catches what a merge breaks.** It refuses a key or table
  defined twice, a header whose brackets do not pair and a dotted key reopening a table, and
  accepts a quoted key holding `#`.
- 🐛 **The gate no longer fails on a machine that signs commits.** Every test's git reads a global
  config of its own and no system config, so `commit.gpgsign=true` no longer fails five gate
  commands.

## 🚀 CI/CD & Infrastructure

- 🚀 **Post-merge lint runs on `main` and `develop` are no longer cancelled by the next merge**;
  only pull-request runs cancel each other. The `lint` job pins Node 22, and `package.json` states
  `engines.node >=22`.
- 🚀 **A Windows-only nightly guard failure opens an issue of its own** ("Nightly guard suite
  failed on Windows"); the Windows job still never fails the run.
- 🚀 **The agent-browser pin workflow commits all three files the bump writes** – the descriptor,
  its kit copy and the digest pin – and opens its PR against `develop`. It and `skills-audit.yml`
  pin `actions/checkout` by commit SHA, and `skills-audit.yml` runs with `contents: read`.
