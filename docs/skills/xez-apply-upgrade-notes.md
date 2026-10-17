# xez-apply-upgrade-notes

> 🧑‍💻 Interactive — acts once, may ask questions, hands control back

Run this after upgrading the skills collection to bring the artifacts a previous run installed into your repo back in sync. Upgrading refreshes the skill instructions themselves, but not the tracker, browser-provider, toolchain and security descriptors (`.xezar/pipeline/{trackers,browsers,toolchains,security}/<name>.md`) or the label taxonomy (`.xezar/pipeline/labels.json`) already sitting in your repo — and a stale descriptor can quietly degrade or skip operations. The skill reads the collection's `UPGRADE_NOTES.md`, diffs installed descriptors against the freshly shipped versions, adds missing operations and config keys, preserves every local customization (asking before touching an edited section), reports gaps for custom providers, and summarizes exactly what changed. It only touches pipeline artifacts under `.xezar/pipeline/` and delivers the changes as one pull request for your review (left uncommitted when no tracker is configured).

A project onboarded with `xez-onboard-opinionated` (it has `.xezar/onboarding.json`) upgrades its kit with the upgrade prompt instead: `upgrade/UPGRADE-PROMPT.md`, run from a verified clone of this repository at the release tag as [`upgrade/README.md`](../../upgrade/README.md) describes. It merges every kit file, the descriptors included, and keeps local changes. The tracker descriptor is the exception: the kit has no source for it, so on a version-2 manifest this skill updates it and refreshes its digest in `.xezar/onboarding.json` in the same change, which keeps the drift check green – unless the file already differs from its recorded digest, which it then reports and skips.

## Parameters

| Parameter | Required | Description |
|---|---|---|
| `--dry-run` | Optional | Report every change it would make, but apply nothing. |
| `--tracker <name>` | Optional | Override which tracker to sync. Defaults to the config's `tracker`. |
| `--browser <name>` | Optional | Override which browser provider to sync. Defaults to the config's `browser.provider` (or `playwright` on an older config). |
| `--yes` | Optional | Apply purely additive, non-conflicting changes without confirmation. Conflicting changes still require an explicit answer. |

## Works with

Consumes the collection's `UPGRADE_NOTES.md` plus the shipped descriptor sources under [xez-setup-agent-pipeline](xez-setup-agent-pipeline.md), and stops early pointing at it when `.xezar/pipeline/config.json` is missing. It edits only `.xezar/pipeline/` pipeline artifacts and config and opens one pull request with them; once it merges, re-run whichever skill degraded.

---
*Source: [`skills/xez-apply-upgrade-notes/SKILL.md`](../../skills/xez-apply-upgrade-notes/SKILL.md)*
