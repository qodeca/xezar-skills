# Review hand-off — authoritative review runs after PR creation

`xez-fix` validates and hands the change to the PR-opening step. The chain performs its single authoritative code-review pass later through `xez-auto-review-pr`.

## xez-fix specifics

The later `xez-auto-review-pr` pass must apply these checks to a fix produced from an analyzer brief:

- No API response fields removed.
- No data-scoping or permission-check rules weakened; the project's data-access conventions followed in every changed production file.
- Fix remains minimal — edit only what the analyzer named plus tests; refactors belong in their own PR.

Do not run `xez-code-review` directly in `xez-fix`; `xez-auto-review-pr` invokes it once after `xez-open-pr`, driven by `xez-auto-fix-issue` or the external flow runner.
