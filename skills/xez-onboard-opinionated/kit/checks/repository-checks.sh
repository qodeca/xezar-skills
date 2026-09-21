#!/usr/bin/env bash
# Fast checks against the actual repository, run as the last gate command.
#
# Each check below is SKIPPED, loudly, when the thing it inspects is not part of this project.
# That matters because this file is vendored into projects that do not all carry a changelog, a
# dogfooding ledger or a contract test. Under `set -e` an unconditional call to a missing file
# aborts the whole gate on the first one, and every check after it silently never runs - which
# reads as "the gate passed" to anyone watching the exit code.
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd -P)"

skip() { printf 'repository-checks: skipped %s (%s)\n' "$1" "$2"; }

# The `.local/xezar/` working area keeps its six named subfolders and nothing loose at the top.
bash "$SCRIPT_DIR/local-tree.sh"

node "$SCRIPT_DIR/catalog-check.mjs" "$REPO_ROOT"

# `--diff-base auto` refuses a direct `# Unreleased` edit: inside the gate run it resolves the
# attempt's own base; run bare it falls back to the remote default branch then the local one, and
# says so when neither exists. `--fragments` parses the per-pull-request changelog fragments.
# The fragment flow needs BOTH the changelog and a `changelog.d/` folder. A project that edits its
# changelog directly has no fragments to check, so the check is skipped, loudly, until the owner
# adopts fragments (create `changelog.d/` to turn it on).
if [ -f "$REPO_ROOT/CHANGELOG.md" ] && [ ! -d "$REPO_ROOT/changelog.d" ]; then
  skip changelog-check "CHANGELOG.md exists but this project has no changelog.d/ fragment folder"
elif [ -f "$REPO_ROOT/CHANGELOG.md" ]; then
  bash "$SCRIPT_DIR/changelog-check.sh" --file "$REPO_ROOT/CHANGELOG.md" --diff-base auto \
    --fragments "$REPO_ROOT/changelog.d"
else
  skip changelog-check "no CHANGELOG.md in this project"
fi

# The dogfooding ledger has the same fragment shape, and a malformed entry would only surface at
# the next release fold. Catch it here.
if [ -d "$REPO_ROOT/.xezar/docs/dogfooding.d" ]; then
  node "$SCRIPT_DIR/dogfooding-fragments.mjs" --check "$REPO_ROOT/.xezar/docs/dogfooding.d"
else
  skip dogfooding-fragments "no .xezar/docs/dogfooding.d ledger in this project"
fi

# Marked fenced quotes are exact copies of maintained repository files. A missing source is a
# failure, not a skip: a document can otherwise keep quoting a file from a different branch.
node "$SCRIPT_DIR/fenced-quotes.mjs" "$REPO_ROOT"

# Documented JSON keys are verified only by fixed scripts named in the reviewed allowlist; marker
# text can never select a path or command to execute. This is also where the leader-context
# loader's own fixture case runs - it is built in here, not shipped as a separate test file.
node "$SCRIPT_DIR/documented-output.mjs" "$REPO_ROOT"

# Offline relative-link and anchor check. Present only where the project keeps its own copy.
if [ -f "$REPO_ROOT/scripts/check-links.mjs" ]; then
  node "$REPO_ROOT/scripts/check-links.mjs"
else
  skip check-links "no scripts/check-links.mjs in this project"
fi

if [ -f "$SCRIPT_DIR/xezar-contract.test.mjs" ]; then
  node --test "$SCRIPT_DIR/xezar-contract.test.mjs"
else
  skip xezar-contract "no contract test installed beside these checks"
fi
