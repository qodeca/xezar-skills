# Stream A – #59 toolchain-neutral role skills

## Changelog

**The testing and dependency roles, and the shared contract of every role, stop assuming npm.**
`xezar-dependency-maintenance` no longer says "use package-lock.json and the four real npm
workspaces": it reads the install roots from `dependencies.units` (or the one root that
`toolchain.providers` names), attributes an update to the unit that imports it, and runs that
unit's **restore-dependencies**, **outdated** and **update-dependency** from its installed
descriptor, `.xezar/pipeline/toolchains/<provider>.md`, in the unit's folder. A provider with no
installed descriptor is a named blocker, not a guessed command. `xezar-testing` runs tests through
the test command in `validation.commands` instead of `npm test`. The shared contract tail of all
37 role skills tells the author to run the typecheck command `validation.commands` lists – and
nothing when it lists none – instead of `npm run typecheck`. A single-root npm project resolves to
the same commands as before (`npm ci`, `npm test`, `npm run typecheck`, `package-lock.json`). The
lint gate now refuses a literal `npm`, `package-lock.json` or workspace count in a kit role skill's
shared tail, and in any role skill body not on the new `npmLiteral` allowlist (#59).

## Upgrade entry

**Symptom.** In a project on Yarn, .NET or several install roots, the dependency agent is told to
use npm, a root `package-lock.json` and four workspaces that do not exist, the testing agent runs
`npm test`, and every author is told to run `npm run typecheck` – so they run the wrong commands
or none, or the project rewrote these skills by hand.

**What to do.** Copy the 37 role skills below from the kit. A project that rewrote
`xezar-testing.md` or `xezar-dependency-maintenance.md` for its toolchain can drop that local
patch once it has checked that `toolchain.providers`, `dependencies.units` (if it has several
install roots) and `validation.commands` in `.xezar/pipeline/config.json` name its real
toolchain and commands. Nothing else changes; no config key is added.

**What you lose by skipping it.** Installed role skills do not update themselves: the dependency
and testing agents keep giving npm instructions on a non-npm project, and every author keeps being
told to run a typecheck command the project may not have. A single-root npm project loses nothing
in behaviour by skipping it, but its role skills drift from the kit.

```upgrade
Applies-to: <3.1.0
Files: .xezar/skills/xezar-acceptance.md; .xezar/skills/xezar-architecture.md; .xezar/skills/xezar-bug-investigation.md; .xezar/skills/xezar-business-analysis.md; .xezar/skills/xezar-code-review.md; .xezar/skills/xezar-dependency-maintenance.md; .xezar/skills/xezar-deploy.md; .xezar/skills/xezar-deprecation-plan.md; .xezar/skills/xezar-design-system.md; .xezar/skills/xezar-docs-maintenance.md; .xezar/skills/xezar-handoff-draft-pr.md; .xezar/skills/xezar-implementation.md; .xezar/skills/xezar-integration-tests.md; .xezar/skills/xezar-integration.md; .xezar/skills/xezar-issue-create.md; .xezar/skills/xezar-issue-triage.md; .xezar/skills/xezar-localisation.md; .xezar/skills/xezar-migration.md; .xezar/skills/xezar-observability.md; .xezar/skills/xezar-performance.md; .xezar/skills/xezar-planning-spec.md; .xezar/skills/xezar-qa.md; .xezar/skills/xezar-quality-gates.md; .xezar/skills/xezar-refactor.md; .xezar/skills/xezar-regression-suite.md; .xezar/skills/xezar-release-changelog.md; .xezar/skills/xezar-release-prep.md; .xezar/skills/xezar-release-publish.md; .xezar/skills/xezar-research.md; .xezar/skills/xezar-review-response.md; .xezar/skills/xezar-security-review.md; .xezar/skills/xezar-spike.md; .xezar/skills/xezar-testing.md; .xezar/skills/xezar-ui-design.md; .xezar/skills/xezar-ui-tests.md; .xezar/skills/xezar-ux-design.md; .xezar/skills/xezar-visual-asset.md
```

## Compatibility rows

None. No config key, file format or skill name changes, and no installed check gains a refusal:
the new refusal is this repository's own lint gate, which never runs in a consumer project. The
`xezar-dependency-maintenance` frontmatter `description` changes wording only.
