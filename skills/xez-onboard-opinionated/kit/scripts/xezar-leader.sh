#!/usr/bin/env bash
# Start the project leader: a Claude Code session attached to this project's xezar engine.
#
# The flag below is `--dangerously-load-development-channels`. It lets the xezar MCP server push
# events straight into the leader session. Without it the leader falls back to polling. The vendor
# put the word "dangerously" in the name on purpose, and Claude Code shows a warning on every
# launch: only run this against a server you trust. The server here is the `xezar` entry in
# `.mcp.json`.
#
# This script starts nothing but the session. It never starts the engine and never installs a
# skill: it says what is missing and stops, or warns and carries on.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."

# The engine names its socket after the project id, not the folder: lower-cased, with other
# characters turned into '-', sometimes a '-2' suffix, or a hash for a long path. So accept any
# socket in the ipc folder, which in single-project mode belongs to this project alone.
socket=""
for candidate in .local/xezar/ipc/*.sock; do
  if [ -S "$candidate" ]; then
    socket="$candidate"
    break
  fi
done
if [ -z "$socket" ]; then
  echo "xezar-leader: the engine is not running here (no socket in .local/xezar/ipc/)." >&2
  echo "  Start it in its own terminal, in this folder, and leave it open:" >&2
  echo "    xezar --single-project --no-open" >&2
  exit 1
fi

# The xez-* skills are installed per machine, not committed. Warn, never install.
if [ ! -e ".claude/skills/xez-add-rule" ]; then
  echo "xezar-leader: the xez-* skills are missing in this clone. AGENTS.md says how to get them." >&2
fi

# One leader per project, and the engine has no takeover. If the session reports that the project
# is occupied, close the other Claude Code session in this folder and start this script again.

# XEZAR_LEADER=1 is what tells the SessionStart hook that THIS session is the leader. Any other
# session in the checkout gets no leader guide.
export XEZAR_LEADER=1
# --settings loads the leader's own permission to merge a PR. A project .claude/settings.json rule
# would reach every agent, read-only reviewers included, and Claude Code reads auto mode's allow
# list only from user settings or this flag, never from the project's own settings.
exec claude --dangerously-load-development-channels server:xezar --settings scripts/xezar-leader-settings.json "$@"
