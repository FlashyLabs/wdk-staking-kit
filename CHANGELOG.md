# Changelog

All notable changes to this project are documented here. Format loosely follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

The published version is the one in [`package.json`](package.json); the topmost entry below must match it (a test pins this — see `test/doc-pins.test.mjs`), so the changelog can never quietly fall behind the package again.

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
