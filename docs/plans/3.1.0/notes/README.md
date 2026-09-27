# 3.1.0 stream fragments

Each 3.1.0 stream writes one file here, `<stream>.md` (for example `A.md`, `B.md`, `pr-49.md`),
with three sections in this order – the format is in `upgrade/CONTRACT.md` §6:

1. `## Changelog` – the text for `CHANGELOG.md`;
2. `## Upgrade entry` – symptom, what to do, what you lose by skipping it, and the `upgrade`
   machine block;
3. `## Compatibility rows` – the rows for `BACKWARD_COMPATIBILITY.md`, or "none".

No stream edits `CHANGELOG.md`, `UPGRADE_NOTES.md` or `BACKWARD_COMPATIBILITY.md` directly. The
release PR folds these files in stream order (0, A, B, C, D, E, F, G, H, U) and deletes this
folder. Plan: `docs/plans/release-3.1.0.md` §2 P2.
