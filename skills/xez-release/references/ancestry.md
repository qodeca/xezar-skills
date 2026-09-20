# Proving the commit already landed

The one check this skill exists to enforce. Everything else it does is bookkeeping.

## Why it is not optional

A tag-triggered release workflow is read **from the tagged commit**. Tag an unmerged head
and the code that runs with the release credentials is that branch's workflow definition —
written by whoever opened the branch, reviewed by nobody, running with the most valuable
secret the repository has. That is strictly worse than any risk of holding the credential
here, which is why this check comes before everything.

The weaker-sounding reasons matter too: a tag on an unmerged commit points at history the
base branch does not contain, so anyone who fetches it gets a version that cannot be
reproduced from the branch they trust.

## The procedure

1. **Resolve the base branch by name** — the **default-branch** operation, or `baseBranch`
   when it is not `"auto"`. Validate it before it reaches a shell:

   ```bash
   case "$BASE_BRANCH" in *[!A-Za-z0-9._/-]*) echo "invalid base branch" >&2; exit 2 ;; esac
   ```

2. **Fetch it.** A local ref can be days old, and a stale ref makes an unmerged commit look
   merged — which is precisely the failure being prevented.

   ```bash
   git fetch origin "$BASE_BRANCH" || { echo "could not fetch the base branch" >&2; exit 1; }
   BASE_TIP=$(git rev-parse FETCH_HEAD)
   ```

   A fetch that fails is `evidence-unavailable`. Here that **ends the run**: a release is the
   one place where "could not check" must stop the work.

3. **Resolve the release commit** and test ancestry against the fetched tip:

   ```bash
   RELEASE_SHA=$(git rev-parse --verify "${RELEASE_REF}^{commit}") || exit 1
   if ! git merge-base --is-ancestor "$RELEASE_SHA" "$BASE_TIP"; then
     echo "refusing: $RELEASE_SHA is not an ancestor of $BASE_BRANCH" >&2
     exit 1
   fi
   ```

   `git merge-base --is-ancestor` is the whole test, and it answers the right question.
   Comparing branch names does not: a branch named for a release can point anywhere.
   Checking that the commit is "in the log" does not either, if the log being searched is
   the local one.

4. **Record the pair** for the report and for step 6's re-check: `Head:` is `RELEASE_SHA`,
   `Base:` is `BASE_TIP`. The tag is created against the first, and the second is what makes
   the first trustworthy.

## Re-check before tagging

Step 6 runs this whole procedure again against the merge commit, because time passed
between the release pull request opening and merging. Nothing about step 1's answer stays
true by itself: the base branch moved, which is the normal case, and the commit being
tagged is now a different one.

Checking once and tagging later is check-then-act — the same shape as approving a pull
request and then merging whatever is current.

## What to do when it fails

Say which commit was asked for, which branch it was tested against, and that it has not
merged. Do not offer to merge it, do not offer to tag the branch tip instead, and do not
suggest `--force`: there is no force here, because the check is not a precaution about
freshness. It is the thing that keeps release credentials away from unreviewed code.
