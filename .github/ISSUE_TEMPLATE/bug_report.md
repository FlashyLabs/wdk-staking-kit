---
name: Bug report
about: Something in wdk-staking-kit doesn't do what it says
title: ''
labels: bug
assignees: ''
---

**What happened**

A clear description of what you expected `lock()`, `close()`, or `yieldForAmount()` to return, and what actually happened.

**Minimal reproduction**

```js
import { StakingService, InMemoryBalanceProvider, EXAMPLE_TIERS } from '@flashylabs/wdk-staking-kit'

const provider = new InMemoryBalanceProvider({ alice: '1000' })
const staking = new StakingService({ provider, tiers: EXAMPLE_TIERS })

// ...the call that misbehaves, and what you expected instead
```

The smaller this is, the faster it gets fixed.

**Package version**

Output of `npm ls @flashylabs/wdk-staking-kit`.

**Environment**

Node version (`node -v`), and whether you're using `EXAMPLE_TIERS` or your own published terms.
