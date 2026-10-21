## 🐛 Fixes

- 🐛 **An upgrade asks about a new Codex tool at the plan step, with the other permission
  questions.** The planner read `.codex/config.toml` line by line, so a tool added on its own line
  inside the `enabled_tools` list – 3.2.0's `emulate` – raised no permission stop, and the owner
  was asked only later, when the merge reached the file. It now reads the TOML list item by item.
