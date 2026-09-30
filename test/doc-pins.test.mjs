// The documented figures are pinned against reality, so they cannot drift
// again the way they had by 0.1.3: the README and the CHANGELOG both said
// "52 tests" while the suite had grown to 59, and the CHANGELOG stopped at
// 0.1.0 while package.json read 0.1.3. A number in prose that nothing checks
// is an opinion with a progress bar; these tests make each documented figure a
// failing test the moment it disagrees with the thing it claims to describe.
//
//   1. The test count the README prints equals the suite's ACTUAL size, counted
//      by running the whole suite as a subprocess and reading node's own
//      `# tests N` summary — not by grepping for `test(`, which a comment or a
//      helper could inflate.
//   2. The CHANGELOG's newest version heading equals package.json's version.
//   3. The README's Status line names that same version.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = dirname(HERE)

const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'))
const readme = readFileSync(join(ROOT, 'README.md'), 'utf8')
const changelog = readFileSync(join(ROOT, 'CHANGELOG.md'), 'utf8')

// Set in the spawned run so the counting test below does not spawn a further
// suite forever. The test is still DEFINED in the child (so the child's total
// matches the parent's total exactly); only the re-spawn is skipped there.
const IS_CHILD = process.env.WDK_DOC_PIN_CHILD === '1'

test('the test count the README prints equals the suite\'s real size at runtime', () => {
  const m = readme.match(/npm test\s+#\s*(\d+)\s+tests/)
  assert.ok(m, 'README has no `npm test  # <N> tests` line to pin')
  const documented = Number(m[1])

  if (IS_CHILD) {
    // Inside the counting subprocess: do not re-spawn. This test still counts
    // as one, in both the parent run and this child run, so both totals agree.
    return
  }

  const files = readdirSync(HERE)
    .filter((f) => f.endsWith('.test.mjs'))
    .map((f) => join(HERE, f))
  assert.ok(files.length > 0, 'no test files found to count')

  // node sets NODE_TEST_CONTEXT for a test child and, seeing it, the spawned
  // `node --test` switches to the v8-serializer IPC reporter and writes nothing
  // to stdout — so strip it and force the tap reporter, whose `# tests N`
  // summary is what we count from.
  const env = { ...process.env, WDK_DOC_PIN_CHILD: '1' }
  delete env.NODE_TEST_CONTEXT
  const run = spawnSync(process.execPath, ['--test', '--test-reporter=tap', ...files], {
    cwd: ROOT,
    encoding: 'utf8',
    env,
  })

  // A suite that did not run cleanly cannot be the source of a trustworthy
  // count — fail loudly rather than pin against a partial or crashed run.
  assert.equal(run.status, 0,
    `the suite did not pass when re-run to count it (exit ${run.status}):\n${run.stdout}\n${run.stderr}`)

  const countMatch = run.stdout.match(/^# tests (\d+)$/m)
  assert.ok(countMatch, `could not read a "# tests N" total from the suite run:\n${run.stdout}`)
  const actual = Number(countMatch[1])

  assert.ok(actual > 0, 'the suite reported zero tests, which cannot be right')
  assert.equal(documented, actual,
    `README documents ${documented} tests but the suite actually runs ${actual} — ` +
    'update the `npm test  # <N> tests` line in README.md to match')
})

test('the CHANGELOG\'s newest version heading matches package.json\'s version', () => {
  const m = changelog.match(/^##\s+(\d+\.\d+\.\d+)/m)
  assert.ok(m, 'CHANGELOG has no `## X.Y.Z` version heading')
  assert.equal(m[1], pkg.version,
    `CHANGELOG's newest entry is ${m[1]} but package.json is ${pkg.version} — ` +
    'add the missing CHANGELOG entry so the two cannot diverge')
})

test('the README\'s Status line names the current package version', () => {
  assert.ok(readme.includes(`(\`${pkg.version}\`)`),
    `README does not name the current version (\`${pkg.version}\`) in its Status section — ` +
    'it is stale relative to package.json')
})
