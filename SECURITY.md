# Security

## Threat model

This package holds no key, signs nothing, and makes no network call. It is an accounting layer: given a `BalanceProvider` you supply, it decides whether a lock is permitted and computes yield on close. Its security surface is:

- **Over-crediting yield.** The one write this package performs is `provider.credit()` on close. `yieldForAmount()` is computed in `BigInt` specifically so this cannot silently over-credit at scale — see `ARCHITECTURE.md`. A bug that inflates a payout is the most severe class of issue this package could contain.
- **Under-checking `available()`.** If `lock()` allowed earmarking more than a holder's actual balance, a holder could lock funds they don't have. `test/staking.test.mjs` exercises this directly (`InsufficientAvailableError`).
- **Non-idempotent retries.** A retried `lock()` or a retried `close()` must not double-lock or double-pay. Both are keyed (`idempotencyKey` on `lock()`; a deterministic `staking-yield:${positionId}` key on `close()`'s `credit()` call) and tested.

This package does not authenticate callers — it assumes whatever calls `lock()`/`close()` has already verified the holder's identity and authority to act for that `holderId`. It also does not prevent a holder from spending a locked balance through a channel that doesn't check `available()` — see `ARCHITECTURE.md`'s "Earmarking, not custody" for why, and what that means for your integration.

## Known, deliberate limitations

- **`InMemoryBalanceProvider` is not production custody.** It is a reference implementation for tests and demos, explicitly documented as such. A production `BalanceProvider` needs its own security review, matched to whatever it actually holds — this package cannot review a balance store it doesn't implement.
- **No on-chain settlement.** This package makes no claim about, and provides no protection for, an on-chain contract you might build later against the same published terms.
- **Time comes from an injectable `now()`, not from a trusted clock source.** `StillLockedError` is checked against whatever `now()` your `StakingService` instance was constructed with. If your integration lets an untrusted party influence what your server considers "now," that is a bug in your integration, not in this package — supply a real, trusted clock.

## Reporting a vulnerability

Please report suspected vulnerabilities privately rather than as a public GitHub issue: email **security@flashy.network** with a description and, if possible, a minimal reproduction (an envelope-equivalent input and the yield or verdict you got versus expected). We aim to acknowledge within 3 business days.
