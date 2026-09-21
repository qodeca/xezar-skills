# Security

This collection ships **instructions that another agent executes**, and descriptors
containing literal shell that runs on a contributor's or a consumer's machine. That is the
whole threat surface, and it is an unusual one: there is no server to compromise and no
binary to trojan. A vulnerability here is a sentence that makes an agent do something the
operator did not intend.

## What counts as a vulnerability here

- **An instruction that causes an agent to run something harmful** — a command that
  destroys state, touches files outside the repository, or kills a process by pattern match
  (which in a consumer's repository can kill their editor).
- **A path where untrusted content becomes an instruction.** Issue bodies, pull-request
  descriptions, review comments, CI logs, scanner output and fetched pages are data. So is
  **committed repository content that a privileged session loads for itself** — campaign
  records a session-start hook injects, for one: anyone who can open a pull request can write
  them, so being in the repository does not make text trusted. Any place a skill would follow
  a directive found inside one of these is a vulnerability, not a bug. The same holds for
  configuration that grants authority: a deploy target read from the branch under review is
  chosen by whoever opened the pull request, so the onboarding kit reads `deploy.*` from the
  remote's default branch.
- **A credential leaving its boundary** — a token in model output, in a tracker comment, in
  a log, or passed to a system under test.
- **A gate that can be made to pass without being satisfied.** A label that was never
  created read as a check that passed, a protection API returning 404 read as "no
  requirements", a scanner that scanned nothing read as clean. These are the defects this
  collection was rebuilt around, so a new one is a serious finding. **One bypass is accepted
  and recorded rather than found:** the opinionated onboarding setup configures branch
  protection without admin enforcement so that record files can be pushed directly. That
  exemption is scope-free, the owner accepted it, and `DECISIONS.md` → "Campaign records are
  committed, and the bypass that costs" states what it gives away. A *second* bypass, or this
  one used for anything but records, is still a finding.
- **A descriptor or override that widens what a skill may do** — expanding tool or network
  access, redirecting output, relaxing a safety rule.
- **A supply-chain path into a run** — a tool resolved from a repository-local directory on
  a path where the result gates something, so the code under review supplies the tool that
  judges it.

## What does not count

- A skill producing a poor-quality result, a wrong judgement, or an unhelpful report. That
  is a bug.
- A consumer choosing to grant an agent broad permissions. The collection cannot and does
  not try to constrain the harness it runs under.
- A theoretical concern with no path from an input somebody can actually control. Say what
  the input is and who controls it.

## Reporting

Open a **private** report through the repository host's security advisory feature. Do not
open a public issue, and do not put a working exploit in any channel.

Include, in this order:

1. **The class of problem**, in a sentence. "Untrusted content becomes an instruction",
   "gate passes without being satisfied", "credential crosses a boundary".
2. **The file and the line.** These are documents; point at the sentence.
3. **Who controls the input.** Anyone who can comment on a pull request? A repository
   maintainer? Someone with push access? This decides the severity more than anything else.
4. **What the agent does as a result** — the observable effect, not the theory.
5. **The smallest reproduction you have.** A minimal shape, not a weaponised one. Describe
   the path; do not hand over a step-by-step extraction.

If you are unsure whether something qualifies, report it privately anyway and say you are
unsure. A report that turns out to be a bug costs one reply; a vulnerability reported in
public costs everyone who has the collection installed.

## Response

- **Acknowledged within 5 working days**, saying whether it is accepted as a vulnerability,
  treated as a bug, or needs more information.
- **A decision within 30 days** of acknowledgement: a fix, a documented mitigation, or a
  reasoned decline. A decline says what would change the answer.
- **Fixes go into a skill, not a descriptor, wherever that is possible.** Skills
  auto-update; the files a skill installed into a consumer repository never do. A fix
  written into a descriptor reaches nobody who already installed it, which for a security
  fix is close to not fixing it. When a descriptor change is genuinely unavoidable, it ships
  with an `UPGRADE_NOTES.md` entry written around the **symptom**, so a reader can tell
  whether it applies to them without understanding the flaw.
- **Credit where wanted.** Tell us how you want to be named, or that you do not.

We will not ask a reporter to delay disclosure indefinitely. If a fix is going to take
longer than 30 days, we will say so and why.
