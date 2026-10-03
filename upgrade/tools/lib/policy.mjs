// Which installed paths get which treatment (plan §6.4, D11). Paths only; no content rules
// except the two line tests at the bottom, which the planner and the verifier share.

/** Owner-shaped: the tool gives facts only; Claude does a semantic merge. */
export const OWNER_SHAPED = new Set([
  ".xezar/pipeline/config.json",
  ".xezar/config.json",
  ".xezar/pipeline/labels.json",
  ".xezar/routing.json",
  ".xezar/docs/leader-guide.md",
  "SDLC.md",
  "CODE_REVIEW.md",
  "AGENTS.md",
  "CLAUDE.md",
  ".mcp.json",
  ".claude/settings.json",
  ".codex/config.toml",
]);

/**
 * The owner's configuration: written for the project at install, then changed in normal work
 * (a routing pull request, a new gate command, a label, a design module's status, a config key
 * the upgrade checklist asks for). Never recorded in manifest v2 (part of NOT_RECORDED below).
 * They stay guarded by the security scan's trust boundary and by `route.mjs --check`.
 */
export const OWNER_CONFIG = [
  ".xezar/pipeline/config.json",
  ".xezar/config.json",
  ".xezar/pipeline/labels.json",
  ".xezar/routing.json",
];

/**
 * Never recorded in manifest v2's `files`, even when the kit index lists them: the project's
 * own documents and configuration, which its roles edit in normal work, and owner files the
 * setup merged into without a kit block (`.xezar/docs/local-patches.md`, "What the manifest
 * tracks"). Recording them would turn every ordinary edit into drift. An owner file with an
 * appended kit block is recorded separately, as `owner-file-appended`, hashing only that block.
 */
export const NOT_RECORDED = Object.freeze([
  ...OWNER_CONFIG,
  "AGENTS.md",
  "SDLC.md",
  "CODE_REVIEW.md",
  "BACKWARD_COMPATIBILITY.md",
  "SECURITY.md",
  ".mcp.json",
  ".codex/config.toml",
  ".gitignore",
]);

// The kit's manifest-drift.mjs keeps its own copy of NOT_RECORDED (it runs in projects, with no
// access to this file) and ignores these paths when an older v2 manifest lists them;
// scripts/test-upgrade.mjs binds the two lists.
export function isNotRecorded(path) {
  return NOT_RECORDED.includes(path) || path === "CLAUDE.md" || path.endsWith("/CLAUDE.md");
}

/** Never touched by an upgrade, whatever the index says. */
export function isNeverTouched(path) {
  return (
    path.startsWith(".xezar/pipeline/overrides/") ||
    path.startsWith(".xezar/campaigns/") ||
    path.startsWith(".local/") ||
    path === ".xezar/LOCAL-PATCHES.md" ||
    path === ".xezar/onboarding.json" ||
    path.startsWith(".xezar/upgrade-reports/")
  );
}

/**
 * Safety files (D11): trust-boundary paths as the kit's security scan names them, plus the
 * leader launcher and its permission file. An unexplained change here stops and asks.
 */
export function isSafetyFile(path) {
  return (
    path === ".xezar/pipeline/config.json" ||
    path === ".xezar/config.json" ||
    path.startsWith(".github/workflows/") ||
    path.startsWith(".xezar/workflows/") ||
    path.startsWith(".xezar/checks/") ||
    path === ".xezar/routing.json" ||
    path === ".xezar/routing.schema.json" ||
    path === ".xezar/loops.json" ||
    path.startsWith(".xezar/docs/") ||
    path.startsWith(".xezar/skills/") ||
    path.startsWith(".xezar/pipeline/") ||
    path === ".claude/settings.json" ||
    path === ".claude/settings.local.json" ||
    path.startsWith(".codex/") ||
    path === ".mcp.json" ||
    path === ".env.example" ||
    path.startsWith("scripts/xezar-leader")
  );
}

/** Files whose change can grant a permission, a hook, an MCP server or a tool. */
export function isPermissionFile(path) {
  return (
    path === ".claude/settings.json" ||
    path === ".claude/settings.local.json" ||
    path === ".mcp.json" ||
    path === ".codex/config.toml" ||
    path === "scripts/xezar-leader-settings.json" ||
    path.startsWith(".xezar/workflows/")
  );
}

