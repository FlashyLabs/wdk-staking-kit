#!/usr/bin/env node
// wdk-staking-kit.manifest.json — generated from the published example
// terms and the service's own refusals; never written by hand.
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { EXAMPLE_TIERS, publishedTerms } from './terms.js'
import { EVENT_TYPES } from './staking.js'

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)))

export function build() {
  const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'))
  const terms = publishedTerms({ tiers: EXAMPLE_TIERS, unit: 'example-unit', version: '0.1.0' })
  return {
    contract: 'wdk-staking-kit-manifest/1',
    name: '@flashylabs/wdk-staking-kit',
    module: { package: pkg.name, version: pkg.version },
    posture: {
      stage: 'balance-provider-first',
      note: 'a lock earmarks a balance the provider already credits to the holder; it does not touch that provider\'s internal ledger. Yield is paid through the provider\'s credit(), with a reason on the record.',
      onChainSettlement: 'out of scope for this package — a contract or any other settlement layer is a second, later implementation of the terms this package publishes, adopted separately.',
    },
    exampleTerms: terms,
    events: EVENT_TYPES,
    refuses: [
      'a lock below the tier\'s minimum, with a reason',
      'to lock more than the holder\'s available balance — balance minus what is already locked',
      'to close a position before it matures',
      'to close the same position twice',
      'to change a matured lock\'s yield after the fact — it is computed from the terms in force when the lock was opened',
      'a non-positive amount, or an amount that is not an integer string',
    ],
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const out = join(ROOT, 'wdk-staking-kit.manifest.json')
  const text = JSON.stringify(build(), null, 2) + '\n'
  if (process.argv.includes('--write')) { writeFileSync(out, text); console.log('wrote wdk-staking-kit.manifest.json') }
  else if (process.argv.includes('--check')) { const ok = readFileSync(out, 'utf8') === text; console.log(ok ? 'ok — manifest current' : 'STALE — run npm run manifest'); process.exit(ok ? 0 : 1) }
  else process.stdout.write(text)
}
