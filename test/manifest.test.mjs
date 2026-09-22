import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from '../src/manifest.js'
import { checkTerms } from '../src/terms.js'
import { EVENT_TYPES } from '../src/staking.js'

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)))
const SRC = readFileSync(join(ROOT, 'src/staking.js'), 'utf8')

test('build(): matches the committed wdk-staking-kit.manifest.json — run `npm run manifest` if this fails', () => {
  const committed = readFileSync(join(ROOT, 'wdk-staking-kit.manifest.json'), 'utf8')
  const fresh = JSON.stringify(build(), null, 2) + '\n'
  assert.equal(committed, fresh)
})

test('build(): contract id and module name', () => {
  const doc = build()
  assert.equal(doc.contract, 'wdk-staking-kit-manifest/1')
  assert.equal(doc.module.package, '@flashy/wdk-staking-kit')
})

test('build(): the embedded example terms pass their own offline verifier', () => {
  const doc = build()
  assert.deepEqual(checkTerms(doc.exampleTerms), { ok: true })
})

test('build(): events is exactly what StakingService exports as EVENT_TYPES — never a second, hand-kept list', () => {
  const doc = build()
  assert.deepEqual(doc.events, EVENT_TYPES)
})

test('build(): every declared event is actually emitted in staking.js', () => {
  const doc = build()
  for (const type of doc.events) {
    assert.ok(SRC.includes(`this._emit('${type}'`), `staking.js never emits ${type}`)
  }
})

test('build(): posture names the balance-provider-first stage', () => {
  const doc = build()
  assert.equal(doc.posture.stage, 'balance-provider-first')
})
