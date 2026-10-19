## 📝 Specs & Documentation

- 📝 **The upgrade prompt names Git for Windows' own config commands.** A real upgrade run on
  Windows found that step 0's read of the commands git runs always lists four lines from Git for
  Windows' system config (`diff.astextplain.textconv` and the three `filter.lfs.*` commands), so
  the question about them comes up on every Windows machine. The read now prints each line's scope,
  and the prompt and `upgrade/README.md` say which four lines are Git for Windows' defaults. The
  rule itself is unchanged: they are still asked about.
