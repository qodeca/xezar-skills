#!/usr/bin/env node
// Keeps the agent-browser pin in the xez-setup-agent-pipeline browser descriptor
// at the latest stable release. The descriptor pins a version and per-asset
// SHA-256 sums (verified before the binary is ever executed); this script is
// the single way to move that pin.
//
//   node scripts/bump-agent-browser.mjs               rewrite the descriptor to the latest stable release
//   node scripts/bump-agent-browser.mjs --check       exit 0 when fresh, 20 when a newer stable release exists
//   node scripts/bump-agent-browser.mjs --latest-tag  print the latest stable tag and exit
//
// Stable means the GitHub releases/latest endpoint, which excludes drafts and
// prereleases. Sums come from the release's asset digest fields — the same
// source the descriptor's Pinned release section documents for manual bumps.

import { readFileSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'

const DESCRIPTOR = 'skills/xez-setup-agent-pipeline/references/browsers/agent-browser.md'
const RELEASES_LATEST = 'https://api.github.com/repos/vercel-labs/agent-browser/releases/latest'
const EXPECTED_ASSETS = [
  'agent-browser-darwin-arm64',
  'agent-browser-darwin-x64',
  'agent-browser-linux-arm64',
  'agent-browser-linux-musl-arm64',
  'agent-browser-linux-musl-x64',
  'agent-browser-linux-x64',
  'agent-browser-win32-x64.exe',
]
const STALE_EXIT_CODE = 20

const fail = (message) => {
  console.error(`bump-agent-browser: ${message}`)
  process.exit(1)
}

const response = await fetch(RELEASES_LATEST, {
  headers: {
    accept: 'application/vnd.github+json',
    ...(process.env.GITHUB_TOKEN ? { authorization: `Bearer ${process.env.GITHUB_TOKEN}` } : {}),
  },
})
if (!response.ok) fail(`releases/latest returned HTTP ${response.status}`)
const release = await response.json()

const tag = release.tag_name
if (!/^v\d+\.\d+\.\d+$/.test(tag ?? '')) fail(`unexpected latest tag: ${tag}`)

const digests = new Map()
for (const asset of release.assets ?? []) {
  const digest = /^sha256:([0-9a-f]{64})$/.exec(asset.digest ?? '')?.[1]
  if (digest) digests.set(asset.name, digest)
}
const missing = EXPECTED_ASSETS.filter((name) => !digests.has(name))
if (missing.length > 0) {
  fail(`release ${tag} is missing sha256 digests for: ${missing.join(', ')} — the descriptor's asset table may need a manual update`)
}

if (process.argv.includes('--latest-tag')) {
  console.log(tag)
  process.exit(0)
}

const original = readFileSync(DESCRIPTOR, 'utf8')
const pinned = /AGENT_BROWSER_VERSION=(v\d+\.\d+\.\d+)/.exec(original)?.[1]
if (!pinned) fail(`no AGENT_BROWSER_VERSION pin found in ${DESCRIPTOR}`)

if (process.argv.includes('--check')) {
  if (pinned === tag) {
    console.log(`pin is fresh: ${pinned}`)
    process.exit(0)
  }
  console.log(`pin is stale: descriptor has ${pinned}, latest stable is ${tag}`)
  process.exit(STALE_EXIT_CODE)
}

// Everything is read and validated BEFORE anything is written. Three files move together -- the
// canonical descriptor, the onboarding kit's byte-identical copy, and the kit's digest pin
// (scripts/test-kit-facts.mjs FACT 9) -- and a failure after the first write would leave them
// disagreeing, which is the state the pin exists to make impossible.
const KIT_COPY = 'skills/xez-onboard-opinionated/kit/pipeline/browsers/agent-browser.md'
const KIT_DIGESTS = 'skills/xez-onboard-opinionated/references/descriptor-digests.json'
const KIT_KEY = 'kit/pipeline/browsers/agent-browser.md'

let updated = original
if (pinned !== tag) {
  updated = original.replaceAll(pinned, tag)
  for (const name of EXPECTED_ASSETS) {
    const caseLine = new RegExp(`(${name.replaceAll('.', '\\.')}\\) ASSET_SHA256=)[0-9a-f]{64}`)
    if (!caseLine.test(updated)) fail(`no ASSET_SHA256 case entry for ${name} in ${DESCRIPTOR}`)
    updated = updated.replace(caseLine, (_, lead) => `${lead}${digests.get(name)}`)
  }
  const win32Sum = /(\$expectedSha256 = ')[0-9a-f]{64}(')/
  if (!win32Sum.test(updated)) fail(`no $expectedSha256 assignment found in ${DESCRIPTOR}`)
  updated = updated.replace(win32Sum, (_, lead, trail) => `${lead}${digests.get('agent-browser-win32-x64.exe')}${trail}`)

  for (const digest of digests.values()) {
    if (!updated.includes(digest)) fail(`digest ${digest} did not land in ${DESCRIPTOR}; aborting without writing`)
  }
  if (updated.includes(pinned)) fail(`old version ${pinned} still present after rewrite; aborting without writing`)
}

let lockText
let kitText
try {
  lockText = readFileSync(KIT_DIGESTS, 'utf8')
  kitText = readFileSync(KIT_COPY, 'utf8')
} catch (error) {
  fail(`cannot read the onboarding kit's copy or its digest pin (${error.message}); aborting without writing`)
}
let lock
try {
  lock = JSON.parse(lockText)
} catch {
  fail(`${KIT_DIGESTS} is not valid JSON; aborting without writing`)
}
const pins = lock?.digests
if (pins === null || typeof pins !== 'object' || Array.isArray(pins)) {
  fail(`${KIT_DIGESTS} has no "digests" object; aborting without writing`)
}
if (!/^[0-9a-f]{64}$/.test(pins[KIT_KEY] ?? '')) {
  fail(`${KIT_DIGESTS} pins no SHA-256 for ${KIT_KEY}; aborting without writing`)
}
pins[KIT_KEY] = createHash('sha256').update(updated).digest('hex')
const newLockText = `${JSON.stringify(lock, null, 2)}\n`

// The kit copy and its pin are brought level even when the canonical file is already at the
// latest tag: a bump made by hand, or by a version of this script that stopped at the canonical
// file, leaves exactly that state, and "nothing to do" would leave it there.
const wrote = []
if (updated !== original) { writeFileSync(DESCRIPTOR, updated); wrote.push(DESCRIPTOR) }
if (kitText !== updated) { writeFileSync(KIT_COPY, updated); wrote.push(KIT_COPY) }
if (lockText !== newLockText) { writeFileSync(KIT_DIGESTS, newLockText); wrote.push(KIT_DIGESTS) }

if (wrote.length === 0) console.log(`already at ${tag}; nothing to do`)
else if (pinned === tag) console.log(`already at ${tag}; brought level: ${wrote.join(', ')}`)
else console.log(`bumped agent-browser pin: ${pinned} -> ${tag}`)
