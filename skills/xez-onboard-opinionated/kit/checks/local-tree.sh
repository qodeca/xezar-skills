#!/usr/bin/env bash
# Reports anything loose at the top level of `.local/xezar/`.
#
# `.local/xezar/` is the project's untracked working area. It has six named subfolders, each with a
# stated meaning, and everything written there belongs inside one of them. A file dropped at the
# top level is how that structure erodes: nobody deletes it, the next writer copies the habit, and
# within a campaign the folder is a junk drawer nobody trusts.
#
# This is a CHECK, not a rule in a document, because a rule about tidiness is exactly the kind of
# rule that gets skimmed and ignored. It costs one directory listing and it fires the same way
# every time.
#
# Exit 0 = clean. Exit 1 = something is loose. It never deletes anything: what to do with a stray
# file is a judgement, and a check that silently removes work is worse than the mess.
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd -P)"
LOCAL="$REPO_ROOT/.local/xezar"

# The six named subfolders. Anything else at the top level is loose.
ALLOWED="runtime tasks worktrees scratch cache qa"

[ -d "$LOCAL" ] || { echo "local-tree: no .local/xezar/ directory - nothing to check."; exit 0; }

loose=""
for entry in "$LOCAL"/* "$LOCAL"/.[!.]*; do
  [ -e "$entry" ] || continue
  name="$(basename "$entry")"
  # A bare .gitignore at the top level is part of the structure, not loose.
  [ "$name" = ".gitignore" ] && continue
  if [ -d "$entry" ]; then
    case " $ALLOWED " in
      *" $name "*) continue ;;
    esac
    loose="$loose  $name/ (unexpected directory)"$'\n'
  else
    loose="$loose  $name (file at the top level)"$'\n'
  fi
done

missing=""
for name in $ALLOWED; do
  [ -d "$LOCAL/$name" ] || missing="$missing $name"
done

status=0

if [ -n "$missing" ]; then
  echo "local-tree: missing expected subfolder(s):$missing"
  echo "  Create them empty. The structure is the point; an absent folder invites a loose file."
  status=1
fi

if [ -n "$loose" ]; then
  echo "local-tree: loose entries at the top level of .local/xezar/"
  printf '%s' "$loose"
  echo
  echo "  Every path under .local/xezar/ belongs in one of: $ALLOWED"
  echo "    runtime/   state the current session needs and can rebuild"
  echo "    tasks/     per-task scratch, one folder per run"
  echo "    worktrees/ linked worktrees for running tasks"
  echo "    scratch/   throwaway working files"
  echo "    cache/     anything re-derivable"
  echo "    qa/        QA artefacts: screenshots, recordings, reports"
  echo "  Move each entry into the right one, or delete it. This check never deletes anything."
  status=1
fi

[ "$status" -eq 0 ] && echo "local-tree: OK - .local/xezar/ has its six subfolders and nothing loose."
exit "$status"
