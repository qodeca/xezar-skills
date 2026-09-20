# Toolchain provider: cargo

The Rust/Cargo ecosystem. Select it with `"toolchain": { "providers": ["cargo"] }`, or
alongside another: `["npm", "cargo"]`.

It ships as the second provider deliberately. A contract with one implementation is a
description of that implementation; the npm-shaped assumptions only become visible when a
second ecosystem has to satisfy the same postconditions — and two of them do not survive
the trip, which is the point.

## Prerequisites

`cargo`, from a Rust toolchain (rustup or a distribution package). `outdated` additionally
needs the `cargo-outdated` subcommand, which is **not** part of Cargo; when it is missing
that operation is `evidence-unavailable`, not a failure.

## Operations

### toolchain-check

```bash
if ! command -v cargo >/dev/null 2>&1; then
  printf 'TOOLCHAIN=cargo\nTOOLCHAIN_STATUS=evidence-unavailable\nTOOLCHAIN_VERSION=unknown\n'
  printf 'TOOLCHAIN_NOTES=cargo is not on PATH; install a Rust toolchain\n'
  exit 0
fi
printf 'TOOLCHAIN=cargo\nTOOLCHAIN_STATUS=pass\n'
printf 'TOOLCHAIN_COMMAND=%s\n' "$(command -v cargo)"
printf 'TOOLCHAIN_VERSION=%s\nTOOLCHAIN_NOTES=\n' "$(cargo --version 2>/dev/null | awk '{print $2}')"
```

### restore-dependencies

```bash
cargo fetch --locked
```

`--locked` is the counterpart of `npm ci`: it fails rather than updating `Cargo.lock`, so
restoring cannot quietly change what the repository pins.

**Lifecycle-script suppression is `not-applicable` here, and that is a real answer, not a
gap.** Cargo has no `postinstall` equivalent — `cargo fetch` downloads sources and runs
nothing. Build scripts (`build.rs`) do execute, but at *build* time, which is the `build`
operation's problem and is reported there.

```text
TOOLCHAIN=cargo
RESTORE_STATUS=…
RESTORE_LOCKFILE=Cargo.lock
RESTORE_SCRIPTS_SUPPRESSED=not-applicable
RESTORE_NOTES=cargo has no package lifecycle scripts; build.rs runs at build time
```

| Code | Status |
|---|---|
| `0` | `pass` |
| `101` | `findings` (Cargo's standard failure code — commonly `Cargo.lock` is out of date) |
| anything else | `unknown` |

### build

```bash
cargo build --locked
```

Unlike npm, a Cargo package always has a build, so this is never `not-applicable`.

**Note in `BUILD_NOTES` when the crate graph contains a `build.rs`**: the build executed
third-party code. That is normal for Rust and unavoidable, and a reviewer of a
dependency-bump pull request should still be told.

| Code | Status |
|---|---|
| `0` | `pass` |
| `101` | `findings` |
| anything else | `unknown` |

### outdated

```bash
if ! cargo outdated --version >/dev/null 2>&1; then
  printf 'TOOLCHAIN=cargo\nOUTDATED_STATUS=evidence-unavailable\nOUTDATED_COUNT=unknown\n'
  printf 'OUTDATED_NOTES=cargo-outdated is not installed; install it with: cargo install cargo-outdated\n'
  exit 0
fi
cargo outdated --format json
```

This is the parity cell worth reading twice. npm ships `outdated`; Cargo does not, so the
same named operation is available in one ecosystem and needs a separate installation in
the other. The contract survives because the answer to "is it available" is a status the
caller can act on, rather than a crash or a silent empty list.

| Code | Status |
|---|---|
| `0` | `pass` (nothing behind) |
| `1` | `findings` (something behind) |
| anything else | `unknown` |

### update-dependency

```bash
case "$NAME" in *[!A-Za-z0-9._-]*) echo "invalid crate name" >&2; exit 2 ;; esac
case "$VERSION" in *[!A-Za-z0-9._+-]*) echo "invalid version" >&2; exit 2 ;; esac
cargo update --package "$NAME" --precise "$VERSION"
```

`--precise` pins the exact version instead of taking the newest compatible one.
`cargo update` touches only `Cargo.lock`; when the new version falls outside the range
`Cargo.toml` declares, the command fails — edit the manifest first and report that the
manifest changed too.

| Code | Status |
|---|---|
| `0` | `pass` |
| `101` | `findings` (commonly: the version is outside the manifest's range) |
| anything else | `unknown` |
