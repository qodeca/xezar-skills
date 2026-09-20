# xez-add-rule

> 🧑‍💻 Interactive — acts once, may ask questions, hands control back

Adds a standing rule for the project leader to follow. Telling a leader something in a chat is not a rule — the next session, the next compaction, or a session on another machine has never heard it. This skill writes the rule into the committed leader guide instead, in your exact words with a dated attribution, so it loads at **every** session start, resume, clear and compaction. That needs no hook change: the one shipped hook already injects that guide in full on all four events.

It proposes the section whose moment the rule belongs to, previews the exact line before writing it, and commits. Your wording is never corrected, shortened or improved — a rule the agent rephrased is the agent's rule. A rule that would relax a safety gate, bypass tests, force-push, widen tool access or remove one of the unattended hard stops is refused with its reason named.

## Parameters

| Parameter | Required | Description |
|---|---|---|
| `{rule}` | No | The rule in your own words. Asked for when not given. |
| `--section <name>` | No | Skip the section proposal and place it in the named section. |
| `--replaces <quote>` | No | Supersede an existing rule. The old line is kept and marked superseded with today's date, never deleted. |

One rule per run. The report states the guide's new size once it passes 40 KB, because every rule is a permanent context cost on every session and nothing prunes it today.

## Works with

Installed alongside [`xez-unattended-on`](xez-unattended-on.md) and [`xez-unattended-off`](xez-unattended-off.md) by the opinionated onboarding setup, and it is the right way to change what those two govern: which decisions the leader may make alone is a rule in the guide, not a flag on a run. An answer that comes out of the morning interview and should bind from now on belongs here too.

---
*Source: [`skills/xez-add-rule/SKILL.md`](../../skills/xez-add-rule/SKILL.md)*
