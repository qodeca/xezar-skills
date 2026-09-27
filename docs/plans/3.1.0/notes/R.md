# Stream R – DeepSeek routing (#89)

## Changelog

**Routing sends much more work to DeepSeek, and DeepSeek V4 Pro reviews when Claude has no budget
(#89).** With several projects running, the Claude and Codex quotas ran out fast, Claude first. The
shipped routing table gains the lane `pi/deepseek-api/deepseek-v4-pro` (strong, no image input) and
divides more work between it and `pi/deepseek-api/deepseek-flash`:

- Flash is first in the simple rows (mechanical docs, bounded bug fixes, merge chains, dependency
  maintenance), with V4 Pro second.
- V4 Pro is first in the mid-size writing rows (docs writing, unit and integration tests,
  observability, hotfix, one-finding review answers), with Flash second, then Codex, then Claude.
- V4 Pro comes after the Codex lanes in the Opus-first rows (design, architecture, specs, research,
  large implementation, refactor, migration) and in the other rows that list Codex.
- V4 Pro is in no screen row, because it cannot see images; Flash is the no-Claude fallback there.
- Localisation, which checks screens, takes Flash first and no V4 Pro; the design-system row is
  unchanged.
- V4 Pro is last in every review row that is not a screen row – re-checks, cold reviews,
  acceptance, architecture and security review – the fallback when Claude has no budget. Work a
  DeepSeek lane wrote merges after a review by `claude/sonnet` first, then `codex/gpt-6-astra`.

Three routing bans relax, and the owner accepted the risk in `SECURITY.md` and `DECISIONS.md`: a
V4 Pro review runs with a full shell, because pi's read-only lock is not proven live yet.
- `tool-limits` lets a lane marked with the new optional `fullShellReviews` key judge in a review
  row or a security row that only reads. `route.mjs --check` refuses the mark on a cheap, local or
  advisory-only lane.
- `pi-write-claude-review` lets `codex/gpt-6-astra` clear pi-written work.
- `high-risk-other-vendor` lets V4 Pro review a risk-high change when no Claude lane has budget.

Off switch: remove the model from a machine's pi config; the lane cache marks the lane unavailable
and `route.mjs` drops it on that machine.

## Upgrade entry

**Symptom.** Claude runs out of budget within the week while DeepSeek sits idle; reviews, re-checks
and QA wait for a Claude login to come back; `route.mjs` never offers
`pi/deepseek-api/deepseek-v4-pro`.

**What to do.** Copy `.xezar/checks/route.mjs` **first**: an older `route.mjs` does not know
`fullShellReviews`, keeps V4 Pro out of the review rows by the old tool-limits ban, and so refuses
the whole new routing file. Then copy `.xezar/routing.schema.json` and `.xezar/docs/routing.md`,
and merge `.xezar/routing.json` with the defaults version 4: the new lane, the new row orders and
never entries, the three ban texts and the notes, keeping your own edits. On a routing clash – a
row you reordered by hand that the new defaults also reorder – stop and ask the owner. On each
machine that should use V4 Pro, add `deepseek-api/deepseek-v4-pro` to pi's model config; a machine
without it simply gets no V4 Pro lane.

**What you lose by skipping it.** Every review still waits for a Claude or Astra login, simple and
mid-size work keeps spending Claude and Codex budget, and the lane the owner added to pi gets no
work.

```upgrade
Applies-to: <3.1.0
Files: .xezar/checks/route.mjs; .xezar/routing.schema.json; .xezar/docs/routing.md; .xezar/routing.json =merge
```

## Compatibility rows

For `BACKWARD_COMPATIBILITY.md`, the routing-file bullet in "Protected surfaces" (additive):

- A lane in `.xezar/routing.json` gains the optional key `fullShellReviews` (boolean; missing means
  false). It is read only by `route.mjs`: a lane with it may be in a review row, or a security row
  with `writes: false`, although `enforcesToolLimits` is false.
- The shipped defaults version 4 gains the lane `pi/deepseek-api/deepseek-v4-pro` and relaxes the
  rule text of `tool-limits`, `pi-write-claude-review` and `high-risk-other-vendor`. The ban ids are
  unchanged.

For the ledger of deliberate breaks:

| Date | What changed | Who it affects | What they must do | Why it was worth it |
|---|---|---|---|---|
| 2026-09-27 | The shipped defaults relax three bans: a full-shell pi lane may review (`tool-limits`), `codex/gpt-6-astra` may clear pi-written work (`pi-write-claude-review`), and V4 Pro may review risk-high work when Claude has no budget (`high-risk-other-vendor`) | every project that merges the 3.1.0 routing defaults | nothing to keep working; to keep the old bans, leave `fullShellReviews` off the lane and keep the old ban texts and orders when merging | Claude's quota ran out within the week across the owner's projects; the owner accepted the risk (#89) |
| 2026-09-27 | `route.mjs --check` refuses `fullShellReviews` that is not a boolean, or is true on a cheap, local or advisory-only lane | nobody with a file written before 3.1.0: the key did not exist | drop the key or fix the lane | the owner accepted a full-shell reviewer for a strong lane that gives verdicts, and nothing wider |
