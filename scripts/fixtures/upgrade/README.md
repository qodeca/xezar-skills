# Upgrade tool fixtures

Read by `scripts/test-upgrade.mjs`, which is a gate command. Everything here is committed, so the
test needs no tags and no network.

| Path | What | Made by |
|---|---|---|
| `<version>/fixture.json` | A synthetic install of one kit version: every installed file as a blob sha, the generated owner files, the placeholder values and a version 1 manifest | `node scripts/build-upgrade-fixtures.mjs` (needs full history and tags) |
| `blobs.json.gz.hex` | The text of every blob those fixtures name: JSON `{ "<git blob sha>": "<text>" }`, gzipped, then hex-encoded so repository text greps never read binary | the same script |
| `customised/` | Customisations applied on top of a synthetic install, and what the test expects of them, in two files so that removing a customisation fails the test | by hand |
| `real/<project>-<version>/` | Sanitised snapshots of real onboarded projects | **the owner, by hand – none yet** |

Do not edit `fixture.json` or `blobs.json.gz.hex` by hand. Re-run the build script, which reads the
committed kit index (`upgrade/kit-index/`), so run `node scripts/build-kit-index.mjs` first when a
new kit version is tagged.

## Adding a real-install snapshot (owner)

Synthetic fixtures are built from the copy map, so they cannot catch what an LLM did differently
while onboarding a real project. Plan §7 asks for at least one real snapshot per major version
(for example from the 8cli or cmplus onboarding pull requests). The agent that built this folder
has no access to those projects, so this part is yours:

1. Take the project's tree at its onboarding (or last upgrade) commit: `.xezar/`, `.claude/`,
   `.codex/`, `.github/`, `.mcp.json`, `scripts/xezar-leader*`, `AGENTS.md`, `CLAUDE.md`,
   `SDLC.md`, `CODE_REVIEW.md`. Leave out application code.
2. Sanitise it: no secrets, tokens, account names or absolute paths; replace the product name and
   repository slug with neutral text if they are private. Keep every other byte, since the point
   is the real rewrites.
3. Put it at `real/<project>-<version>/tree/` (for example `real/8cli-3.0.2/tree/`).
4. Run the planner once and write down the counts you expect after reading them, in
   `real/<project>-<version>/expected.json`:

   ```json
   {
     "target": "3.1.0",
     "counts": { "clean-update": 0, "both-changed": 0, "unexplained-local-change": 0 },
     "classes": { ".xezar/checks/ci-watch.sh": "local-only" }
   }
   ```

   Only the classes you list are checked. The test finds the folder by itself.
