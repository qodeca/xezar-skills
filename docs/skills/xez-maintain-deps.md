# xez-maintain-deps

> 🧑‍💻 Interactive — acts once, may ask questions, hands control back

Answers the three questions a maintainer keeps re-asking by hand: what do we depend on, what is behind, and what is vulnerable. It takes a bill of materials, lists the packages behind their latest version, scans for known advisories, and turns the answers into update proposals — one pull request per group, with the blast radius stated and the validation gate run before anything is proposed.

It has no opinion about ecosystems. Whatever `toolchain.providers` and `security.provider` name in `.xezar/pipeline/config.json` is what runs, so a repository with a JavaScript front end and a Rust service gets both answered in one report.

It proposes; it never merges, never widens a version range to make an update fit, and never disables a check to make a gate pass. When something could not be checked — a tool that is not installed, a scanner that found no packages — it says so rather than dropping the section, because a missing section reads as a clean result.

## Parameters

- `--scope inventory|outdated|vulnerable|all` — which questions to answer. Default: `all`.
- `--group major|minor|patch|security` (repeatable) — which update groups to propose. Default: `security` and `patch`.
- `--dry-run` — report only; open no pull request and change no file.
- `--repo <owner>/<name>` — override repo detection.

## Works with

Runs the toolchain and security descriptors installed by [xez-setup-agent-pipeline](xez-setup-agent-pipeline.md), and opens its pull requests through the same tracker operations every other skill uses. A repository with no `toolchain.providers` configured gets a report saying exactly that, and nothing else happens — the skill never guesses an ecosystem from the files it sees.

---
*Source: [`skills/xez-maintain-deps/SKILL.md`](../../skills/xez-maintain-deps/SKILL.md)*
