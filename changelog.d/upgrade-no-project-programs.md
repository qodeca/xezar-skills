## 🔒 Security

- 🔒 **The upgrade tool never runs a program from the project.** On Windows a bare program name
  is looked for in the working folder first, and the tool starts git with the project as that
  folder, so a `git.exe` committed to a project could run in place of git. The tool now starts git
  and the engine by full path from PATH, skipping the working folder and the project.
