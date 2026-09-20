# Tracker provider: mock

A tracker that answers from files. It makes no network call, needs no credentials, and
mutates nothing outside its own journal — so a contributor can exercise a skill end to end,
and a test can drive a merge gate through states a real repository would take days to reach.

Select it with `"tracker": "mock"` in `.xezar/pipeline/config.json`.

**This provider is for tests and local exploration. It must never be selected in a repository
whose PRs actually merge** — it cannot merge anything, and a skill that "succeeds" against it
has proved only that it followed its own steps.

## Prerequisites

`jq`, and a fixture directory. Verify with the **auth-check** operation below.

```bash
MOCK_DIR="${XEZ_MOCK_DIR:-.xezar/pipeline/mock}"
```

## Conventions

- **Identifiers** are plain integers, written `#123` in prose, exactly as on the code host.
- **A read** loads `$MOCK_DIR/<operation>.json`, or `$MOCK_DIR/<operation>.<id>.json` when one
  exists — so a fixture set can hold several pull requests without inventing a query language.
- **A missing fixture is `unknown`, never an empty success.** The read prints nothing and exits
  `3`. This is the whole point of the provider: the states worth testing are the ones where a
  real tracker says nothing, and a mock that returns `{}` would turn each of them into a
  silent pass and hide exactly the bug the fixture was written to catch.
- **A write appends one JSON line to `$MOCK_DIR/journal.ndjson`** and changes nothing else. A
  test asserts on the journal. Nothing is sent anywhere, so a skill under test cannot comment
  on a real pull request by accident.
- **Cross-repo targets** are accepted and recorded in the journal; there is one fixture set.
- **Claim signals** work as on any tracker: the assignee, the active-ownership label and the
  `🤖` claim comment all round-trip through the journal and the fixtures.

## Label guards

`label_exists` consults `$MOCK_DIR/labels.json`; when that file is absent the guard exits `3`
(unknown), and it never reports a label as present by default. `labels.enabled: false` in the
config skips label operations entirely, as everywhere else.

```bash
label_exists() {
  [ -f "$MOCK_DIR/labels.json" ] || return 3
  jq -e --arg n "$1" 'index($n) != null' "$MOCK_DIR/labels.json" >/dev/null
}
```

## Operations

Two shapes cover every operation. A **read** resolves a fixture; a **write** appends to the
journal. Each heading below names which shape it takes and what the fixture must contain.

```bash
mock_read() {  # $1 = operation, $2 = optional id
  f="$MOCK_DIR/$1.json"
  [ -n "${2:-}" ] && [ -f "$MOCK_DIR/$1.$2.json" ] && f="$MOCK_DIR/$1.$2.json"
  if [ ! -f "$f" ]; then
    echo "mock: no fixture for $1${2:+ ($2)}; unknown" >&2
    return 3
  fi
  cat "$f"
}

mock_write() {  # $1 = operation, rest = key=value pairs recorded verbatim
  op="$1"; shift
  mkdir -p "$MOCK_DIR"
  jq -nc --arg op "$op" --arg at "$(date -u +%Y-%m-%dT%H:%M:%SZ)" --args \
    '{op: $op, at: $at, args: $ARGS.positional}' "$@" >> "$MOCK_DIR/journal.ndjson"
}
```

#### auth-check
Read. Fixture: `auth-check.json` (or `auth-check.<id>.json`). Absent → exit `3`, unknown.
```bash
mock_read "auth-check" "${1:-}"
```

#### current-user
Read. Fixture: `current-user.json` (or `current-user.<id>.json`). Absent → exit `3`, unknown.
```bash
mock_read "current-user" "${1:-}"
```

#### repo-info
Read. Fixture: `repo-info.json` (or `repo-info.<id>.json`). Absent → exit `3`, unknown.
```bash
mock_read "repo-info" "${1:-}"
```

#### default-branch
Read. Fixture: `default-branch.json` (or `default-branch.<id>.json`). Absent → exit `3`, unknown.
```bash
mock_read "default-branch" "${1:-}"
```

