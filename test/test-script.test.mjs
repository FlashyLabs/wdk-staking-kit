// The test script names every test file, and globs none of them.
//
// ── The bug this exists for ────────────────────────────────────────────────
//
// `node --test test/*.test.mjs` asks the SHELL to expand the glob. cmd.exe
// does not, and Node only learned to expand one itself in 21 — so on Windows
// with Node 20, which this package's engines range includes, `npm test` exits
// with `Could not find '...\test\*.test.mjs'` before a single test runs.
//
// It was invisible because CI ran on ubuntu-latest only. A wallet kit whose
// suite cannot run on Windows is one a Windows integrator cannot contribute
// to, and they do not file an issue about it.
//
// Naming the files has exactly one failure mode: a test file that nothing
// runs, which from the outside looks precisely like a test file that passes.
// That is what this guards.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)))
const script = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')).scripts.test

const named = (script.match(/test\/[\w.-]+\.test\.mjs/g) ?? []).sort()
const onDisk = readdirSync(join(ROOT, 'test'))
  .filter((f) => f.endsWith('.test.mjs'))
  .map((f) => `test/${f}`)
  .sort()

test('the test script names files rather than globbing them', () => {
  assert.ok(!script.includes('*'), `the test script globs, which cmd.exe will not expand: ${script}`)
  assert.ok(named.length > 0, `no test files named in the script: ${script}`)
})

test('every test file in the tree is in the script', () => {
  // A vacuity guard sits inside this one: an empty `onDisk` would make the
  // comparison pass over two empty lists.
  assert.ok(onDisk.length > 0, 'no test files found on disk')
  assert.deepEqual(named, onDisk, 'the test script and test/ disagree')
})
