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
#
# Targeted runs (#122), for tests and quick feedback – never a gate result:
#   --only <check>     run only this check; repeat the option for several (the names are in CHECKS).
#   --files <path>...  repository-relative files: a per-file check scans only these, a per-skill
#                      check covers only the skills that own them, and a whole-tree check
#                      (roster, config, discovery, platform) runs as usual.
# With no option this is the full gate and its output is unchanged. A bad option, an unknown
# check or a path that is not a file in the repository stops the run with exit 2.
#
# How a per-file check runs (#123): one bulk pass reads every file once and flags the files that
# could hold a finding; the per-file code then runs for the flagged files only and prints every
# message. A green run starts a fixed number of programs, so never add a $( ) or a pipeline that
# runs once per file or per skill on a green path. grep and sed decide every pattern hit; awk
# copies, splits and counts, and decides only the frontmatter's first-line and override checks. A
# file the bulk pass cannot read faithfully (binary, encoding error, empty, unreadable, a CR, a
# byte count that is not its size) is always flagged, and strip_expr must stay line-local (s///
# commands only – a review rule, nothing checks it). The edges left are in DECISIONS.md ->
# "lint.sh finds in bulk and reports with its per-file code".
# To give a check a bulk pass: (1) name it in the temp-folder condition below; (2) write only under
# $lint_tmp, behind [ -d "${lint_tmp:-}" ]; (3) flag every file on any failure – no temp folder, a
# file it cannot write or read, an exit status, a line of stderr; (4) keep the per-file code as it
# is and skip only the files the pass did not flag; (5) add a committed case that a test-guards
# break fires.
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

CHECKS="frontmatter packaging references roster names portability role-skills old-brand tracker-cli process-kill config secrets discovery platform"
only_checks=""   # " <check> <check> " when --only was given
target_files=""  # newline-separated, repository-relative, when --files was given
usage_error() { printf 'lint.sh: %s\n' "$*" >&2; exit 2; }
while [ "$#" -gt 0 ]; do
  case "$1" in
    --only)
      [ "$#" -ge 2 ] || usage_error "--only needs a check name; the checks are: $CHECKS"
      case " $CHECKS " in
        *" $2 "*) only_checks="${only_checks:- }$2 " ;;
        *) usage_error "unknown check '$2'; the checks are: $CHECKS" ;;
      esac
      shift 2
      ;;
    --files)
      shift
      [ "$#" -gt 0 ] && [ "${1#--}" = "$1" ] || usage_error "--files needs at least one path"
      while [ "$#" -gt 0 ] && [ "${1#--}" = "$1" ]; do
        f=${1//\\//}
        f=${f#./}
        case "$f" in
          '' | /* | [A-Za-z]:* | .. | ../* | */.. | */../*) usage_error "--files takes paths relative to the repository root: '$1'" ;;
        esac
        [ -f "$f" ] || usage_error "--files: not a file in this repository: '$1'"
        target_files="$target_files$f
"
        shift
      done
      ;;
    *) usage_error "unknown option '$1'; the options are --only <check> and --files <path>..." ;;
  esac
done
[ -z "$target_files" ] || target_files=$(printf '%s' "$target_files" | sort -u)

# want <check>: is the check part of this run? Every check is, unless --only names others.
want() {
  [ -z "$only_checks" ] && return 0
  case "$only_checks" in *" $1 "*) return 0 ;; esac
  return 1
}

# covers_skill <skills/name/>: does the run cover this skill? Every skill, unless --files lists
# no file inside it.
covers_skill() {
  [ -z "$target_files" ] && return 0
  case "
$target_files" in *"
$1"*) return 0 ;; esac
  return 1
}

# listed <path>...: the --files that sit under one of the paths ("dir/") or are one of them.
listed() {
  local f p
  while IFS= read -r f; do
    [ -n "$f" ] || continue
    for p in "$@"; do
      case "$p" in
        */) case "$f" in "$p"*) printf '%s\n' "$f"; break ;; esac ;;
        *) if [ "$f" = "$p" ]; then printf '%s\n' "$f"; break; fi ;;
      esac
    done
  done <<EOF
$target_files
EOF
}

# grep_listed <files> <grep options> <pattern>: grep a newline-separated list of files, naming
# the file on every hit as grep -r does. An empty list scans nothing (no output, status 1).
grep_listed() {
  local list="$1" opts="$2" pattern="$3" f
  set --
  while IFS= read -r f; do
    [ -n "$f" ] && set -- "$@" "$f"
  done <<EOF
$list
EOF
  [ "$#" -gt 0 ] || return 1
  # shellcheck disable=SC2086 # the options are separate words on purpose
  grep -H $opts -e "$pattern" -- "$@"
}

# grep_scope <grep options> <pattern> <path>...: a full run greps the paths recursively, exactly
# as written; with --files only the listed files under those paths are read.
grep_scope() {
  local opts="$1" pattern="$2"
  shift 2
  if [ -z "$target_files" ]; then
    # shellcheck disable=SC2086 # the options are separate words on purpose
    grep -r $opts "$pattern" "$@"
  else
    grep_listed "$(listed "$@")" "$opts" "$pattern"
  fi
}

