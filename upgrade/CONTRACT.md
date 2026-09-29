# Upgrade contract

The formats the 3.1.0 upgrade tool reads and writes. Every stream that touches the onboarding
manifest, the local-patch register, the kit index or an upgrade entry follows this file. Changing a
format here after 3.1.0 ships is a breaking change (`BACKWARD_COMPATIBILITY.md`).

Plan: `docs/plans/release-3.1.0.md` §6.

## 1. Onboarding manifest – `.xezar/onboarding.json`

### 1.1 Version 1 (everything written before 3.1.0)

Version 1 was specified in prose only (`xez-onboard-opinionated/references/write.md`, "Both halves
of the manifest") and written by the onboarding agent, so its shape varies between projects. A
reader treats it as follows:

- A manifest with no `manifestVersion` key is version 1.
- The only fields a reader may rely on:
  - `version` – string, the skills version that onboarded the project. It may be missing or
    vague.
  - `descriptors` – object `{ "<repo-relative path>": "<sha256 hex>" }`. It may be missing.
- Any per-file digest map is **optional and untrusted**:
  - a reader may use it as a hint for finding the base (plan §6.2 step 1);
  - it never uses it to decide that a file is unchanged.
- Every other field is data for humans. A reader ignores unknown fields and never fails on them.

JSON Schema (loose on purpose):

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "xezar-onboarding-manifest-v1",
  "type": "object",
  "not": { "required": ["manifestVersion"] },
  "properties": {
    "version": { "type": "string" },
    "descriptors": {
      "type": "object",
      "additionalProperties": { "type": "string", "pattern": "^[0-9a-f]{64}$" }
    }
  }
}
```

### 1.2 Version 2 (written from 3.1.0)

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "xezar-onboarding-manifest-v2",
  "type": "object",
  "required": ["manifestVersion", "version", "files"],
  "properties": {
    "manifestVersion": { "const": 2 },
    "version": { "type": "string", "description": "kit version installed, e.g. 3.1.0 or 3.0.2+<sha12>" },
    "date": { "type": "string", "format": "date-time" },
    "descriptors": {
      "type": "object",
      "additionalProperties": { "type": "string", "pattern": "^[0-9a-f]{64}$" }
    },
    "files": {
      "type": "object",
      "propertyNames": { "pattern": "^(?!/)(?!.*(^|/)\\.\\.(/|$))[^\\\\]+$" },
      "additionalProperties": {
        "type": "object",
        "required": ["sha256", "origin"],
        "additionalProperties": false,
        "properties": {
          "sha256": { "type": "string", "pattern": "^[0-9a-f]{64}$" },
          "origin": { "enum": ["copied", "adapted", "generated", "owner-file-appended"] },
          "kitSource": { "type": "string" },
          "kitBlob": { "type": "string", "pattern": "^[0-9a-f]{40}$" },
          "renderInputs": {
            "type": "object",
            "additionalProperties": { "type": "string", "maxLength": 4000 }
          },
          "patch": { "type": "string", "pattern": "^LP-[0-9]+$" }
        }
      }
    }
  }
}
```

Rules:

- **`version` is the only version fact.** It is the kit version from the kit index (§3). An
  install from an untagged commit uses a pseudo-version, `<last tag>+<sha12>`. A writer never
  writes `unknown`: onboarding stops when it can name neither. A reader still accepts an older
  manifest that says `unknown` and treats it as no version: the planner takes the version most
  of the files with a sure base agree on, and when there is none, every upgrade entry applies.
- **`origin` is set at install time and never changes.**
  - `copied` – byte-identical to the kit file.
  - `adapted` – the kit file after copy-time rewrites; `renderInputs` holds every value a rewrite
    used.
  - `generated` – written for this project; the kit has no source file.
  - `owner-file-appended` – an owner file with one kit-owned block appended; only that block is
    the kit's.

  The list is closed: adding a value is a breaking change.
- **Digests.** `sha256` values are of the file as text with `\r\n` read as `\n`; a file with a NUL
  byte in its first 8000 bytes is binary and hashed as it is. On an LF checkout this is the file's
  bytes. A digest an earlier install recorded over the raw bytes of a CRLF file is still accepted,
  by the drift check (§4) and by the planner, which reads it as the file's own record.
- **`patch` present = locally patched.** It names a register entry (§2). A file with no `patch`
  must hash-match `sha256` (Digests, above). A patched file may also be absent: a kit file the
  project removed on purpose keeps its entry – what was installed – with the `patch`, so the next
  upgrade reads the absence as the recorded local change and does not add the file back.
