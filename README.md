# @flashylabs/wdk-staking-kit

```
        ██
       ██
      ██████
        ██
       ██
      ██
```

A reference staking primitive for wallets built on [Tether's WDK](https://github.com/tetherto/wdk) — or any wallet SDK. Lock a balance into a fixed-term tier at a published rate, without an on-chain contract and without touching a ledger's internals: a lock **earmarks** a balance a provider already credits, and only the yield, paid on close, is a real write.

[![tests](https://github.com/FlashyLabs/wdk-staking-kit/actions/workflows/ci.yml/badge.svg)](https://github.com/FlashyLabs/wdk-staking-kit/actions/workflows/ci.yml)
[![CodeQL](https://github.com/FlashyLabs/wdk-staking-kit/actions/workflows/codeql.yml/badge.svg)](https://github.com/FlashyLabs/wdk-staking-kit/actions/workflows/codeql.yml)
[![OpenSSF Scorecard](https://api.securityscorecards.dev/projects/github.com/FlashyLabs/wdk-staking-kit/badge)](https://scorecard.dev/viewer/?uri=github.com/FlashyLabs/wdk-staking-kit)
[![npm version](https://img.shields.io/npm/v/@flashylabs/wdk-staking-kit.svg)](https://www.npmjs.com/package/@flashylabs/wdk-staking-kit)
[![npm downloads](https://img.shields.io/npm/dm/@flashylabs/wdk-staking-kit.svg)](https://www.npmjs.com/package/@flashylabs/wdk-staking-kit)
[![license](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](./LICENSE)
[![node](https://img.shields.io/badge/node-%3E%3D20-brightgreen.svg)](https://nodejs.org)

Built by [Flashy Labs](https://flashyos.com) — part of the open-source toolkit we ship for teams building on Tether's WDK. Its sibling package is [`@flashylabs/wdk-policy-guard`](https://github.com/FlashyLabs/wdk-policy-guard).

## Why this exists

As of this package's first release, no WDK module offers staking — every wallet, protocol and pricing module WDK publishes covers something else (transfers, swaps, bridging, fiat on/off-ramp), and a team wanting to offer staking has to design the whole primitive from nothing. The two real design questions — *does a lock need an on-chain contract to be safe?* and *how do you pay yield without letting a caller assert their own payout?* — are exactly the ones this package answers, so the next team doesn't have to re-derive them under deadline.

**No on-chain contract required.** A lock is bookkeeping on top of a balance a provider already holds — it never moves the underlying balance, and it carries no custody risk beyond what the provider itself already carries.

## Install

```bash
npm install @flashylabs/wdk-staking-kit
```

## Quickstart

```js
import { StakingService, InMemoryBalanceProvider, EXAMPLE_TIERS } from '@flashylabs/wdk-staking-kit'

const provider = new InMemoryBalanceProvider({ alice: '100' })
const staking = new StakingService({ provider, tiers: EXAMPLE_TIERS })

const position = await staking.lock({
  holderId: 'alice',
  tierId: 'standard-90',
  amount: '20',
  idempotencyKey: 'lock-1',
})
// position.status === 'locked'; provider balance is unchanged — 20 is
// earmarked, not moved. staking.available('alice') === '80' (a Promise).

// ... 90 days later, once position.maturesAt has passed:
const closed = await staking.close(position.id)
// closed.yieldPaid is credited through provider.credit(), with a reason:
// { type: 'staking-yield', id: position.id }
```

`InMemoryBalanceProvider` is the reference implementation this package ships for tests and demos. In production, implement `BalanceProvider`'s two methods (`balance(holderId)`, `credit(cmd)`) against your own accounting, or against a WDK wallet's balance — `StakingService` never needs to change when you do. See [`ARCHITECTURE.md`](ARCHITECTURE.md) for the full interface contract.

## Publishing your own terms

`EXAMPLE_TIERS` is exactly that — an example. Publish your own:

```js
import { publishedTerms, checkTerms } from '@flashylabs/wdk-staking-kit'

const MY_TIERS = [
  { id: 'flex-7', termDays: 7, aprBasisPoints: 150, minAmount: '10' },
  { id: 'locked-365', termDays: 365, aprBasisPoints: 1200, minAmount: '100' },
]

const terms = publishedTerms({ tiers: MY_TIERS, unit: 'USDC', version: '2026-01.1' })
console.log(checkTerms(terms)) // { ok: true } — or a list of problems, before you publish a rate you can't defend
```

`checkTerms()` is the offline verifier a stranger runs against your published terms document — no network call, no dependency on this package's service. It catches a self-contradictory terms document (duplicate tier ids, a longer term paying less than a shorter one, a non-positive rate) before it ever reaches a page.

## API

| Export | What it does |
|---|---|
| `StakingService` | The service: `lock()`, `close()`, `position()`, `positionsFor()`, `locked()`, `available()`, `on()`. |
| `InMemoryBalanceProvider` | A reference `BalanceProvider` for tests and demos. |
| `EXAMPLE_TIERS` | Four example tiers (30/90/180/365 days). Not a recommendation — an illustration of the shape. |
| `tierById(tiers, id)` | Look up a tier by id in any tier array. |
| `yieldForAmount(tier, amount)` | The exact, `BigInt`-computed yield for a real lock amount. What `close()` actually uses. |
| `yieldFor(tier, amount)` | A `Number`-based yield calculation for small, display-sized amounts (e.g. "yield on 100 units" on a terms page). **Never use this for a real lock amount** — see `ARCHITECTURE.md`. |
| `publishedTerms(opts)` / `checkTerms(doc)` | Build and verify a published terms document. |
| `TierNotFoundError`, `BelowMinimumError`, `InsufficientAvailableError`, `PositionNotFoundError`, `StillLockedError`, `AlreadyClosedError` | Typed errors `lock()`/`close()` throw. |

Full TypeScript declarations ship with the package — `Tier` and `BalanceProvider` import directly from the package root, generated from the source's own JSDoc so the types can never drift from the implementation. `test-types/consumer.ts` is the type-level test that would fail if they ever did; it's also what caught `BalanceProvider` not actually being structurally typed before this shipped — `StakingService` accepted any object shaped like the interface at runtime, but the types only accepted `InMemoryBalanceProvider` itself.

## What it refuses

Every one of these is a real test in [`test/staking.test.mjs`](test/staking.test.mjs):

- a lock below the tier's minimum, with a reason (`BelowMinimumError`)
- to lock more than the holder's available balance — balance minus what is already locked, across every open position (`InsufficientAvailableError`)
- a non-positive amount, or an amount that isn't an integer string (never a `Number`)
- to close a position before it matures (`StillLockedError`)
- to close the same position twice (`AlreadyClosedError`)
- to change a matured lock's yield after the fact — it is computed from the tier **in force when the lock was opened**, never recomputed against a later tier list

## Events

`StakingService` emits `stake.locked` and `stake.closed`:

```js
staking.on('stake.locked', ({ position }) => { /* ... */ })
const unsubscribe = staking.on('stake.closed', ({ position }) => { /* ... */ })
```

## Design principles

- **Amounts are always strings, in the smallest denomination.** Never a `Number` — see `ARCHITECTURE.md`'s note on `yieldForAmount` versus `yieldFor`.
- **A lock never moves the underlying balance.** It is bookkeeping only, on top of a `BalanceProvider` you control.
- **Yield is computed once, at lock time, from the tier then in force.** A later change to your tier list cannot reach back into an open position.
- **Idempotent by construction.** Every `lock()` and every yield `credit()` carries an idempotency key; a retried call never double-locks or double-pays.
- **A lock cannot be clever about what it will pay, because the tier it pays from is fixed the moment it opens, not the moment it closes.**

## What this package does not do

- It does not move funds, hold a key, sign anything, or make a network call.
- It does not build or deploy an on-chain contract. See `ARCHITECTURE.md`'s "What this package does not do" for the sequencing if you want on-chain settlement later.
- It does not enforce that `available()` is checked before every possible spend elsewhere in your system — that's your integration's job.

## Status

Pre-1.0 (`0.1.0`). The tier and position shapes are not yet frozen. Watch [`CHANGELOG.md`](CHANGELOG.md) across a version bump before pinning a wider range than `^0.1.0`.

## Testing

```bash
npm test        # 52 tests, node's built-in test runner, no external services
npm run check    # confirms the generated manifest is current
```

## Security

See [`SECURITY.md`](SECURITY.md). In short: this package never holds a key, signs nothing, and makes no network call — it is a pure accounting layer over a `BalanceProvider` you supply.

## Provenance

Generalized from the rail-first staking design built for Flashy Staking (`life-staking`, internal — a product-specific implementation of this same shape, over Flashy's own settlement rail). Open-sourced because "no WDK staking module exists yet" is a gap the whole ecosystem building on WDK shares, not one specific to us. See [`CHANGELOG.md`](CHANGELOG.md).

## Contributing

See [`CONTRIBUTING.md`](CONTRIBUTING.md).

## ⚡ The Strike

This README commits to a secret, the same way a lock commits to its tier — fixed before you can see the payoff, checkable by anyone after:

```
sha256: c8eaccf0b6f14e1883faa022e662e2e97f375f3fb84c62194275d686a84a8082
```

The preimage is already on this page — one exact sentence from "Design principles," above. Recover it, hash it yourself (never trust, verify — that includes us), and open an issue titled `⚡ STRIKE` containing the sentence. First verified striker per release gets their name in [`STRIKERS.md`](STRIKERS.md) — the only position in this repository that matures the instant it's opened.

No prize, no token, no yield. Just the ledger of who looked closely.

## License

[Apache-2.0](./LICENSE) © 2026 Flashy Labs

---

Built by [Flashy Labs](https://flashyos.com), the mesh platform for organisations' agents. If something here is broken, unclear, or just interesting, [open an issue](https://github.com/FlashyLabs/wdk-staking-kit/issues) — we read them.
