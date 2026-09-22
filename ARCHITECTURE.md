# Architecture

## Earmarking, not custody

A lock does not move a balance out of the holder's account into some staking contract or escrow. It **earmarks** a portion of a balance the `BalanceProvider` already tracks — `available()` is simply `balance() - locked()`. This is deliberate, and different from most staking designs, which move funds into a contract or pool:

- **No new custody risk.** The balance never leaves wherever the provider already holds it. Staking cannot introduce a new place value can be lost, because it never holds anything itself.
- **No on-chain contract needed to launch.** A rail-first (or provider-first) design like this can go live the day the provider exists — an audited on-chain contract, if you want one later, is a separate, later implementation of the same published terms, not a prerequisite.

The tradeoff: this package does not prevent a holder from spending their balance elsewhere through a channel that doesn't check `locked()`. Enforcing that is your integration's job — typically, the same code path that lets a holder spend calls `available()` (not `balance()`) before allowing a spend. This package publishes the number; it does not gate every possible spend path for you, because it cannot see them.

## Why yield uses BigInt, and yieldFor vs. yieldForAmount

Basis-point interest math (`amount * aprBasisPoints * termDays / (10_000 * 365)`) is exact arithmetic on integers, but `Number` in JavaScript loses precision past `2^53 - 1` (`Number.MAX_SAFE_INTEGER`). A stake of a large, real-world amount — easily past that threshold once you're in a token's base units at 18 decimals — computed with `Number` silently loses precision at the multiplication step, before rounding is even a concern.

This package ships two yield functions for two different purposes:

- **`yieldForAmount(tier, amount)`** — computes entirely in `BigInt`, on an integer-string amount. This is what `StakingService.close()` actually calls to determine a real payout. Exact at any scale, floored to a whole base unit (a fractional base unit does not exist, so crediting one would be crediting something imaginary).
- **`yieldFor(tier, amount)`** — a `Number`-based version, exact only at small, display-sized amounts ("yield on 100 units," for a terms page). It exists because a terms page showing an illustrative number doesn't need `BigInt` ceremony, and using it for anything beyond illustration is exactly the mistake `yieldForAmount` exists to prevent — the two are kept as separate, differently-named functions rather than one function with a flag, so an integrator cannot reach for the wrong one by accident and have it work at small scale in testing, then silently misbehave in production at real scale.

## The BalanceProvider interface

```ts
interface BalanceProvider {
  balance(holderId: string): Promise<string>   // integer string, smallest denomination
  credit(cmd: {
    holderId: string
    amount: string             // integer string, smallest denomination
    reason: { type: string, id: string }
    idempotencyKey: string     // the same key credits once, however many times called
  }): Promise<unknown>
}
```

Two methods, deliberately. `StakingService` never asks a provider to debit, hold, or release — locking never touches the provider at all, and yield is the only write, which is why `credit()` is the only write method the interface needs. A provider backed by a real ledger, a database row with an atomic increment, or a WDK wallet's own balance-reading method all satisfy this with a thin adapter; `StakingService`'s own code never needs to change to swap one in.

**Idempotency is the provider's contract to honor, not `StakingService`'s to re-implement.** `close()` always calls `credit()` with the deterministic key `staking-yield:${positionId}`, so a provider that honors "the same key credits once" makes a retried `close()` safe automatically. `InMemoryBalanceProvider` shows the reference implementation of that contract.

## Why the tier list is a constructor argument, not a constant

`StakingService` takes `tiers` at construction rather than importing `EXAMPLE_TIERS` itself, and nothing in `lock()` or `close()` refers to `EXAMPLE_TIERS` by name. This is what makes "publish your own terms" in the README a real, exercised path rather than a suggestion in prose — `test/staking.test.mjs`'s last test locks against a custom single-tier list to confirm nothing is hardcoded to the shipped example.

## What this package does not do

- It does not move funds, hold a key, sign anything, or make a network call.
- It does not build or deploy an on-chain contract. If you want on-chain settlement later, that is a second implementation of the terms this package publishes — see the README's "Provenance" section for how Flashy's own product plans to sequence exactly that.
- It does not enforce that `available()` is checked before every possible spend elsewhere in your system — see "Earmarking, not custody," above.
