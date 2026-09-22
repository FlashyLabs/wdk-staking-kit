# Contributing

Thank you for looking. This package is small on purpose — most of what you need to know is enforced by tests rather than described here.

## Getting set up

```bash
npm install
npm test          # node's built-in test runner
npm run check     # confirms the generated manifest is current
```

No build step, no external services, no network access needed to develop or test this package.

## Before you open a pull request

- **`npm test` must pass.** Every exported function needs direct coverage.
- **Amounts stay strings, and yield math stays `BigInt`.** Never introduce a `Number` for `amount`, `minAmount`, or anywhere yield is computed for a real position — see `ARCHITECTURE.md`'s note on `yieldFor` versus `yieldForAmount`. A change that reaches for `Number` where `BigInt` already works will be asked to change.
- **A new error class updates the README's "What it refuses" table and gets a direct test.**
- **`wdk-staking-kit.manifest.json` is generated.** Run `npm run manifest` after changing `src/terms.js` or `src/staking.js`'s event list; never hand-edit the manifest file.
- **`StakingService` must stay balance-provider-agnostic.** No import of any specific SDK, chain library, or `EXAMPLE_TIERS` inside `src/staking.js` itself — the last test in `test/staking.test.mjs` (a custom, non-`EXAMPLE_TIERS` tier list) exists to catch a regression here.

## GitHub Actions are pinned by commit SHA, not by tag

Every `uses:` line in `.github/workflows/` names a full 40-character commit SHA, with the version as a trailing `# vX.Y.Z` comment — never a floating tag like `@v4`. A tag can be retargeted upstream, by the action's own maintainer or by an attacker who compromises their account; a commit SHA can't move. `test/workflow-pins.test.mjs` enforces this as a real, failing test, not just a convention someone might forget.

Dependabot (`.github/dependabot.yml`) understands this convention specifically for GitHub Actions: when a pinned action ships a new release, it opens a PR bumping both the SHA and the version comment together, so the pin never silently goes stale either.

`.github/workflows/codeql.yml` and `.github/workflows/scorecard.yml` run GitHub's static analysis and the OpenSSF Scorecard respectively — both read-only, both already green, both checkable independently rather than taken on trust.

## Reporting a bug

Open an issue with: the tiers, the lock/close calls you made, and the result you got versus expected. Because `StakingService`'s core logic is deterministic given its inputs, most bug reports can become a single test case — include one if you can.

## Security issues

Not here. See [`SECURITY.md`](SECURITY.md) — **security@flashy.network**, never a public issue.

## License

By contributing, you agree your contribution is licensed under this project's [Apache-2.0 license](LICENSE).
