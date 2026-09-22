// The terms, published — the page that quotes a rate cites this file
// directly, so a displayed rate is a rate this file states and a test
// checks, never a number typed into copy. `checkTerms` is the offline
// verifier: a stranger with this file and the pinned test can confirm the
// page matches the code without asking the service anything.
//
// Balance-provider-first: a lock earmarks a balance a provider already
// credits (see balance-provider.js); it never touches that provider's
// internal ledger, and it is not itself an entry anywhere until it closes.
// An on-chain contract, or any other settlement layer, is a second, later
// implementation of the same shape described here — not a rewrite of it.

export const EXAMPLE_TIERS = Object.freeze([
  { id: 'flex-30', termDays: 30, aprBasisPoints: 300, minAmount: '10' },
  { id: 'standard-90', termDays: 90, aprBasisPoints: 600, minAmount: '10' },
  { id: 'loyalty-180', termDays: 180, aprBasisPoints: 1000, minAmount: '25' },
  { id: 'loyalty-365', termDays: 365, aprBasisPoints: 1500, minAmount: '50' },
])

/**
 * @typedef {object} Tier
 * @property {string} id
 * @property {number} termDays        the lock period
 * @property {number} aprBasisPoints  annualised rate, in basis points (100 = 1%)
 * @property {string} minAmount       the smallest lock this tier accepts, in the unit's smallest denomination, as an integer string
 */

/** @param {Tier[]} tiers @param {string} id */
export function tierById(tiers, id) {
  return tiers.find((t) => t.id === id) ?? null
}

/**
 * Yield for one tier over its full term, for a small display amount (e.g.
 * "yield on 100 units", for a terms page). Simple interest — no
 * compounding, because a lock earmarks a fixed amount for a fixed term and
 * does not itself grow; a holder who wants compounding relocks the
 * proceeds. Uses `Number`, which is exact at display-sized amounts
 * (hundreds, thousands) but must never be used for the actual amount
 * locked — see {@link yieldForAmount}, which `staking.js` uses instead,
 * precisely to avoid this function's precision limit at real scale.
 * @param {Tier} tier @param {number} amount
 */
export function yieldFor(tier, amount) {
  return (amount * tier.aprBasisPoints * tier.termDays) / (10_000 * 365)
}

/**
 * Yield for one tier over its full term, computed entirely in `BigInt` on
 * an integer-string amount — the function `staking.js` actually calls to
 * credit a real position, so a lock at a real, possibly large amount never
 * loses precision the way a float computation would past
 * `Number.MAX_SAFE_INTEGER`. Floored: a staking kit that credited a
 * fractional base unit would be crediting a unit that does not exist.
 * @param {Tier} tier @param {string} amount  integer string, base units
 * @returns {string} integer string, base units
 */
export function yieldForAmount(tier, amount) {
  const numerator = BigInt(amount) * BigInt(tier.aprBasisPoints) * BigInt(tier.termDays)
  return (numerator / (10_000n * 365n)).toString()
}

/**
 * The whole terms document, in the shape a page renders and a stranger
 * checks. Frozen so nothing downstream can mutate the published set.
 * @param {object} opts
 * @param {Tier[]} opts.tiers
 * @param {string} opts.unit          e.g. "Gold", "USD", "points" — whatever the staked balance is denominated in
 * @param {string} opts.version
 */
export function publishedTerms({ tiers, unit, version }) {
  return Object.freeze({
    contract: 'wdk-staking-kit-terms/1',
    version,
    unit,
    tiers: tiers.map((t) => ({ ...t, yieldOn100: Number(yieldFor(t, 100).toFixed(6)) })),
  })
}

/** @returns {{ok: true} | {ok: false, problems: string[]}} */
export function checkTerms(doc) {
  const problems = []
  if (doc.contract !== 'wdk-staking-kit-terms/1') problems.push('contract must be "wdk-staking-kit-terms/1"')
  if (typeof doc.unit !== 'string' || doc.unit.length === 0) problems.push('unit must be a non-empty string')
  if (!Array.isArray(doc.tiers) || doc.tiers.length === 0) problems.push('tiers must be a non-empty array')
  const ids = new Set()
  for (const t of doc.tiers ?? []) {
    if (ids.has(t.id)) problems.push(`duplicate tier id ${t.id}`)
    ids.add(t.id)
    if (!(t.termDays > 0)) problems.push(`${t.id}: termDays must be positive`)
    if (!(t.aprBasisPoints >= 0)) problems.push(`${t.id}: aprBasisPoints must be non-negative`)
    if (!(typeof t.minAmount === 'string' && /^\d+$/.test(t.minAmount) && BigInt(t.minAmount) > 0n)) problems.push(`${t.id}: minAmount must be a positive integer string`)
  }
  // Longer terms pay at least as well as shorter ones — a terms file that
  // paid less for holding longer would be a page nobody could defend.
  const sorted = [...(doc.tiers ?? [])].sort((a, b) => a.termDays - b.termDays)
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].aprBasisPoints < sorted[i - 1].aprBasisPoints) problems.push(`${sorted[i].id} pays less than the shorter ${sorted[i - 1].id}`)
  }
  return problems.length ? { ok: false, problems } : { ok: true }
}
