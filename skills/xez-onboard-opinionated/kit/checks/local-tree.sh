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

# Single-project mode (`.xezar/workspace.json` present): the ENGINE keeps its own working files at
# the top level of `.local/xezar/`. They are the engine's, not loose work, and nothing here may move
# them. The list is closed and exact on purpose: a name that is not on it is still reported.
#
# THAT MAKES THIS LIST A CROSS-REPOSITORY SURFACE, and it is worth knowing which way it cuts. The
# engine can add a state file here as a routine change — its own contributor guidance says a
# blanket `.local/` ignore means a new state file needs no entry anywhere, which is true of git and
# false of this check. The cost lands entirely on the consumer: a name this list does not carry
# fails a gate in EVERY onboarded project, on EVERY run, for a file nobody did anything wrong to
# create. So the list is extended by a release of this kit, never by editing an installed copy, and
# the engine team has undertaken to announce a new top-level name before it ships (agreed for
# engine 0.19.0 onward, 2026-09-22).
#
# THREE THINGS ARE INTENTIONS, NOT GUARANTEES, as of engine 0.18.0, and they are listed together
# so none gets promoted by repetition: (1) that announcement; (2) their documenting this top level
# as a surface at all; (3) their recording it as a SHAPE — base names plus the suffixes below —
# rather than as a fixed set of names. All three were agreed between sessions on 2026-09-22 and
# none is recorded in the engine's own compatibility document yet. Treat each as goodwill until it
# is. That is why this check does not lean on any of them: the list is extended by a release of
# this kit, the match is by prefix, and the failure message below names a new engine file as the
# likely cause rather than leaving somebody to work it out mid-gate.
#
# A SUBDIRECTORY is not the same risk: `ENGINE_DIRS` covers the engine's folders, and anything the
# engine writes INSIDE one of them is invisible to this check by construction. Only the top level
# is closed.
#
# THE SIX ADDED ON 2026-09-22 SHOW HOW THIS LIST GOES STALE, and it is not by the engine changing.
# A measured listing of engine 0.18.0 covered every name already here — the list was CORRECT for
# everything that exercise produced. The gap was in the names it could not produce: `pi-leader.json`
# needs a pi leader attached, and the five `automation*` entries need an opt-in flag nobody had
# turned on. So they were missing for as long as this check has existed, at every engine version,
# and no amount of watching releases would have surfaced them — the first project to switch on
# automations would have found them instead, as a gate failing on every run. All six are
# `join(dataDir, …)` in the engine source, verified before being added rather than taken on report.
#
# The lesson for whoever extends this next: a listing shows what the features you ENABLED write.
# Reading the source shows what every feature CAN write, and that is the larger set.
#
# So the list below was then rebuilt from a full SOURCE enumeration of engine 0.18.0 rather than
# from any run - every path built from `dataDir`, with filename constants resolved, production code
# only. That found a whole class no exact list can hold: the engine's atomic writes and locks land
# beside its state files under names containing a pid and random hex, and the audit trail rotates
# through numbered suffixes. Hence the prefix match below. Repeat the enumeration, not a listing,
# when this is next revisited.
ENGINE_DIRS=""
ENGINE_FILES=""
if [ -f "$REPO_ROOT/.xezar/workspace.json" ]; then
  # `kit` is the one name here that a source enumeration of 0.18.0 missed and the engine team's own
  # scan found: `projectKitDir` (`src/project-kit-paths.ts`) falls back to `.local/xezar/kit` when
  # the repo root IS the user's home directory, so that a home launch cannot turn the workspace
  # file into a kit. Onboarded projects are not launched from `$HOME`, so this should never appear
  # - which is the reason to allow it rather than argue about it. A name that cannot occur costs
  # nothing to permit and costs every project a red gate if the reasoning is ever wrong.
  ENGINE_DIRS="ipc mcp mcp-owner-claims runs writer-claims tmp campaigns kit"
  # BASE names only. The match below is a prefix match, so `<name>.tmp`, `<name>.lock`,
  # `<name>.<pid>.<hex>.tmp` and `audit.ndjson.1`..`.4` are all covered without being listed.
  ENGINE_FILES="audit.ndjson mcp-audit.ndjson launch-key machine-state.json mcp-connection.json mcp-operations.ndjson mcp-operations.json onboarding-state.json runs.json ui-state.json todos.json pi-leader.json automations.json automation-state.json automation-receipts.ndjson automation-log.ndjson automation-poll.lock"