- **`kitSource`** is the path under `kit/`. It is required for `copied` and `adapted`, and absent
  for `generated`.
- **`kitBlob`** is the git blob sha of the kit file before rewrite. It is required for `copied` and
  `adapted`.
- **`kitSource` and `kitBlob` name the kit copy the file sits on**, which is the base the next
  upgrade merges from. After an upgrade that is the target's copy only when the file took the
  target's text. A file kept at its old version, or resolved to the owner's side, keeps the old
  version's copy. A patched file's `sha256` is the digest of that copy, not of the patched file.
- **What `files` lists**: the setup's machinery, as `.xezar/docs/local-patches.md` says. It never
  lists the project's own documents (`AGENTS.md`, `SDLC.md`, `CODE_REVIEW.md`,
  `BACKWARD_COMPATIBILITY.md`, `SECURITY.md`, the `CLAUDE.md` files and their siblings), the
  project's configuration (`.xezar/config.json`,
  `.xezar/pipeline/config.json`, `.xezar/pipeline/labels.json`, `.xezar/routing.json`), or an
  owner file merged without a kit block (`.mcp.json`, `.codex/config.toml`, the root
  `.gitignore`), even where the kit index lists one. The drift check ignores such an entry an
  earlier 3.1.0 build wrote, and its list is kept equal to the upgrade tool's. An owner file
  with an appended kit block is the exception: it is listed as `owner-file-appended`.
- **`renderInputs`** holds plain text only. A secret, token or account name never goes here; those
  live in the gitignored `.local/xezar/runtime/onboarding-identity.json`.
- **The gate runner's gate list is a filled-in value.** `.xezar/checks/repo-gates.sh` has no
  placeholder: onboarding writes the project's gates into three assignments, which are rendered
  regions (`upgrade/tools/lib/rewrites.mjs`, `RENDERED_REGIONS`). Its `renderInputs` records them
  under `GATE_NAMES` and `GATE_COMMANDS` (the text between the array's `(` and `)`) and
  `GATE_APPLICATION_LANES` (the rest of that line after `=`). The upgrade compares the file with
  those regions masked and writes the new kit text with them put back, and the drift check puts
  the recorded values back before a second hash, so a later change to the gate list alone is not
  drift. Any other difference in the file is a local change.
- **`descriptors`** stays, with the same meaning as in version 1.
- **`owner-file-appended`**: `sha256` covers only the appended block, from its start marker to its
  end marker, both included. The markers are
  `<!-- xezar:kit:start -->` and `<!-- xezar:kit:end -->`.

Upgrade path: the upgrade tool writes a v2 manifest (plan §6.5 step 7). The drift check (§4) reads
version 2 or later only. On a v1 manifest it prints `not-applicable` with the migration line and exits 0.

## 2. Local-patch register – `.xezar/LOCAL-PATCHES.md`

One register per project, at this path. Each entry is one heading plus bullet fields.

```markdown
## LP-3 – skip ci-watch for conflict repairs
- Files: .xezar/checks/ci-watch.sh, .xezar/workflows/address-review-findings.yaml
- Reason: conflict repairs do not merge the base, so ci-watch waits forever
- Upstream: qodeca/xezar-skills#54
- Since: 2026-09-25
- Confirmed: yes
```

Grammar:

- Heading: `^## (LP-[0-9]+) [–-] (.+)$` (en dash or hyphen). Ids are unique, and a removed id is
  never reused.
- Fields, one per line, as `^- (Files|Reason|Upstream|Since|Confirmed): (.+)$`. All five are
  required:
  - `Files` – comma-separated repo-relative paths; one entry may cover several files;
  - `Upstream` – `<owner>/<repo>#<n>` or `local only`;
  - `Since` – `YYYY-MM-DD`;
  - `Confirmed` – `yes` or `no`.
- Other text between entries is ignored.

Binding with the manifest:

- every manifest file with `patch: LP-n` appears in that entry's `Files`;
- every path in a `Files` list has a manifest entry with that `patch`.

An entry written by the upgrade tool starts as `Confirmed: no` (plan D11). Only the owner changes
it to `yes`.

## 3. Kit index – `upgrade/kit-index/<version>.json`

Built by `scripts/build-kit-index.mjs` and committed.
- There is one file per version: every release tag since v1.2.0, plus a pseudo-version for every
  other commit that changed `skills/xez-onboard-opinionated/kit/`.
- `upgrade/kit-index/index.json` lists them in commit order.

```json
{
  "version": "3.0.3",
  "commit": "<40-hex>",
  "tag": "v3.0.3",
  "files": {
    ".xezar/checks/route.mjs": {
      "kitSource": "checks/route.mjs",
      "kitBlob": "<40-hex>",
      "sha256": "<64-hex of the kit file (§1 Digests)>",
      "rewrite": "copied",
      "renamedFrom": ".xezar/docs/model-routing.md"
    }
  }
}
```

- Keys of `files` are installed paths, from that version's copy map (`upgrade/tools/lib/copy-map.mjs`).
- `rewrite` is one of `copied`, `adapted`, `generated`. A `generated` entry has no `kitBlob` or
  `sha256`.
- `renamedFrom` is present only when this version first installs a file that replaced an older
  installed path.
- `tag` is `null` for a pseudo-version.

## 4. Drift check – `.xezar/checks/manifest-drift.mjs`

Output follows the kit's `NAME=value` convention, parsed after the first `=`:

```text
drift-status=pass|fail|not-applicable
drift=<path> origin=<origin> reason=<hash-mismatch|missing|unregistered-patch|unconfirmed-patch|register-without-manifest>
```

Exit codes:
- 0 – `pass` or `not-applicable`;
- 1 – `fail`;
- 2 – the manifest or register cannot be parsed.

A file is compared by the digest rule in §1 (Digests): as LF text, or as its raw bytes when that is
what an earlier install recorded.

## 5. Upgrade entry machine block

Every upgrade entry in `UPGRADE_NOTES.md` from 3.1.0 on ends with one fenced block tagged
`upgrade`. It replaces the older `Digests:` line. Older entries with a step outside the tool's
reach (the 3.0.2 steps among them) carry one too. The planner lists every entry in the project's
range that has **no** block (`unblockedEntries`) so its steps are read, never dropped: an entry is
in range under a heading "upgrading an onboarded project to X" when the project is below X, and
otherwise when it is dated on or after the day the project's kit version was committed (all
entries when that day cannot be read).

