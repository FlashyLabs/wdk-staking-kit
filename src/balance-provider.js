// The interface StakingService depends on — two methods, not a whole
// ledger. See ARCHITECTURE.md for why the surface is this small.

/**
 * @typedef {object} BalanceProvider
 * @property {(holderId: string) => Promise<string>} balance
 *   The holder's current balance, as an integer string in the unit's
 *   smallest denomination.
 * @property {(cmd: {holderId: string, amount: string, reason: {type: string, id: string}, idempotencyKey: string}) => Promise<unknown>} credit
 *   Credits the holder's balance. Must be idempotent on idempotencyKey — the
 *   same key credits once, however many times it is called.
 */

/**
 * A reference implementation for tests, demos, and getting started. Not
 * meant for production use as-is — wire a real BalanceProvider backed by
 * your own accounting or a WDK wallet's balance in its place; StakingService
 * never needs to change when you do.
 */
export class InMemoryBalanceProvider {
  /** @param {Record<string, string>} [balances] holderId -> integer string */
  constructor(balances = {}) {
    this.balances = new Map(Object.entries(balances))
    /** @type {Array<{holderId: string, amount: string, reason: object, idempotencyKey: string}>} */
    this.credited = []
  }

  /** @param {string} holderId */
  async balance(holderId) {
    return this.balances.get(holderId) ?? '0'
  }

  /**
   * @param {{holderId: string, amount: string, reason: {type: string, id: string}, idempotencyKey: string}} cmd
   */
  async credit({ holderId, amount, reason, idempotencyKey }) {
    if (!(BigInt(amount) >= 0n)) throw new Error('amount must be non-negative')
    if (!idempotencyKey) throw new Error('idempotencyKey is required')
    if (!reason?.type) throw new Error('reason.type is required')
    const existing = this.credited.find((c) => c.idempotencyKey === idempotencyKey)
    if (existing) return existing
    const current = BigInt(this.balances.get(holderId) ?? '0')
    this.balances.set(holderId, (current + BigInt(amount)).toString())
    const entry = { holderId, amount, reason, idempotencyKey }
    this.credited.push(entry)
    return entry
  }
}
