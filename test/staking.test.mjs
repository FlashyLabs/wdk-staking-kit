import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  StakingService, EVENT_TYPES, TierNotFoundError, BelowMinimumError, InsufficientAvailableError,
  PositionNotFoundError, StillLockedError, AlreadyClosedError,
} from '../src/staking.js'
import { InMemoryBalanceProvider } from '../src/balance-provider.js'
import { EXAMPLE_TIERS, yieldForAmount, tierById } from '../src/terms.js'

function service({ balances = { alice: '100' }, now = () => new Date('2026-09-21T00:00:00.000Z'), tiers = EXAMPLE_TIERS } = {}) {
  const provider = new InMemoryBalanceProvider(balances)
  return { svc: new StakingService({ provider, tiers, now }), provider }
}

test('constructor: refuses to build without a provider', () => {
  assert.throws(() => new StakingService({ tiers: EXAMPLE_TIERS }), /needs a provider/)
})

test('constructor: refuses to build without at least one tier', () => {
  const provider = new InMemoryBalanceProvider()
  assert.throws(() => new StakingService({ provider, tiers: [] }), /at least one tier/)
})

test('lock: opens a position, earmarking against the provider balance', async () => {
  const { svc } = service()
  const p = await svc.lock({ holderId: 'alice', tierId: 'flex-30', amount: '20', idempotencyKey: 'k1' })
  assert.equal(p.status, 'locked')
  assert.equal(p.amount, '20')
  assert.equal(p.tierId, 'flex-30')
  assert.equal(svc.locked('alice'), '20')
  assert.equal(await svc.available('alice'), '80')
})

test('lock: does not move the provider balance — only earmarks', async () => {
  const { svc, provider } = service()
  await svc.lock({ holderId: 'alice', tierId: 'flex-30', amount: '20', idempotencyKey: 'k1' })
  assert.equal(await provider.balance('alice'), '100')
})

test('lock: maturesAt is startedAt + termDays', async () => {
  const now = () => new Date('2026-01-01T00:00:00.000Z')
  const { svc } = service({ now })
  const p = await svc.lock({ holderId: 'alice', tierId: 'standard-90', amount: '20', idempotencyKey: 'k1' })
  assert.equal(p.maturesAt.toISOString(), '2026-04-01T00:00:00.000Z')
})

test('lock: refuses an unknown tier', async () => {
  const { svc } = service()
  await assert.rejects(() => svc.lock({ holderId: 'alice', tierId: 'nope', amount: '20', idempotencyKey: 'k1' }), TierNotFoundError)
})

test('lock: refuses a non-positive or non-integer-string amount', async () => {
  const { svc } = service()
  for (const amount of ['0', '-5', '1.5', 'abc']) {
    await assert.rejects(() => svc.lock({ holderId: 'alice', tierId: 'flex-30', amount, idempotencyKey: `k-${amount}` }), /positive integer string/)
  }
})

test('lock: refuses below the tier minimum', async () => {
  const { svc } = service()
  await assert.rejects(() => svc.lock({ holderId: 'alice', tierId: 'flex-30', amount: '5', idempotencyKey: 'k1' }), BelowMinimumError)
})

test('lock: refuses a missing idempotencyKey', async () => {
  const { svc } = service()
  await assert.rejects(() => svc.lock({ holderId: 'alice', tierId: 'flex-30', amount: '20' }), /idempotencyKey/)
})

test('lock: refuses to earmark more than what is available, across multiple open locks', async () => {
  const { svc } = service({ balances: { alice: '30' } })
  await svc.lock({ holderId: 'alice', tierId: 'flex-30', amount: '20', idempotencyKey: 'k1' })
  await assert.rejects(
    () => svc.lock({ holderId: 'alice', tierId: 'flex-30', amount: '20', idempotencyKey: 'k2' }),
    InsufficientAvailableError,
  )
})

test('position: returns the position, throws PositionNotFoundError otherwise', async () => {
  const { svc } = service()
  const p = await svc.lock({ holderId: 'alice', tierId: 'flex-30', amount: '20', idempotencyKey: 'k1' })
  assert.equal(svc.position(p.id), p)
  assert.throws(() => svc.position('stake_999999'), PositionNotFoundError)
})

test('close: refuses before maturity', async () => {
  const { svc } = service()
  const p = await svc.lock({ holderId: 'alice', tierId: 'flex-30', amount: '20', idempotencyKey: 'k1' })
  await assert.rejects(() => svc.close(p.id), StillLockedError)
})

test('close: refuses an unknown position', async () => {
  const { svc } = service()
  await assert.rejects(() => svc.close('stake_999999'), PositionNotFoundError)
})

