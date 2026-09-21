#!/usr/bin/env bash
# Lint gate for the skills collection.
# 1. Frontmatter: every skills/<name>/SKILL.md declares name (== directory) and a description.
# 2. Local overrides: every skill explicitly checks its own `.xezar/pipeline/overrides/<name>.md` override file.
# 3. Portability gate: a skill never hard-codes a choice the consumer repo owns — its base
#    branch, its package manager — nor an upstream helper name. The xez- name prefix is the
#    naming convention and is allowed; portability is about behavior, not naming.
#    A skill MAY name a product or a brand: that gate was removed deliberately, because the
#    opinionated onboarding skill has to name the product it installs.
# 4. Old-brand ban: the predecessor collection's brand, prefix and `.ai/` layout may not
#    reappear anywhere in the maintained sources (LICENSE and UPGRADE_NOTES.md excepted).
# Scope of 3: skills/** including a vendored `skills/<name>/kit/` payload. The kit exclusion
#    applies only to the tracker-abstraction and process-kill gates, not to this one.
set -uo pipefail

# Per-run load ceiling (body + always-loaded references). Ratchet: lower only.
# 2026-09-20: worst skill measured 27034, so the ceiling is 27500 and the warning
# threshold is 85% of it. Nine skills sit above the 20000 body figure once their
# always-loaded reference is counted; that is the number this gate exists to shrink.
LOADED_CEILING=27500
LOADED_WARN=23375


cd "$(dirname "$0")/.."
fail=0
PREFIX="${SKILL_PREFIX:-xez}"

err() { printf 'LINT FAIL: %s\n' "$*" >&2; fail=1; }

