# Stream U core – the upgrade tool's index, planner, applier and verifier (U2, U3, U5)

## Changelog

**The upgrade tool's engine.** The scripts the 3.1.0 upgrade prompt runs from a verified clone of
this repository, against one project at a time. None of them is installed into a project.

- **A kit index for every version since 1.2.0** (`upgrade/kit-index/`): each release tag, plus a
  pseudo-version `<last tag>+<sha12>` for every other commit that changed the kit, because
  projects were installed from the default branch. Each version maps every installed path to its
  kit source, blob sha, sha256 and rewrite class, using that version's own copy table
  (`upgrade/tools/lib/copy-map.mjs`). Built by `scripts/build-kit-index.mjs`, committed.
- **Per-file base finding with a confidence** (`upgrade/tools/detect.mjs`): a file byte-equal to a
  kit version, the manifest's recorded digest, the file after masking placeholders and absolute
  paths, or the smallest line diff – high, medium, low, or unknown. A project that applied part of
  an old upgrade by hand gets the right base for each file.
- **A plan by class** (`upgrade/tools/plan.mjs`): unchanged, clean update, local only, already
  upstream, both changed, base unknown, moved in the kit, routing before 3.0, unexplained local
  change, new, removed, owner-shaped, per-machine and refused, with the stop-and-ask items
  (unexplained change to a safety file, a permission change, a weakened safety check, an unsafe
  path) and the upgrade-entry actions for the project's version range. It names config and
  placeholder keys, never values.
- **A mechanical applier** (`upgrade/tools/apply.mjs`): writes clean updates and new files,
  deletes unchanged files the kit removed, and stages `git merge-file --zdiff3` results for Claude.
  It checks every path before any write (repo-relative, no symlink on the way, inside the project,
  in the copy map, not ignored, unchanged since the plan), refuses the whole run on one bad path,
  and changes nothing when run twice.
- **A verifier** (`upgrade/tools/verify.mjs`): no conflict marker, JSON and TOML still parse, no
  config key lost or owner value changed, the leader guide's owner rules byte-equal, the register
  bound to real files, and the refusing lines a new kit version added still present; then it
  writes manifest v2 and runs the target kit's drift, catalog, route and repository checks.
- **A new gate, `node scripts/test-upgrade.mjs`**, over committed synthetic installs of 1.2.0,
  2.1.1, 3.0.0, 3.0.3 and one untagged commit (`scripts/fixtures/upgrade/`, built by
  `scripts/build-upgrade-fixtures.mjs`), a customised install, and the plan's hard cases.

## Upgrade entry

None. This stream ships no file into a project: the tool runs from the verified xezar-skills
clone, and the prompt that drives it (stream U4) carries the upgrade entry for 3.1.0.

## Compatibility rows

For `BACKWARD_COMPATIBILITY.md` §5 (cross-skill file formats):

- **The kit index** (`upgrade/kit-index/index.json` and `<version>.json`, shape in
  `upgrade/CONTRACT.md` §3) – written by `scripts/build-kit-index.mjs`, read by every later
  upgrade tool. A version file, once committed for a tag, never changes; adding a version is
  additive. Renaming or removing a field, or changing what `rewrite` or `renamedFrom` means, is
  breaking.
- **The upgrade plan** (`.local/xezar/scratch/upgrade/plan.json`, `planVersion: 1`, and the
  `NAME=value` lines of `detect.mjs`, `apply.mjs` and `verify.mjs`) – written by the tools, read by
  the upgrade prompt and by `apply.mjs`/`verify.mjs`. Class and action names are a closed list;
  adding one, or renaming one, is breaking for the prompt that branches on them, and raises
  `planVersion`.

No new config key and no new refusal in a project: nothing for §2 or the ledger.
