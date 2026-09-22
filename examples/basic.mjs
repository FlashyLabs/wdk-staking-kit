// A runnable, end-to-end example: lock a balance, watch it mature, close it
// and see the yield credited.
//
//   node examples/basic.mjs
import { StakingService, InMemoryBalanceProvider, EXAMPLE_TIERS } from '../src/index.js'

let now = new Date('2026-01-01T00:00:00.000Z')
const provider = new InMemoryBalanceProvider({ alice: '1000' })
const staking = new StakingService({ provider, tiers: EXAMPLE_TIERS, now: () => now })

staking.on('stake.locked', ({ position }) => console.log('locked:', position.id, position.amount, position.tierId))
staking.on('stake.closed', ({ position }) => console.log('closed:', position.id, 'yield paid:', position.yieldPaid))

console.log('balance before:', await provider.balance('alice'))
console.log('available before lock:', await staking.available('alice'))

const position = await staking.lock({
  holderId: 'alice',
  tierId: 'standard-90', // 90 days, 6% APR
  amount: '200',
  idempotencyKey: 'demo-lock-1',
})

console.log('available after lock:', await staking.available('alice'))
console.log('balance unchanged:', await provider.balance('alice'))

try {
  await staking.close(position.id)
} catch (err) {
  console.log('close before maturity refused:', err.message)
}

now = new Date(position.maturesAt.getTime() + 1000) // one second after maturity

const closed = await staking.close(position.id)
console.log('closed position:', closed)
console.log('balance after close:', await provider.balance('alice'))
console.log('available after close:', await staking.available('alice'))
