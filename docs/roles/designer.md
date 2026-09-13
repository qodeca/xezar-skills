# 🎨 Designer

The pipeline gives you a written spec with visuals attached: UI mockups of the proposed layout sitting next to screenshots of the current app, so a review is a design review, not a guessing game. When a browser provider is configured, [`xez-auto-write-spec`](../skills/xez-auto-write-spec.md) boots the running app through [`xez-prepare-test-env`](../skills/xez-prepare-test-env.md), captures the current-state screenshots, and generates mockups as PR evidence — all on a ready, labeled spec PR with an assumptions comment you can correct. Once the design is agreed, the same visuals reappear as before/after screenshots when the change is built.

← Back to the [README](../../README.md#-workflows-by-role)

## Skills you'll use

| Skill | When | Example call | What you get |
|---|---|---|---|
| [`xez-auto-write-spec`](../skills/xez-auto-write-spec.md) | Propose a redesign with visuals | `/xez-auto-write-spec "Redesign the checkout summary panel — include mockups of the new layout and screenshots of the current one"` | a spec PR with mockups, current-app screenshots, and an assumptions comment |
| [`xez-auto-write-spec`](../skills/xez-auto-write-spec.md) | Spec a brand-new surface | `/xez-auto-write-spec "Onboarding wizard for first-time merchants"` | a spec PR with proposed-flow mockups |
| [`xez-auto-implement-spec`](../skills/xez-auto-implement-spec.md) | See the design built | `/xez-auto-implement-spec 2026-07-18-checkout-redesign` | the change implemented with before/after screenshots from the working app |
| [`xez-auto-qa-pr`](../skills/xez-auto-qa-pr.md) | Check the UI on an open PR | `/xez-auto-qa-pr 123` | screenshots of the changed flow + a pass/fail report on the PR |
| [`xez-ux-shape`](../skills/xez-ux-shape.md) | Decide before drawing | `/xez-ux-shape "Quick-add flow for the people list"` | a decided direction: smallest coherent scope, interaction contract, riskiest-assumption test |
| [`xez-ux-setup`](../skills/xez-ux-setup.md) | Make the design system executable | `/xez-ux-setup` | the repo's design contract in `.uxproof/` — tokens, components, screen archetypes, team rules |
| [`xez-ux-review-pr`](../skills/xez-ux-review-pr.md) | Judge a PR's UI, not just see it | `/xez-ux-review-pr 123` | a design review: findings ranked by user impact, each with evidence, a pattern, a trade-off and a done-when |

## What happens automatically

- **Mockups + current-app screenshots** attached to the spec PR when a browser provider exists (degrades to text-only when it doesn't).
- **Assumptions comment** — autonomous Open-Questions defaults are posted for you to override, not silently baked in.
- **Full SDLC labels** on the spec PR, plus chain markers so [`xez-auto-implement-spec`](../skills/xez-auto-implement-spec.md) reuses the same branch/PR.
- **Before/after screenshots** from the real app on the implementing PR via [`xez-auto-qa-pr`](../skills/xez-auto-qa-pr.md).
- **Claim locks** — an issue-driven spec run claims the issue so concurrent agents back off.

## Tips

- Say "include mockups of the new layout and screenshots of the current one" in the brief — naming the visuals you want is what forces them into the spec PR.
- Describe the surface concretely (which page, which panel, which states) so the current-app screenshots capture the right flow.
- No browser provider set up yet? Run `/xez-prepare-test-env` first, or ask QA to — otherwise the spec degrades to text-only with no screenshots.
- Reply on the assumptions comment to steer the design; the autonomous defaults exist to be corrected.
- Use `/xez-auto-qa-pr 123` any time to pull fresh screenshots of a PR's UI without touching source or labels.
- Run `/xez-ux-setup` once per repo before the first design review — contract-grounded findings ("this repo already has a component for that") beat generic best practices.
- `/xez-auto-qa-pr` captures the evidence; `/xez-ux-review-pr` judges it. Use both on UI-heavy PRs.
