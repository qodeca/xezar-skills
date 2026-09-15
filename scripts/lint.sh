#!/usr/bin/env bash
# Lint gate for the skills collection.
# 1. Frontmatter: every skills/<name>/SKILL.md declares name (== directory) and a description.
# 2. Local overrides: every skill explicitly checks its own `.xezar/pipeline/overrides/<name>.md` override file.
# 3. Grep gate: installable skill content must be product-agnostic — no product or brand
#    tokens, no hard-coded base branch, no hard-coded package manager. The xez- name
#    prefix is the naming convention and is allowed; agnosticism is about behavior.
# 4. Old-brand ban: the predecessor collection's brand, prefix and `.ai/` layout may not
#    reappear anywhere in the maintained sources (LICENSE and UPGRADE_NOTES.md excepted).
# Scope of 3: skills/** only. README, LICENSE, and DECISIONS.md may name Qodeca/Xezar.
set -uo pipefail

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

# Agnosticism gate: skills stay brand-free so they run in any consumer repo. The
# collection's own tokens – the source slug, the pipeline directory and the skill
# name prefix – are stripped from each line first; every other brand token is a hit.
strip_expr="s#qodeca/xezar-skills##g; s#\.xezar/pipeline/##g; s#(^|[^A-Za-z0-9])${PREFIX}-#\1#g"
patterns=(
  '[Qq]odeca'
  '@qodeca'
  '[Xx]ezar'
  '(^|[^[:alnum:]-])develop($|[^[:alnum:]-])'
  '(^|[^[:alnum:]])yarn '
  'findWithDecryption'
)

skill_files=$(find skills -type f | sort)
for pattern in "${patterns[@]}"; do
  hits=""
  while IFS= read -r f; do
    [ -n "$f" ] || continue
    # Native engine/MCP tokens required by onboarding, scoped to their exact
    # artifact surfaces. Strip tokens, never a whole line/file: adjacent project
    # instructions must still fail. Other skills keep the existing brand gate.
    file_strip="$strip_expr"
    case "$f" in
      skills/xez-onboard/references/writes.md)
        file_strip="$file_strip; s#\\.xezar/config\\.json([^A-Za-z0-9_./-]|$)#\\1#g" ;;
      skills/xez-onboard/references/recheck.md)
        file_strip="$file_strip; s#\\.local/xezar/onboarding-state\\.json([^A-Za-z0-9_./-]|$)#\\1#g" ;;
      skills/xez-onboard/references/clients.md)
        file_strip="$file_strip; s#@qodeca/xezar([^A-Za-z0-9_./-]|$)#\\1#g; s#server:xezar([^A-Za-z0-9_-]|$)#\\1#g" ;;
      skills/xez-onboard/templates/claude-mcp.json|skills/xez-onboard/templates/pi-mcp.json)
        file_strip="$file_strip; s#@qodeca/xezar([^A-Za-z0-9_./-]|$)#\\1#g; s#\"xezar\":##g" ;;
      skills/xez-onboard/templates/codex-mcp.toml)
        file_strip="$file_strip; s#@qodeca/xezar([^A-Za-z0-9_./-]|$)#\\1#g; s#\\[mcp_servers\\.xezar\\]##g" ;;
    esac
    file_hits=$(sed -E "$file_strip" "$f" | grep -En "$pattern" | sed "s#^#$f:#" || true)
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
gh_hits=$(grep -rEn '(^|[`"[:space:]])gh (api|pr|issue|label|repo|search|auth|run) ' skills/ 2>/dev/null | grep -v 'references/trackers/' || true)
if [ -n "$gh_hits" ]; then
  err "direct gh CLI usage found outside references/trackers/ (use a tracker operation instead):"
  printf '%s\n' "$gh_hits" >&2
fi

if [ "$fail" -ne 0 ]; then
  echo "Lint failed." >&2
  exit 1
fi

node scripts/test-discovery-contracts.mjs || exit 1

echo "Lint OK."
