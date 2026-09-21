## What changed

<!-- One or two sentences. -->

## Why

<!-- The problem this solves. Link the issue: "Closes #123". -->

## How it was verified

<!-- The commands you ran and what they showed: the gate commands in SDLC.md.
     For a change a user can see, say what you exercised by hand and what it showed. -->

## Design

<!-- UI in scope = {{UI_SCOPE}}, or anything under {{DESIGNS_DIR}}/. SDLC.md § The design gate. -->
- [ ] Not UI in scope
- [ ] UI in scope – `needs-design` applied (outside contributors: a maintainer applies it). Design: `{{DESIGNS_DIR}}/<feature>/` or "fix-sized"
- [ ] `skip-design`, because: <rendered output unchanged – say why>

Design review evidence: <link to the "## Design review" comment or the design README section>

## Risk

<!-- SDLC.md defines one risk flag, `risk-high`: the change touches {{RISK_SURFACES}}, a contract in
     BACKWARD_COMPATIBILITY.md, or edits broadly across the tree. Say which, or "ordinary". A
     maintainer applies the label. -->

- [ ] This change is `risk-high`
