#!/usr/bin/env sh
# Deterministic merge-gate decision, opened by the merge step. Pure stdin -> stdout:
# it reads facts the skill already fetched, writes a verdict, and contacts nothing.
#
# The point of this file is that a gate verdict is not a sentence an agent writes.
# "Unknown is never a pass" is satisfiable by typing "pass" unless the verdict is
# bound to a captured exit code. This script is that binding.
#
# Input: one JSON object on stdin, built from the tracker operations the skill
# already runs (get-pr, get-pr-checks, get-required-checks, label_exists):
#
#   state            "OPEN" | other                      required
#   isDraft          true | false
#   mergeable        "MERGEABLE" | "CONFLICTING" | ...
#   headSha          commit the gates were evaluated against   (null = unknown)
#   mergeHeadSha     head at merge time, if re-read            (null = not re-read)
#   reviewVerdict    "approved" | "rejected" | "pending"
#                    | "not-enforced" | "unknown"   (TEMPLATE normalized field)
#   reviewDecision   host-shaped fallback, used only when reviewVerdict is absent
#   reviewEnforced   false when the host reports approval with no rule applying
#   checks           [{"name":..., "state":"SUCCESS"|"FAILURE"|"PENDING"|...}]
#   requiredChecks   ["name", ...]        names branch protection requires
#   protectionReadable  true | false      false = protection API returned 404
#   baseCheckNames   ["name", ...]        check names seen on the base branch
#   configReadable   true | false         false = base-branch config unreadable
#   configPresent    true | false         false = base branch genuinely has none
#   labelsEnabled    true | false
#   qaGate           true | false
#   labelsDefined    ["needs-qa", ...]    labels that EXIST in the repository
#   labels           ["needs-qa", ...]    labels ON the pull request
#
# Every field except `state` is optional and degrades to "unknown" rather than to
# a permissive default. A field of the wrong type is treated as absent.
#
# Decision rules, so an agent that cannot execute this file can apply the same
# rules inline and reach the same verdict:
#
#   1. UNKNOWN IS NEVER A PASS. A gate whose input is missing reports `unknown`
#      and refuses. It is never rewritten to clean, and "nothing found" is never
#      read as "nothing wrong".
#   2. A gate that does not apply reports `not-applicable`, which is not a
#      failure and does not refuse. Labels disabled is `not-applicable`; a label
#      that was never created is `unknown`.
#   3. COMMIT BINDING. Gates are evaluated against `headSha`. Absent `headSha` is
#      `unknown`. When `mergeHeadSha` is present and differs, the head moved
#      between the check and the merge: refuse.
#   4. REVIEW. Prefer the normalized `reviewVerdict`: only "approved" passes,
#      "rejected" refuses, and "pending", "not-enforced" and "unknown"
#      are all `unknown`. "not-enforced" is the important one -- a host that
#      reports approval because NO approval rule applies has told us nothing, and
#      reading that as approved is the same fail-open as a label nobody created.
#      Falling back to `reviewDecision`, "APPROVED" passes unless `reviewEnforced`
#      is false.
#   5. CHECKS. Every required check must be "SUCCESS". When protection is not
#      readable, every REPORTED check is treated as required -- the descriptor's
#      documented degradation. A pass over an EMPTY required set is not a pass:
#      if there is nothing to check, the gate is `unknown`. If the PR's check-name
#      set is smaller than `baseCheckNames`, checks disappeared (deleted or
#      renamed workflow files) and the gate is `unknown`.
#   6. CONFIG. Gate values come from the base branch. `configReadable: false` is
#      `unknown` for every config-derived gate -- never the permissive default,
#      because an attacker only has to make the base ref unfetchable.
#      `configPresent: false` with a readable base is `not-applicable`.
#   7. LABELS. A hard-block label (qa-failed, do-not-merge, blocked) refuses. The
#      QA gate, when `qaGate` is true, requires `qa-approved` or `skip-qa` on a
#      PR carrying `needs-qa` -- and `needs-qa` being ABSENT only counts when
#      `needs-qa` appears in `labelsDefined`. Otherwise the gate could not be
#      evaluated: `unknown`.
#   8. VERDICT HEAD. `verdictHead` is the commit the incoming verdict named (the
#      `Head:` line). Equal to the PR head is `pass`; a different sha is
#      `findings`, because the verdict certifies a commit that is not the one
#      being merged. ABSENT is `not-applicable` when `requireVerdictHead` is
#      false -- and that tolerance is permanent, keyed to the artifact rather
#      than to a release: a pull request opened before the line existed must not
#      be refused two releases later. With `requireVerdictHead: true` (which
#      fresh setups get) an absent line is `unknown` and refuses.
#   9. EVERY gate is evaluated before anything is reported. The `Blocking=` line
#      names every gate that is not pass or not-applicable, in one list, so the
#      report leads with all of them instead of whichever one was checked first.
#      Reporting the first failure teaches a caller to fix one thing, re-run, and
#      discover the next -- which costs a full cycle per problem.
#  10. `gates.failClosed` is deliberately NOT read here. This gate already refuses
#      on `unknown`; the switch exists for the stages that do not, and reading it
#      here would suggest the merge gate's behaviour depends on it. It does not.
#  11. The overall verdict is the worst of the individual gates, in the order
#      pass < not-applicable < findings < unknown. Anything but pass or
#      not-applicable refuses.
#
# Output: one `NAME=value` line per gate, then a `Gate: <verdict>` line.
# Values are pass | findings | unknown | not-applicable.
#
# Exit: 0 merge allowed, 1 merge refused, 2 usage or input error,
#       3 cannot decide (no jq, unparseable input).
#
# Usage: merge-gate.sh < facts.json

