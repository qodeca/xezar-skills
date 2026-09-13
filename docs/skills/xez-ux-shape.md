# xez-ux-shape

> 🧑‍💻 Interactive — acts once, may ask questions, hands control back

Turns a vague product, UI/UX, or AI feature idea into a decided, development-ready direction. Three modes: **Shape** (a vague opportunity becomes a recommendation with the smallest coherent scope, an interaction contract, and a validation plan), **Review** (an existing concept or product area gets a keep / simplify / rethink / stop verdict with a revised primary flow), and **Handoff** (implementation-ready behavior with a state table and Given/When/Then acceptance criteria). An AI-necessity gate rejects "add a chat" when rules would serve users better; every AI feature must state which mistake it prefers and why, from the user's seat. Recommendations carry tagged evidence, from the repository's own design contract down to labeled assumptions.

## Parameters

This skill takes no parameters — describe the idea, concept, or area to shape in the call.

## Works with

Loads the design contract written by [xez-ux-setup](xez-ux-setup.md) as constraints when present (works standalone otherwise, and says so). Its Handoff output is written to feed a coding pipeline — for example [xez-auto-create-pr](xez-auto-create-pr.md) — and [xez-ux-review-pr](xez-ux-review-pr.md) closes the loop on the resulting PR.

---
*Source: [`skills/xez-ux-shape/SKILL.md`](../../skills/xez-ux-shape/SKILL.md)*
