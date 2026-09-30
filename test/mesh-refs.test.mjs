// Every local file and command MESH.md points at actually exists — so a
// dangling reference is a red test, not something a reader discovers by
// following an instruction that fails. This is why it exists: MESH.md told a
// reader to run `node vendor-aao-check.mjs validate flashyos.roles.json`, and
// that file was absent from the tree, so the one command the document leads
// with could not run.
//
// Scope, deliberately: this checks references that resolve INSIDE this
// checkout — relative markdown links, `node <script>` commands, and bare
// local filenames in backticks. It does NOT check `npx` invocations or paths
// that live in another repository: MESH.md's `npx tsx
// packages/api/scripts/provision-org-from-charter.ts` runs against a flashyos
// checkout on a machine holding DATABASE_URL, and `npx @flashyos/conformance`
// runs a published tool against a live domain — neither is a claim about a
// file in this repository, and asserting they exist here would be a false
// failure. A slash in a backtick token (a path, an @scope) is treated as
// out-of-repo for the same reason.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)))
const mesh = readFileSync(join(ROOT, 'MESH.md'), 'utf8')

const local = (target) =>
  target &&
  !/^[a-z][a-z0-9+.-]*:\/\//i.test(target) && // not http(s):// or any scheme
  !target.startsWith('#') && // not an in-page anchor
  !target.startsWith('mailto:')

test('every relative markdown link in MESH.md resolves to a file in this repo', () => {
  const links = [...mesh.matchAll(/\[[^\]]*\]\(([^)]+)\)/g)].map((m) => m[1].split('#')[0].trim())
  const relative = links.filter(local)
  assert.ok(relative.length > 0, 'expected at least one relative markdown link in MESH.md')
  for (const target of relative) {
    assert.ok(existsSync(join(ROOT, target)), `MESH.md links to "${target}", which does not exist in this repo`)
  }
})

test('every `node <script>` command in MESH.md names a script that exists here', () => {
  const scripts = [...mesh.matchAll(/\bnode\s+([^\s`]+\.(?:mjs|cjs|js))\b/g)].map((m) => m[1])
  assert.ok(scripts.length > 0, 'expected at least one `node <script>` command in MESH.md')
  for (const script of scripts) {
    assert.ok(existsSync(join(ROOT, script)),
      `MESH.md tells a reader to run "node ${script}", but that file is not in this repo — vendor it or fix the reference`)
  }
})

test('every bare local filename in backticks in MESH.md exists', () => {
  // A backtick token that is a plain filename (no slash, no scheme) is a claim
  // about a file in this repository. Tokens with a slash (paths into other
  // repos, @scope packages) are out of scope — see the docblock above.
  const KNOWN_EXT = /\.(?:json|mjs|cjs|js|md|ts|yml|yaml)$/
  const tokens = new Set(
    [...mesh.matchAll(/`([^`]+)`/g)]
      .map((m) => m[1].trim())
      .filter((t) => KNOWN_EXT.test(t) && !t.includes('/') && !t.includes(' ')),
  )
  assert.ok(tokens.size > 0, 'expected at least one bare local filename in backticks in MESH.md')
  for (const token of tokens) {
    assert.ok(existsSync(join(ROOT, token)),
      `MESH.md references \`${token}\`, which does not exist in this repo`)
  }
})