/** Where a removed line can weaken a check: scripts, workflows, launchers, settings. */
export function isCheckLike(path) {
  return (
    path.startsWith(".xezar/checks/") ||
    path.startsWith(".xezar/workflows/") ||
    path.startsWith(".github/workflows/") ||
    path.startsWith("scripts/xezar-leader") ||
    path.startsWith(".claude/settings")
  );
}

/**
 * A line that refuses, fails or stops something. Removing one is a candidate weakening.
 * `exit "$rc"`, `exit $?` and `exit ${status}` pass a failure on, so they count too.
 */
export const SAFETY_LINE =
  /(\bexit\s+[1-9]|\bexit\s+"?\$(\?|\{?[A-Za-z_])|\breturn\s+[1-9]|process\.exit\(\s*[1-9]|\bthrow\b|\brefus|\bfail|\bdie\b|\bdeny\b|\breject|\babort|set\s+-[a-z]*e)/i;

/**
 * A line that swallows a failure: `|| true`, `|| :`, `exit 0`, `set +e`, a step allowed to
 * fail, a skipped hook. Adding one is a candidate weakening.
 */
export const WEAKENING_LINE =
  /(\|\|\s*(true|:)\s*(#|;|$)|\bexit\s+0\b|\bset\s+\+[a-z]*e|continue-on-error:\s*true|--no-verify|process\.exit\(\s*0\s*\))/i;

const PERMISSION_KEY = /allow|permission|hooks?$|mcpServers|mcp_servers|trust|approval|sandbox|prefix_rule|bashAllowlist|tools?$/i;
const PERMISSION_LINE = /mcp__|bashAllowlist|allowed_?tools|--dangerously|permission|trust_level|prefix_rule|approval_policy|sandbox_mode|^\s*\[mcp_servers/i;

/** Every leaf under a permission-shaped key, as `path=value`, one per array item. */
function collectGrants(value, path, out, inGrant = false) {
  if (Array.isArray(value)) {
    for (const v of value) collectGrants(v, `${path}[]`, out, inGrant);
  } else if (value && typeof value === "object") {
    for (const [k, v] of Object.entries(value)) collectGrants(v, `${path}.${k}`, out, inGrant || PERMISSION_KEY.test(k));
  } else if (inGrant) {
    out.add(`${path}=${JSON.stringify(value)}`);
  }
  return out;
}

/**
 * What would writing `theirs` over `mine` grant that `mine` does not? Returns a list of
 * grant descriptions; empty means no permission change. Structural for JSON, by line for
 * everything else.
 */
export function permissionGrants(path, mineText, theirsText) {
  if (!isPermissionFile(path) || theirsText == null) return [];
  if (path.endsWith(".json")) {
    try {
      const mine = mineText == null ? new Set() : collectGrants(JSON.parse(mineText), "", new Set());
      const theirs = collectGrants(JSON.parse(theirsText), "", new Set());
      return [...theirs].filter((g) => !mine.has(g)).sort();
    } catch {
      // Unparseable on either side: fall through to the line test.
    }
  }
  const mineLines = new Set((mineText ?? "").split("\n").map((l) => l.trim()));
  return theirsText
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => PERMISSION_LINE.test(l) && !mineLines.has(l));
}

/** Lines of `base` that refuse or fail and are gone from `mine`. */
export function removedSafetyLines(baseText, mineText) {
  if (baseText == null || mineText == null) return [];
  const mine = new Set(mineText.split("\n").map((l) => l.trim()));
  return baseText
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && SAFETY_LINE.test(l) && !mine.has(l));
}

/** Lines of `mine` that swallow a failure and are not in `base`. */
export function addedWeakeningLines(baseText, mineText) {
  if (baseText == null || mineText == null) return [];
  const base = new Set(baseText.split("\n").map((l) => l.trim()));
  return mineText
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("#") && WEAKENING_LINE.test(l) && !base.has(l));
}
