# Changelog

All notable changes to this project are documented here. Format loosely follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## 0.1.0 — 2026-09-22

Initial public release.

- `StakingService` — `lock()`, `close()`, `position()`, `positionsFor()`, `locked()`, `available()`, event subscription — generalized from the rail-first staking design built for Flashy Staking, with the provider interface abstracted to `BalanceProvider` (two methods: `balance`, `credit`) so it works against any balance source, not just one product's settlement rail.
- `terms.js` — publishable, offline-verifiable terms documents (`publishedTerms()`, `checkTerms()`), and `yieldForAmount()`, a `BigInt`-exact yield calculation that replaces the float-based version this package's predecessor used, precisely to avoid precision loss at real transaction scale.
- `InMemoryBalanceProvider` — a reference `BalanceProvider` for tests and demos.
- 52 tests covering every refusal path, event emission, `BigInt` exactness at a scale `Number` cannot represent, and a custom (non-example) tier list to confirm nothing is hardcoded to the shipped example.
- `wdk-staking-kit.manifest.json` — a generated, machine-readable statement of the example terms, events, and refusals this package's service exposes.
