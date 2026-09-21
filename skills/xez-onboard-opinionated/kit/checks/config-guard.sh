#!/usr/bin/env bash
# Refuses a guarded workflow before anything is paid for, when the project never configured it.
#
# Some workflows only make sense in a project that has said something first: a deploy needs an
# environment, a performance verdict needs a budget, a locale needs to be on the list. They are
# installed everywhere — a project that gains a deploy next month should find the workflow already
# there — so the question "is this one awake here?" is asked at run time, by this script, as the
# step BEFORE `setup`. `setup` is a full dependency install; refusing after it means minutes of
# work to learn that this project has no deploy.
#
#   config-guard.sh <key> [--from-base]
#
# Four answers, and the two refusals that matter are different sentences on purpose:
#   ok         exit 0   the list is there and every entry is the right shape
#   empty      exit 1   the key is `[]`: the owner's honest "this project has none"
#   absent     exit 1   the key is not set at all
#   malformed  exit 2   a misspelt key, a wrong type, an entry of the wrong shape
# A typo must never read as "none configured". The grammar lives in lib/config-grammar.mjs.
#
# --from-base reads the config from `origin/<base branch>` instead of this checkout, and for the
# `deploy.*` keys also requires each named workflow file to exist THERE with a
# `workflow_dispatch` trigger. A deploy target is a trust boundary: a branch under review must
# not be able to repoint `production=` at a workflow file it adds itself.
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
# shellcheck source=lib/common.sh
. "$SCRIPT_DIR/lib/common.sh"

KEY="${1:-}"
FROM_BASE=0
[ "${2:-}" = "--from-base" ] && FROM_BASE=1
if [ -z "$KEY" ]; then
  printf 'config-guard: usage: config-guard.sh <key> [--from-base]\n' >&2
  exit 2
fi
if ! resolve_task_paths; then
  printf 'config-guard: cannot resolve this checkout\n' >&2
  exit 2
fi

CFG_REL=".xezar/pipeline/config.json"
if [ "$FROM_BASE" -eq 1 ]; then
  SOURCE_NAME="origin/$BASE_BRANCH:$CFG_REL"
  git -C "$TASK_CWD" fetch --quiet origin "$BASE_BRANCH" 2>/dev/null || true
  CFG_TEXT="$(git -C "$TASK_CWD" show "origin/$BASE_BRANCH:$CFG_REL" 2>/dev/null)" || {
    printf 'config-guard: malformed — cannot read %s; the base branch is where this key is trusted from\n' "$SOURCE_NAME" >&2
    exit 2
  }
else
  SOURCE_NAME="$CFG_REL"
  CFG_TEXT="$(cat "$TASK_CWD/$CFG_REL" 2>/dev/null)" || {
    printf 'config-guard: absent — %s does not exist, so "%s" is not set\n' "$CFG_REL" "$KEY" >&2
    exit 1
  }
fi

VERDICT="$(printf '%s' "$CFG_TEXT" | node --input-type=module -e '
  import { judge } from "'"$SCRIPT_DIR"'/lib/config-grammar.mjs";
  let text = "";
  for await (const chunk of process.stdin) text += chunk;
  let config;
  try { config = JSON.parse(text); } catch { console.log("malformed\tnot valid JSON"); process.exit(0); }
  const result = judge(config, process.argv[1]);
  console.log(`${result.status}\t${result.detail}`);
  for (const value of result.values) console.log(value);
' "$KEY" 2>/dev/null)" || {
  printf 'config-guard: malformed — the grammar check itself could not run; an unknown answer is never a pass\n' >&2
  exit 2
}

STATUS="$(printf '%s\n' "$VERDICT" | sed -n '1p' | cut -f1)"
DETAIL="$(printf '%s\n' "$VERDICT" | sed -n '1p' | cut -f2-)"

case "$STATUS" in
  ok) ;;
  empty)
    printf 'config-guard: empty — %s in %s. This project has said it has none, so this workflow does not run here. To wake it, fill the list.\n' "$DETAIL" "$SOURCE_NAME" >&2
    exit 1 ;;
  absent)
    printf 'config-guard: absent — %s in %s. Nobody has answered this for this project yet; set the key, or set it to [] to say there is none.\n' "$DETAIL" "$SOURCE_NAME" >&2
    exit 1 ;;
  *)
    printf 'config-guard: malformed — %s (%s). This is a fault in the config, not a project with none.\n' "$DETAIL" "$SOURCE_NAME" >&2
    exit 2 ;;
esac

# A deploy target must be a dispatchable workflow that exists on the base branch.
if [ "$FROM_BASE" -eq 1 ]; then
  case "$KEY" in
    deploy.*)
      while IFS= read -r entry; do
        [ -n "$entry" ] || continue
        file="${entry#*=}"
        body="$(git -C "$TASK_CWD" show "origin/$BASE_BRANCH:.github/workflows/$file" 2>/dev/null)" || {
          printf 'config-guard: malformed — %s names %s, and origin/%s has no .github/workflows/%s\n' "$KEY" "$entry" "$BASE_BRANCH" "$file" >&2
          exit 2
        }
        printf '%s\n' "$body" | grep -Eq '^[[:space:]]*workflow_dispatch[[:space:]]*:' || {
          printf 'config-guard: malformed — %s on origin/%s has no workflow_dispatch trigger, so nothing here can start it\n' "$file" "$BASE_BRANCH" >&2
          exit 2
        }
      done <<LIST
$(printf '%s\n' "$VERDICT" | sed '1d')
LIST
      ;;
  esac
fi

printf 'config-guard: ok — %s: %s (%s)\n' "$KEY" "$DETAIL" "$SOURCE_NAME"