command -v node >/dev/null 2>&1 || { printf 'LINT FAIL: %s\n' "node is required (it counts description characters and reads the pipeline config)" >&2; exit 1; }

# Characters, not bytes: `${#var}` counts bytes when no UTF-8 locale is set (Git Bash on Windows
# with LANG unset, a C-locale CI shell), so a 500-character description in a multibyte script
# read as 1000. Node counts code points, which is what `${#var}` counts in a UTF-8 locale (#122).
desc_chars() { printf '%s' "$1" | node -e 'process.stdout.write(String([...require("fs").readFileSync(0, "utf8")].length))'; }

nl='
'
tab=$'\t'

# in_list <newline-separated list> <line>: is the line one of the list's lines?
in_list() {
  case "$nl$1$nl" in *"$nl$2$nl"*) return 0 ;; esac
  return 1
}

# One temp folder per run holds the bulk passes' lists and streams; lint never writes in the
# repository. awk reads paths from ENVIRON, never through -v, which would turn a backslash in a
# TMPDIR path into an escape.
lint_tmp=""
if want frontmatter || want packaging || want portability || want role-skills; then
  if ! lint_tmp=$(mktemp -d "${TMPDIR:-/tmp}/lint.XXXXXX") || [ ! -d "$lint_tmp" ]; then
    printf 'LINT FAIL: %s\n' "cannot create a temp folder" >&2
    exit 1
  fi
  trap 'rm -rf "$lint_tmp"' EXIT
  trap 'exit 130' INT TERM
  export LINT_TMP="$lint_tmp"
fi

# Frontmatter values come from one awk pass over fm.list (fm_bulk) and one `wc -c`, so the loop
# below starts no program per skill. Per skill the pass prints k, path, slow, first, name,
# description and override, one per line. awk reads in binary mode (BINMODE, gawk on Windows; a
# plain variable elsewhere), so it sees every CR. A CR in a SKILL.md or in a reference's first line
# (Git Bash's awk and $( ) drop one, head and Linux keep it), a file it cannot read, or a size wc
# does not print sets slow, and that skill runs the per-skill reads.
# fm_awk and the per-skill reads in the loop below (fm_slow) are two implementations of the same
# reads: change both. test-onboarding-content.mjs proves they report the same on twin skills.
# shellcheck disable=SC2016 # a literal: the backticks are text, not a command
ov_tpl='**ALWAYS check first:** Apply `.xezar/pipeline/overrides/@NAME@.md` when present; safety rules still win.'
# shellcheck disable=SC2016 # an awk program: its $ fields are awk's, not the shell's
fm_awk='
function trim(v) {
  while (v != "" && index(ws, substr(v, 1, 1))) v = substr(v, 2)
  return v
}
function skill(k, path,   name, want, body, line, r, nr, c, f, infm, gn, gd) {
  n++; ks[n] = k; paths[k] = path; first[k] = 0; fname[k] = ""; fdesc[k] = ""; ov[k] = 0
  name = substr(path, 8, length(path) - 16)
  want = pre name post
  body = tmp "/body." k
  printf "" > body
  infm = 1
  while ((r = (getline line < path)) > 0) {
    nr++
    if (index(line, "\r")) slow[k] = 1
    if (nr == 1) first[k] = (line == "---")
    else if (infm && line == "---") infm = 0
    else if (infm) {
      if (!gn && substr(line, 1, 5) == "name:") { fname[k] = trim(substr(line, 6)); gn = 1 }
      if (!gd && substr(line, 1, 12) == "description:") { fdesc[k] = trim(substr(line, 13)); gd = 1 }
    }
    if (f) print line > body
    if (line == "---" && ++c == 2) f = 1
    if (!ov[k] && index(line, want)) ov[k] = 1
  }
  if (r < 0) slow[k] = 1
  close(path); close(body)
}
function ref(k, path,   line, r) {
  r = (getline line < path)
  if (r < 0 || index(line, "\r")) slow[k] = 1
  else if (r > 0 && line == "<!-- loaded: always -->") print k "\t" path > always
  close(path)
}
BEGIN {
  BINMODE = 3; FS = "\t"; ws = " \t\r\013\014"
  tmp = ENVIRON["LINT_TMP"]; always = tmp "/always"; printf "" > always
  tpl = ENVIRON["LINT_OV_TPL"]; at = index(tpl, "@NAME@")
  pre = substr(tpl, 1, at - 1); post = substr(tpl, at + 6)
}
$1 == "S" { skill($2, substr($0, length($2) + 4)) }
$1 == "R" { ref($2, substr($0, length($2) + 4)) }
END {
  close(always)
  for (i = 1; i <= n; i++) {
    k = ks[i]
    print k; print paths[k]; print (slow[k] ? 1 : 0); print first[k]; print fname[k]; print fdesc[k]; print ov[k]
  }
}'

