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
  Report with `references/report-templates.md` → "Setup rejected": it lists what this setup made
  **outside git** — the labels, any recorded engine change — with the undo for each, and does none
  of it unasked.

## 2. The engine tools, and which state they are in

Setup results use four words, and none implies the next: **files prepared**, **connected**,
**attached**, **delivery verified**. Report the furthest one reached, by name.

1. **Are the engine's MCP tools in this session at all?** Not there → this session started before
   the registration existed, or the owner has not approved the server. Print the launcher line
   and the sentence "start a new session with it, then run `/xez-onboard-opinionated --verify`".
   That is the whole answer; do not improvise a smoke test without the tools. A session started
   from the bootstrap prompt has the server registered at **local scope** (the owner's own
   settings) as well as in the committed `.mcp.json`; both name the same package, so either one
   serving the tools is fine. Say which one it is, and leave the local entry for the owner to
   remove — it is their setting, not the project's.
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

**Three engine settings change here, and all three follow one rule: read, record, write, read back.**
They are the default task account, the OpenCode switch and the skill auto-update switch. None of
them is a file in the pull request, so the preview names each (`references/preview.md`) and the
report says what each was before.

- **Where the record goes.** `.local/xezar/runtime/onboarding-engine-settings.json` — git-ignored,
  beside the saved interview, one entry per setting: `{ "setting": "<name>", "previous": <what you
  read>, "now": <what you wrote>, "undo": "<the call>", "when": "<ISO-8601>" }`. **Never
  `.xezar/onboarding.json`**: that file is committed, this step runs after the merge, and a write
  there leaves the tree dirty under a rule that says it must be clean — and puts a fact about one
  machine into git.
- **Which mode the engine is in is read from the engine, not from a file.** `project_config`,
  action `get_capabilities`: `capabilities.singleProjectRoot` is `true` when this folder owns its
  engine state, and only then do these settings land in this project (`.xezar/workspace.json`,
  git-ignored). The file existing proves nothing — the engine creates it either way. Absent or
  false → the provider switch and the skill-update switch are the machine's, shared by every
  project on it: **change neither**, and report each as "left as it was, the engine is not in
  single-project mode". The default task account is keyed by this checkout's path in either mode,
  so it is always set.
- **A successful call is not the evidence; the read-back is.** Each write is followed by the read
  that shows the new value, and a read-back that disagrees is a finding, reported as one.

In order:

- **The default task account.** Engine tool `project_config`, action `select_account`, with the
  **login** the owner chose on screen 3 — an account handle, never a lane, which is a tool and a
  model; read it back with `get_account`. It must not be the
  leader's login. The engine writes the choice into `.xezar/agent-accounts.json` keyed by this
  checkout's absolute path, which is why the kit's ignore file lists it.

  **Read what was there before you write, and report it.** Until this step runs, the project falls
  back to the engine's own default, and that default can name an account the registry does not
  contain — a second test found `selections: {}` and a default naming a login absent from the
  account list, which is a task that fails at dispatch with nothing to point at. State what the
  default was, in one line, before saying what it is now. Setting it silently hides the finding.
- **OpenCode is switched off for this project.** It is a provider the engine supports and this
  setup does not route to, for recorded reasons (`DECISIONS.md` → "OpenCode is off by default"):
  after a denied permission request its session can go silent for minutes with no event and no
  error, it does not enforce a step's tool allowlist — which is the only thing that makes a
  read-only role read-only — a resumed session loses its role and its tool limits, and it cannot
  attach itself as leader. Four moves, in this order, and the order is the point:

  1. **Read.** `get_capabilities`. Find the `opencode` entry under `providers` and note `enabled`
     and `status`. Not installed, or already disabled → say so, write nothing, tick the line.
  2. **Check it is safe to switch.** Three conditions, all read, none assumed. **The engine is
     0.17.0 or later** — `health` reports the version. On 0.16.0 the action takes no arguments and
     is refused outright, whatever it carries, so there is nothing to correct and nothing to
     consent to: leave the provider on, report "found, left on — this engine cannot switch it",
     and keep OpenCode out of every chain this run writes. Then:
     `capabilities.singleProjectRoot` is `true` (above). And `.xezar/docs/model-routing.md` names
     no OpenCode lane in any chain — a setup written before this rule may, and switching the
     provider off under it turns those dispatches into refusals. Either condition false → **leave
     it on**, report "found, left on" with which condition failed, and keep it out of any chain
     this run writes. Never reach for a machine-wide setting from a per-project setup — the one
     exception is the owner naming that change themselves, under
     `references/engine-refusals.md`, where these same two conditions still hold.
  3. **Record, then switch.** Write the entry (`"setting": "provider.opencode.enabled"`) and only
     then call action `set_provider_enabled` with `provider: "opencode"`, `enabled: false` and a
     fresh `operationId` — the argument names that action takes **from engine 0.17.0 on**, where
     it gained them. **Check them against the tool's own description before you send them**,
     because a shape written down in a skill ages into being wrong about one. An "Unrecognized
     key" answer is the description telling you the names; read it, correct once, and never guess
     a third (`references/engine-refusals.md`).
  4. **Read back.** `get_capabilities` again; `enabled` must now be false.

  Put the one call that undoes it in the report, word for word: `set_provider_enabled` with
  `provider: "opencode"`, `enabled: true` — the same argument names you just used. Reverting the setup pull request does **not** undo this —
  the state lives outside git — and an engine started later without `--single-project` reads the
  machine's own settings instead, where this switch was never made.
- **Skill updates are the owner's, not the engine's start-up.** Read `project_config` action
  `get_limits` → `workspace.skillsAutoUpdate.effective`; already `false` → say so and write
  nothing. Otherwise record the entry (`"setting": "skillsAutoUpdate"`), call
  `set_workspace_config` with `skillsAutoUpdate: false`, and read `get_limits` again. The engine
  otherwise updates installed skills at every start under a thirty-second limit, and the first
  test found fifteen of forty-five updated and the rest not — invisible once the skill folders are
  ignored. Undo: the same call with `true`.
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
on the base branch · labels · default task account · OpenCode off, or left on and why · protection read back · connection state
(one of the four words, or polling) · smoke test, both tiers · gates · clean tree · launcher ·
owner's controls.

Any ❌ → name the **one** next action, keep the pending file, and use the matching failure
template. All ✅ → delete the pending file and report with `references/report-templates.md` →
"Setup complete".

After a context compaction in this session, call `leader_events` action `read` with no cursor
before anything else: the attachment survives, the memory of what arrived does not.
