## 🚀 CI/CD & Infrastructure

- 🚀 **The upgrade test now covers a 3.2.0 install.** A synthetic 3.2.0 fixture with the manifest
  v2 its onboarding writes joins the committed set: its own drift check passes on it, and it
  gets the same class, apply-twice and equal-to-fresh-install checks as the older installs.
- 🚀 **Four new upgrade eval cases**, built and checked at the planner level but not yet run: an
  owner lane on `pi/` that must not survive the upgrade, an owner row reorder that clashes with
  the routing defaults version 6, a leader guide whose owner rules stay byte for byte while the
  template's changes come in, and config keys the target documents but the project lacks, which
  go on the owner checklist instead of being filled in.
