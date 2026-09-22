// The README publishes a sha256 commitment over a sentence that's also
// printed, in plain text, in its own "Design principles" section. This test
// is what makes that commitment trustworthy rather than decorative: it
// proves the published hash actually matches the sentence a reader would
// find, so a future edit to either one can't quietly break the puzzle
// without the test suite catching it first.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)))
const readme = readFileSync(join(ROOT, 'README.md'), 'utf8')

const PREIMAGE = 'A lock cannot be clever about what it will pay, because the tier it pays from is fixed the moment it opens, not the moment it closes.'
const PUBLISHED_HASH = 'c8eaccf0b6f14e1883faa022e662e2e97f375f3fb84c62194275d686a84a8082'

test('the Strike preimage is really in the README, in plain text', () => {
  assert.ok(readme.includes(PREIMAGE), 'the preimage sentence has moved or changed — the puzzle is now unsolvable as published')
})

test('the Strike preimage really hashes to the published commitment', () => {
  const digest = createHash('sha256').update(PREIMAGE, 'utf8').digest('hex')
  assert.equal(digest, PUBLISHED_HASH, 'the README’s published sha256 does not match its own preimage')
})

test('the published commitment is really printed in the README', () => {
  assert.ok(readme.includes(PUBLISHED_HASH), 'the commitment in this test has drifted from what the README actually publishes')
})
