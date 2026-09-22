import { test } from 'node:test'
import assert from 'node:assert/strict'
import { EXAMPLE_TIERS, tierById, yieldFor, yieldForAmount, publishedTerms, checkTerms } from '../src/terms.js'

test('EXAMPLE_TIERS: four tiers, longer terms pay at least as well as shorter ones', () => {
  assert.equal(EXAMPLE_TIERS.length, 4)
  const sorted = [...EXAMPLE_TIERS].sort((a, b) => a.termDays - b.termDays)
  for (let i = 1; i < sorted.length; i++) assert.ok(sorted[i].aprBasisPoints >= sorted[i - 1].aprBasisPoints)
})

test('EXAMPLE_TIERS is frozen', () => {
  assert.throws(() => { EXAMPLE_TIERS.push({ id: 'x' }) })
})

test('tierById: finds a known tier and returns null for an unknown one', () => {
  assert.equal(tierById(EXAMPLE_TIERS, 'flex-30').id, 'flex-30')
  assert.equal(tierById(EXAMPLE_TIERS, 'nope'), null)
})

test('yieldFor: simple interest, no compounding, display-sized amounts', () => {
  const tier = { termDays: 365, aprBasisPoints: 1000, minAmount: '1' }
  assert.equal(yieldFor(tier, 100), 10)
  const halfYear = { termDays: 182.5, aprBasisPoints: 1000, minAmount: '1' }
  assert.equal(yieldFor(halfYear, 100), 5)
})

test('yieldForAmount: exact at a scale Number would lose precision on', () => {
  const tier = { termDays: 365, aprBasisPoints: 1000, minAmount: '1' } // 10% APR, 1 year
  // Beyond Number.MAX_SAFE_INTEGER (2^53 - 1): a float computation here
  // would silently round the input before any arithmetic even ran.
  const huge = '900719925474099200000'
  assert.ok(BigInt(huge) > BigInt(Number.MAX_SAFE_INTEGER))
  // 10% of `huge`, exactly — computed independently of yieldForAmount's own
  // implementation, so this test cannot pass by sharing its rounding.
  const expected = (BigInt(huge) * 10n) / 100n
  assert.equal(yieldForAmount(tier, huge), expected.toString())
})

test('yieldForAmount: matches yieldFor at small, exact scale', () => {
  const tier = { termDays: 365, aprBasisPoints: 1000, minAmount: '1' }
  assert.equal(yieldForAmount(tier, '100'), '10')
})

test('yieldForAmount: floors rather than rounds', () => {
  const tier = { termDays: 30, aprBasisPoints: 300, minAmount: '1' } // small yield, should floor to 0 or a small int
  const result = yieldForAmount(tier, '100')
  assert.equal(result, ((100n * 300n * 30n) / (10_000n * 365n)).toString())
})

test('yieldForAmount: zero for a zero-rate tier', () => {
  assert.equal(yieldForAmount({ termDays: 30, aprBasisPoints: 0, minAmount: '1' }, '1000'), '0')
})

test('publishedTerms: shape matches the contract, carries the unit and version, is frozen', () => {
  const doc = publishedTerms({ tiers: EXAMPLE_TIERS, unit: 'Gold', version: '1.0' })
  assert.equal(doc.contract, 'wdk-staking-kit-terms/1')
  assert.equal(doc.version, '1.0')
  assert.equal(doc.unit, 'Gold')
  assert.equal(doc.tiers.length, EXAMPLE_TIERS.length)
  for (const t of doc.tiers) assert.equal(typeof t.yieldOn100, 'number')
  assert.throws(() => { doc.tiers = [] })
})

test('checkTerms: the published example terms pass', () => {
  assert.deepEqual(checkTerms(publishedTerms({ tiers: EXAMPLE_TIERS, unit: 'Gold', version: '1.0' })), { ok: true })
})

test('checkTerms: catches a wrong contract id', () => {
  const doc = { ...publishedTerms({ tiers: EXAMPLE_TIERS, unit: 'Gold', version: '1.0' }), contract: 'something-else/1' }
  const result = checkTerms(doc)
  assert.equal(result.ok, false)
  assert.ok(result.problems.some((p) => p.includes('contract')))
})

test('checkTerms: catches a missing or empty unit', () => {
  const doc = { ...publishedTerms({ tiers: EXAMPLE_TIERS, unit: 'Gold', version: '1.0' }), unit: '' }
  const result = checkTerms(doc)
  assert.equal(result.ok, false)
  assert.ok(result.problems.some((p) => p.includes('unit')))
})

test('checkTerms: catches a duplicate tier id', () => {
  const base = publishedTerms({ tiers: EXAMPLE_TIERS, unit: 'Gold', version: '1.0' })
  const doc = { ...base, tiers: [base.tiers[0], base.tiers[0]] }
  const result = checkTerms(doc)
  assert.equal(result.ok, false)
  assert.ok(result.problems.some((p) => p.includes('duplicate')))
})

test('checkTerms: catches a non-positive termDays, negative apr, non-integer minAmount', () => {
  const doc = {
    contract: 'wdk-staking-kit-terms/1', unit: 'Gold', version: '1.0',
    tiers: [{ id: 'bad', termDays: 0, aprBasisPoints: -1, minAmount: 'notanumber' }],
  }
  const result = checkTerms(doc)
  assert.equal(result.ok, false)
  assert.ok(result.problems.some((p) => p.includes('termDays')))
  assert.ok(result.problems.some((p) => p.includes('aprBasisPoints')))
  assert.ok(result.problems.some((p) => p.includes('minAmount')))
})

test('checkTerms: catches a longer term paying less than a shorter one', () => {
  const doc = {
    contract: 'wdk-staking-kit-terms/1', version: '1.0', unit: 'Gold',
    tiers: [
      { id: 'short', termDays: 30, aprBasisPoints: 900, minAmount: '1' },
      { id: 'long', termDays: 90, aprBasisPoints: 500, minAmount: '1' },
    ],
  }
  const result = checkTerms(doc)
  assert.equal(result.ok, false)
  assert.ok(result.problems.some((p) => p.includes('pays less than the shorter')))
})

test('checkTerms: catches a missing or empty tiers array', () => {
  const result = checkTerms({ contract: 'wdk-staking-kit-terms/1', unit: 'Gold', version: '1.0', tiers: [] })
  assert.equal(result.ok, false)
  assert.ok(result.problems.some((p) => p.includes('non-empty array')))
})
