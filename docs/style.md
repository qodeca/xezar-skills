# Style guide

Written from **counted usage**, not from taste. Every entry below reports what this
collection actually says today, and picks the majority form. Where the count is close, that
is stated rather than hidden.

Counts were measured on 2026-09-20 with one command per term, so anyone can re-derive them
rather than trust the table:

```bash
grep -rohiE "\b<term>s?\b" --include='*.md' skills/ | wc -l
```

They move with every edit. A stale count is a note about emphasis, never a fact to quote.

Consistency is worth having here for one reason: several of these words are parsed. A
reader who sees `PR` in one skill and "pull request" in the next has to decide whether they
mean the same thing, and an agent following the text literally may decide they do not.

## Counted choices

| Use | Not | Count | Note |
|---|---|---|---|
| `PR` | "pull request" | 4504 vs 90 | Not close. `PR` is the term; "pull request" is for prose aimed at a first-time reader, like a README paragraph. |
| `repo` | "repository" | 859 vs 395 | Roughly two to one. Prefer `repo` in skills, "repository" in prose documents where it reads better. Do not mix inside one paragraph. |
| `config` | "configuration" | 611 vs 67 | Clear. The file is `config.json`, so the short form matches the thing. |
| `tracker` | "issue tracker", "GitHub" | 1219 | Never name a host in `skills/**`. The tracker is whatever the descriptor says. |
| `descriptor` | "provider file", "adapter" | 528 | One word for the committed file that says how to execute operations. |
| `operation` | "command", "action", "API call" | 550 | Skills *name operations*; descriptors say how to execute them. Using "command" blurs the line the whole design rests on. |
| `gate` | "check step", "validation" | 952 | A gate produces one of five statuses. A "check" is one thing a gate looks at. |
| `claim` | "lock", "reservation" | 1373 | The three-signal ownership protocol. "Lock" suggests something enforced by a machine; this is not. |
| `finding` | "issue", "problem" | 613 | A review produces findings. "Issue" is a tracker item, and using it for both is the one ambiguity that costs real time. |
| `evidence` | "proof" | 889 | Evidence is something a reader can go and look at. |
| `worktree` | "working copy", "checkout" | 318 | One word, no space. |
| `base branch` | "main", "master", "develop" | 90 | Never a literal branch name in `skills/**`; the lint gate enforces this. |

## Words with one meaning, held to it

These are not style preferences. Each is parsed, or decides a behaviour.

- **`unknown`** — the check did not happen. Never a synonym for "probably fine" or "failed".
- **`not-applicable`** — there was nothing to check. Distinct from `unknown`, always.
- **`evidence-unavailable`** — the source could not be reached. Does not pass.
- **`pass` / `findings`** — the check ran, and was or was not satisfied.
- **`passed` / `refused` / `unavailable`** — the three merge-policy words. They map onto the
  five statuses; they are not a second vocabulary for the same thing.
- **`Head:` / `Base:` / `PR:` / `Issue:` / `Spec:` / `Gate:`** — line-anchored markers. The
  text never changes, whatever the surrounding prose does.

## The emoji glossary

One line, identical in every skill's `references/rules.md`, and changing it changes every
copy in the same PR:

> 🎯 goal · 📋 plan · 📝 spec · 🏷️ labels · 📸 evidence · 🔍 review · 🧪 tests · 💥 breaking · ✅ pass · ❌ fail · ⚠️ needs-human · ⛔ blocked · 🔁 resume · 🚀 merge/release

Plus the comment marker `` 🤖 `<skill-name>` — <purpose> ``. Emoji **decorate**; parsers key
on the text markers only, never on an emoji. Use one only for its glossary meaning, and do
not invent per-skill emojis.

## Prose

- **Sentence case** for headings, not Title Case.
- **Second person, imperative** inside a skill: "Run the gate", not "The gate should be run".
- **Lead with what changes for whom**, then why, then the next action. Process narration
  goes last or not at all.
- **Name the scope of an absence claim**: "not found in the files read", never "does not
  exist".
- **State a cost in the same sentence as a benefit.** "Simpler, at the price of two extra
  files" is reviewable; "simpler" is not.

## Adding to this guide

Count first. An entry with no count is an opinion, and opinions about wording expand
without limit. If the two forms are within about 20% of each other, say so and pick one
rather than pretending the data decided.