#### get-issue
Read. Fixture: `get-issue.json` (or `get-issue.<id>.json`). Absent → exit `3`, unknown.
```bash
mock_read "get-issue" "${1:-}"
```

#### search-issues
Read. Fixture: `search-issues.json` (or `search-issues.<id>.json`). Absent → exit `3`, unknown.
```bash
mock_read "search-issues" "${1:-}"
```

#### create-issue
Write. Appends to the journal; changes no fixture.
```bash
mock_write "create-issue" "$@"
```

#### close-issue
Write. Appends to the journal; changes no fixture.
```bash
mock_write "close-issue" "$@"
```

#### comment-issue
Write. Appends to the journal; changes no fixture.
```bash
mock_write "comment-issue" "$@"
```

#### update-issue
Write. Appends to the journal; changes no fixture.
```bash
mock_write "update-issue" "$@"
```

#### assign-issue / unassign-issue
Write. Appends to the journal; changes no fixture.
```bash
mock_write "assign-issue" "$@"
```

#### label-issue / unlabel-issue
Write. Appends to the journal; changes no fixture.
```bash
mock_write "label-issue" "$@"
```

#### get-issue-comment
Read. Fixture: `get-issue-comment.json` (or `get-issue-comment.<id>.json`). Absent → exit `3`, unknown.
```bash
mock_read "get-issue-comment" "${1:-}"
```

#### list-issue-comments
Read. Fixture: `list-issue-comments.json` (or `list-issue-comments.<id>.json`). Absent → exit `3`, unknown.
```bash
mock_read "list-issue-comments" "${1:-}"
```

#### update-comment
Write. Appends to the journal; changes no fixture.
```bash
mock_write "update-comment" "$@"
```

#### get-pr
Read. Fixture: `get-pr.json` (or `get-pr.<id>.json`). Absent → exit `3`, unknown.
```bash
mock_read "get-pr" "${1:-}"
```

#### list-prs
Read. Fixture: `list-prs.json` (or `list-prs.<id>.json`). Absent → exit `3`, unknown.
```bash
mock_read "list-prs" "${1:-}"
```

#### search-prs
Read. Fixture: `search-prs.json` (or `search-prs.<id>.json`). Absent → exit `3`, unknown.
```bash
mock_read "search-prs" "${1:-}"
```

#### create-pr
Write. Appends to the journal; changes no fixture.
```bash
mock_write "create-pr" "$@"
```

#### update-pr
Write. Appends to the journal; changes no fixture.
```bash
mock_write "update-pr" "$@"
```

#### comment-pr
Write. Appends to the journal; changes no fixture.
```bash
mock_write "comment-pr" "$@"
```

#### attach-image-evidence
Write. Appends to the journal; changes no fixture.
```bash
mock_write "attach-image-evidence" "$@"
```

#### assign-pr / unassign-pr
Write. Appends to the journal; changes no fixture.
```bash
mock_write "assign-pr" "$@"
```

#### label-pr / unlabel-pr
Write. Appends to the journal; changes no fixture.
```bash
mock_write "label-pr" "$@"
```

#### get-pr-diff
Read. Fixture: `get-pr-diff.json` (or `get-pr-diff.<id>.json`). Absent → exit `3`, unknown.
```bash
mock_read "get-pr-diff" "${1:-}"
```

#### get-pr-files
Read. Fixture: `get-pr-files.json` (or `get-pr-files.<id>.json`). Absent → exit `3`, unknown.
```bash
mock_read "get-pr-files" "${1:-}"
```

#### checkout-pr
Write. Appends to the journal; changes no fixture.
```bash
mock_write "checkout-pr" "$@"
```

#### review-pr
Write. Appends to the journal; changes no fixture.
```bash
mock_write "review-pr" "$@"
```

#### merge-pr
Write. Appends to the journal; changes no fixture.
```bash
mock_write "merge-pr" "$@"
```

#### mark-pr-ready
Write. Appends to the journal; changes no fixture.
```bash
mock_write "mark-pr-ready" "$@"
```

#### get-pr-checks
Read. Fixture: `get-pr-checks.json` (or `get-pr-checks.<id>.json`). Absent → exit `3`, unknown.
```bash
mock_read "get-pr-checks" "${1:-}"
```

