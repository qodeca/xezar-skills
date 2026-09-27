#!/usr/bin/env bash
# The only way a review or QA step runs the change it judges (DECISIONS.md, D13).
#
# A review step (code-review, security-review, architecture-review, qa, design-review,
# acceptance-verification) holds no Edit and no Write, and its `bashAllowlist` is the kit's reading
# set plus this script. So it may RUN the pull request – check its head out in this run's own
# worktree, install, run the tests and the build, start a dev server – but it has no git or gh
# command that commits, pushes, resets or moves to another branch. Running a PR's code means
# running whatever that code does, so the allowlist is not the boundary; the boundary is the check
# before the verdict: `verdict-write.sh` runs `finish`, which fails when the worktree's tracked
# files or its HEAD differ from the head that was reviewed, and then the verdict is refused. Build caches, installed dependencies and
# gitignored output do not count.
#
# Usage:
#   review-run.sh checkout <pr-number>        check the PR's head out, detached, in THIS worktree,
#                                             and record it as the reviewed head (once per run)
#   review-run.sh install                     install dependencies here (deps-restore.sh)
#   review-run.sh run <program> [<args>…]     run one project command here, in the foreground
#   review-run.sh start <name> <program> […]  start one long-running command (a dev server) in the
#                                             background; its log is <evidence>/review/<name>.log
#   review-run.sh stop [<name>]               stop one started command, or all of them
#   review-run.sh verify-unchanged            exit 0 only when the tracked tree equals the
#                                             reviewed head (below); prints review-tree=<status>
#   review-run.sh finish                      stop everything started, then verify-unchanged –
#                                             verdict-write.sh runs this before a packet
#
# The reviewed head: the one `checkout` recorded; without a checkout, HEAD must be the run's own
# branch with no commit of its own (an ancestor of the base branch, local or origin).
#
# Refused as <program>: git and gh (their writing subcommands are exactly what a reviewer may not
# run – read through git-read.sh and gh pr view/diff instead), sudo/su, and every shell or wrapper
# that would run another program unseen (bash, sh, zsh, dash, env, eval, exec, xargs, nohup,
# command, timeout, nice). Never the project's main checkout: this script refuses to run there.
#
# Exit: the command's own status for `run`; 0 ok, 1 refused or changed, 2 usage.
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
# shellcheck source=lib/common.sh
. "$SCRIPT_DIR/lib/common.sh"

refuse() {
  echo "review-run.sh: refused: $*" >&2
  exit 1
}

usage() {
  echo "usage: review-run.sh checkout <pr> | install | run <program> [<args>…] | start <name> <program> [<args>…] | stop [<name>] | verify-unchanged | finish" >&2
  exit 2
}

[ $# -ge 1 ] || usage
sub="$1"
shift

resolve_task_paths || refuse "cannot resolve this checkout"
[ "$IS_WORKTREE" -eq 1 ] || refuse "this is the project's main checkout; a review runs code only in its own task worktree"
evidence="$(task_evidence_dir)" || refuse "no run identity for this worktree, so there is nowhere to record the reviewed head"
state="$evidence/review"
mkdir -p "$state" || refuse "cannot create $state"
cd "$TASK_CWD" || exit 1

REFUSED_PROGRAMS="git gh sudo su bash sh zsh dash ksh fish env eval exec xargs nohup command timeout nice"

check_program() {
  local program="${1:-}" base
  [ -n "$program" ] || usage
  base="${program##*/}"
  case " $REFUSED_PROGRAMS " in *" $base "*) refuse "\"$base\" is not a command a review step runs (see the header of review-run.sh)" ;; esac
}

valid_name() {
  printf '%s' "${1:-}" | grep -Eq '^[a-z0-9][a-z0-9-]{0,31}$' || refuse "\"${1:-}\" is not a name (lower-case letters, digits and -)"
}

tracked_changes() {
  git status --porcelain --untracked-files=no 2>/dev/null
}

