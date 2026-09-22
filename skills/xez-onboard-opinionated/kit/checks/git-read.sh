#!/usr/bin/env bash
# The only way a reading role runs git.
#
# A reading step (no Edit, no Write in its `allowedTools`) carries a `bashAllowlist`, and the engine
# turns each entry into a command prefix. A prefix cannot say "but not this flag": `git diff`,
# `git log` and `git show` all accept `--output=<file>`, which writes wherever it is pointed. So a
# reading step is not allowed `git` at all; it is allowed this script, which runs one of a fixed set
# of reading subcommands and refuses every argument that makes git write or run a helper.
#
# Usage:
#   git-read.sh <subcommand> [<args>…]
#
#   <subcommand> is one of: diff | log | show | rev-parse | status | merge-base | ls-files |
#                           cat-file | blame | describe
#
# Exit: git's own status on a run, 1 on a refused argument, 2 on usage.
set -uo pipefail

usage() {
  echo "usage: git-read.sh <diff|log|show|rev-parse|status|merge-base|ls-files|cat-file|blame|describe> [<args>…]" >&2
  exit 2
}

[ $# -ge 1 ] || usage
sub="$1"
shift

case "$sub" in
  diff | log | show | rev-parse | status | merge-base | ls-files | cat-file | blame | describe) ;;
  *)
    echo "git-read.sh: refused: \"$sub\" is not a reading subcommand this script runs" >&2
    exit 1
    ;;
esac

# Each of these makes git write a file or run a program the repository configures.
for arg in "$@"; do
  case "$arg" in
    --output | --output=* | --ext-diff | --textconv | --exec | --exec=* | --upload-pack* | --git-dir* | --work-tree*)
      echo "git-read.sh: refused: \"$arg\" can make git write or run a helper" >&2
      exit 1
      ;;
  esac
done

case "$sub" in
  diff | log | show) exec git --no-pager "$sub" --no-ext-diff --no-textconv "$@" ;;
  status) exec git --no-pager status --no-renames "$@" ;;
  *) exec git --no-pager "$sub" "$@" ;;
esac
