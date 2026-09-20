# The owner's three control skills

Called from step 8, after the smoke test and before the report. Read-only unless something is
missing, and never a hard stop: the setup this skill wrote is complete and correct without these
three. They are how the owner *drives* it afterwards.

## Why this check exists at all

The generated leader guide names all three by name, and one of them — `xez-add-rule` — refuses to
run at all without the onboarding manifest this skill just wrote. So the guide promises the owner
three controls, and nothing so far has confirmed the owner can actually run any of them.

The failure is quiet and it lands late: the owner reads the guide, tries to leave for the night,
and finds the skill is not installed. Checking here costs one directory listing.

| The owner wants to… | They run | If it is missing |
|---|---|---|
| leave, and let the leader keep working | `xez-unattended-on` | the leader keeps the **full** owner-only list and stops on every one of the six |
| come back and clear what was parked | `xez-unattended-off` | parked entries pile up in `parked.md` and nothing asks them back |
| add a standing rule to the leader guide | `xez-add-rule` | rules are hand-edited into the guide, losing the dated `(owner <date>)` attribution |

Notice that every "missing" consequence is **safe**. Nothing becomes more permissive because a
control skill is absent — the leader simply stays on its strictest behaviour. That is why this is
a report line and not a stop.

## The check

`SKILLS_ROOT` is the directory containing this skill's own installed directory — its parent.
Resolve it from this skill's location; do not assume an agent tool's default path.

```sh
# SKILLS_ROOT: parent directory of this skill's installed directory.
missing=""
for s in xez-unattended-on xez-unattended-off xez-add-rule; do
  [ -d "$SKILLS_ROOT/$s" ] || missing="$missing $s"
done
```

All three present → one line in the report naming them as the owner's controls. Anything missing →
name exactly what is missing, what the owner loses until it is installed, and **one** paste-and-run
command that installs all of them at once.

## The install command

`<collection-source>` is the `<owner>/<repo>` the skills were originally installed from. **Never
guess it.** Resolve it in this order:

1. This skill's installed directory is a symlink into a development checkout → follow it and read
   that checkout's `package.json` (`repository.url`), or its origin remote.
2. Install metadata the skills CLI keeps near `SKILLS_ROOT`, when present.
3. Ask the owner once, and reuse the answer.

Substitute the resolved source before showing the command: the goal is paste-and-run, not a
template. One command for all three, never one per skill — three commands invite installing one
and forgetting the rest, which is the worst of the three outcomes because the guide still promises
all three.

Do not re-run the setup after the install. Nothing this skill wrote depends on these three being
present; they read the manifest, they do not change it.
