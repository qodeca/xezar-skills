## 📝 Specs & Documentation

- 📝 **An upgrade note for Codex reviews on Windows (#230).** On native Windows a Codex review,
  QA, design or security step posts no comment and writes no verdict, because engine 0.30.0's
  read-only check refuses the command the role skills prescribe. The engine fix
  (qodeca/xezar#1089) has not shipped, so `UPGRADE_NOTES.md` now says how to keep those rows on a
  Claude lane until it does.
