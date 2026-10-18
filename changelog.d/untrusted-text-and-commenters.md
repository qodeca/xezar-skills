## 🔒 Security

- 🔒 **Tracker descriptors no longer put issue titles, bodies or search text inside double
  quotes.** A backtick or `$(…)` in an issue title would have run on the machine executing the
  operation; every GitHub, Linear and Jira snippet now passes free text through a file. The
  untrusted-content block in every skill says so, and its id/path pattern rejects a leading `-`
  and any `..` segment. `scripts/lint.sh` gains a `tracker-text` check that fails a quoted
  placeholder and runs `bash -n` on each descriptor block without placeholders; Jira's
  **auth-check** parses on bash 3.2 again.
- 🔒 **Review and continue runs act only on comments from repository members.** Comment reads
  now also return `association` (GitHub's `author_association`); only `OWNER`, `MEMBER`,
  `COLLABORATOR` or a bot in the new `review.trustedBots` config key can turn a comment into
  work, and a `🤖` claim comment counts as a lock only from such an author (and the assignee, when
  there is one), so a stranger's fake claim cannot lock automation out.