test('close: pays yield through provider.credit(), computed from the tier at lock time, and frees the earmark', async () => {
  let now = new Date('2026-01-01T00:00:00.000Z')
  const { svc, provider } = service({ now: () => now })
  const p = await svc.lock({ holderId: 'alice', tierId: 'standard-90', amount: '20', idempotencyKey: 'k1' })
  now = new Date('2026-04-01T00:00:00.000Z')
  const closed = await svc.close(p.id)
  assert.equal(closed.status, 'closed')
  const expected = yieldForAmount(tierById(EXAMPLE_TIERS, 'standard-90'), '20')
  assert.equal(closed.yieldPaid, expected)
  assert.equal(await provider.balance('alice'), (100n + BigInt(expected)).toString())
  assert.equal(svc.locked('alice'), '0')
  assert.equal(await svc.available('alice'), (100n + BigInt(expected)).toString())
})

test('close: refuses to close the same position twice', async () => {
  let now = new Date('2026-01-01T00:00:00.000Z')
  const { svc } = service({ now: () => now })
  const p = await svc.lock({ holderId: 'alice', tierId: 'flex-30', amount: '20', idempotencyKey: 'k1' })
  now = new Date('2026-02-01T00:00:00.000Z')
  await svc.close(p.id)
  await assert.rejects(() => svc.close(p.id), AlreadyClosedError)
})

test('close: yield credit is idempotent at the provider even if credit were called twice for the same position', async () => {
  let now = new Date('2026-01-01T00:00:00.000Z')
  const { svc, provider } = service({ now: () => now })
  const p = await svc.lock({ holderId: 'alice', tierId: 'flex-30', amount: '20', idempotencyKey: 'k1' })
  now = new Date('2026-02-01T00:00:00.000Z')
  await svc.close(p.id)
  const before = await provider.balance('alice')
  await provider.credit({ holderId: 'alice', amount: '999', reason: { type: 'staking-yield', id: p.id }, idempotencyKey: `staking-yield:${p.id}` })
  assert.equal(await provider.balance('alice'), before)
})

test('positionsFor: returns only that holder\'s positions, open and closed', async () => {
  const { svc } = service({ balances: { alice: '100', bob: '100' } })
  await svc.lock({ holderId: 'alice', tierId: 'flex-30', amount: '20', idempotencyKey: 'a1' })
  await svc.lock({ holderId: 'bob', tierId: 'flex-30', amount: '20', idempotencyKey: 'b1' })
  const alicePositions = svc.positionsFor('alice')
  assert.equal(alicePositions.length, 1)
  assert.equal(alicePositions[0].holderId, 'alice')
})

test('on/emit: stake.locked fires with the new position', async () => {
  const { svc } = service()
  const seen = []
  svc.on('stake.locked', (payload) => seen.push(payload))
  const p = await svc.lock({ holderId: 'alice', tierId: 'flex-30', amount: '20', idempotencyKey: 'k1' })
  assert.equal(seen.length, 1)
  assert.equal(seen[0].position.id, p.id)
})

test('on/emit: stake.closed fires with the closed position', async () => {
  let now = new Date('2026-01-01T00:00:00.000Z')
  const { svc } = service({ now: () => now })
  const seen = []
  svc.on('stake.closed', (payload) => seen.push(payload))
  const p = await svc.lock({ holderId: 'alice', tierId: 'flex-30', amount: '20', idempotencyKey: 'k1' })
  now = new Date('2026-02-01T00:00:00.000Z')
  await svc.close(p.id)
  assert.equal(seen.length, 1)
  assert.equal(seen[0].position.status, 'closed')
})

test('on: refuses an unknown event type', () => {
  const { svc } = service()
  assert.throws(() => svc.on('stake.exploded', () => {}), /unknown event type/)
})

test('on: the returned unsubscribe function stops delivery', async () => {
  const { svc } = service()
  const seen = []
  const unsubscribe = svc.on('stake.locked', (payload) => seen.push(payload))
  unsubscribe()
  await svc.lock({ holderId: 'alice', tierId: 'flex-30', amount: '20', idempotencyKey: 'k1' })
  assert.equal(seen.length, 0)
})

test('EVENT_TYPES: exactly the two lock/close events, frozen', () => {
  assert.deepEqual(EVENT_TYPES, ['stake.locked', 'stake.closed'])
  assert.throws(() => { EVENT_TYPES.push('x') })
})

test('a custom tier list works exactly like EXAMPLE_TIERS — nothing in StakingService is hardcoded to it', async () => {
  const customTiers = [{ id: 'quick-7', termDays: 7, aprBasisPoints: 100, minAmount: '1' }]
  const { svc } = service({ tiers: customTiers })
  const p = await svc.lock({ holderId: 'alice', tierId: 'quick-7', amount: '50', idempotencyKey: 'k1' })
  assert.equal(p.tierId, 'quick-7')
})
