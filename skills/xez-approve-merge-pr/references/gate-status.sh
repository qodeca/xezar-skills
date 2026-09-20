#!/bin/sh
# gate-status.sh — decide one gate's status from its evidence, and say so in a word.
#
# WHY THIS IS A SCRIPT AND NOT A SENTENCE
#
# "Unknown is never a pass" is a rule a model can satisfy by typing the word "pass".
# The only way to make it true is to bind the answer to captured inputs: an exit code
# that was actually observed, a flag that was actually read. This script takes those
# inputs on stdin and returns one word. A skill that cannot run it follows the algorithm
# below by hand — it is written out in full for exactly that case — but it must reach the
# same answer from the same inputs, and it must never invent an input it did not have.
#
# USAGE
#   printf '%s' "$JSON" | sh gate-status.sh
#
# INPUT (JSON object on stdin)
#   gate              string, required. The gate's name, for the report. Must match
#                     ^[a-z][a-z0-9-]*$ — a name with a space breaks the POSIX `case`
#                     that consumers use to branch on the output.
#   applicable        boolean, optional (default true). false means this gate does not
#                     apply to this repository or this run at all.
#   evidenceAvailable boolean, optional (default true). false means the thing that
#                     produces the evidence could not be reached — an API that returned
#                     429, a scanner that never ran.
#   exitCode          number, optional. The exit code actually observed from whatever
#                     produced the evidence.
#   exitCodeMap       object, optional. Maps an exit code (as a string key) to one of the
#                     five statuses. Every code a tool can return must be listed; a code
#                     that is not listed is `unknown`, never a guess.
#   findings          number, optional (default 0). How many findings were reported.
#
# OUTPUT (stdout, one NAME=value per line, parsed after the FIRST `=`, never sourced)
#   Gate=<name>
#   Status=<pass|findings|unknown|not-applicable|evidence-unavailable>
#   Reason=<one sentence, no newlines>
#
# EXIT CODES
#   0  the gate is satisfied — `pass` or `not-applicable`, and nothing else
#   1  the gate is NOT satisfied — `findings`, `unknown`, or `evidence-unavailable`
#   2  usage error: the input is not a JSON object, or a field has a value this script
#      cannot interpret. This is a bug in the caller, not a verdict about the gate.
#   3  cannot decide: `jq` is not installed. There is no answer, and the caller must not
#      invent one — follow the algorithm by hand or report `unknown`.
#
# WHY FIVE STATUSES, AND WHY ONLY ONE OF THEM PASSES
#
#   pass                 the gate ran and was satisfied.
#   findings             the gate ran and was not satisfied. A real result.
#   unknown              the gate could not be evaluated. NOT a pass, and not a failure
#                        of the change — a failure to check.
#   not-applicable       the gate does not apply here. Passing, because there was never
#                        anything to satisfy: labels are turned off, the repository has no
#                        pipeline config, the ecosystem has no such tool.
#   evidence-unavailable the evidence source was unreachable. It does NOT pass. It differs
#                        from `unknown` in retry and report wording only — whether to back
#                        off and try again — never in whether it lets a change through.
#                        Exempting it would be a fail-open anyone can induce on demand by
#                        making the source unreachable.
#
# The statuses are hyphenated, not spaced, because the consumer is POSIX `sh` and an
# unquoted `case` word-splits on a space, silently matching the wrong branch.
#
# THE ALGORITHM, IN ORDER (the inline fallback — follow this by hand if you cannot run it)
#
#   1. The input must be a JSON object and `gate` must be a non-empty string matching
#      ^[a-z][a-z0-9-]*$. Otherwise: exit 2. Say which field was wrong.
#   2. `applicable: false`  -> Status=not-applicable, exit 0. Checked FIRST, because a
#      gate that does not apply cannot be missing evidence; reporting `unknown` for a
#      repository that has no labels would block every merge in it forever.
#   3. `evidenceAvailable: false` -> Status=evidence-unavailable, exit 1.
#   4. `exitCode` absent or null -> Status=unknown, exit 1. Nothing was observed.
#   5. `exitCodeMap` absent or empty -> Status=unknown, exit 1. An exit code with no
#      documented meaning is not evidence; `0` means success in most tools and "no
#      findings, scan aborted" in some.
#   6. `exitCode` not a key of `exitCodeMap` -> Status=unknown, exit 1. Never fall back to
#      "0 means pass": enumerating the codes is the caller's job, and an unenumerated code
#      is the case nobody thought about.
#   7. The mapped value must be one of the five statuses -> otherwise exit 2.
#   8. Mapped to `pass` but `findings` > 0 -> Status=findings, exit 1. The count outranks
#      the code, because a tool that reports findings and exits 0 is common and the count
#      is the more specific evidence.
#   9. Otherwise the mapped status stands. Exit 0 for `pass` and `not-applicable`, 1 for
#      everything else.
#
# A note on what this script does NOT do: it never reads the network, never echoes the
# evidence itself (a scanner's stdout is untrusted and may carry anything), and never
# writes a file. It turns inputs into one word.