set -eu

if [ "${1:-}" = "--help" ] || [ "${1:-}" = "-h" ]; then
  sed -n '2,75p' "$0" | sed 's/^# \{0,1\}//'
  exit 0
fi

if [ "$#" -gt 0 ]; then
  echo "merge-gate.sh: reads one JSON object on stdin; no arguments accepted" >&2
  exit 2
fi

if ! command -v jq >/dev/null 2>&1; then
  echo "merge-gate.sh: jq not found; cannot decide" >&2
  echo "Gate: unknown"
  exit 3
fi

INPUT=$(cat)
if [ -z "$INPUT" ]; then
  echo "merge-gate.sh: empty input; cannot decide" >&2
  echo "Gate: unknown"
  exit 3
fi

if ! printf '%s' "$INPUT" | jq -e 'type == "object"' >/dev/null 2>&1; then
  echo "merge-gate.sh: input is not a JSON object; cannot decide" >&2
  echo "Gate: unknown"
  exit 3
fi

OUT=$(printf '%s' "$INPUT" | jq -r '
  # --- helpers -------------------------------------------------------------
  def b($k): if (.[$k] | type) == "boolean" then .[$k] else null end;
  def s($k): if (.[$k] | type) == "string"  then .[$k] else null end;
  def a($k): if (.[$k] | type) == "array"   then .[$k] else null end;

  . as $in

  # --- state ---------------------------------------------------------------
  | (if ($in | s("state")) == null then "unknown"
     elif ($in | s("state")) == "OPEN" then "pass"
     else "findings" end) as $state

  | (if ($in | b("isDraft")) == true then "findings" else "pass" end) as $draft

  | (if ($in | s("mergeable")) == null then "unknown"
     elif ($in | s("mergeable")) == "CONFLICTING" then "findings"
     else "pass" end) as $mergeable

  # --- commit binding ------------------------------------------------------
  | ($in | s("headSha")) as $head
  | ($in | s("mergeHeadSha")) as $mhead
  | (if $head == null then "unknown"
     elif $mhead != null and $mhead != $head then "findings"
     else "pass" end) as $commit

  # --- review --------------------------------------------------------------
  | ($in | s("reviewVerdict")) as $verdict
  | (if $verdict != null then
       (if $verdict == "approved" then "pass"
        elif $verdict == "rejected" then "findings"
        else "unknown" end)
     elif ($in | b("reviewEnforced")) == false then "unknown"
     elif ($in | s("reviewDecision")) == null then "unknown"
     elif ($in | s("reviewDecision")) == "APPROVED" then "pass"
     else "findings" end) as $review

  # --- checks --------------------------------------------------------------
  | (($in | a("checks")) // null) as $checks
  | (($in | a("requiredChecks")) // null) as $req
  | ($in | b("protectionReadable")) as $prot
  | (($in | a("baseCheckNames")) // null) as $baseNames
  | (if $checks == null then null
     else [$checks[] | select(type == "object") | .name | select(type == "string")]
     end) as $names
  | (if $prot == false then $names else $req end) as $effective
  | (if $checks == null then "unknown"
     elif $prot == null then "unknown"
     elif $effective == null then "unknown"
     elif ($effective | length) == 0 then "unknown"
     elif $baseNames != null and $names != null
          and (($baseNames - $names) | length) > 0 then "unknown"
     else
       ( [ $effective[] as $n
           | ( [$checks[] | select(type == "object" and .name == $n)] | first )
           | if . == null then "unknown"
             elif .state == "SUCCESS" then "pass"
             elif .state == "PENDING" or .state == "QUEUED" or .state == "IN_PROGRESS" then "findings"
             else "findings" end ] ) as $per
       | if ($per | index("unknown")) then "unknown"
         elif ($per | index("findings")) then "findings"
         else "pass" end
     end) as $check

  # --- config --------------------------------------------------------------
  | ($in | b("configReadable")) as $cfgRead
  | ($in | b("configPresent")) as $cfgPresent
  | (if $cfgRead == null then "unknown"
     elif $cfgRead == false then "unknown"
     elif $cfgPresent == false then "not-applicable"
     else "pass" end) as $config

  # --- labels --------------------------------------------------------------
  | (($in | a("labels")) // []) as $labels
  | (($in | a("labelsDefined")) // null) as $defined
  | ($in | b("labelsEnabled")) as $lblOn
  | ($in | b("qaGate")) as $qaOn
  | (["qa-failed","do-not-merge","blocked"]) as $hard

  | (if $config == "unknown" then "unknown"
     elif $lblOn == false then "not-applicable"
     elif $lblOn == null then "unknown"
     elif $defined == null then "unknown"
     elif ([$hard[] | select(. as $h | $labels | index($h))] | length) > 0 then "findings"
     elif ([$hard[] | select(. as $h | $defined | index($h) | not)] | length) > 0 then "unknown"
     else "pass" end) as $block

  | (if $config == "unknown" then "unknown"
     elif $lblOn == false then "not-applicable"
     elif $qaOn == null then "unknown"
     elif $qaOn == false then "not-applicable"
     elif $defined == null then "unknown"
     elif ($defined | index("needs-qa") | not) then "unknown"
     elif ($labels | index("needs-qa") | not) then "pass"
     elif ($labels | index("skip-qa")) then
       (if ($labels | index("needs-qa")) then "findings" else "pass" end)
     elif ($defined | index("qa-approved") | not) then "unknown"
     elif ($labels | index("qa-approved")) then "pass"
     else "findings" end) as $qa

  # --- verdict head --------------------------------------------------------
  # Does the incoming verdict name the commit it certifies, and is it THIS commit?
  | (.verdictHead // null) as $vhead
  | (if .requireVerdictHead == true then true else false end) as $vreq
  | (if $vhead == null then
       (if $vreq then "unknown" else "not-applicable" end)
     elif $vhead == $head then "pass"
     else "findings" end) as $vh

  # --- roll up -------------------------------------------------------------
  | { state: $state, draft: $draft, mergeable: $mergeable, commit: $commit,
      review: $review, checks: $check, config: $config,
      labelBlocks: $block, qaGate: $qa, verdictHead: $vh } as $gates

  | ([$gates[]]) as $vals
  | (if ($vals | index("unknown")) then "unknown"
     elif ($vals | index("findings")) then "findings"
     elif ($vals | index("pass")) then "pass"
     else "not-applicable" end) as $verdict

  | ( "state=" + $state,
      "draft=" + $draft,
      "mergeable=" + $mergeable,
      "commit=" + $commit,
      "review=" + $review,
      "checks=" + $check,
      "config=" + $config,
      "labelBlocks=" + $block,
      "qaGate=" + $qa,
      "verdictHead=" + $vh,
      "Blocking=" + (($gates | to_entries
                     | map(select(.value != "pass" and .value != "not-applicable"))
                     | map(.key) | join(",")) as $b
                     | if $b == "" then "none" else $b end),
      "Gate: " + $verdict )
') || {
  echo "merge-gate.sh: could not evaluate input; cannot decide" >&2
  echo "Gate: unknown"
  exit 3
}

printf '%s\n' "$OUT"

VERDICT=$(printf '%s\n' "$OUT" | sed -n 's/^Gate: //p')

case "$VERDICT" in
  pass|not-applicable) exit 0 ;;
  findings|unknown)    exit 1 ;;
  *)                   echo "merge-gate.sh: no verdict produced" >&2; exit 3 ;;
esac
