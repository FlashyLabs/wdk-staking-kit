# Contributing

Thank you for looking. This package is small on purpose — most of what you need to know is enforced by tests rather than described here.

## Getting set up

```bash
npm install
npm test          # 52 tests, node's built-in test runner
npm run check     # confirms the generated manifest is current
```

No build step, no external services, no network access needed to develop or test this package.

## Before you open a pull request

- **`npm test` must pass.** Every exported function needs direct coverage.
- **Amounts stay strings, and yield math stays `BigInt`.** Never introduce a `Number` for `amount`, `minAmount`, or anywhere yield is computed for a real position — see `ARCHITECTURE.md`'s note on `yieldFor` versus `yieldForAmount`. A change that reaches for `Number` where `BigInt` already works will be asked to change.
- **A new error class updates the README's "What it refuses" table and gets a direct test.**
- **`wdk-staking-kit.manifest.json` is generated.** Run `npm run manifest` after changing `src/terms.js` or `src/staking.js`'s event list; never hand-edit the manifest file.
- **`StakingService` must stay balance-provider-agnostic.** No import of any specific SDK, chain library, or `EXAMPLE_TIERS` inside `src/staking.js` itself — the last test in `test/staking.test.mjs` (a custom, non-`EXAMPLE_TIERS` tier list) exists to catch a regression here.

## Reporting a bug

Open an issue with: the tiers, the lock/close calls you made, and the result you got versus expected. Because `StakingService`'s core logic is deterministic given its inputs, most bug reports can become a single test case — include one if you can.

## Security issues

Not here. See [`SECURITY.md`](SECURITY.md) — **security@flashy.network**, never a public issue.

## License

By contributing, you agree your contribution is licensed under this project's [Apache-2.0 license](LICENSE).