fi

# Only the primary checkout has the full tree. A task worktree creates the one or two subfolders
# it needs, so running this there would report four missing folders on every single task.
git_dir="$(git -C "$REPO_ROOT" rev-parse --path-format=absolute --git-dir 2>/dev/null || true)"
common_dir="$(git -C "$REPO_ROOT" rev-parse --path-format=absolute --git-common-dir 2>/dev/null || true)"
if [ -n "$git_dir" ] && [ "$git_dir" != "$common_dir" ]; then
  echo "local-tree: linked worktree - skipped (the primary checkout owns the tree)."
  exit 0
fi

# Absent is not a failure: a fresh clone has no .local/ at all, because git stores no empty
# directories. The first run in a new checkout must not fail for that.
[ -d "$LOCAL" ] || { echo "local-tree: no .local/xezar/ directory yet - nothing to check."; exit 0; }

loose=""
for entry in "$LOCAL"/* "$LOCAL"/.[!.]* "$LOCAL"/..?*; do
  # `-e` is false for a BROKEN symlink, so `-L` is what catches a dangling link. Without it a
  # dangling link is the one kind of loose entry this check cannot see.
  { [ -e "$entry" ] || [ -L "$entry" ]; } || continue
  name="$(basename "$entry")"
  # A bare .gitignore at the top level is part of the structure, not loose.
  [ "$name" = ".gitignore" ] && continue
  if [ -d "$entry" ]; then
    case " $ALLOWED $ENGINE_DIRS " in
      *" $name "*) continue ;;
    esac
    loose="$loose  $name/ (unexpected directory)"$'\n'
  else
    # PREFIX match, not exact. The engine writes transient siblings beside its state files whose
    # names cannot be enumerated: atomic writes land at `<file>.<pid>.<hex>.tmp`, locks at
    # `<file>.lock`, and the audit trail rotates to `audit.ndjson.1` through `.4` past 10 MB. These
    # exist DURING normal operation, and this check runs as a gate command while the engine is
    # live, so a run that races an atomic write would fail on a file that is gone a millisecond
    # later - the worst kind of flake, and one no exact list can prevent. Matching `<known>` or
    # `<known>.*` covers every one of them in a single rule.
    #
    # It also covers one the engine team found only after their own review pressed on it:
    # `<file>.lock.takeover`, written by `core/file-lock.ts` on EVERY lock release rather than only
    # on a stale takeover, and reached on every audit write. It was missing from their documented
    # suffix list too. A rule that matches shapes absorbs that; an enumeration would have needed a
    # release to learn it. Keep the rule, not a longer list.
    #
    # The trade, stated: a stray file a person names `runs.json.notes` is skipped. That is worth
    # it. A missed stray file is untidiness; a false failure is every project's gate going red on
    # a timing coincidence.
    matched=""
    for known in $ENGINE_FILES; do
      case "$name" in
        "$known" | "$known".*) matched=1; break ;;
      esac
    done
    [ -n "$matched" ] && continue
    case " $ENGINE_FILES " in
      *" $name "*) continue ;;
    esac
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
  if [ -f "$REPO_ROOT/.xezar/workspace.json" ]; then
    echo
    echo "  DID YOU JUST UPGRADE THE ENGINE? Then this may not be loose work at all. The list of"
    echo "  engine files allowed here is CLOSED and exact, so a state file a new engine release"
    echo "  adds at this level is reported exactly like a stray file - in every project, on every"
    echo "  run. If the name above looks like the engine's rather than yours, do not move it:"
    echo "  report it so the allowed list is extended, and skip this check until it is."
  fi
  status=1
fi

[ "$status" -eq 0 ] && echo "local-tree: OK - .local/xezar/ has its six subfolders and nothing loose."
exit "$status"
