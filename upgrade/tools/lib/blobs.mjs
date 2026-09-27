// Where the tools read old kit file contents (the "base" of a 3-way merge) by git blob sha.
//
// Sources, tried in order:
//   - a git repository with history (the verified xezar-skills clone, fetched with full
//     history: a shallow clone has no old blobs);
//   - a blob pack, `{ "<blob sha>": "<utf-8 text>" }` gzipped, optionally hex-encoded
//     (the committed test fixtures).
// Every blob read is re-hashed: content that does not hash to its sha is refused, so a
// tampered pack or object store cannot feed the merge.

import { readFileSync, existsSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { git, gitBlobSha } from "./hash.mjs";

/**
 * A pack is gzipped JSON; `*.hex` is the same bytes hex-encoded, which is how the committed
 * test pack is stored so that repository-wide text greps never read raw binary.
 */
export function readPack(path) {
  const raw = readFileSync(path);
  const gz = path.endsWith(".hex") ? Buffer.from(raw.toString("utf8").replace(/\s+/g, ""), "hex") : raw;
  return JSON.parse(gunzipSync(gz).toString("utf8"));
}

export function createBlobSource({ repo = null, packs = [] } = {}) {
  const packMaps = packs.filter((p) => existsSync(p)).map(readPack);
  const cache = new Map();
  const repoOk = repo && git(["rev-parse", "--git-dir"], repo, { allowFail: true }) !== null;
  return {
    get(sha) {
      if (!sha) return null;
      if (cache.has(sha)) return cache.get(sha);
      let text = null;
      for (const m of packMaps) {
        if (Object.prototype.hasOwnProperty.call(m, sha)) {
          text = m[sha];
          break;
        }
      }
      if (text === null && repoOk) {
        const out = git(["cat-file", "blob", sha], repo, { allowFail: true });
        if (out !== null) text = out;
      }
      if (text !== null && gitBlobSha(text) !== sha) {
        throw new Error(`blob ${sha}: content does not match its sha (tampered source?)`);
      }
      cache.set(sha, text);
      return text;
    },
  };
}
