# Resolve a tracker without setup

Read the trusted brief, project guidance, and existing configuration/descriptors. A Git remote can identify a candidate GitHub repository, but cannot override an explicitly selected tracker. Resolve ambiguity before publishing. Preserve the intended destination on failures; never silently switch backlogs.

## GitHub

Use existing **search-issues**, **get-issue**, and **create-issue** operations when they satisfy the skill's authority, read-only search, body-file, and recovery rules. Read the bundled [GitHub mapping](trackers/github.md) for a standalone project or missing safe operation. This is a per-skill fallback, not a change to the collection's shared descriptor contract. Do not run descriptor hooks that claim, comment, edit, install, or log in.

CLI missing, authentication denied, network unavailable, malformed output, and incomplete search all produce a local draft with the intended repository and blocker. No automatic login, tool installation, or remote creation follows.

## Another existing tracker

Use its already available supported tools and project templates. Keep the same three authority modes, open/closed search, concrete approval, existing-label discipline, create-once receipt, and readback. Record the actual tool inputs, pagination, result limits, and candidate inspection. An adapter without complete search or reliable readback cannot claim verified publication. If the required capability is absent, leave a draft; do not invent a connector or substitute GitHub.

## No tracker / local fallback

Search the project's existing local issue store first, including its closed/archive records. Follow its established location and naming convention. Otherwise use root `.local/issues/` with the entire `.local/` ignored before writing in a Git project. Check for already tracked local files and report them; ignore rules do not untrack them. If adding the ignore rule exceeds authority, or the directory is read-only, return the draft and receipt in the task output without claiming a saved file.

Use a stable, safe task-derived basename (letters, digits, hyphens only), never a title-derived path. Create the Markdown record and initial receipt with exclusive create (`wx` / `O_EXCL` / equivalent), not a check-then-overwrite. On collision read the owned receipt: reuse the identical operation or report the collision, never overwrite another draft. Subsequent receipt updates must be atomic and limited to the same operation. No Git repository is required.

The local record includes intended destination, authority mode, title/body, proposed labels, search evidence, and reason. Report `draft-only` with a local path (or inline artifact); it is not a remotely filed issue. Do not commit temporary records or require source commits/gates merely to file an issue.