for dir in skills/*/; do
  name=$(basename "$dir")
  file="${dir}SKILL.md"
  if [ ! -f "$file" ]; then
    err "$dir is missing SKILL.md"
    continue
  fi
  if [ "$(head -n 1 "$file")" != "---" ]; then
    err "$file does not start with frontmatter"
    continue
  fi
  fm=$(awk 'NR==1 {next} /^---$/ {exit} {print}' "$file")
  fm_name=$(printf '%s\n' "$fm" | sed -n 's/^name:[[:space:]]*//p' | head -n 1)
  fm_desc=$(printf '%s\n' "$fm" | sed -n 's/^description:[[:space:]]*//p' | head -n 1)
  if [ "$fm_name" != "$name" ]; then
    err "$file frontmatter name '$fm_name' does not match directory '$name'"
  fi
  if [ -z "$fm_desc" ]; then
    err "$file frontmatter is missing a description"
  elif [ "${#fm_desc}" -gt 500 ]; then
    err "$file description is ${#fm_desc} chars (max 500; aim for ≤350) — descriptions load into every session's context"
  fi
  # Unquoted ": " inside a plain YAML scalar is invalid YAML and the most common
  # cross-client parse failure (agentskills.io client guide). Quote it or rephrase.
  case "$fm_desc" in
    \"*|\'*) : ;;
    *": "*) err "$file description contains an unquoted ': ' — invalid YAML for strict parsers; rephrase (use — ) or quote the value" ;;
  esac
  # Progressive-disclosure budget: a SKILL.md body should stay under ~5k tokens
  # (~20000 chars); push detail into references/ instead (agentskills.io tier-2 guidance).
  body_chars=$(awk 'f{print} /^---$/{c++; if(c==2) f=1}' "$file" | wc -c)
  if [ "$body_chars" -gt 20000 ]; then
    err "$file body is ${body_chars} chars (budget 20000 ≈ 5k tokens) — move detail into references/"
  fi

  # What actually loads is the body PLUS every reference the body opens
  # unconditionally. The body budget alone can be satisfied by moving text into
  # references/agentic-setup.md, which step 0 opens on every single run — the lint
  # goes green and the per-run cost is unchanged. A reference declares itself with
  # `<!-- loaded: always -->` on its first line, so this is measured, not guessed.
  #
  # The ceiling is a RATCHET: it starts just above today's worst skill and only ever
  # moves down. It is not a target to grow into, and safety text never moves behind a
  # conditional branch to get under it.
  always_chars=0
  for ref in "$(dirname "$file")"/references/*.md; do
    [ -f "$ref" ] || continue
    if [ "$(head -1 "$ref")" = "<!-- loaded: always -->" ]; then
      always_chars=$((always_chars + $(wc -c < "$ref")))
    fi
  done
  loaded_chars=$((body_chars + always_chars))
  if [ "$loaded_chars" -gt "$LOADED_CEILING" ]; then
    err "$file loads ${loaded_chars} chars per run (body ${body_chars} + always-loaded ${always_chars}); ceiling ${LOADED_CEILING} — the ceiling is a ratchet and never rises"
  elif [ "$loaded_chars" -gt "$LOADED_WARN" ]; then
    echo "note: $file loads ${loaded_chars} chars per run (${LOADED_WARN} is 85% of the ${LOADED_CEILING} ceiling) — trim before adding to it" >&2
  fi

  # Invocation-layer invariant: the command must live in SKILL.md itself, not only
  # behind references/agentic-setup.md, so it cannot be skipped by partial loading.
  expected_override="**ALWAYS check first:** Apply \`.xezar/pipeline/overrides/${name}.md\` when present; safety rules still win."
  if ! grep -Fq "$expected_override" "$file"; then
    err "$file is missing the mandatory local override preflight: $expected_override"
  fi
done

# Packaging gate: two machine-readable contracts that shipped broken once and
# are invisible to a human reviewer.
#   1. An agents/<client>.yaml that invokes a name other than the skill's own
#      addresses a package the user does not have installed.
#   2. OS metadata files (.DS_Store, Thumbs.db) get published into every
#      installed copy of the skill.
for dir in skills/*/; do
  name=$(basename "$dir")
  for meta in "$dir"agents/*.yaml; do
    [ -e "$meta" ] || continue
    invoked=$(grep -oE '\$[a-z0-9-]+' "$meta" | sort -u)
    for token in $invoked; do
      if [ "$token" != "\$$name" ]; then
        err "$meta invokes $token but the installed skill is named '$name'"
      fi
    done
  done
done

junk=$(find skills -name '.DS_Store' -o -name 'Thumbs.db' 2>/dev/null)
if [ -n "$junk" ]; then
  err "OS metadata files must not ship inside skills: $(printf '%s' "$junk" | tr '\n' ' ')"
fi

# Reference-resolution gate: every `references/...` pointer in a skill's markdown
# must resolve — same-skill pointers relative to the skill dir, cross-skill
# pointers written as explicit xez-<skill>/references/<file> paths.
ref_hits=$(grep -roE --include='*.md' "(${PREFIX}-[a-z-]+/)?references/[A-Za-z0-9._/-]+\.(md|py|sh|png)" skills 2>/dev/null | sort -u || true)
while IFS= read -r line; do
  [ -n "$line" ] || continue
  src=${line%%:*}
  ref=${line#*:}
  skill_dir=$(printf '%s' "$src" | cut -d/ -f1-2)
  case "$ref" in
    "$PREFIX"-*) target="skills/$ref" ;;
    *)    target="$skill_dir/$ref" ;;
  esac
  [ -e "$target" ] || err "$src points at missing $ref"
done <<EOF
$ref_hits
EOF

# Roster-sync gate: the cross-skill coverage roster shipped in
# xez-setup-agent-pipeline must list exactly the skills in skills/ — installed
# setups use it to tell a missing collection skill from an unrelated xez- token.
roster_file=skills/${PREFIX}-setup-agent-pipeline/references/skill-coverage.md
if [ ! -f "$roster_file" ]; then
  err "missing $roster_file (cross-skill coverage roster)"
else
  roster=$(sed -n 's/^ROSTER="\(.*\)"$/\1/p' "$roster_file" | tr ' ' '\n' | sed '/^$/d' | sort)
  shipped=$(ls skills | sort)
  if [ "$roster" != "$shipped" ]; then
    err "coverage roster in $roster_file is out of sync with skills/:"
    diff <(printf '%s\n' "$roster") <(printf '%s\n' "$shipped") >&2
  fi
fi

# Name-reference gate: every `xez-<name>` token in shipped skill content must name
# a skill this collection actually ships. Skills compose by invoking each other by
# name (Cross-skill contract §4), so a reference left behind by a rename or a merge
# reads like an optional dependency and fails silently at run time — and the
# installed coverage check in xez-setup-agent-pipeline cannot see it, because that
# check deliberately considers only roster names (an unknown xez- token there is
# assumed to be unrelated prose, not a missing skill). This is the source-side
# check that catches a stale name before it ships.
#
# Skipped by construction, because they are not name references: the `xez-auto-*`
# behavioral-contract glob and any other trailing-hyphen or `*` form; cross-skill
# file pointers `xez-<skill>/references/<file>` (the reference-resolution gate above
# owns those); and filename forms that name a repo doc.
# Everything else must be a shipped skill or listed here with a reason.
name_allow=" ${PREFIX}-skill ${PREFIX}-skills "   # prose: "new xez-skill", "the xez-skills collection"
shipped_names=" $(ls skills | tr '\n' ' ')"
name_hits=$(grep -rnoE "(^|[^A-Za-z0-9_-])${PREFIX}-[a-z0-9]+(-[a-z0-9]+)*(-?\*|/|\.[a-z0-9]+)?" skills/ 2>/dev/null | sort -u || true)
while IFS= read -r line; do
  [ -n "$line" ] || continue
  src=${line%%:*}
  rest=${line#*:}
  lineno=${rest%%:*}
  token=${rest#*:}
  token=${token#"${token%%"$PREFIX"-*}"}    # drop the leading delimiter grep captured
  case "$token" in
    *[-*/] | *.[a-z0-9]*) continue ;;      # glob, cross-skill path, or filename form
  esac
  case "$shipped_names$name_allow" in *" $token "*) continue ;; esac
  err "$src:$lineno references '$token', which is not a skill in this collection (renamed, absorbed, or a typo) — use the current name, or add it to name_allow in this script with a reason"
