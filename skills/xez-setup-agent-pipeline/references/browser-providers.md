# Browser providers

Browser-capable skills use the same committed-descriptor pattern as trackers.
They name provider operations — **ensure-installed**, **doctor**, **open**,
**snapshot**, **interact**, **assert**, **screenshot**, and **close** — and read
`.xezar/pipeline/browsers/<provider>.md`, selected by `browser.provider`. The repo's copy is
authoritative and may extend the shipped operations without editing installed
skills.

This collection ships `agent-browser.md`, `playwright.md` and `chrome-devtools.md`, plus
`references/browsers/TEMPLATE.md` for custom providers. `agent-browser` is the
fresh-setup default and self-provisions its native CLI, Chrome for Testing, and
available OS libraries on macOS, Linux, WSL2, Git Bash, and native Windows. It
uses local browser processes only — no cloud-browser account or API key.

`chrome-devtools.md` is for ad-hoc browsing and smoke checks only: its
operations are calls to a pinned, headless `chrome-devtools-mcp` server that
the project wires into `.mcp.json` and `.codex/config.toml`. It never writes or
runs an e2e suite; that stays with the project's own test tool.

Backward compatibility is deliberate: a config without `browser.provider` is
read as `playwright`, and browser consumers accept the legacy `playwright`
object in `test-env.json`. Re-run this setup skill or `xez-apply-upgrade-notes`
to make the choice explicit and install a browser descriptor.
