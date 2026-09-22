// Locking, on the balance provider, first.
//
// A lock does not move a balance out of the holder's account — it earmarks
// it. The holder's balance stays exactly where the provider already puts
// it, credited to their id; `available()` is what the provider's balance is
// minus what this service has earmarked, so a wallet or a page can show
// "how much can I spend" without asking two services and subtracting by
// hand. This is deliberately not a provider's own hold/release machinery
// (most balance providers expose none); it is a second, small accounting
// layer on top of a balance the provider already tracks, honest about what
// it actually does: it does not touch the provider at all until yield is
// paid.
//
// Yield is paid the one way a BalanceProvider exposes for crediting a
// holder: `credit()`, with a reason on the record. The lock is never itself
// an entry anywhere; only its yield is.
import { tierById, yieldForAmount } from './terms.js'

export class TierNotFoundError extends Error {
  constructor(tierId) { super(`no such tier: ${tierId}`); this.name = 'TierNotFoundError'; this.code = 'TIER_NOT_FOUND' }
}
export class BelowMinimumError extends Error {
  constructor(tierId, min, amount) { super(`${tierId} requires at least ${min}; ${amount} was offered`); this.name = 'BelowMinimumError'; this.code = 'BELOW_MINIMUM' }
}
export class InsufficientAvailableError extends Error {
  constructor(holderId, need, have) { super(`${holderId} has ${have} available (balance minus what is already locked), needs ${need}`); this.name = 'InsufficientAvailableError'; this.code = 'INSUFFICIENT_AVAILABLE' }
}
export class PositionNotFoundError extends Error {
  constructor(id) { super(`no such position: ${id}`); this.name = 'PositionNotFoundError'; this.code = 'POSITION_NOT_FOUND' }
}
export class StillLockedError extends Error {
  constructor(id, until) { super(`${id} is locked until ${until.toISOString()}`); this.name = 'StillLockedError'; this.code = 'STILL_LOCKED' }
}
export class AlreadyClosedError extends Error {
  constructor(id) { super(`${id} is already closed`); this.name = 'AlreadyClosedError'; this.code = 'ALREADY_CLOSED' }
}

export const EVENT_TYPES = Object.freeze(['stake.locked', 'stake.closed'])

export class StakingService {
  /**
   * @param {object} opts
   * @param {import('./balance-provider.js').InMemoryBalanceProvider} opts.provider  or any object shaped like the BalanceProvider interface — see balance-provider.js
   * @param {import('./terms.js').Tier[]} opts.tiers
   * @param {() => Date} [opts.now]
   */
  constructor({ provider, tiers, now = () => new Date() }) {
    if (!provider) throw new Error('StakingService needs a provider (balance + credit)')
    if (!Array.isArray(tiers) || tiers.length === 0) throw new Error('StakingService needs at least one tier')
    this.provider = provider
    this.tiers = tiers
    this.now = now
    /** @type {Map<string, object>} */
    this.positions = new Map()
    let seq = 0
    this.nextId = () => `stake_${(++seq).toString().padStart(6, '0')}`
    /** @type {Map<string, Set<(payload: object) => void>>} */
    this._listeners = new Map()
  }

  /**
   * Subscribe to a lock/close event. Returns an unsubscribe function.
   * @param {'stake.locked'|'stake.closed'} type
   * @param {(payload: object) => void} handler
   */
  on(type, handler) {
    if (!EVENT_TYPES.includes(type)) throw new Error(`unknown event type: ${type}`)
    if (!this._listeners.has(type)) this._listeners.set(type, new Set())
    this._listeners.get(type).add(handler)
    return () => this._listeners.get(type)?.delete(handler)
  }

  /** @private */
  _emit(type, payload) {
    for (const handler of this._listeners.get(type) ?? []) handler(payload)
  }

  /** The sum of a holder's open locks, across all tiers, as an integer string. */
  locked(holderId) {
    let sum = 0n
    for (const p of this.positions.values()) if (p.holderId === holderId && p.status === 'locked') sum += BigInt(p.amount)
    return sum.toString()
  }

  /** What the provider says the holder has, minus what is already earmarked. */
  async available(holderId) {
    const balance = BigInt(await this.provider.balance(holderId))
    return (balance - BigInt(this.locked(holderId))).toString()
  }

  /**
   * Lock a balance into a tier. Refuses below the tier's minimum, and
   * refuses to earmark more than the provider's own balance can cover once
   * this holder's other open locks are counted.
   * @param {{ holderId: string, tierId: string, amount: string, idempotencyKey: string }} cmd
   */
  async lock({ holderId, tierId, amount, idempotencyKey }) {
    const tier = tierById(this.tiers, tierId)
    if (!tier) throw new TierNotFoundError(tierId)
    if (!(typeof amount === 'string' && /^\d+$/.test(amount) && BigInt(amount) > 0n)) throw new Error('amount must be a positive integer string')
    if (BigInt(amount) < BigInt(tier.minAmount)) throw new BelowMinimumError(tierId, tier.minAmount, amount)
    if (!idempotencyKey) throw new Error('idempotencyKey is required')
    const available = BigInt(await this.available(holderId))
    if (available < BigInt(amount)) throw new InsufficientAvailableError(holderId, amount, available.toString())

    const startedAt = this.now()
    const maturesAt = new Date(startedAt.getTime() + tier.termDays * 86_400_000)
    const id = this.nextId()
    const position = Object.freeze({
      id, holderId, tierId, amount, startedAt, maturesAt,
      idempotencyKey, status: 'locked',
    })
    this.positions.set(id, position)
    this._emit('stake.locked', { position })
    return position
  }

  /** @param {string} id */
  position(id) {
    const p = this.positions.get(id)
    if (!p) throw new PositionNotFoundError(id)
    return p
  }

  /**
   * Pay yield and close the position, once it has matured. The yield is
   * computed from the terms at the moment the position was opened — a
   * later change to the tier list never reaches back into an open lock —
   * and paid through the provider's `credit()`, so it lands as a normal,
   * reason-carrying credit a stranger reading the provider's own history
   * can see. Computed in `BigInt` throughout — see `terms.js`'s
   * `yieldForAmount` — so a lock at a real, large amount never loses
   * precision, and floored: a staking kit that credited a fractional base
   * unit would be crediting a unit that does not exist.
   * @param {string} positionId
   */
  async close(positionId) {
    const p = this.position(positionId)
    if (p.status === 'closed') throw new AlreadyClosedError(positionId)
    if (this.now() < p.maturesAt) throw new StillLockedError(positionId, p.maturesAt)
    const tier = tierById(this.tiers, p.tierId)
    const yieldAmount = yieldForAmount(tier, p.amount)
    await this.provider.credit({
      holderId: p.holderId, amount: yieldAmount,
      reason: { type: 'staking-yield', id: positionId },
      idempotencyKey: `staking-yield:${positionId}`,
    })
    const closed = Object.freeze({ ...p, status: 'closed', closedAt: this.now(), yieldPaid: yieldAmount })
    this.positions.set(positionId, closed)
    this._emit('stake.closed', { position: closed })
    return closed
  }

  /** Everything a holder has open or has closed, for a screen or a statement. */
  positionsFor(holderId) {
    return [...this.positions.values()].filter((p) => p.holderId === holderId)
  }
}
