// mcp-approval-queue.ts – a pi add-on: asks MCP tool approvals one at a time, with "Deny" first, and lets a
// xezar step use the project's own browser tools without asking.
// Imported from: homelab-krasienin 805898f, macs/scripts/web-tools-clients/pi/mcp-approval-queue.ts (the owner's
// add-on). Every rule of that copy is kept; the one rule added is "Browser tools a xezar project allows" below.
// Install: replace <pi agent dir>/extensions/mcp-approval-queue.ts with this file (the agent dir is
// $PI_CODING_AGENT_DIR, else ~/.pi/agent). A copy in the project's .pi/extensions/ is not enough: pi loads the
// user's add-ons before a project's, and the first add-on to claim an approval request answers it.
//
// Why: pi-mcp-adapter 2.33.0 asks for approval inside each tool run, and pi 0.85.1 runs sibling tool calls at the
// same time. pi's select dialog holds one prompt, so a second prompt orphans the first and the turn hangs forever on
// "Working". This add-on claims every approval request (the adapter's broker event) and asks them in order.
//
// Rules:
// - It claims every request from every MCP server. With no UI (pi -p) it answers "deny", so headless pi fails closed
//   even when a project's mcp.json turns approveTools off – except for the browser tools below.
// - The options are always ["Deny", "Allow once"], so Enter on the first option denies. There is no "Allow for session".
// - The prompt shows the host of args.url, a warning when it had to show invisible or control characters, and the
//   arguments: whole up to 4000 characters, else the first 3000 and the last 500.
// - A request that was cancelled, or that belongs to a session that has ended, is denied without a dialog.
// - Browser tools a xezar project allows: a call to the chrome-devtools server whose tool is in the project's
//   `.codex/config.toml` [mcp_servers.chrome-devtools] enabled_tools list is allowed once, without asking, UI or not.
//   The project is the nearest folder at or above the session's cwd that holds `.xezar/routing.json`. The list is
//   read once, when the session starts, so a step that edits the file mid-run does not widen it. That list is the
//   one the Codex lane already runs with: a change to it needs a security review (the kit's config guard), and it
//   holds no evaluate_script and no upload. No project, no file, no such table or an unreadable list: no tool is
//   allowed this way, and the rules above decide.
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

const APPROVAL_EVENT = "pi-mcp-adapter:tool-approval-request";
const OPTIONS = ["Deny", "Allow once"];
const MAX_WHOLE = 4000;
const HEAD = 3000;
const TAIL = 500;
const BROWSER_SERVER = "chrome-devtools";
// Characters a terminal does not show as themselves. Each one is shown as \u{XXXX} instead.
const INVISIBLE = /[\p{Cc}\p{Cf}\p{Cs}\p{Zl}\p{Zp}\p{Default_Ignorable_Code_Point}]/gu;

type Decision = "allow_once" | "deny";
type ApprovalRequest = {
  serverName: string;
  originalToolName: string;
  args?: Record<string, unknown>;
  signal?: AbortSignal;
  claim(handler: () => Decision | Promise<Decision>): boolean;
};
type Ui = {
  select(title: string, options: string[], opts?: { signal?: AbortSignal }): Promise<string | undefined>;
  notify(message: string, type?: "info" | "warning" | "error"): void;
};
type Counter = { shown: number; osc: boolean };

// Copied from pi-mcp-adapter 2.33.0 utils.ts: removes OSC control strings (ESC ] and the single byte 0x9D),
// including payloads that have no terminator.
function stripOscSequences(text: string): string {
  let result = "";
  let index = 0;
  while (index < text.length) {
    const isEscOsc = text.charCodeAt(index) === 0x1b && text[index + 1] === "]";
    const isC1Osc = text.charCodeAt(index) === 0x9d;
    if (!isEscOsc && !isC1Osc) {
      result += text[index++];
      continue;
    }

    index += isEscOsc ? 2 : 1;
    while (index < text.length) {
      const code = text.charCodeAt(index++);
      if (code === 0x07 || code === 0x9c) break;
      if (code === 0x1b && text[index] === "\\") {
        index++;
        break;
      }
    }
  }
  return result;
}

// Clean text for the terminal: no OSC strings, and every invisible or control character made visible.
function render(text: string, counter: Counter, keepNewlines: boolean): string {
  const noOsc = stripOscSequences(text);
  if (noOsc.length !== text.length) counter.osc = true;
  return noOsc.replace(INVISIBLE, (ch) => {
    if (keepNewlines && ch === "\n") return ch;
    counter.shown++;
    return `\\u{${(ch.codePointAt(0) ?? 0).toString(16).toUpperCase().padStart(4, "0")}}`;
  });
}

// Cut by code points, never inside a surrogate pair.
function cut(text: string): { body: string; hidden: number } {
  const points = Array.from(text);
  if (points.length <= MAX_WHOLE) return { body: text, hidden: 0 };
  const hidden = points.length - HEAD - TAIL;
  const head = points.slice(0, HEAD).join("");
  const tail = points.slice(-TAIL).join("");
  return { body: `${head}\n… [${hidden} characters hidden] …\n${tail}`, hidden };
}

function hostLine(args: Record<string, unknown>): string | undefined {
  if (!Object.prototype.hasOwnProperty.call(args, "url")) return undefined;
  const raw = args.url;
  let url: URL;
  try {
    if (typeof raw !== "string") throw new TypeError("url is not a string");
    url = new URL(raw);
  } catch {
    return "Host: (not a valid URL – read the arguments)";
  }
  let line = `Host: ${url.hostname || "(none)"}`;
  if (url.protocol !== "http:" && url.protocol !== "https:") line += `   Scheme: ${url.protocol.replace(/:$/, "")}`;
  if (url.username !== "" || url.password !== "") line += "   Warning: the URL has a user@ part";
  return line;
}

