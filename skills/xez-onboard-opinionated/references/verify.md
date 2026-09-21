# Verify — finishing after the merge

Called from preflight check 4 when a run is unfinished, and by `--verify`. It finishes steps 7 to
10 and ends with a checklist in which **every line is proved by something read back**, never by
what an earlier step intended.

Nothing here re-asks the interview, and nothing here rewrites a setup file.

## 1. Where things stand

Read `.local/xezar/runtime/onboarding-pending.json`. Then, through tracker operations, read the
setup pull request it names:

- **Still open** — say so and offer the two ways on: the owner merges it, or tells this skill to
  (`references/write.md` §6 has the condition). Do not protect a branch the setup has not landed on.
- **Merged** — make sure the working tree is on the base branch and up to date. A session still
  sitting on the setup branch verifies the wrong files.
- **Closed unmerged** — stop. The setup was rejected; removing the pending file is the owner's call.

## 2. The engine tools, and which state they are in

Setup results use four words, and none implies the next: **files prepared**, **connected**,
**attached**, **delivery verified**. Report the furthest one reached, by name.

1. **Are the engine's MCP tools in this session at all?** Not there → this session started before
   the registration existed, or the owner has not approved the server. Print the launcher line
   and the sentence "start a new session with it, then run `/xez-onboard-opinionated --verify`".
   That is the whole answer; do not improvise a smoke test without the tools.
2. **Call `health`.** Read the status word, not the prose:
   - `not-registered` — the engine has not run in this folder, *or* the tools started before it
     first did and are still looking in the old place. After the owner starts the engine, they
     must run `/mcp` and reconnect `xezar`; calling again is not enough.
   - `not-running` — the engine ran here before and is stopped. The owner starts it
     (`references/preflight.md` check 5 has the line and what to say with it); then call again.
   - running — check the version it reports against the preflight minimum. **Connected.**
3. **`discover_project`, then `leader_events` with action `attach`, then action `status`.** The
   session must be the owner in `status`. "Project occupied" means another Claude session in this
   folder holds the one leader slot: the owner closes it. There is no takeover. **Attached.**
4. **One pushed event, when the smoke test runs.** A real `<channel source="xezar">` message in
   the session is the only evidence of push. None within a minute of a task changing state →
   read the journal with `leader_events` action `read`, and report **"ready — polling mode"**:
   channels can be switched off for a whole organisation, and do not exist on Bedrock, Vertex or
   Foundry. Polling is a slower leader, not a broken setup. **Delivery verified**, or polling.

## 3. The remaining steps, in order

- **The default task account.** Engine tool `project_config`, action `select_account`, with the
  lane the owner chose in the interview; read it back with `get_account`. It must not be the
  leader's login. The engine writes the choice into `.xezar/agent-accounts.json` keyed by this
  checkout's absolute path, which is why the kit's ignore file lists it.
- **Skill updates are the owner's, not the engine's start-up.** Engine tool
  `set_workspace_config` with `skillsAutoUpdate: false`. The engine otherwise updates installed
  skills at every start under a thirty-second limit, and the first test found fifteen of
  forty-five updated and the rest not — invisible once the skill folders are ignored.
- **The labels exist.** Tracker operation **list-labels** against `.xezar/pipeline/labels.json`.
  Anything missing → **ensure-label-taxonomy**, which creates only what is absent and never
  recolours. They were approved in the preview; this is the read-back.
- **Step 7** — `references/protection.md`.
- **Step 8** — `references/smoke-test.md`.
- **Step 9** — `references/control-skills.md`.
- **The tree and the gates.** The working tree is clean, and the confirmed gate commands pass
  when run here, one at a time. An engine that dirties the tree by starting is a finding.
- **The launcher.** It parses (`bash -n`). This session may never have used it — a session
  launched by hand with the same flag is just as attached — so say plainly that the launcher is
  what the owner uses from tomorrow, and that it is parsed, not yet run.

## 4. The checklist, then the report

One line each, ✅ or ❌, with the evidence beside it: engine version · engine running · setup files
on the base branch · labels · default task account · protection read back · connection state
(one of the four words, or polling) · smoke test, both tiers · gates · clean tree · launcher ·
owner's controls.

Any ❌ → name the **one** next action, keep the pending file, and use the matching failure
template. All ✅ → delete the pending file and report with `references/report-templates.md` →
"Setup complete".

After a context compaction in this session, call `leader_events` action `read` with no cursor
before anything else: the attachment survives, the memory of what arrived does not.
