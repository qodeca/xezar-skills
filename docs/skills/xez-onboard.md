# xez-onboard

> 🧑‍💻 Interactive — acts once, may ask questions, hands control back

Optional project setup for software, campaign/marketing, research or other work.
Use `setup`, `preview` or `recheck` mode with the task/project identity, desired outputs
and existing decisions. Re-checks also take previous template bytes, current files
and pinned new defaults with engine/kit identities.

The skill inspects without executing project scripts, asks only unresolved questions,
previews minimal per-file edits and verifies the authorized result. Independent operation
needs no MCP. Leader setup prepares project files; trust, login and attachment stay with you.

The result is local, uncommitted files and an honest checklist, with no publication authority.

## Parameters

| Parameter | Required | Description |
|---|---|---|
| `mode` | Yes | One of `setup`, `preview` or `recheck`. `preview` shows the file edits and writes nothing; `recheck` compares a previous install against the current one. |
| project identity and root | Yes | What is being set up, and the writable directory it may touch. |
| intended outcome, materials, decisions | Optional | What the project is for, what already exists, and choices already made. Missing provenance is treated as unknown, never as permission to replace a file. |
| previous template bytes and digest | `recheck` only | What was installed last time, so a re-check can tell your edits from the template's. |

This skill has **no unattended-defaults switch**: it asks rather than assume.

## Works with

[`xez-setup-agent-pipeline`](xez-setup-agent-pipeline.md) supplies the optional software config schema, and [`xez-apply-upgrade-notes`](xez-apply-upgrade-notes.md) supplies an existing pipeline's dry-run upgrade diff. Either one missing leaves only that optional part pending; the minimal setup still completes.

See the [three-domain examples](../../skills/xez-onboard/references/examples.md) and [verification cases](../../skills/xez-onboard/references/verification.md).

---
*Source: [`skills/xez-onboard/SKILL.md`](../../skills/xez-onboard/SKILL.md)*
