---
name: onboarding-owner-decisions
description: Owner decisions of 2026-09-21 that shape the Xezar onboarding flow and are easy to get wrong
metadata:
  type: feedback
---

Decisions the owner made on 2026-09-21 for the onboarding flow:
- The bootstrap prompt runs in a session launched with `claude --dangerously-load-development-channels server:xezar` – the leader-channel flag, not skip-permissions.
- The prompt itself runs `xezar init` and then starts `xezar --single-project` – it does not leave those to a README step.
- The prompt may install Xezar globally after asking once; the skill itself still never installs.
- The `xez-*` skills are never committed into a target repo, but `.claude/skills/` as a whole must NOT be git-ignored – other skills live there. Ignore by pattern.
- Kit faults are fixed in `xezar-skills`; do not update `../xezar`.
- The design gate stays ON in `8cli` even though it is a CLI.

**Why:** the goal is the least manual work for a first-time user, ending with a fully working setup; and the owner keeps control of the engine repo separately.

**How to apply:** verified constraint to respect – the engine's first single-project start asks its account-import question only in a real terminal and only once, so "the prompt starts the engine" means opening a terminal window, never a background process. Related: [[onboarding-improvement-work]].

Added 2026-09-21 (evening), from the 8cli audit:
- **A lane is a tool plus a model** (`<tool>/<model>`). Accounts/logins are only the rotation under a tool when one runs out of tokens. Never propose chains of logins.
- Fable-class models are escalation-only and image models single-purpose; daily workhorses are the strong everyday models – ask what each model is for before ranking.
- When the engine refuses a call, a **consented, backed-up hand edit** of `~/.xezar` files is allowed ("much more user friendly… the owner is taking the decision"). It is a recorded exception in `SECURITY.md`; the skill never proposes the machine-wide case itself.
- Leader guide: trim the template rather than raise the 200-line limit.
- Engine issues for xezar get the label of the target release (`release-0.18.0`); filing issues on `qodeca/xezar` is fine, editing `../xezar` is not.