function buildPrompt(request: ApprovalRequest): string {
  const args = request.args ?? {};
  const counter: Counter = { shown: 0, osc: false };
  const json = render(JSON.stringify(args, null, 2) ?? "{}", counter, true);
  const { body, hidden } = cut(json);
  const long = hidden > 0 ? ` (long – ${hidden} hidden)` : "";
  const server = render(String(request.serverName), counter, false);
  const tool = render(String(request.originalToolName), counter, false);
  const lines = [`MCP: ${server} wants to run ${tool}${long}`, ""];
  const host = hostLine(args);
  if (host !== undefined) lines.push(render(host, counter, false));
  if (counter.shown > 0 || counter.osc) {
    const osc = counter.osc ? " Terminal escape sequences were removed." : "";
    lines.push(`Warning: ${counter.shown} invisible or control characters are shown as \\u{…}.${osc}`);
  }
  lines.push("", "Arguments:", body);
  return lines.join("\n");
}

/** The tool names in a `.codex/config.toml` text's [mcp_servers.chrome-devtools] enabled_tools, or undefined. */
export function browserAllowlist(toml: string): string[] | undefined {
  const lines = toml.split(/\r?\n/);
  const header = /^\s*\[\s*mcp_servers\s*\.\s*(?:chrome-devtools|"chrome-devtools"|'chrome-devtools')\s*\]\s*(?:#.*)?$/;
  const start = lines.findIndex((line) => header.test(line));
  if (start < 0) return undefined;
  let text = "";
  let open = false;
  for (const line of lines.slice(start + 1)) {
    if (!open && /^\s*\[/.test(line)) break;
    const body = withoutComment(line);
    if (!open) {
      const m = /^\s*enabled_tools\s*=\s*\[(.*)$/.exec(body);
      if (!m) continue;
      open = true;
      text = m[1];
    } else {
      text += ` ${body}`;
    }
    if (text.includes("]")) {
      const inside = text.slice(0, text.indexOf("]"));
      const names: string[] = [];
      for (const item of inside.split(",")) {
        const s = item.trim();
        if (s === "") continue;
        const q = /^"([A-Za-z0-9_]+)"$|^'([A-Za-z0-9_]+)'$/.exec(s);
        if (!q) return undefined;
        names.push(q[1] ?? q[2]);
      }
      return names;
    }
  }
  return undefined;
}

// A line with its `#` comment removed; a `#` inside a quoted string stays.
function withoutComment(line: string): string {
  let quote = "";
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quote) {
      if (ch === quote) quote = "";
    } else if (ch === '"' || ch === "'") {
      quote = ch;
    } else if (ch === "#") {
      return line.slice(0, i);
    }
  }
  return line;
}

/** The browser allowlist of the xezar project at or above `cwd`, or undefined when there is none. */
export function projectAllowlist(cwd: string): string[] | undefined {
  let dir = resolve(cwd);
  for (;;) {
    if (existsSync(join(dir, ".xezar", "routing.json"))) {
      try {
        return browserAllowlist(readFileSync(join(dir, ".codex", "config.toml"), "utf8"));
      } catch {
        return undefined;
      }
    }
    const up = dirname(dir);
    if (up === dir) return undefined;
    dir = up;
  }
}

/** "allow_once" when the request is a browser tool the project allows; undefined when the other rules decide. */
export function allowedWithoutAsking(
  request: Pick<ApprovalRequest, "serverName" | "originalToolName" | "signal">,
  allowlist: readonly string[] | undefined,
): Decision | undefined {
  if (request.signal?.aborted === true) return undefined;
  if (request.serverName !== BROWSER_SERVER || !allowlist) return undefined;
  return allowlist.includes(request.originalToolName) ? "allow_once" : undefined;
}

export default function (pi: ExtensionAPI) {
  let ui: Ui | undefined;
  let allowlist: string[] | undefined;
  let generation = 0;
  let warned = false;
  let queue: Promise<unknown> = Promise.resolve();

  pi.on("session_start", (_event, ctx) => {
    generation++;
    ui = ctx.hasUI ? (ctx.ui as unknown as Ui) : undefined;
    allowlist = projectAllowlist(ctx.cwd);
    warned = false;
    queue = Promise.resolve();
  });
  pi.on("session_shutdown", () => {
    generation++;
    ui = undefined;
    allowlist = undefined;
    queue = Promise.resolve();
  });

  pi.events.on(APPROVAL_EVENT, (raw: unknown) => {
    const request = raw as ApprovalRequest;
    const ask = ui;
    const allowed = allowlist;
    const mine = generation;
    const stale = () => mine !== generation || request.signal?.aborted === true;
    const claimed = request.claim(() => {
      if (stale()) return "deny";
      const auto = allowedWithoutAsking(request, allowed);
      if (auto) return auto;
      if (!ask) return "deny";
      const turn = queue.then(async (): Promise<Decision> => {
        if (stale()) return "deny";
        const prompt = buildPrompt(request);
        if (stale()) return "deny";
        const choice = await ask.select(prompt, [...OPTIONS], { signal: request.signal });
        return choice === "Allow once" ? "allow_once" : "deny";
      });
      queue = turn.catch(() => undefined);
      return turn;
    });
    if (!claimed && !warned && ask) {
      warned = true;
      ask.notify(
        "mcp-approval-queue: another extension already answers MCP approvals, so this add-on does not ask. " +
          "Two approval prompts at once can hang pi.",
        "warning",
      );
    }
  });
}
