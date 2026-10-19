## 🚀 CI/CD & Infrastructure

- 🚀 **The upgrade tests that need a broken git now run on Windows too.** `test-upgrade.mjs`
  sections 5a (a git without `--zdiff3`, and a failed merge that writes nothing) and 5g (a failing
  `git check-ignore`) skipped on Windows, because their stand-in git was a shell script. On Windows
  the stand-in is now Node under the name `git.exe`, so both sections and their two nightly guard
  cases run on every OS. The CRLF fix in the upgrade verifier was also checked on real Windows,
  with `core.autocrlf` off and on.
