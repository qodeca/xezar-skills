# Creating the tag

Runs only after the release pull request has merged, and only after `ancestry.md` has been
re-run against the merge commit.

## Order, and why it is this way

Tag **after** the release pull request merges, never before. Tagging first would tag a
commit that does not contain its own changelog entry or its own version number — the tag
would point at a version that does not know it is that version.

## The tag

```bash
case "$VERSION" in *[!A-Za-z0-9._+-]*) echo "invalid version" >&2; exit 2 ;; esac
TAG="v$VERSION"

if git rev-parse -q --verify "refs/tags/$TAG" >/dev/null; then
  echo "refusing: tag $TAG already exists" >&2
  exit 1
fi

git tag -a "$TAG" -m "$VERSION" "$RELEASE_SHA"
git push origin "refs/tags/$TAG"
```

Four things are deliberate:

- **Annotated (`-a`), not lightweight.** An annotated tag carries who made it and when,
  which is what turns it into a record rather than a pointer.
- **The explicit refspec** `refs/tags/$TAG`, not `git push --tags`. A blanket push sends
  every local tag, including experiments and leftovers from other work.
- **The tag is created against `$RELEASE_SHA`**, the commit ancestry was proved for — not
  against `HEAD`, which is whatever the local checkout happens to be on.
- **An existing tag ends the run.** It is never moved and never deleted.

## When the tag already exists

Stop and report. A tag that has been pushed has been fetched by other people and by build
systems; moving it means two parties who both have `v1.4.0` disagree about what it
contains, with nothing to tell them apart.

The fix is a new version. Say that, name the existing tag and the commit it points at, and
let the user decide.

## After the tag

This skill's work ends. Print the publish command, or name the repository's release
workflow, and say plainly that this skill does not run it and holds no credential that
could.

A workflow triggered by the tag runs under the repository's own credentials, in the
repository's own environment, from a commit that is now on the protected branch and was
reviewed on the way there. That is where publishing authority belongs.
