# Project-only leader preparation

Use only the chosen client's project configuration. These snippets register the MCP bridge; they neither connect a session nor authorize trust, login or attachment. Confirm support against the installed engine's MCP connection reference and the chosen client's version before writing. If that evidence is absent, supply the snippet as a candidate and mark live setup pending; never assert readiness.

| Client | Template → destination | User-owned prerequisites |
|---|---|---|
| Claude Code | `templates/claude-mcp.json` → `.mcp.json` | Review/approve the project MCP entry, log in and start the client in the integrated project. For pushed events the installed connection reference may require `--dangerously-load-development-channels server:xezar`; the user must understand and accept its warning and provider/admin restrictions. |
| Codex | `templates/codex-mcp.toml` → `.codex/config.toml` | Trust the project and log in. Project config is ignored until trusted. Push delivery can additionally require a shared app-server under the same client home as the engine; consult the installed reference. Do not run a machine-scope MCP registration command. |
| Qwen Code | `templates/qwen-mcp.json` → `.qwen/settings.json` (merge `mcpServers.xezar` only) | Qwen Code 0.25.2 or newer with a model provider already set up. Pushed events use its own cross-session messaging, on by default; xezar changes none of its settings. Never add `hooks`, `permissions.allow`/`ask` or `tools.allowed` to the project file: a read-only Qwen step refuses to start while the project's `.qwen/settings.json` holds any of them. |

The engine runs no pi or OpenCode from 0.30.0: offer neither as a leader client (the xezar guide page "Moving from pi or OpenCode to Qwen Code").

Merge just the selected server entry; preserve other servers and all unrelated bytes, and do not start the client. Never copy credentials, launch an adapter, grant approval, or install an extension as a side effect of preparing files.

`npx` and `@qodeca/xezar` in the templates are the bridge launch mechanism and package identity, not a project package-manager requirement. Writing a snippet does not execute it. On a later user launch it may resolve the package over the network; preserve an existing trusted/pinned launch command and show any proposed change in the preview.

After integrating the candidate, the person reviews client trust/login, starts the client, makes a real MCP tool call (such as `health` / `discover_project`), then uses the installed supported Attach leader control. Do not invent an MCP attach action. Confirm project identity, attached ownership and delivery/replay independently before saying the leader is ready. Hosted mode may not support local leader attachment; report the restriction without widening access. A configured snippet alone means only “files prepared”.