done <<EOF
$name_hits
EOF

# Portability gate: a skill never hard-codes the choices a consumer repo owns – its
# base branch, its package manager – nor an upstream helper name. The skill name
# prefix is stripped from each line first. Product and vendor names are NOT checked
# here: a skill that installs a product must name it, and a tracker skill must name
# its tracker (DECISIONS.md -> "The brand rule, removed").
strip_expr="s#(^|[^A-Za-z0-9])${PREFIX}-#\1#g"
patterns=(
  '(^|[^[:alnum:]-])develop($|[^[:alnum:]-])'
  '(^|[^[:alnum:]])yarn '
  'findWithDecryption'
  # A vendored kit is an ADAPTED copy, not a mirror. These are facts about the engine's own
  # repository — its module paths, its mutation-test config, its design-system tree — and they
  # shipped into every onboarded project, where the path names nothing and the reader cannot
  # follow it. Name the symbol, or read the value from `.xezar/pipeline/config.json`.
  'packages/(web|xezar)'
  '[Ss]tryker'
  'docs/design-system'
)

skill_files=$(find skills -type f | sort)
for pattern in "${patterns[@]}"; do
  hits=""
  while IFS= read -r f; do
    [ -n "$f" ] || continue
    file_hits=$(sed -E "$strip_expr" "$f" | grep -En "$pattern" | sed "s#^#$f:#" || true)
    [ -n "$file_hits" ] && hits="${hits}${hits:+
}${file_hits}"
  done <<EOF
$skill_files
EOF
  if [ -n "$hits" ]; then
    err "forbidden pattern '$pattern' found:"
    printf '%s\n' "$hits" >&2
  fi
done

# Old-brand ban (permanent): the predecessor collection's brand, its `om-` skill
# prefix and its `.ai/` layout must not reappear in the maintained sources. Lineage
# is recorded in LICENSE and the UPGRADE_NOTES.md migration entry only.
old_brand_scope=(skills/ docs/ scripts/ package.json README.md AGENTS.md SDLC.md CODE_REVIEW.md BACKWARD_COMPATIBILITY.md DECISIONS.md)
old_brand_patterns=(
  '[Oo]pen[- ][Mm]ercato'
  '@open-mercato'
  '(^|[^A-Za-z0-9])om-[a-z]'
  '\bOM\b'
  '\.ai/'
  'cezar'
)
for pattern in "${old_brand_patterns[@]}"; do
  hits=$(grep -rEn --exclude=lint.sh "$pattern" "${old_brand_scope[@]}" 2>/dev/null || true)
  if [ -n "$hits" ]; then
    err "old-brand pattern '$pattern' found (permanently banned outside LICENSE and UPGRADE_NOTES.md):"
    printf '%s\n' "$hits" >&2
  fi
done