````text
```upgrade
Applies-to: <3.1.0
Files: .xezar/checks/route.mjs; .xezar/routing.json =merge; .xezar/docs/old.md =delete
Actions: restart-leader; per-machine=add-mcp-permission:mcp__chrome-devtools__emulate
```
````

Grammar:

- The block's lines are `^(Applies-to|Files|Actions): (.*)$`. Each key appears at most once,
  `Applies-to` is required, and items are separated by `; `.
- **`Applies-to`** is a version range: `<X`, `>=X <Y`, or `*`. It is compared with the project's
  manifest `version`; a pseudo-version compares as its tag.
- **`Files`** item: a repo-relative installed path, optionally followed by ` =merge`, ` =new` or
  ` =delete`. No suffix means replace, subject to the 3-way rules.
- **`Actions`** item: exactly one of the closed vocabulary below. A reader refuses an unknown
  action.

| Action | Meaning |
|---|---|
| `restart-leader` | Restart the leader after the merge. |
| `restart-engine` | Restart the engine after the merge. |
| `engine-min=<semver>` | The engine must be at least this version before the upgrade. |
| `config-key=<dotted.key>` | A new config key exists. Add it only if `config-fields.md` marks a **Default** an upgrade may leave unset (plan P7); "absent means …" is not one. Otherwise put it on the owner checklist. |
| `label-sync` | Re-sync the tracker label taxonomy. |
| `env-rename=<OLD>:<NEW>` | An environment variable was renamed. |
| `per-machine=<verb>:<detail>` | A change to an untracked or ignored file on every machine that runs the leader or reviews. The tool never writes it; it goes on the owner checklist. `<verb>` is one of `add-mcp-permission`, `remove-mcp-permission`, `enable-mcp-server`, `trust-codex-project`, `add-runner-model` (`<detail>` is the lane, `<runner>/<provider>/<model>`: add the model to that runner's model config). In `trust-codex-project:<absolute-project-path>`, the detail stands for the project's absolute path. |

## 6. Stream fragments – `docs/plans/3.1.0/notes/<stream>.md`

Used during 3.1.0 development only: the release folded the fragments and deleted the folder.

Each 3.1.0 stream writes one fragment with three sections, in this order:

1. `## Changelog` – the text for `CHANGELOG.md`;
2. `## Upgrade entry` – symptom, what to do, what you lose, and the machine block (§5);
3. `## Compatibility rows` – the rows for `BACKWARD_COMPATIBILITY.md`, or "none".

The release PR folds the fragments in stream order and deletes the folder. The upgrade tool never
reads the fragments: it reads upgrade entries from `UPGRADE_NOTES.md` only.
