import { test } from 'node:test'
import assert from 'node:assert/strict'
import { InMemoryBalanceProvider } from '../src/balance-provider.js'

test('balance: zero for an unknown holder, the seeded amount otherwise', async () => {
  const provider = new InMemoryBalanceProvider({ alice: '100' })
  assert.equal(await provider.balance('bob'), '0')
  assert.equal(await provider.balance('alice'), '100')
})

test('credit: credits the holder and records the entry', async () => {
  const provider = new InMemoryBalanceProvider({ alice: '10' })
  await provider.credit({ holderId: 'alice', amount: '5', reason: { type: 'staking-yield', id: 'stake_1' }, idempotencyKey: 'k1' })
  assert.equal(await provider.balance('alice'), '15')
})

test('credit: idempotent on the same key', async () => {
  const provider = new InMemoryBalanceProvider({ alice: '10' })
  await provider.credit({ holderId: 'alice', amount: '5', reason: { type: 'staking-yield', id: 'stake_1' }, idempotencyKey: 'k1' })
  await provider.credit({ holderId: 'alice', amount: '5', reason: { type: 'staking-yield', id: 'stake_1' }, idempotencyKey: 'k1' })
  assert.equal(await provider.balance('alice'), '15')
  assert.equal(provider.credited.length, 1)
})

test('credit: refuses a negative amount', async () => {
  const provider = new InMemoryBalanceProvider()
  await assert.rejects(() => provider.credit({ holderId: 'alice', amount: '-1', reason: { type: 'x' }, idempotencyKey: 'k' }), /non-negative/)
})

test('credit: refuses a missing idempotencyKey', async () => {
  const provider = new InMemoryBalanceProvider()
  await assert.rejects(() => provider.credit({ holderId: 'alice', amount: '1', reason: { type: 'x' } }), /idempotencyKey/)
})

test('credit: refuses a missing reason.type', async () => {
  const provider = new InMemoryBalanceProvider()
  await assert.rejects(() => provider.credit({ holderId: 'alice', amount: '1', reason: {}, idempotencyKey: 'k' }), /reason\.type/)
})

test('credit: accepts a zero amount', async () => {
  const provider = new InMemoryBalanceProvider({ alice: '10' })
  await provider.credit({ holderId: 'alice', amount: '0', reason: { type: 'x' }, idempotencyKey: 'k' })
  assert.equal(await provider.balance('alice'), '10')
})
