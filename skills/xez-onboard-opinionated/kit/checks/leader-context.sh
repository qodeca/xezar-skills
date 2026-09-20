#!/usr/bin/env bash
# SessionStart hook for the project leader session: load the leader guide and the live campaign
# notes into the session at start and after every context compaction.
#
# Prints exactly one JSON hook payload, or nothing at all. The hook is for the LEADER session in
# the primary checkout; a xezar task agent must never receive it, because the guide is irrelevant
# to the work a task was given. It therefore stays silent:
#   - in a linked worktree (`--git-dir` differs from `--git-common-dir`), which is where every
#     task runs by default;
#   - when the path itself is a task worktree (`/.local/xezar/worktrees/` or the legacy
#     `/.local/xezar/worktrees/`);
#   - whenever xezar set `XEZ_HANDOFF_FILE`, `XEZ_TODOS_FILE` or `XEZ_TASK_ID` for this process,
#     which covers a Worktree-OFF task running in the primary checkout. `XEZ_TASK_ID` is the one
#     that is unconditional and always non-empty; `XEZ_TODOS_FILE` is set to an EMPTY string when
#     follow-ups are off (`run.ts` `agentEnv`), and an empty value reads as absent here, so it is
#     not a signal on its own;
#   - when the guide file is missing, so an older checkout degrades to no output rather than an
#     error.
#
# Exit status is always 0: a hook that fails must not break session start. The escaping is done
# by node, so no guide or note text can produce malformed JSON.
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd -P)"
GUIDE="$REPO_ROOT/.xezar/docs/leader-guide.md"
CAMPAIGNS="$REPO_ROOT/.xezar/campaigns"

silent() { exit 0; }

# A xezar task agent, even one running in the primary checkout with Worktree off.
[ -z "${XEZ_HANDOFF_FILE:-}" ] || silent
[ -z "${XEZ_TODOS_FILE:-}" ] || silent
[ -z "${XEZ_TASK_ID:-}" ] || silent

# A task worktree, by path or by git registration.
case "$PWD" in */.local/xezar/worktrees/*|*/.local/xezar/worktrees/*) silent ;; esac
case "$REPO_ROOT" in */.local/xezar/worktrees/*|*/.local/xezar/worktrees/*) silent ;; esac
git_dir="$(git -C "$REPO_ROOT" rev-parse --path-format=absolute --git-dir 2>/dev/null || true)"
common_dir="$(git -C "$REPO_ROOT" rev-parse --path-format=absolute --git-common-dir 2>/dev/null || true)"
[ -n "$git_dir" ] && [ "$git_dir" = "$common_dir" ] || silent

# Without the guide there is nothing to load.
[ -f "$GUIDE" ] || silent

# The live campaign folder under .xezar/campaigns, if one exists. Two rules, both load-bearing:
#
#   - Chosen by NAME, not by modification time. Folders carry a compact start date
#     (`20260817-amber-ridge`), so the name is the sort key. Reading, grepping or copying an old
#     campaign no longer promotes it to "current", which is exactly what a newest-modified lookup
#     does — it silently loads a finished campaign as the live one.
#   - Only digit-prefixed names are candidates. The reserved `future-campaign/` holds work aimed at
#     a campaign that has not opened yet. It sorts after every `2026...` name, so an unfiltered
#     lookup would pick it every single time. It is excluded by shape, not by remembering the name.
campaign=""
if [ -d "$CAMPAIGNS" ]; then
  name="$(ls -1 "$CAMPAIGNS" 2>/dev/null | grep -E '^[0-9]' | LC_ALL=C sort | tail -n 1 || true)"
  [ -n "$name" ] && [ -d "$CAMPAIGNS/$name" ] && campaign="$CAMPAIGNS/$name/"
fi

# A campaign note grows for the life of a campaign, so the narrative notes are bounded to their
# LAST bytes. The leader reads the tail anyway, and a note that was cut is labelled with its own
# path so a partial note is never mistaken for the whole.
#
# `decisions.md` is the ONE exception: it is injected whole, never truncated. It holds the owner's
# exact words, append-only, and the oldest entry binds the leader exactly as hard as the newest.
# Cutting its head would silently drop standing decisions the leader is still required to follow —
# and it would do so without any visible failure, which is the worst shape a defect can take.
NOTE_TAIL_BYTES=65536
note_tail() {
  local file="$1" heading="$2" size
  size="$(wc -c < "$file" 2>/dev/null | tr -d '[:space:]')"
  printf '\n\n=== %s ===\n\n' "$heading"
  if [ "${size:-0}" -gt "$NOTE_TAIL_BYTES" ]; then
    printf '[note truncated: %s is %s bytes; showing only its last %s bytes]\n\n' "$file" "$size" "$NOTE_TAIL_BYTES"
    tail -c "$NOTE_TAIL_BYTES" "$file"
  else
    cat "$file"
  fi
}

{
  printf '%s\n\n' '=== .xezar/docs/leader-guide.md (project leader guide) ==='
  cat "$GUIDE"
  if [ -n "$campaign" ] && [ -d "$campaign" ]; then
    [ -f "${campaign}README.md" ] && note_tail "${campaign}README.md" "${campaign}README.md (campaign live state)"
    newest_timeline="$(ls -1 "$campaign" 2>/dev/null | grep -E '^timeline-.*\.md$' | LC_ALL=C sort | tail -n 1 || true)"
    [ -n "$newest_timeline" ] && note_tail "${campaign}${newest_timeline}" "${campaign}${newest_timeline} (newest day timeline)"
    [ -f "${campaign}parked.md" ] && note_tail "${campaign}parked.md" "${campaign}parked.md (decisions the leader made alone, waiting for the owner)"
    # Whole, never truncated. See NOTE_TAIL_BYTES above.
    if [ -f "${campaign}decisions.md" ]; then
      printf '\n\n=== %s ===\n\n' "${campaign}decisions.md (owner decisions, exact words — complete)"
      cat "${campaign}decisions.md"
    fi
  fi
} | node -e 'const fs=require("node:fs");const text=fs.readFileSync(0,"utf8");process.stdout.write(JSON.stringify({hookSpecificOutput:{hookEventName:"SessionStart",additionalContext:text}})+"\n")'

exit 0
