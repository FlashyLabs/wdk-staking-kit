# Changelog

All notable changes to this project are documented here. Format loosely follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

The published version is the one in [`package.json`](package.json); the topmost entry below must match it (a test pins this — see `test/doc-pins.test.mjs`), so the changelog can never quietly fall behind the package again.

## Unreleased

**Fixed:** two `close()` calls for one matured position started together both fulfilled and `stake.closed` fired twice — the status check and the write sat either side of the provider's `credit()` await, the same shape as the lock defect fixed at 0.2.0. Only the provider's idempotency key on `staking-yield:${positionId}` prevented a second payment. `close()` now runs through the same per-holder chain as `lock()`, so exactly one close succeeds and the rest are refused `AlreadyClosedError`. Found by the harness below on the day it was wired, on the code that had just fixed the other three.

**Added:** `INVARIANTS.md` — the four guarantees this service makes about money (never over-reserve, idempotent lock, terms fixed at agreement, a position closes once), each citing the code that enforces it and the tests that prove it — and `vendor-invariants.mjs`, the estate's `invariants/1` harness vendored byte-for-byte from spec-kit (`test/vendor-invariants.test.mjs` reports drift, and UNKNOWN rather than a pass when spec-kit is not checked out beside this repository). `test/invariants.test.mjs` drives the real `StakingService` through every ordered pair of lock / same-key lock / conflicting lock / close / tierChange under seven schedules including across the clock, through seeded random command sequences, and through one deliberately broken variant per invariant that the harness must refuse. `npm run invariants` checks the document against the suite and CI runs it.

## 0.2.0 — 2026-10-10

Three behaviours an external audit reproduced behind a green suite, each now fixed and pinned by a test in `test/staking.test.mjs`:

- **Concurrent locks could reserve more than the balance** (80 + 80 against 100 both succeeded). `lock()` is serialised per holder, so the read of the provider balance and the recording of the lock are one step; different holders do not wait on each other.
- **A repeated idempotency key opened a second position.** The same `(holderId, idempotencyKey)` now returns the same position and emits no second event; the same key with a different amount or tier throws `IdempotencyConflictError` (`IDEMPOTENCY_CONFLICT`).
- **A tier's rate change re-priced an open position.** The terms a position was opened under (`aprBasisPoints`, `termDays`) are frozen into it as `position.terms`, and `close()` prices the yield from those — never from the tier list as it stands at close.

`position.terms` is a new field on every position; nothing else in the shape changed.

## 0.1.3 — 2026-09-28

Maintenance release. The current published version on npm.

The exact per-version diffs for the `0.1.1`–`0.1.3` line are not reconstructable from this repository's history — the working tree's git history is squashed to a single content commit that already carries `0.1.3`, and only `0.1.3` is on the public registry — so these three entries are recorded honestly as maintenance releases rather than with invented detail. What the working tree ships beyond the `0.1.0` entry below (TypeScript declarations generated from the source's own JSDoc, the `test-types/consumer.ts` type-level test, and CI hardening — SHA-pinned actions, CodeQL, Scorecard) landed somewhere across this line, but which change belongs to which version is not recorded here and is not fabricated.

## 0.1.2 — 2026-09-27

Maintenance release. No behavioural change to the public API is recorded for this version.

## 0.1.1 — 2026-09-24

Maintenance release. No behavioural change to the public API is recorded for this version.

## 0.1.0 — 2026-09-22

Initial public release.

- `StakingService` — `lock()`, `close()`, `position()`, `positionsFor()`, `locked()`, `available()`, event subscription — generalized from the rail-first staking design built for Flashy Staking, with the provider interface abstracted to `BalanceProvider` (two methods: `balance`, `credit`) so it works against any balance source, not just one product's settlement rail.
- `terms.js` — publishable, offline-verifiable terms documents (`publishedTerms()`, `checkTerms()`), and `yieldForAmount()`, a `BigInt`-exact yield calculation that replaces the float-based version this package's predecessor used, precisely to avoid precision loss at real transaction scale.
- `InMemoryBalanceProvider` — a reference `BalanceProvider` for tests and demos.
- A test suite covering every refusal path, event emission, `BigInt` exactness at a scale `Number` cannot represent, and a custom (non-example) tier list to confirm nothing is hardcoded to the shipped example. (The suite's exact size at `0.1.0` is not recorded; the current count is pinned to the README by `test/doc-pins.test.mjs`.)
- `wdk-staking-kit.manifest.json` — a generated, machine-readable statement of the example terms, events, and refusals this package's service exposes.