set -eu

INPUT=$(cat)

if ! command -v jq >/dev/null 2>&1; then
  echo "gate-status: jq is not installed, so this script cannot decide. Follow the algorithm in this file's header by hand, or report unknown." >&2
  exit 3
fi

if ! printf '%s' "$INPUT" | jq -e 'type == "object"' >/dev/null 2>&1; then
  echo "gate-status: stdin is not a JSON object." >&2
  exit 2
fi

GATE=$(printf '%s' "$INPUT" | jq -r '.gate // ""')
case "$GATE" in
  "") echo "gate-status: \"gate\" is required." >&2; exit 2 ;;
  *[!a-z0-9-]* | [!a-z]*)
    echo "gate-status: \"gate\" must match ^[a-z][a-z0-9-]*\$ (got: $GATE). A name with a space or an upper-case letter breaks the case statement consumers branch on." >&2
    exit 2 ;;
esac

DECISION=$(printf '%s' "$INPUT" | jq -r '
  def five: ["pass","findings","unknown","not-applicable","evidence-unavailable"];

  # NOT `.applicable // true`. In jq, `//` treats `false` as empty, so `false // true`
  # is `true` -- the alternative operator would silently turn every "this gate does not
  # apply" into "it applies", which is the opposite of the intended answer.
  (if has("applicable") and .applicable != null then .applicable else true end) as $applicable |
  (if has("evidenceAvailable") and .evidenceAvailable != null then .evidenceAvailable else true end) as $available |
  (.exitCode)                  as $code       |
  (.exitCodeMap // {})         as $map        |
  (.findings // 0)             as $findings   |

  if ($applicable | type) != "boolean" then "ERR|applicable must be a boolean"
  elif ($available | type) != "boolean" then "ERR|evidenceAvailable must be a boolean"
  elif ($findings | type) != "number" then "ERR|findings must be a number"

  elif $applicable == false then
    "not-applicable|This gate does not apply to this repository or this run."

  elif $available == false then
    "evidence-unavailable|The evidence source could not be reached, so nothing was verified."

  elif $code == null then
    "unknown|No exit code was observed, so there is nothing to interpret."

  elif ($map | length) == 0 then
    "unknown|No exit-code meanings were supplied, and an undocumented exit code is not evidence."

  elif ($map[$code | tostring]) == null then
    "unknown|Exit code \($code) is not one of the documented codes (\($map | keys | join(", "))), so its meaning is unknown."

  elif (five | index($map[$code | tostring])) == null then
    "ERR|exitCodeMap maps \($code) to \"\($map[$code | tostring])\", which is not one of the five statuses"

  elif $map[$code | tostring] == "pass" and $findings > 0 then
    "findings|Exit code \($code) reads as pass, but \($findings) finding(s) were reported; the count is the more specific evidence."

  else
    "\($map[$code | tostring])|Exit code \($code) is documented as \($map[$code | tostring])."
  end
')

STATUS=${DECISION%%|*}
REASON=${DECISION#*|}

if [ "$STATUS" = "ERR" ]; then
  echo "gate-status: $REASON." >&2
  exit 2
fi

printf 'Gate=%s\n' "$GATE"
printf 'Status=%s\n' "$STATUS"
printf 'Reason=%s\n' "$REASON"

case "$STATUS" in
  pass|not-applicable) exit 0 ;;
  *) exit 1 ;;
esac