#### get-required-checks
Read. Fixture: `get-required-checks.json` (or `get-required-checks.<id>.json`). Absent → exit `3`, unknown.
```bash
mock_read "get-required-checks" "${1:-}"
```

#### branch-protected
Write. Records the call and reports the postcondition from the fixture, so a test can exercise both the protected and the no-permission path without a repository.
```bash
mock_write "branch-protected" "${1:-}"
```

#### get-pr-comment / get-review-comment
Read. Fixture: `get-pr-comment.json` (or `get-pr-comment.<id>.json`). Absent → exit `3`, unknown.
```bash
mock_read "get-pr-comment" "${1:-}"
```

#### list-review-comments
Read. Fixture: `list-review-comments.json` (or `list-review-comments.<id>.json`). Absent → exit `3`, unknown.
```bash
mock_read "list-review-comments" "${1:-}"
```

#### get-pr-template
Read. Fixture: `get-pr-template.txt`. Absent → exit `3`, unknown.
```bash
mock_read "get-pr-template" ""
```

#### get-issue-templates
Read. Fixture: `get-issue-templates.json`. Absent → exit `3`, unknown.
```bash
mock_read "get-issue-templates" ""
```

#### put-verification-record
Write. Records to `put-verification-record.<prNumber>.txt` under the fixture directory, replacing
any previous content — the same marker-idempotent behaviour a real tracker gives, without a
tracker. Prints a fake comment URL so a caller that parses one still works.
```bash
mock_write "put-verification-record" "${1:-}"
printf 'https://mock.invalid/pr/%s#verification-record\n' "${1:-0}"
```

#### get-verification-record
Read. Fixture: `put-verification-record.<prNumber>.txt`, else `get-verification-record.json`.
Absent → exit `3`, unknown. It is deliberately NOT an empty success: a run that reads "no record"
as "the record says pass" is the failure this provider exists to expose.
```bash
mock_read "get-verification-record" "${1:-}"
```

#### list-runs
Read. Fixture: `list-runs.json` (or `list-runs.<id>.json`). Absent → exit `3`, unknown.
```bash
mock_read "list-runs" "${1:-}"
```

#### get-run
Read. Fixture: `get-run.json` (or `get-run.<id>.json`). Absent → exit `3`, unknown.
```bash
mock_read "get-run" "${1:-}"
```

#### get-run-failed-logs
Read. Fixture: `get-run-failed-logs.json` (or `get-run-failed-logs.<id>.json`). Absent → exit `3`, unknown.
```bash
mock_read "get-run-failed-logs" "${1:-}"
```

#### rerun-failed
Write. Appends to the journal; changes no fixture.
```bash
mock_write "rerun-failed" "$@"
```

#### watch-run
Write. Appends to the journal; changes no fixture.
```bash
mock_write "watch-run" "$@"
```

#### list-labels
Read. Fixture: `list-labels.json` (or `list-labels.<id>.json`). Absent → exit `3`, unknown.
```bash
mock_read "list-labels" "${1:-}"
```

#### create-label
Write. Appends to the journal; changes no fixture.
```bash
mock_write "create-label" "$@"
```

#### ensure-label-taxonomy
Write. Appends to the journal; changes no fixture.
```bash
mock_write "ensure-label-taxonomy" "$@"
```

## Normalized fields

`get-pr` fixtures carry the TEMPLATE's normalized fields — `headRefOid`, `baseRefOid` and
`reviewVerdict` — with the same rule as any other provider: a fixture that omits one is read as
the literal `unknown`, not as a default. That is what makes a fixture set able to express
"the host could not tell us" as a first-class state.

## What this provider cannot do

- **merge-pr** records the intent and merges nothing. A test asserts the journal entry; it must
  never conclude that a merge would have succeeded.
- There is no clock and no CI. `watch-run` returns its fixture once and does not poll.
- Nothing here proves a real descriptor works. It proves a *skill* follows its own rules when
  the tracker answers in a given way, which is a different and smaller claim.
