// Not run by `npm test` — this is a type-level smoke test, checked by
// `npm run test:types`. It imports the package exactly as a real TypeScript
// consumer would (through the package name, resolved to the built dist/
// declarations via this directory's tsconfig `paths`), so a change that
// breaks the published types breaks this file, not just the JS behaviour.
import {
  StakingService, InMemoryBalanceProvider, EXAMPLE_TIERS, tierById, yieldForAmount, checkTerms,
  type Tier, type BalanceProvider,
} from '@flashylabs/wdk-staking-kit'

// A plain object satisfying the BalanceProvider interface, not an instance
// of InMemoryBalanceProvider — this is the exact case the interface exists
// for (ARCHITECTURE.md: "any object shaped like BalanceProvider"), and
// exactly the case that a type narrowed to the concrete class would reject.
const customProvider: BalanceProvider = {
  async balance(holderId) {
    void holderId
    return '1000'
  },
  async credit(cmd) {
    return { credited: cmd.amount }
  },
}

const stakingOverCustomProvider = new StakingService({ provider: customProvider, tiers: EXAMPLE_TIERS })
void stakingOverCustomProvider

const stakingOverReferenceProvider = new StakingService({
  provider: new InMemoryBalanceProvider({ alice: '1000' }),
  tiers: EXAMPLE_TIERS,
})

const tier: Tier | null = tierById(EXAMPLE_TIERS, 'standard-90')
if (tier) {
  const yieldAmount: string = yieldForAmount(tier, '200')
  void yieldAmount
}

const result = checkTerms({ tiers: EXAMPLE_TIERS, unit: 'example-unit', version: '0.1.0' })
void result

async function demo() {
  const position = await stakingOverReferenceProvider.lock({
    holderId: 'alice',
    tierId: 'standard-90',
    amount: '20',
    idempotencyKey: 'lock-1',
  })
  void position

  await stakingOverReferenceProvider.lock({
    holderId: 'alice',
    tierId: 'standard-90',
    // @ts-expect-error — amount must be a string, not a number
    amount: 20,
    idempotencyKey: 'lock-2',
  })
}
void demo
