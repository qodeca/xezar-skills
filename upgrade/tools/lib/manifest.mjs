// Reading the onboarding manifest, v1 or v2 (upgrade/CONTRACT.md §1), for the base hints, and
// writing v2.

import { isRepoRelative } from "./paths.mjs";

const HEX64 = /^[0-9a-f]{64}$/;
const HEX40 = /^[0-9a-f]{40}$/;

/**
 * Returns { manifestVersion, version, hints: Map(path -> { sha256?, kitBlob?, origin?,
 * renderInputs?, patch? }), refused: [path], raw }.
 * v1 per-file data is optional and untrusted: it is only ever a hint for base finding.
 */
export function readManifest(text) {
  const raw = JSON.parse(text);
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("onboarding.json is not a JSON object");
  const manifestVersion = raw.manifestVersion ?? 1;
  const hints = new Map();
  const refused = [];
  const add = (path, value) => {
    if (!isRepoRelative(path)) {
      refused.push(path);
      return;
    }
    const h = {};
    if (typeof value === "string" && HEX64.test(value)) h.sha256 = value;
    else if (value && typeof value === "object") {
      const sha = value.sha256 ?? value.digest ?? value.sha;
      if (typeof sha === "string" && HEX64.test(sha)) h.sha256 = sha;
      if (typeof value.kitBlob === "string" && HEX40.test(value.kitBlob)) h.kitBlob = value.kitBlob;
      if (typeof value.origin === "string") h.origin = value.origin;
      if (value.renderInputs && typeof value.renderInputs === "object") {
        h.renderInputs = Object.fromEntries(Object.entries(value.renderInputs).filter(([, v]) => typeof v === "string"));
      }
      if (typeof value.patch === "string") h.patch = value.patch;
    }
    hints.set(path, { ...(hints.get(path) ?? {}), ...h });
  };
  const files = raw.files;
  if (Array.isArray(files)) {
    for (const f of files) if (f && typeof f.path === "string") add(f.path, f);
  } else if (files && typeof files === "object") {
    for (const [p, v] of Object.entries(files)) add(p, v);
  }
  if (raw.descriptors && typeof raw.descriptors === "object") {
    for (const [p, v] of Object.entries(raw.descriptors)) {
      if (!hints.has(p) || !hints.get(p).sha256) add(p, v);
    }
  }
  return {
    manifestVersion,
    version: typeof raw.version === "string" ? raw.version : null,
    hints,
    refused,
    raw,
  };
}
