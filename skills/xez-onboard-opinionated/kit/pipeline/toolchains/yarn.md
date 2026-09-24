# Toolchain provider: yarn

The Node.js ecosystem with **Yarn 1** (Yarn Classic, 1.22.x). Select it with
`"toolchain": { "providers": ["yarn"] }`.

Yarn 2 and later are different tools behind the same name: another lockfile format, other flags
(`--immutable`, no `--frozen-lockfile`), and Plug'n'Play instead of `node_modules` by default. This
descriptor refuses them rather than guessing, and says so in **toolchain-check**.

## Prerequisites

`yarn` 1.22 or newer within the 1.x line, on `PATH` under the project's Node.js. A repository that
asks for Yarn 2 or later — a `packageManager` of `yarn@2` or higher, or a `.yarnrc.yml` — needs a
different descriptor.

## Output grammar

As in `TEMPLATE.md`: `NAME=value` lines, split on the first `=`, never sourced as shell.

## Operations

### toolchain-check

```bash
if ! command -v yarn >/dev/null 2>&1; then
  printf 'TOOLCHAIN=yarn\nTOOLCHAIN_STATUS=evidence-unavailable\nTOOLCHAIN_VERSION=unknown\n'
  printf 'TOOLCHAIN_NOTES=yarn is not on PATH; install Yarn 1 under this Node.js (npm install -g yarn@1)\n'
  exit 0
fi
YARN_VERSION=$(yarn --version 2>/dev/null || echo unknown)
case "$YARN_VERSION" in
  1.*) ;;
  *)
    printf 'TOOLCHAIN=yarn\nTOOLCHAIN_STATUS=evidence-unavailable\nTOOLCHAIN_VERSION=%s\n' "$YARN_VERSION"
    printf 'TOOLCHAIN_NOTES=this descriptor is Yarn 1 only; install Yarn 1 (npm install -g yarn@1) or use a descriptor for Yarn %s\n' "$YARN_VERSION"
    exit 0
    ;;
esac
printf 'TOOLCHAIN=yarn\nTOOLCHAIN_STATUS=pass\n'
printf 'TOOLCHAIN_COMMAND=%s\n' "$(command -v yarn)"
printf 'TOOLCHAIN_VERSION=%s\nTOOLCHAIN_NOTES=\n' "$YARN_VERSION"
```

### restore-dependencies

`--frozen-lockfile` is the operation: Yarn 1 installs what `yarn.lock` pins and fails when the
lockfile would have to change, instead of rewriting it. `--non-interactive` keeps a prompt from
hanging an unattended run.

`--ignore-scripts` is not optional, for the same reason as npm: restoring otherwise runs
`preinstall`, `install` and `postinstall` from every transitive package, in a checkout that may be
a pull request from outside the project.

```bash
yarn install --frozen-lockfile --non-interactive --ignore-scripts
```

Exit codes:

| Code | Status | Why |
|---|---|---|
| `0` | `pass` | Dependencies restored from the lockfile. |
| `1` | `findings` | Yarn could not restore — commonly the lockfile and `package.json` disagree, which is a real result about the repository. |
| anything else | `unknown` | Not enumerated, so its meaning is not known. |

```text
TOOLCHAIN=yarn
RESTORE_STATUS=…
RESTORE_LOCKFILE=yarn.lock
RESTORE_SCRIPTS_SUPPRESSED=yes
RESTORE_NOTES=…
```

Check `git status --porcelain yarn.lock` afterwards: a modified lockfile is `findings` with the note
"yarn rewrote the lockfile".

### build

A build exists only when `package.json` declares a `build` script. When it does not, this is
`not-applicable` — reporting `pass` would claim a check that never ran.

```bash
if node -e 'process.exit(require("./package.json").scripts?.build ? 0 : 1)' 2>/dev/null; then
  yarn run build
else
  : # not-applicable
fi
```

| Code | Status |
|---|---|
| `0` | `pass` |
| `1` | `findings` (the build failed) |
| anything else | `unknown` |

### outdated

Like `npm outdated`, `yarn outdated` exits **1 when anything is out of date**. That is the normal
result, **not a failure**.

```bash
yarn outdated --json
```

| Code | Status | Why |
|---|---|---|
| `0` | `pass` | Nothing is behind. |
| `1` | `findings` | Something is behind. **Not a failure.** |
| anything else | `unknown` | |

The output is one JSON object per line. The line whose `type` is `table` carries `data.body`, rows
of `[name, current, wanted, latest, …]`; map each to `OUTDATED_<n>=<name>|<current>|<wanted>|<latest>`
and ignore every other line.

### update-dependency

```bash
case "$NAME" in *[!A-Za-z0-9._@/-]*) echo "invalid dependency name" >&2; exit 2 ;; esac
case "$VERSION" in *[!A-Za-z0-9._+-]*) echo "invalid version" >&2; exit 2 ;; esac
yarn upgrade --exact --ignore-scripts "$NAME@$VERSION"
```

`upgrade` keeps the dependency in the section it was declared in (`add` would move a dev dependency
into `dependencies`); `--exact` writes the exact version rather than a range.

Compare `yarn.lock` before and after to fill `UPDATE_OTHERS_MOVED`: Yarn re-resolves the package's
subtree, so one requested bump can move transitive entries too.

| Code | Status |
|---|---|
| `0` | `pass` |
| `1` | `findings` (Yarn refused — the version does not exist, or a resolution conflict) |
| anything else | `unknown` |
