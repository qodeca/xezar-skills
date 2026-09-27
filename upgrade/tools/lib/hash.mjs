// Hashing and small git helpers shared by the upgrade tools and their build scripts.
//
// `gitBlobSha` is computed here rather than asked of git so the tools can index a kit
// tree that is not a git checkout (a release tarball, a test fixture) and still produce
// the same `kitBlob` that `scripts/build-kit-index.mjs` reads out of history.

import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";

export function sha256(data) {
  return createHash("sha256").update(data).digest("hex");
}

export function gitBlobSha(data) {
  const buf = Buffer.isBuffer(data) ? data : Buffer.from(data, "utf8");
  return createHash("sha1").update(`blob ${buf.length}\0`).update(buf).digest("hex");
}

/** Run git with an argument vector (never a shell string). Returns stdout as a string. */
export function git(args, cwd, { input, allowFail = false } = {}) {
  try {
    return execFileSync("git", args, {
      cwd,
      input,
      encoding: "utf8",
      maxBuffer: 256 * 1024 * 1024,
      stdio: ["pipe", "pipe", "pipe"],
    });
  } catch (error) {
    if (allowFail) return null;
    const detail = (error.stderr ?? "").toString().trim();
    throw new Error(`git ${args.join(" ")} failed${detail ? `: ${detail}` : ""}`);
  }
}

/** Stable JSON: object keys sorted, two-space indent, trailing newline. */
export function stableJson(value) {
  const sort = (v) => {
    if (Array.isArray(v)) return v.map(sort);
    if (v && typeof v === "object") {
      return Object.fromEntries(Object.keys(v).sort().map((k) => [k, sort(v[k])]));
    }
    return v;
  };
  return `${JSON.stringify(sort(value), null, 2)}\n`;
}
