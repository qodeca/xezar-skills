# Provider families

Four families of committed descriptor, all selected the same way: a config key names a
descriptor, the descriptor says how to execute the operations skills name. Adding support
for a new tracker, browser, ecosystem or scanner is a descriptor, never a skill change.

## Tracker providers

Skills name the operations in `references/trackers/TEMPLATE.md`; the selected `.xezar/pipeline/trackers/<tracker>.md` says how to execute them and is the team's committed override point. This skill installs shipped descriptors from its own `references/trackers/` directory.

The collection ships `github.md`, `linear.md`, and `jira.md`. Linear and Jira own issues but delegate repository/PR/review/CI/PR-label operations to a required `github.md` companion, so setup installs both. Scaffold any other provider from `TEMPLATE.md`.

## Toolchain and security providers

Two more descriptor families, selected the same way trackers and browsers are.

`toolchain.providers` is a **list**: a repository with a JavaScript front end and a Rust
service configures both, and a skill runs each in turn and reports each separately. The
operations are **toolchain-check**, **restore-dependencies**, **build**, **outdated** and
**update-dependency**, and each is defined by its postcondition rather than by a verb —
`install` means three different things in three ecosystems, so the operation is
"restore-dependencies", defined as the state it leaves behind.

`security.provider` is single-valued and has **no default**. With the key absent, every
supply-chain operation is `not-applicable` and nothing executes. Operations:
**security-check**, **security-scan** and **dependency-inventory**, the last producing a
CycloneDX or SPDX bill of materials.

Full contracts, the exit-code rules and the shipped providers:
`references/toolchains/TEMPLATE.md` and `references/security/TEMPLATE.md`.

## Browser providers

Browser-capable skills use the same committed-descriptor pattern as trackers: they name provider operations (**ensure-installed**, **doctor**, **open**, **snapshot**, **interact**, **assert**, **screenshot**, **close**) and read `.xezar/pipeline/browsers/<provider>.md`, selected by `browser.provider`. The collection ships `agent-browser.md` (the self-provisioning fresh-setup default, local processes only) and `playwright.md`, plus `references/browsers/TEMPLATE.md` for custom providers. A config without `browser.provider` is read as `playwright` for backward compatibility. Full operation contract, `agent-browser` platform support, and the compatibility path: `references/browser-providers.md`.