stop_one() {
  local pidfile="$1" pid
  pid="$(cat "$pidfile" 2>/dev/null)" || return 0
  if printf '%s' "$pid" | grep -Eq '^[1-9][0-9]*$' && kill -0 "$pid" 2>/dev/null; then
    kill "$pid" 2>/dev/null
    sleep 1
    kill -0 "$pid" 2>/dev/null && kill -9 "$pid" 2>/dev/null
  fi
  rm -f "$pidfile"
}

verify_unchanged() {
  local head recorded changes
  head="$(git rev-parse HEAD 2>/dev/null)" || { echo "review-tree=fail"; echo "review-run.sh: HEAD cannot be read" >&2; return 1; }
  if [ -f "$state/head" ]; then
    recorded="$(cat "$state/head")"
    if [ "$head" != "$recorded" ]; then
      echo "review-tree=fail"
      echo "review-run.sh: HEAD is $head, and the reviewed head was $recorded – the review moved or committed" >&2
      return 1
    fi
  else
    if ! git merge-base --is-ancestor HEAD "refs/heads/$BASE_BRANCH" 2>/dev/null &&
       ! git merge-base --is-ancestor HEAD "refs/remotes/origin/$BASE_BRANCH" 2>/dev/null; then
      echo "review-tree=fail"
      echo "review-run.sh: HEAD $head has commits the base branch does not, and no head was checked out for review – the review committed" >&2
      return 1
    fi
  fi
  changes="$(tracked_changes)"
  if [ -n "$changes" ]; then
    echo "review-tree=fail"
    printf 'review-run.sh: the review changed tracked files:\n%s\n' "$changes" >&2
    return 1
  fi
  echo "review-tree=unchanged head=$head"
}

case "$sub" in
  checkout)
    [ $# -eq 1 ] || usage
    printf '%s' "$1" | grep -Eq '^[1-9][0-9]{0,9}$' || refuse "\"$1\" is not a PR number"
    [ -f "$state/head" ] && refuse "this run already reviews $(cat "$state/head"); one reviewed head per run"
    [ -z "$(tracked_changes)" ] || refuse "the worktree has tracked changes before the checkout"
    gh pr checkout "$1" --detach || refuse "gh pr checkout $1 --detach failed"
    head="$(git rev-parse HEAD)" || exit 1
    want="$(gh pr view "$1" --json headRefOid --jq .headRefOid 2>/dev/null)" || want=""
    [ "$head" = "$want" ] || refuse "checked out $head, and the PR's head is ${want:-unknown}"
    printf '%s\n' "$head" >"$state/head"
    printf '%s\n' "$1" >"$state/pr"
    echo "review-head=$head pr=$1"
    ;;
  install)
    [ $# -eq 0 ] || usage
    bash "$SCRIPT_DIR/deps-restore.sh"
    ;;
  run)
    check_program "${1:-}"
    "$@"
    ;;
  start)
    [ $# -ge 2 ] || usage
    valid_name "$1"
    name="$1"
    shift
    check_program "$1"
    if [ -f "$state/$name.pid" ] && kill -0 "$(cat "$state/$name.pid")" 2>/dev/null; then
      refuse "\"$name\" is already running"
    fi
    nohup "$@" >"$state/$name.log" 2>&1 </dev/null &
    printf '%s\n' "$!" >"$state/$name.pid"
    echo "review-started=$name pid=$! log=$state/$name.log"
    ;;
  stop)
    [ $# -le 1 ] || usage
    if [ $# -eq 1 ]; then
      valid_name "$1"
      stop_one "$state/$1.pid"
    else
      for pidfile in "$state"/*.pid; do [ -e "$pidfile" ] && stop_one "$pidfile"; done
    fi
    ;;
  verify-unchanged)
    [ $# -eq 0 ] || usage
    verify_unchanged
    ;;
  finish)
    [ $# -eq 0 ] || usage
    for pidfile in "$state"/*.pid; do [ -e "$pidfile" ] && stop_one "$pidfile"; done
    verify_unchanged
    ;;
  *) usage ;;
esac
