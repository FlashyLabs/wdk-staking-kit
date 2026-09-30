// The AAO charter (`flashyos.roles.json`) passes the estate's real checker, not
// only the shape MESH.md describes. MESH.md tells a reader to run
//
//   node vendor-aao-check.mjs validate flashyos.roles.json   # 0 issues
//
// and until this landed, `vendor-aao-check.mjs` was not in the tree at all — a
// dangling instruction that would fail the moment anyone followed it. The file
// is now vendored byte-for-byte from the aao repository's own
// `vendor-aao-check.mjs`; it imports nothing but node: builtins, so it runs
// here with nothing installed. Re-vendor, never edit — the drift test below
// compares the copy against a checkout beside this repository and reports
// UNKNOWN, never a pass, when there is nothing to compare against.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { validateCharterDocument, conform } from '../vendor-aao-check.mjs'

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)))
const VENDORED = 'vendor-aao-check.mjs'
const CHARTER_PATH = 'flashyos.roles.json'

// Two layouts, one question: the aao checkout sits beside this repository
// (/home/user/aao next to /home/user/wdk-staking-kit), or — in a graduated or
// nested layout — one further up.
const AAO_SOURCE = [
  join(ROOT, '..', 'aao', VENDORED),
  join(ROOT, '..', '..', 'aao', VENDORED),
].find((p) => existsSync(p))

const loadCharter = () => JSON.parse(readFileSync(join(ROOT, CHARTER_PATH), 'utf8'))

test('the committed charter validates as an AAO charter document — zero issues', () => {
  const issues = validateCharterDocument(loadCharter())
  assert.deepEqual(issues, [],
    `${CHARTER_PATH} fails aao validate:\n  ${issues.map((i) => `${i.path}: ${i.message}`).join('\n  ')}`)
})

test('every static conformance question passes; the live ones are deferred, never claimed', () => {
  const report = conform(loadCharter())
  assert.ok(report.ok, `aao conform failed: ${JSON.stringify(report.issues)}`)
  for (const r of report.results) {
    assert.ok(r.status === 'pass' || (r.kind === 'live' && r.status === 'deferred'),
      `${r.id} is ${r.status}`)
  }
})

test('every worksIn names a declared repository, and every repository has an owning role', () => {
  const c = loadCharter()
  const repos = new Set(c.repositories.map((r) => r.name))
  for (const role of c.roles) {
    for (const w of role.worksIn ?? []) {
      assert.ok(repos.has(w), `role "${role.name}" works in "${w}", which is not a declared repository`)
    }
  }
  const covered = new Set(c.roles.flatMap((r) => r.worksIn ?? []))
  for (const r of repos) assert.ok(covered.has(r), `no role works in "${r}"`)
  // And the declared repository is the real one this charter lives in.
  assert.ok(c.repositories.some((r) => r.url === 'github.com/FlashyLabs/wdk-staking-kit'),
    'the charter does not name the repository it lives in')
})

test('MESH.md declares as many roles as the charter actually has', () => {
  // MESH.md's prose says "five roles are five agents" and prints a table row
  // per role; the charter is the source. Pin the count so the prose cannot
  // quietly disagree with the governance record it derives from.
  const mesh = readFileSync(join(ROOT, 'MESH.md'), 'utf8')
  const roleCount = loadCharter().roles.length
  const words = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine']
  assert.ok(mesh.includes(`**${words[roleCount]} roles**`) || mesh.includes(`${roleCount} roles`),
    `MESH.md does not state that the charter has ${roleCount} roles`)
})

test('the vendored checker imports nothing but node: builtins', () => {
  const src = readFileSync(join(ROOT, VENDORED), 'utf8')
  for (const [, spec] of src.matchAll(/from\s+['"]([^'"]+)['"]/g)) {
    assert.ok(spec.startsWith('node:'), `${VENDORED} imports "${spec}"`)
  }
})

test('the vendored checker matches the aao source byte for byte, when it is beside us', (t) => {
  if (!AAO_SOURCE) {
    t.diagnostic(`the aao repository is not checked out beside this one — ${VENDORED} drift status UNKNOWN, not current`)
    return
  }
  assert.ok(readFileSync(join(ROOT, VENDORED)).equals(readFileSync(AAO_SOURCE)),
    `${VENDORED} has drifted from the aao repository's ${VENDORED} — re-vendor, never edit`)
})
