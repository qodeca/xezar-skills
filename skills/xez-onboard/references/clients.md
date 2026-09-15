# Project-only leader preparation

Use only the chosen client's project configuration. These snippets register the MCP bridge; they neither connect a session nor authorize trust, login or attachment. Confirm support against the installed engine's MCP connection reference and the chosen client's version before writing. If that evidence is absent, supply the snippet as a candidate and mark live setup pending; never assert readiness.

| Client | Template → destination | User-owned prerequisites |
|---|---|---|
| Claude Code | `templates/claude-mcp.json` → `.mcp.json` | Review/approve the project MCP entry, log in and start the client in the integrated project. For pushed events the installed connection reference may require `--dangerously-load-development-channels server:xezar`; the user must understand and accept its warning and provider/admin restrictions. |
| Codex | `templates/codex-mcp.toml` → `.codex/config.toml` | Trust the project and log in. Project config is ignored until trusted. Push delivery can additionally require a shared app-server under the same client home as the engine; consult the installed reference. Do not run a machine-scope MCP registration command. |
| pi | `templates/pi-mcp.json` → `.pi/mcp.json` | Install/enable a compatible MCP adapter, log in, and enable the engine's leader extension if pushed turns are wanted. Adapter support and push support are separate checks. The prepared `keep-alive` connection can claim project ownership whenever pi starts here; other clients may be refused until it exits. |
| OpenCode | No bundled snippet in this revision | Detect it for task execution. For leader setup require its installed, version-matched project configuration reference; if unavailable, report that portion pending and offer a supported client or independent operation. Never guess a schema or write home config. |

Merge just the selected server entry; preserve other servers and all unrelated bytes. The pi adapter can also read the shared `.mcp.json`; disclose that consequence if Claude's project snippet will be visible to pi, and do not start either client. Never copy credentials, launch an adapter, grant approval, or install an extension as a side effect of preparing files.

`npx` and `@qodeca/xezar` in the templates are the bridge launch mechanism and package identity, not a project package-manager requirement. Writing a snippet does not execute it. On a later user launch it may resolve the package over the network; preserve an existing trusted/pinned launch command and show any proposed change in the preview.

After integrating the candidate, the person reviews client trust/login, starts the client, makes a real MCP tool call (such as `health` / `discover_project`), then uses the installed supported Attach leader control. Do not invent an MCP attach action. Confirm project identity, attached ownership and delivery/replay independently before saying the leader is ready. Hosted mode may not support local leader attachment; report the restriction without widening access. A configured snippet alone means only “files prepared”.
