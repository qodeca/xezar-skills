# Toolchain provider: dotnet

The .NET ecosystem with NuGet `PackageReference`. Select it with
`"toolchain": { "providers": ["dotnet"] }`. Every operation works on one solution or project file,
the **entry** (`{entry}`, a `.sln`, `.slnx` or project file name, validated like a dependency name).

## Prerequisites

The .NET SDK 8 or newer, which ships `dotnet list package --format json` and reads `.slnx`
solutions. Resolve `dotnet` from `PATH`, or from the absolute `$DOTNET_ROOT/dotnet` or
`$HOME/.dotnet/dotnet` where `dotnet-install.sh` puts it — never from the repository.

## Output grammar

As in `TEMPLATE.md`: `NAME=value` lines, split on the first `=`, never sourced as shell.

## Operations

### toolchain-check

```bash
DOTNET=$(command -v dotnet 2>/dev/null)
for candidate in "${DOTNET_ROOT:-}/dotnet" "$HOME/.dotnet/dotnet"; do
  [ -n "$DOTNET" ] && break
  case "$candidate" in /*) [ -x "$candidate" ] && DOTNET="$candidate" ;; esac
done
if [ -z "$DOTNET" ]; then
  printf 'TOOLCHAIN=dotnet\nTOOLCHAIN_STATUS=evidence-unavailable\nTOOLCHAIN_VERSION=unknown\n'
  printf 'TOOLCHAIN_NOTES=dotnet is not on PATH; install the .NET SDK 8 or newer (see https://dot.net)\n'
  exit 0
fi
printf 'TOOLCHAIN=dotnet\nTOOLCHAIN_STATUS=pass\nTOOLCHAIN_COMMAND=%s\n' "$DOTNET"
printf 'TOOLCHAIN_VERSION=%s\nTOOLCHAIN_NOTES=\n' "$("$DOTNET" --version 2>/dev/null || echo unknown)"
```

### restore-dependencies

`--locked-mode` is what makes a restore reproducible: with a `packages.lock.json` beside a project,
NuGet restores exactly the locked versions and fails rather than updating the lock file. A project
without one has no lockfile to hold it to, and the restore resolves afresh — report that as a note.

NuGet `PackageReference` restore runs no package scripts, so the suppression half is
`not-applicable`. (A package's MSBuild targets run later, at build time, which is the build's risk,
not the restore's.)

```bash
case "$ENTRY" in *[!A-Za-z0-9._-]*) echo "invalid entry" >&2; exit 2 ;; esac
LOCKED=""
[ -n "$(find . -name packages.lock.json -not -path '*/obj/*' -not -path '*/bin/*' | head -1)" ] && LOCKED="--locked-mode"
"$DOTNET" restore "$ENTRY" $LOCKED
```

Exit codes:

| Code | Status | Why |
|---|---|---|
| `0` | `pass` | Every project restored. |
| `1` | `findings` | NuGet could not restore — a package that does not resolve, or in locked mode a lock file that no longer matches the project (NU1004), which is a real result about the repository. |
| anything else | `unknown` | Not enumerated, so its meaning is not known. |

```text
TOOLCHAIN=dotnet
RESTORE_STATUS=…
RESTORE_LOCKFILE=<packages.lock.json, or none>
RESTORE_SCRIPTS_SUPPRESSED=not-applicable
RESTORE_NOTES=…
```

### build

A solution or project always has a build, so this is never `not-applicable`.

```bash
"$DOTNET" build "$ENTRY" --no-restore
```

| Code | Status |
|---|---|
| `0` | `pass` |
| `1` | `findings` (the build failed) |
| anything else | `unknown` |

### outdated

`dotnet list package --outdated` exits **0 whether or not anything is out of date** — the opposite
trap to npm's. The status comes from the parsed output, never from the exit code alone. It asks the
package feeds, so it needs the network.

```bash
"$DOTNET" list "$ENTRY" package --outdated --format json
```

| Code | Status | Why |
|---|---|---|
| `0` | `pass` or `findings` | `pass` when no project lists a package, `findings` when any does. |
| anything else | `unknown` | The feed was unreachable or the entry did not load. |

Map each `projects[].frameworks[].topLevelPackages[]` entry to
`OUTDATED_<n>=<id>|<resolvedVersion>|<resolvedVersion>|<latestVersion>` (NuGet has no separate
"wanted" version), counting a package listed by several projects once.

### update-dependency

```bash
case "$NAME" in *[!A-Za-z0-9._-]*) echo "invalid dependency name" >&2; exit 2 ;; esac
case "$VERSION" in *[!A-Za-z0-9._+-]*) echo "invalid version" >&2; exit 2 ;; esac
grep -rl --include='*.csproj' "Include=\"$NAME\"" . | while IFS= read -r project; do
  "$DOTNET" add "$project" package "$NAME" --version "$VERSION" --no-restore
done
"$DOTNET" restore "$ENTRY" --force-evaluate
```

Every project that references the package is moved, so the solution does not end up on two
versions. With central package management (`Directory.Packages.props`) the SDK writes the version
there instead. `--force-evaluate` rewrites each `packages.lock.json` for the new version.

Compare every `packages.lock.json` before and after to fill `UPDATE_OTHERS_MOVED`; with no lock
files it is `unknown`, not `0`.

| Code | Status |
|---|---|
| `0` | `pass` |
| `1` | `findings` (the version does not exist, or restore refused it) |
| anything else | `unknown` |
