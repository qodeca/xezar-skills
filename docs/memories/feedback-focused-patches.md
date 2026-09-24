---
name: feedback-focused-patches
description: Owner wants patch releases kept very focused – fix only the reported bug, never rework the working process
metadata:
  type: feedback
---

For 3.0.1 (and patches generally) the owner said: "ensure your planned changes will be very focused as I would like to avoid completely destroy the process which is already quite good."

**Why:** the 3.0.0 onboarding worked end to end (8cli, 28 min); the owner values the current process and fears broad rewrites.
**How to apply:** each fix touches only the lines that cause the bug, plus the one test/pin/guard it needs and its changelog/upgrade line. No restructuring, no wording sweeps, no "while we're here" cleanups; list anything extra as a separate, optional follow-up for the owner to decide. See [[routing-json-plan]].