# fm_bulk: fills fm_*_a[k] for the k-th covered skill that has a SKILL.md – the same glob, order
# and tests as the loop below. A skill it leaves without fm_path_a runs the per-skill reads.
fm_bulk() {
  local dir ref k=0 i path slow first fname fdesc ov
  [ -d "${lint_tmp:-}" ] || return 0
  for dir in skills/*/; do
    covers_skill "$dir" || continue
    [ -f "${dir}SKILL.md" ] || continue
    k=$((k + 1))
    printf 'S\t%s\t%s\n' "$k" "${dir}SKILL.md"
    for ref in "${dir}"references/*.md; do
      [ -f "$ref" ] && printf 'R\t%s\t%s\n' "$k" "$ref"
    done
  done > "$lint_tmp/fm.list"
  [ "$k" -gt 0 ] || return 0
  : > "$lint_tmp/always"
  LINT_OV_TPL=$ov_tpl LC_ALL=C awk "$fm_awk" "$lint_tmp/fm.list" > "$lint_tmp/fm.out" </dev/null || return 0
  while IFS= read -r i && IFS= read -r path && IFS= read -r slow && IFS= read -r first &&
    IFS= read -r fname && IFS= read -r fdesc && IFS= read -r ov; do
    case "$i" in '' | *[!0-9]*) break ;; esac
    fm_path_a[i]=$path; fm_slow_a[i]=$slow; fm_first_a[i]=$first
    fm_name_a[i]=$fname; fm_desc_a[i]=$fdesc; fm_ov_a[i]=$ov
  done < "$lint_tmp/fm.out"
  fm_sizes "$k"
}

# fm_sizes <k>: one `wc -c` over the k bodies and every always-loaded reference, matched by path.
# A body keeps the count exactly as `wc -c` prints it for one input – BSD pads it the same way for
# a file, GNU aligns several files, so the padding goes – because a message prints it as it is.
fm_sizes() {
  local skills=$1 i=1 line rest count path gnu=0 q=1 m total=0 wc_out
  set --
  while [ "$i" -le "$skills" ]; do set -- "$@" "$lint_tmp/body.$i"; i=$((i + 1)); done
  while IFS="$tab" read -r i path; do
    case "$i" in '' | *[!0-9]*) continue ;; esac
    total=$((total + 1)); aw_k[total]=$i; aw_path[total]=$path; aw_size[total]=""
    set -- "$@" "$path"
  done < "$lint_tmp/always"
  wc_out=$(wc -c -- "$@" </dev/null 2>/dev/null)
  case "$nl$wc_out" in *"$nl"[!\ ]*) gnu=1 ;; esac
  while IFS= read -r line; do
    rest=${line#"${line%%[! ]*}"}
    count=${rest%% *}
    path=${rest#* }
    case "$count" in '' | *[!0-9]*) continue ;; esac
    case "$path" in
      "$lint_tmp/body."*)
        i=${path#"$lint_tmp/body."}
        case "$i" in '' | *[!0-9]*) continue ;; esac
        if [ "$gnu" = 1 ]; then fm_body_a[i]=$count; else fm_body_a[i]=${line%" $path"}; fi
        continue ;;
    esac
    # wc prints the files in argument order; a file it could not size is skipped, not padded.
    m=$q
    while [ "$m" -le "$total" ] && [ "${aw_path[m]}" != "$path" ]; do m=$((m + 1)); done
    [ "$m" -le "$total" ] || continue
    aw_size[m]=$count
    q=$((m + 1))
  done <<EOF
$wc_out
EOF
  m=1
  while [ "$m" -le "$total" ]; do
    i=${aw_k[m]}
    if [ -z "${aw_size[m]}" ]; then
      fm_slow_a[i]=1
    else
      fm_always_a[i]=$((${fm_always_a[i]:-0} + aw_size[m]))
    fi
    m=$((m + 1))
  done
}

want frontmatter && fm_bulk
fm_k=0
for dir in skills/*/; do
  if ! want frontmatter || ! covers_skill "$dir"; then continue; fi
  name=${dir%/}
  name=${name##*/}
  file="${dir}SKILL.md"
  if [ ! -f "$file" ]; then
    err "$dir is missing SKILL.md"
    continue
  fi
  fm_k=$((fm_k + 1))
  fm_slow=1
  if [ "${fm_path_a[fm_k]-}" = "$file" ] && [ -n "${fm_body_a[fm_k]-}" ]; then fm_slow=${fm_slow_a[fm_k]}; fi
  if [ "$fm_slow" = 1 ]; then
    fm_first=0
    [ "$(head -n 1 "$file")" != "---" ] || fm_first=1
  else
    fm_first=${fm_first_a[fm_k]}
  fi
  if [ "$fm_first" != 1 ]; then
    err "$file does not start with frontmatter"
    continue
  fi
  if [ "$fm_slow" = 1 ]; then
    fm=$(awk 'NR==1 {next} /^---$/ {exit} {print}' "$file")
    fm_name=$(printf '%s\n' "$fm" | sed -n 's/^name:[[:space:]]*//p' | head -n 1)
    fm_desc=$(printf '%s\n' "$fm" | sed -n 's/^description:[[:space:]]*//p' | head -n 1)
  else
    fm_name=${fm_name_a[fm_k]}
    fm_desc=${fm_desc_a[fm_k]}
  fi
  if [ "$fm_name" != "$name" ]; then
    err "$file frontmatter name '$fm_name' does not match directory '$name'"
  fi
  if [ -z "$fm_desc" ]; then
    err "$file frontmatter is missing a description"
  else
    # The shell's count is never below the character count (bytes are never fewer than
    # characters), so node is started only for a description that might be over the limit.
    desc_len=${#fm_desc}
    [ "$desc_len" -gt 500 ] && desc_len=$(desc_chars "$fm_desc")
    case "$desc_len" in
      '' | *[!0-9]*) err "$file: description characters could not be counted" ;;
      *) if [ "$desc_len" -gt 500 ]; then
           err "$file description is ${desc_len} chars (max 500; aim for ≤350) — descriptions load into every session's context"
         fi ;;
    esac
  fi
  # Unquoted ": " inside a plain YAML scalar is invalid YAML and the most common
  # cross-client parse failure (agentskills.io client guide). Quote it or rephrase.
  case "$fm_desc" in
    \"*|\'*) : ;;
    *": "*) err "$file description contains an unquoted ': ' — invalid YAML for strict parsers; rephrase (use — ) or quote the value" ;;
  esac
  # Progressive-disclosure budget: a SKILL.md body should stay under ~5k tokens
  # (~20000 chars); push detail into references/ instead (agentskills.io tier-2 guidance).
  if [ "$fm_slow" = 1 ]; then
    body_chars=$(awk 'f{print} /^---$/{c++; if(c==2) f=1}' "$file" | wc -c)
  else
    body_chars=${fm_body_a[fm_k]}
  fi
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
  if [ "$fm_slow" = 1 ]; then
    for ref in "$(dirname "$file")"/references/*.md; do
      [ -f "$ref" ] || continue
      if [ "$(head -1 "$ref")" = "<!-- loaded: always -->" ]; then
        always_chars=$((always_chars + $(wc -c < "$ref")))
      fi
    done
  else
    always_chars=${fm_always_a[fm_k]:-0}
  fi
  loaded_chars=$((body_chars + always_chars))
  if [ "$loaded_chars" -gt "$LOADED_CEILING" ]; then
    err "$file loads ${loaded_chars} chars per run (body ${body_chars} + always-loaded ${always_chars}); ceiling ${LOADED_CEILING} — the ceiling is a ratchet and never rises"
  elif [ "$loaded_chars" -gt "$LOADED_WARN" ]; then
    echo "note: $file loads ${loaded_chars} chars per run (${LOADED_WARN} is 85% of the ${LOADED_CEILING} ceiling) — trim before adding to it" >&2
  fi

  # Invocation-layer invariant: the command must live in SKILL.md itself, not only
  # behind references/agentic-setup.md, so it cannot be skipped by partial loading.
  # One literal (ov_tpl) for this message and for the bulk pass; the name goes in by prefix and
  # suffix, not ${ov_tpl//@NAME@/$name}, whose replacement bash 5.2 reads `&` in.
  expected_override="${ov_tpl%%@NAME@*}${name}${ov_tpl#*@NAME@}"
  if [ "$fm_slow" = 1 ]; then
    fm_ov=0
    if grep -Fq "$expected_override" "$file"; then fm_ov=1; fi
  else
    fm_ov=${fm_ov_a[fm_k]}
  fi
  if [ "$fm_ov" != 1 ]; then
    err "$file is missing the mandatory local override preflight: $expected_override"
  fi
done

# Packaging gate: two machine-readable contracts that shipped broken once and
# are invisible to a human reviewer.
#   1. An agents/<client>.yaml that invokes a name other than the skill's own
#      addresses a package the user does not have installed.
#   2. OS metadata files (.DS_Store, Thumbs.db) get published into every
#      installed copy of the skill.
# packaging_bulk: one grep over every covered agents/*.yaml flags the yamls that invoke a name
# other than their skill's, cannot be read, or give output it cannot parse (a binary-file note,
# an error, a missing hits or error file: then every yaml); the loop below reports on the flagged
# yamls only.
pkg_flagged=""
packaging_bulk() {
  local dir meta line path token owner yamls="" rc=0
  set --
  for dir in skills/*/; do
    covers_skill "$dir" || continue
    for meta in "$dir"agents/*.yaml; do
      [ -e "$meta" ] || continue
      set -- "$@" "$meta"
      yamls="$yamls$meta$nl"
      [ -r "$meta" ] || pkg_flagged="$pkg_flagged$meta$nl"
    done
  done
  [ "$#" -gt 0 ] || return 0
  if ! [ -d "${lint_tmp:-}" ]; then pkg_flagged=$yamls; return 0; fi
  grep -H -oE '\$[a-z0-9-]+' -- "$@" </dev/null > "$lint_tmp/pkg.hits" 2> "$lint_tmp/pkg.err" || rc=$?
  if [ "$rc" -gt 1 ] || [ ! -f "$lint_tmp/pkg.hits" ] || [ ! -f "$lint_tmp/pkg.err" ] || [ -s "$lint_tmp/pkg.err" ]; then
    pkg_flagged=$yamls
    return 0
  fi
  while IFS= read -r line; do
    path=${line%:*}
    token=${line##*:}
    owner=${path#skills/}
    owner=${owner%%/*}
    case "$token" in '$'?*) ;; *) pkg_flagged=$yamls; return 0 ;; esac
    in_list "$yamls" "$path" || { pkg_flagged=$yamls; return 0; }
    [ "$token" = "\$$owner" ] || pkg_flagged="$pkg_flagged$path$nl"
  done < "$lint_tmp/pkg.hits"
}
want packaging && packaging_bulk
for dir in skills/*/; do
  if ! want packaging || ! covers_skill "$dir"; then continue; fi
  name=${dir%/}
  name=${name##*/}
  for meta in "$dir"agents/*.yaml; do
    [ -e "$meta" ] || continue
    in_list "$pkg_flagged" "$meta" || continue
    invoked=$(grep -oE '\$[a-z0-9-]+' "$meta" | sort -u)
    for token in $invoked; do
      if [ "$token" != "\$$name" ]; then
        err "$meta invokes $token but the installed skill is named '$name'"
      fi
    done
  done
done

# find_junk <folders, one per line>: the OS metadata files under them. Each line is one argument
# to find – never split or globbed – so a folder named in --files with a space, a `;` or a `-exec`
# in it stays one path.
find_junk() {
  local dirs="$1" dir
  set --
  while IFS= read -r dir; do
    [ -n "$dir" ] && set -- "$@" "$dir"
  done <<EOF
$dirs
EOF
  [ "$#" -gt 0 ] || return 0
  find "$@" -name '.DS_Store' -o -name 'Thumbs.db' 2>/dev/null
}

junk_dirs=skills
[ -z "$target_files" ] || junk_dirs=$(listed skills/ | sed -n 's#^\(skills/[^/]*\)/.*#\1#p' | sort -u)
junk=""
if want packaging && [ -n "$junk_dirs" ]; then
  junk=$(find_junk "$junk_dirs")
fi
if [ -n "$junk" ]; then
  err "OS metadata files must not ship inside skills: $(printf '%s' "$junk" | tr '\n' ' ')"
fi

# Reference-resolution gate: every `references/...` pointer in a skill's markdown
# must resolve — same-skill pointers relative to the skill dir, cross-skill
# pointers written as explicit xez-<skill>/references/<file> paths.
ref_pattern="(${PREFIX}-[a-z-]+/)?references/[A-Za-z0-9._/-]+\.(md|py|sh|png)"
ref_hits=""
if ! want references; then
  :
elif [ -z "$target_files" ]; then
  ref_hits=$(grep -roE --include='*.md' "$ref_pattern" skills 2>/dev/null | sort -u || true)
else
  ref_hits=$(grep_listed "$(listed skills/ | grep '\.md$')" -oE "$ref_pattern" 2>/dev/null | sort -u || true)
fi
while IFS= read -r line; do
  [ -n "$line" ] || continue
  src=${line%%:*}
  ref=${line#*:}
  rest=${src#*/}   # fields 1-2 of "/", or the whole line without one (as `cut -d/ -f1-2`)
  if [ "$rest" = "$src" ]; then skill_dir=$src; else skill_dir=${src%%/*}/${rest%%/*}; fi
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
if ! want roster; then
  :
elif [ ! -f "$roster_file" ]; then
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
name_hits=""
want names && name_hits=$(grep_scope -noE "(^|[^A-Za-z0-9_-])${PREFIX}-[a-z0-9]+(-[a-z0-9]+)*(-?\*|/|\.[a-z0-9]+)?" skills/ 2>/dev/null | sort -u || true)
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
  'findWithDecryption'
)
# The Yarn 1 toolchain descriptors must write its commands, and they are the only files that may.
# Bound to scripts/allowlists.json `yarnLiteral` by scripts/check-allowlists.mjs.
yarn_allow=" skills/xez-setup-agent-pipeline/references/toolchains/yarn.md skills/xez-onboard-opinionated/kit/pipeline/toolchains/yarn.md "
yarn_patterns=(
  '(^|[^[:alnum:]])yarn '
)
# A vendored kit is an ADAPTED copy, not a mirror. These are facts about the engine's own
# repository — its module paths, its mutation-test config, its design-system tree — and they
# shipped into every onboarded project, where the path names nothing and the reader cannot
# follow it. Name the symbol, or read the value from `.xezar/pipeline/config.json`.
#
# Scoped to `skills/<name>/kit/**` and nowhere else. `docs/design-system` is also the DEFAULT
# a setup skill writes into `paths.designSystem`, so the skill's own references must be able to
# say it; what must never happen is a kit file that follows the path instead of reading the key.
kit_patterns=(
  'packages/(web|xezar)'
  '[Ss]tryker'
  'docs/design-system'
)

if [ -z "$target_files" ]; then
  skill_files=$(find skills -type f | sort)
else
  skill_files=$(listed skills/)
fi

# The bulk pass for portability and role-skills. The stream awks copy each listed file into one
# stream and write an index line per file, "count<TAB>bytes<TAB>size<TAB>key": the lines it put in
# the stream, the bytes it read (-1 when the stream cannot stand for the file: unreadable, a CR,
# or listed by the probe – binary, encoding error or empty in this run's locale, where grep -a
# would decide otherwise than the per-file grep), and the file's `wc -c` size (-1 when unknown).
# bulk_load_awk reads the size table and the probe list, both matched by path.
bulk_load_awk='
function load(   f, line, i) {
  f = ENVIRON["LINT_TMP"] "/sizes"
  while ((getline line < f) > 0) {
    sub(/^ +/, "", line); i = index(line, " ")
    if (i > 1) size[substr(line, i + 1)] = substr(line, 1, i - 1) + 0
  }
  close(f)
  f = ENVIRON["LINT_TMP"] "/probe"
  while ((getline line < f) > 0) probe[line] = 1
  close(f)
}
function index_line(key, path, count, bytes, bad) {
  if (bad || (path in probe)) bytes = -1
  print count "\t" bytes "\t" ((path in size) ? size[path] : -1) "\t" key
}'
# stream_awk: every listed skill file, line by line, into raw (awk ends every line with a newline).
# shellcheck disable=SC2016 # an awk program: its $ fields are awk's, not the shell's
stream_awk='
BEGIN { BINMODE = 3; load(); raw = ENVIRON["LINT_TMP"] "/raw"; printf "" > raw }
$0 != "" {
  path = $0; count = 0; bytes = 0; bad = 0
  while ((r = (getline line < path)) > 0) {
    print line > raw; count++; bytes += length(line) + 1
    if (index(line, "\r")) bad = 1
  }
  if (r < 0) bad = 1
  close(path)
  index_line(path, path, count, bytes, bad)
}'
# bulk_join_awk: maps every grep hit to its file through the cumulative line counts of the index
# (a hit on the last line of a file belongs to that file), then prints, in list order, each key
# with a hit, with bytes that are neither its size nor its size + 1 (C1), missing from the index,
# or every key when LINT_BULK_ALL is 1. It exits 1 when it cannot read the hits or the list.
bulk_join_awk='
BEGIN {
  tmp = ENVIRON["LINT_TMP"]; f = ENVIRON["LINT_BULK_INDEX"]; n = 0; total = 0
  while ((getline line < f) > 0) {
    t = index(line, "\t"); count = substr(line, 1, t - 1) + 0; line = substr(line, t + 1)
    t = index(line, "\t"); bytes = substr(line, 1, t - 1) + 0; line = substr(line, t + 1)
    t = index(line, "\t"); size = substr(line, 1, t - 1) + 0; k = substr(line, t + 1)
    n++; key[n] = k; known[k] = 1; total += count; last[n] = total
    if (size < 0 || (bytes != size && bytes != size + 1)) flag[k] = 1
  }
  close(f)
  f = tmp "/bulk.hits"; p = 1
  while ((r = (getline line < f)) > 0) {
    ln = substr(line, 1, index(line, ":") - 1) + 0
    while (p <= n && !(ln <= last[p])) p++
    if (p <= n) flag[key[p]] = 1
  }
  close(f)
  if (r < 0) exit 1
  all = (ENVIRON["LINT_BULK_ALL"] == 1); f = tmp "/bulk.list"
  while ((r = (getline k < f)) > 0) if (k != "" && (all || (k in flag) || !(k in known))) print k
  close(f)
  if (r < 0) exit 1
}'

# bulk_flag <stream> <index> <files> <grep option>...: one grep over the stream, then every file of
# the newline-separated <files> the join flags, in list order. An empty list starts nothing; no
# temp folder, a list it cannot write, or a grep or join that fails flags every file.
bulk_flag() {
  local stream="$lint_tmp/$1" index="$lint_tmp/$2" files="$3" rc=0 all=0 flagged
  shift 3
  [ -n "$files" ] || return 0
  if ! [ -d "${lint_tmp:-}" ] || ! printf '%s\n' "$files" > "$lint_tmp/bulk.list"; then
    printf '%s\n' "$files"
    return 0
  fi
  grep -a -n "$@" -- "$stream" </dev/null > "$lint_tmp/bulk.hits" 2> "$lint_tmp/bulk.err" || rc=$?
  if [ "$rc" -gt 1 ] || [ -s "$lint_tmp/bulk.err" ]; then all=1; fi
  if flagged=$(LINT_BULK_INDEX=$index LINT_BULK_ALL=$all LC_ALL=C awk "$bulk_join_awk" </dev/null); then
    [ -z "$flagged" ] || printf '%s\n' "$flagged"
  else
    printf '%s\n' "$files"
  fi
}

# skill_probe: the skill files grep reads as binary, with an encoding error, or empty, in this run's
# locale – where grep -a on the stream and the per-file grep can disagree (C3). Its exit status
# differs between grep versions with -L, so it is not read; a line of stderr (or no error file)
# may mean a file it missed, so then it lists every file.
skill_probe() {
  local f
  if [ -z "$target_files" ]; then
    grep -rIL -e '' -- skills </dev/null 2> "$lint_tmp/probe.err"
  else
    set --
    while IFS= read -r f; do
      [ -n "$f" ] && set -- "$@" "$f"
    done < "$lint_tmp/skill.list"
    [ "$#" -gt 0 ] || return 0
    grep -IL -e '' -- "$@" </dev/null 2> "$lint_tmp/probe.err"
  fi
  if [ ! -f "$lint_tmp/probe.err" ] || [ -s "$lint_tmp/probe.err" ]; then
    printf '%s\n' "$skill_files"
  fi
  return 0
}

if [ -n "$skill_files" ] && { want portability || want role-skills; } && [ -d "${lint_tmp:-}" ]; then
  printf '%s\n' "$skill_files" > "$lint_tmp/skill.list"
  skill_probe > "$lint_tmp/probe"
  # xargs splits a long list itself, so no command line grows with the number of files.
  tr '\n' '\0' < "$lint_tmp/skill.list" | xargs -0 wc -c -- > "$lint_tmp/sizes" 2>/dev/null
fi
if [ -n "$skill_files" ] && want portability && [ -d "${lint_tmp:-}" ]; then
  # A failed step leaves an empty index, and a file the index does not know is always flagged.
  LC_ALL=C awk "$bulk_load_awk$stream_awk" "$lint_tmp/skill.list" > "$lint_tmp/index" </dev/null || : > "$lint_tmp/index"
  if ! sed -E "$strip_expr" "$lint_tmp/raw" > "$lint_tmp/stripped" 2> "$lint_tmp/sed.err" || [ -s "$lint_tmp/sed.err" ]; then
    : > "$lint_tmp/index"
  fi
fi

scan_patterns() {
  # $1: newline-separated file list; the rest: the patterns to refuse in those files.
  local files="$1" pattern hits f file_hits
  shift
  for pattern in "$@"; do
    hits=""
    while IFS= read -r f; do
      [ -n "$f" ] || continue
      # The file name goes in through ENVIRON, never into a sed script, where a `#` would end the
      # substitution and the text after it run as sed flags.
      file_hits=$(sed -E "$strip_expr" "$f" | grep -En "$pattern" | LINT_PREFIX="$f" awk '{ print ENVIRON["LINT_PREFIX"] ":" $0 }' || true)
      [ -n "$file_hits" ] && hits="${hits}${hits:+
}${file_hits}"
    done <<EOF
$(bulk_flag stripped index "$files" -E -e "$pattern")
EOF
    if [ -n "$hits" ]; then
      err "forbidden pattern '$pattern' found:"
      printf '%s\n' "$hits" >&2
    fi
  done
}
yarn_scope() {
  local f
  while IFS= read -r f; do
    case "$yarn_allow" in
      *" $f "*) ;;
      *) printf '%s\n' "$f" ;;
    esac
  done <<EOF
$skill_files
EOF
}
if want portability; then
  scan_patterns "$skill_files" "${patterns[@]}"
  scan_patterns "$(yarn_scope)" "${yarn_patterns[@]}"
  scan_patterns "$(printf '%s\n' "$skill_files" | grep -E '^skills/[^/]+/kit/' || true)" "${kit_patterns[@]}"
fi

# Kit role skills name no package manager (#59). They run in projects on Yarn, .NET or several
# install roots, so a role reads its commands from the installed toolchain descriptors,
# `dependencies.units` and `validation.commands` instead of assuming npm, a root lockfile or a
# workspace count. The generated `## Shared contract` tail of every role skill is always scanned;
# a body is scanned unless the file is listed here, each with a reason and an expiry.
# Bound to scripts/allowlists.json `npmLiteral` by scripts/check-allowlists.mjs.
npm_allow=" skills/xez-onboard-opinionated/kit/skills/xezar-implementation.md skills/xez-onboard-opinionated/kit/skills/xezar-quality-gates.md skills/xez-onboard-opinionated/kit/skills/xezar-release-publish.md "
role_patterns=(
  -e '(^|[^[:alnum:]])npm($|[^[:alnum:]])'
  -e 'package-lock\.json'
  -e '(^|[^[:alnum:]])([0-9]+|[Tt]wo|[Tt]hree|[Ff]our|[Ff]ive|[Ss]ix|[Ss]even|[Ee]ight|[Nn]ine|[Tt]en)( [[:alnum:]]+){0,2} workspaces'
)
# The line that starts a role skill's generated tail. role_part and role_awk both read it from
# LINT_ROLE_MARKER, so the per-file split and the bulk split cannot drift apart.
role_marker='## Shared contract'
role_part() {
  # $1: file; $2: body|tail. Prints "<line>:<text>" for that part only.
  LINT_ROLE_MARKER=$role_marker awk -v part="$2" '$0 == ENVIRON["LINT_ROLE_MARKER"] { tail = 1 } (part == "tail") == (tail == 1) { print NR ":" $0 }' "$1"
}
role_files=""
want role-skills && role_files=$(printf '%s\n' "$skill_files" | grep -E '^skills/[^/]+/kit/skills/xezar-[^/]*\.md$' || true)
# The bulk pass: role_awk runs role_part's program for every (part, file) pair in role_pairs, into
# one stream of the same "<line>:<text>" lines; the loop over role_pairs reports on flagged pairs
# only.
# shellcheck disable=SC2016 # an awk program: its $ fields are awk's, not the shell's
role_awk='
BEGIN { BINMODE = 3; load(); raw = ENVIRON["LINT_TMP"] "/role.raw"; printf "" > raw; marker = ENVIRON["LINT_ROLE_MARKER"] }
$0 != "" {
  t = index($0, "\t"); part = substr($0, 1, t - 1); path = substr($0, t + 1)
  count = 0; bytes = 0; bad = 0; nr = 0; tail = 0
  while ((r = (getline line < path)) > 0) {
    nr++; bytes += length(line) + 1
    if (index(line, "\r")) bad = 1
    if (line == marker) tail = 1
    if ((part == "tail") == (tail == 1)) { print nr ":" line > raw; count++ }
  }
  if (r < 0) bad = 1
  close(path)
  index_line($0, path, count, bytes, bad)
}'
role_pairs=""
for f in $role_files; do
  parts="tail body"
  case "$npm_allow" in *" $f "*) parts="tail" ;; esac
  for part in $parts; do role_pairs="$role_pairs$part$tab$f$nl"; done
done
role_flagged=$role_pairs
if [ -n "$role_pairs" ] && [ -d "${lint_tmp:-}" ]; then
  printf '%s' "$role_pairs" > "$lint_tmp/role.list"
  LINT_ROLE_MARKER=$role_marker LC_ALL=C awk "$bulk_load_awk$role_awk" "$lint_tmp/role.list" > "$lint_tmp/role.index" </dev/null || : > "$lint_tmp/role.index"
  role_flagged=$(bulk_flag role.raw role.index "$role_pairs" -E "${role_patterns[@]}")
fi
while IFS="$tab" read -r part f; do
  [ -n "$f" ] || continue
  in_list "$role_flagged" "$part$tab$f" || continue
  role_hits=$(role_part "$f" "$part" | grep -E "${role_patterns[@]}" || true)
  while IFS= read -r hit; do
    [ -n "$hit" ] || continue
    err "$f:${hit%%:*} names a package manager, a root lockfile or a workspace count in a kit role skill's $part (#59) — read the command from the installed toolchain descriptor, \`dependencies.units\` or \`validation.commands\` instead"
  done <<EOF
$role_hits
EOF
done <<EOF
$role_pairs
EOF

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
old_brand_files=""
[ -z "$target_files" ] || old_brand_files=$(listed "${old_brand_scope[@]}" | grep -vE '(^|/)lint\.sh$')
for pattern in "${old_brand_patterns[@]}"; do
  want old-brand || break
  if [ -z "$target_files" ]; then
    hits=$(grep -rEn --exclude=lint.sh "$pattern" "${old_brand_scope[@]}" 2>/dev/null || true)
  else
    hits=$(grep_listed "$old_brand_files" -En "$pattern" 2>/dev/null || true)
  fi
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
gh_hits=""
want tracker-cli && gh_hits=$(grep_scope -En '(^|[`"[:space:]])gh (api|pr|issue|label|repo|search|auth|run) ' skills/ 2>/dev/null | grep -v 'references/trackers/' | grep -vE '^skills/[^/]+/kit/' || true)
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
kill_hits=""
want process-kill && kill_hits=$(grep_scope -En '(^|[`"'"'"'[:space:]])(pkill|killall)([[:space:]]|$)|kill[[:space:]]+(-[A-Za-z0-9]+[[:space:]]+)*\$\((pgrep|ps |lsof)' skills/ 2>/dev/null | grep -vE '^skills/[^/]+/kit/' || true)
if [ -n "$kill_hits" ]; then
  err "process killed by pattern match (use a saved PID; a pattern also matches the user's editor):"
  printf '%s\n' "$kill_hits" >&2
fi

# Committed-config gate: .xezar/pipeline/config.json is shared by everyone who
# clones the repo, so it must not carry anything true of one machine only.
# Memory limits, worker counts and absolute paths belong in the environment, not
# in a file a teammate inherits and then silently runs with the wrong value.
if want config && [ -f .xezar/pipeline/config.json ]; then
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
secret_hits=""
want secrets && secret_hits=$(grep_scope -En \
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

if want discovery; then node scripts/test-discovery-contracts.mjs || exit 1; fi
if want platform; then node scripts/test-platform.mjs || exit 1; fi

if [ -z "$only_checks$target_files" ]; then
  echo "Lint OK."
else
  run_checks=${only_checks:- all }
  run_scope="all files"
  [ -z "$target_files" ] || run_scope="the listed files"
  echo "Lint OK for a targeted run (checks:${run_checks% }; $run_scope) – only the full run is a gate result."
fi