# Tracker-abstraction gate: no direct gh CLI usage inside skills — all tracker
# operations go through the descriptor layer. The shipped descriptors under
# references/trackers/ are the one place gh commands belong.
#
# `skills/<name>/kit/**` is excluded, and the exclusion is narrow on purpose. A kit
# is vendored payload a skill COPIES into a consumer project — another product's
# workflows and check scripts, which run under that product's own engine and never
# call this collection's tracker operations. Rewriting them would fork the payload
# from its source, which is the thing a vendored copy must not do. The rule is
# unchanged for everything a skill actually instructs an agent to do.
gh_hits=$(grep -rEn '(^|[`"[:space:]])gh (api|pr|issue|label|repo|search|auth|run) ' skills/ 2>/dev/null | grep -v 'references/trackers/' | grep -vE '^skills/[^/]+/kit/' || true)
if [ -n "$gh_hits" ]; then
  err "direct gh CLI usage found outside references/trackers/ (use a tracker operation instead):"
  printf '%s\n' "$gh_hits" >&2
fi

# Process-kill gate: a skill runs in somebody else's checkout, on a machine we
# know nothing about. Killing by command-line pattern match is unbounded -- the
# same pattern that matches the dev server matches the user's editor, their other
# checkout of the same project, or an unrelated process that merely mentions it.
# Start a process, save its PID, kill that PID.
#
# `skills/<name>/kit/**` is excluded for the same reason as the gate above, and the
# hits it was catching there make the point: every one was a comment explaining why
# the payload does NOT pattern-kill. A text grep cannot tell a rule from its own
# explanation, and the payload carries its own check for this.
kill_hits=$(grep -rEn '(^|[`"'"'"'[:space:]])(pkill|killall)([[:space:]]|$)|kill[[:space:]]+(-[A-Za-z0-9]+[[:space:]]+)*\$\((pgrep|ps |lsof)' skills/ 2>/dev/null | grep -vE '^skills/[^/]+/kit/' || true)
if [ -n "$kill_hits" ]; then
  err "process killed by pattern match (use a saved PID; a pattern also matches the user's editor):"
  printf '%s\n' "$kill_hits" >&2
fi

# Committed-config gate: .xezar/pipeline/config.json is shared by everyone who
# clones the repo, so it must not carry anything true of one machine only.
# Memory limits, worker counts and absolute paths belong in the environment, not
# in a file a teammate inherits and then silently runs with the wrong value.
if [ -f .xezar/pipeline/config.json ] && command -v node >/dev/null 2>&1; then
  cfg_hits=$(node -e '
    const cfg = require("./.xezar/pipeline/config.json");
    const banned = /^(memory|maxMemory|heap|parallel|parallelism|jobs|threads|maxWorkers|concurrency|cpus|nodePath|homeDir)$/i;
    const out = [];
    (function walk(node, path) {
      if (node === null || typeof node !== "object") return;
      for (const [k, v] of Object.entries(node)) {
        const here = path ? path + "." + k : k;
        if (banned.test(k)) out.push(here + " (machine-specific setting)");
        if (typeof v === "string" && /^(\/|[A-Za-z]:\\|~\/)/.test(v)) out.push(here + " (absolute path: " + v + ")");
        walk(v, here);
      }
    })(cfg, "");
    if (out.length) console.log(out.join("\n"));
  ' 2>/dev/null || true)
  if [ -n "$cfg_hits" ]; then
    err "committed pipeline config carries machine-specific values (move them to the environment):"
    printf '%s\n' "$cfg_hits" >&2
  fi
fi

# Secrets gate: the rule "never commit a credential" is worth exactly as much as
# the check behind it. Values only -- a key NAME like "passwordEnv" is how the
# collection refers to a secret without holding one.
secret_hits=$(grep -rEn \
  '(gh[pousr]_[A-Za-z0-9]{16,}|xox[baprs]-[A-Za-z0-9-]{10,}|AKIA[0-9A-Z]{16}|-----BEGIN [A-Z ]*PRIVATE KEY-----|(secret|token|password|api[_-]?key)[[:space:]]*[:=][[:space:]]*["'"'"'][A-Za-z0-9/+_-]{16,}["'"'"'])' \
  skills/ scripts/ docs/ .xezar/ 2>/dev/null | grep -vE '<[^>]*>|\$\{|\$[A-Za-z_]|example|placeholder|REDACTED|xxxx' || true)
if [ -n "$secret_hits" ]; then
  err "credential-shaped value found in a committed file:"
  printf '%s\n' "$secret_hits" >&2
fi

if [ "$fail" -ne 0 ]; then
  echo "Lint failed." >&2
  exit 1
fi

node scripts/test-discovery-contracts.mjs || exit 1

echo "Lint OK."
