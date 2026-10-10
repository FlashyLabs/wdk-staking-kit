// The invariants in INVARIANTS.md, driven against the REAL StakingService with
// the estate's invariants/1 harness (vendor-invariants.mjs):
//
//   interleave()      every ordered pair of lock / lock-with-the-same-key /
//                     lock-with-a-conflicting-payload / close / tierChange,
//                     under every schedule, including across the clock;
//   property()        random command sequences with a 400-day tick, shrunk
//                     to the fewest commands on failure;
//   expectViolation() one deliberately broken variant per invariant, which
//                     the harness MUST refuse — a harness that has never
//                     failed has proved nothing.
//
// Every operation is a real call on the service. The harness keeps its own
// memory of what was agreed (`agreed`, the live tier's terms at the moment a
// lock was recorded) and what was answered (`log`), so no invariant trusts a
// field the component wrote about itself.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { property, interleave, expectViolation, checkInvariantsDoc } from '../vendor-invariants.mjs'
import { StakingService } from '../src/staking.js'
import { InMemoryBalanceProvider } from '../src/balance-provider.js'
import { EXAMPLE_TIERS, tierById, yieldForAmount } from '../src/terms.js'

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)))
const DAY = 86_400_000
const T0 = Date.parse('2026-01-01T00:00:00.000Z')
const HOLDER = 'alice'
const BALANCE = '1000000'
const TIER = 'flex-30'

// ── the system under test ───────────────────────────────────────────────────
// A fresh service per schedule: alice holds 1,000,000; one position (P0,
// 200,000 in flex-30) is already open and matured; the clock is `sys.t`.
async function build(Service = StakingService) {
  const tiers = EXAMPLE_TIERS.map((t) => ({ ...t }))
  const provider = new InMemoryBalanceProvider({ [HOLDER]: BALANCE })
  const sys = { t: T0, tiers, provider, agreed: new Map(), log: [], closes: [], closedEvents: [] }
  sys.svc = new Service({ provider, tiers, now: () => new Date(sys.t) })
  sys.svc.on('stake.locked', ({ position }) => {
    const live = tierById(tiers, position.tierId)
    sys.agreed.set(position.id, { aprBasisPoints: live.aprBasisPoints, termDays: live.termDays })
  })
  sys.svc.on('stake.closed', ({ position }) => sys.closedEvents.push(position.id))
  sys.p0 = await sys.svc.lock({ holderId: HOLDER, tierId: TIER, amount: '200000', idempotencyKey: 'p0' })
  sys.t += 31 * DAY
  return sys
}

// Every lock answer is logged in the order the service gave it, so the
// idempotency invariant can read what a key was told across the whole run.
const lock = (amount, key) => async (sys) => {
  try {
    const p = await sys.svc.lock({ holderId: HOLDER, tierId: TIER, amount, idempotencyKey: key })
    sys.log.push({ key, amount, ok: true, id: p.id })
    return p
  } catch (err) {
    sys.log.push({ key, amount, ok: false, code: err.code ?? err.name })
    throw err
  }
}

// Close the newest open position (P0 when nothing else is open), logging
// which position each successful close was for.
const closeNewest = async (sys) => {
  const open = sys.svc.positionsFor(HOLDER).filter((p) => p.status === 'locked')
  const target = open.length ? open[open.length - 1] : sys.p0
  const closed = await sys.svc.close(target.id)
  sys.closes.push(target.id)
  return closed
}

const tierChange = (factor = 10) => async (sys) => { tierById(sys.tiers, TIER).aprBasisPoints *= factor }
const tick = async (sys) => { sys.t += 400 * DAY }

const OPS = [
  { name: 'lockA', run: lock('800000', 'a') },
  { name: 'lockB', run: lock('800000', 'b') },
  { name: 'lockA-conflict', run: lock('700000', 'a') }, // the same key, a different command — and one that fits, so the conflict is what refuses it
  { name: 'close', run: closeNewest },
  { name: 'tierChange', run: tierChange() },
]

// ── the invariants ──────────────────────────────────────────────────────────

/** I-1: the sum of open locks never exceeds what the provider says the holder has. */
async function neverOverReserve(sys) {
  const locked = BigInt(sys.svc.locked(HOLDER))
  const balance = BigInt(await sys.provider.balance(HOLDER))
  return locked > balance ? [`I-1: ${locked} locked against a balance of ${balance}`] : []
}

/** I-2: one position per (holder, key); a replayed command answers the same position; a changed command is a conflict. */
function idempotentLock(sys) {
  const out = []
  const byKey = new Map()
  for (const p of sys.svc.positions.values()) {
    const k = `${p.holderId}|${p.idempotencyKey}`
    if (byKey.has(k)) out.push(`I-2: key ${p.idempotencyKey} opened both ${byKey.get(k)} and ${p.id}`)
    byKey.set(k, p.id)
  }
  const first = new Map()
  for (const e of sys.log) {
    const f = first.get(e.key)
    if (!f) { if (e.ok) first.set(e.key, e); continue }
    if (e.amount === f.amount) {
      if (!e.ok || e.id !== f.id) out.push(`I-2: key ${e.key} replayed ${e.amount} and was answered ${e.ok ? e.id : e.code} instead of ${f.id}`)
    } else if (e.ok || e.code !== 'IDEMPOTENCY_CONFLICT') {
      out.push(`I-2: key ${e.key} was reused for ${e.amount} after ${f.amount} and was ${e.ok ? `given ${e.id}` : `refused ${e.code}`}, not IDEMPOTENCY_CONFLICT`)
    }
  }
  return out
}

/** I-3: a closed position paid exactly the yield of the terms live when it was recorded. */
function termsFixed(sys) {
  const out = []
  for (const p of sys.svc.positions.values()) {
    if (p.status !== 'closed') continue
    const expected = yieldForAmount(sys.agreed.get(p.id), p.amount)
    if (p.yieldPaid !== expected) out.push(`I-3: ${p.id} paid ${p.yieldPaid}; the terms agreed at lock pay ${expected}`)
  }
  return out
}

/** I-4: a position closes at most once — one successful close, one credit, one stake.closed. */
function closesOnce(sys) {
  const out = []
  for (const p of sys.svc.positions.values()) {
    const closes = sys.closes.filter((id) => id === p.id).length
    const credits = sys.provider.credited.filter((c) => c.reason.type === 'staking-yield' && c.reason.id === p.id).length
    const events = sys.closedEvents.filter((id) => id === p.id).length
    if (closes > 1) out.push(`I-4: ${p.id} was closed successfully ${closes} times`)
    if (credits > 1) out.push(`I-4: ${p.id} was credited yield ${credits} times`)
    if (events > 1) out.push(`I-4: stake.closed fired ${events} times for ${p.id}`)
    if (p.status === 'locked' && (closes || credits || events)) out.push(`I-4: ${p.id} is still locked yet was closed, credited or announced`)
  }
  return out
}

async function all(sys) {
  return [...(await neverOverReserve(sys)), ...idempotentLock(sys), ...termsFixed(sys), ...closesOnce(sys)]
}

// ── the real component, every pair, every schedule ──────────────────────────

test('interleave: every pair of lock, same-key lock, conflicting lock, close and tierChange holds every invariant under every schedule, across the clock too', async () => {
  const r = await interleave({ setup: build, ops: OPS, invariants: all, tick })
  assert.equal(r.pairs, 25, 'five ops, every ordered pair, self-pairs included')
  assert.equal(r.schedules, 175, 'seven schedules per pair — five, plus two across the clock')
})

test('interleave: a replayed lock answers the same position in every schedule, and a conflicting replay is refused without opening anything', async () => {
  // Pin the shape, not only the absence of a violation: the self-pair must
  // settle as two successes with one id, and the conflicting pair as one
  // success and one IDEMPOTENCY_CONFLICT, whichever started first.
  await interleave({
    setup: build,
    ops: OPS,
    pairs: [['lockA', 'lockA'], ['lockA', 'lockA-conflict'], ['lockA-conflict', 'lockA']],
    invariants: (sys, { results, a, b }) => {
      const out = idempotentLock(sys)
      const oks = results.filter((x) => x.ok)
      if (a === b) {
        if (oks.length !== 2 || oks[0].value.id !== oks[1].value.id) out.push(`self-pair ${a}: ${JSON.stringify(results)}`)
      } else if (oks.length !== 1 || !results.some((x) => !x.ok && /idempotency key a was already used/.test(x.error))) {
        out.push(`${a}/${b}: expected one success and one conflict, got ${JSON.stringify(results)}`)
      }
      if (sys.svc.positionsFor(HOLDER).length !== 2) out.push(`${sys.svc.positionsFor(HOLDER).length} positions, expected P0 and one more`)
      return out
    },
  })
})

// ── the real component, random sequences, shrunk on failure ─────────────────

test('property: random lock / close / tierChange / tick sequences hold every invariant (seeded, so a failure replays)', async () => {
  const r = await property({
    setup: build,
    commands: [
      { name: 'lock', gen: (r) => ({ key: r.pick(['k1', 'k2', 'k3']), amount: r.pick(['300000', '400000', '600000']) }), run: (sys, { key, amount }) => lock(amount, key)(sys) },
      {
        name: 'close',
        gen: (r) => ({ pick: r.int(6) }),
        run: async (sys, { pick }) => {
          // Any position, open or closed, so AlreadyClosedError and StillLockedError are both in play.
          const ps = sys.svc.positionsFor(HOLDER)
          const target = ps[pick % ps.length]
          const closed = await sys.svc.close(target.id)
          sys.closes.push(target.id)
          return closed
        },
      },
      { name: 'tierChange', gen: (r) => ({ factor: r.pick([2, 10]) }), run: (sys, { factor }) => tierChange(factor)(sys) },
    ],
    invariants: all,
    tick,
    runs: 150, maxLen: 10, seed: 20261010,
  })
  assert.equal(r.runs, 150)
  assert.ok(r.commands > 500, `the runs were cut short: ${r.commands} commands`)
})

// ── the mutation checks: one broken variant per invariant ───────────────────
// Each variant is the component with one guard removed. The harness must
// refuse every one of them, or a green run above means nothing.

test('mutation: a lock whose body runs outside the per-holder chain over-reserves, and the harness sees it in exactly the started-together schedules', async () => {
  class Unserialised extends StakingService { _serial(holderId, fn) { return fn() } }
  const err = await expectViolation(() => interleave({ setup: () => build(Unserialised), ops: OPS, pairs: [['lockA', 'lockB']], invariants: neverOverReserve }), { match: /I-1: 1800000 locked against a balance of 1000000/ })
  assert.deepEqual(err.failures.map((f) => f.pattern).sort(), ['a||b', 'b||a'], 'sequential and yielded schedules pass; both started-together schedules over-reserve')
})

test('mutation: a dedupe map that is never consulted opens a second lock for a replayed key, and the harness sees it in every schedule', async () => {
  class Forgetful extends StakingService {
    constructor(opts) { super(opts); this.byKey.get = () => undefined } // every lookup misses
  }
  const err = await expectViolation(() => interleave({ setup: () => build(Forgetful), ops: OPS, pairs: [['lockA', 'lockA'], ['lockA', 'lockA-conflict']], invariants: idempotentLock }), { match: /I-2: key a/ })
  assert.equal(err.failures.length, 10, 'this is not a race: every schedule of both pairs fails')
  assert.ok(err.failures.some((f) => /replayed 800000 and was answered INSUFFICIENT_AVAILABLE/.test(f.violations.join())), 'a replay refused instead of answered')
  assert.ok(err.failures.some((f) => /not IDEMPOTENCY_CONFLICT/.test(f.violations.join())), 'a changed command admitted or refused for the wrong reason')
})

test('mutation: a close that prices from the live tier list pays the changed rate, and the harness sees it wherever the change lands before the pricing', async () => {
  class LiveTerms extends StakingService {
    position(id) {
      const p = super.position(id)
      const live = tierById(this.tiers, p.tierId)
      return { ...p, terms: { aprBasisPoints: live.aprBasisPoints, termDays: live.termDays } }
    }
  }
  const err = await expectViolation(() => interleave({ setup: () => build(LiveTerms), ops: OPS, pairs: [['tierChange', 'close']], invariants: termsFixed }), { match: /I-3: stake_000001 paid 4931; the terms agreed at lock pay 493/ })
  const patterns = err.failures.map((f) => f.pattern).sort()
  assert.ok(patterns.includes('a;b'), 'tierChange then close pays the new rate')
  assert.ok(!patterns.includes('b;a'), 'close then tierChange is priced before the change and passes')
  // b||a fails too: close() queues its body behind the per-holder chain, so a
  // tierChange started right after it still lands before the pricing runs.
  assert.deepEqual(patterns, ['a;b', 'a|y|b', 'a||b', 'b||a'])
})

test('mutation: a close that bypasses the per-holder chain fulfils twice and announces twice, and the harness sees it in exactly the started-together schedules', async () => {
  class UnserialisedClose extends StakingService { close(id) { return this._close(id) } }
  const err = await expectViolation(() => interleave({ setup: () => build(UnserialisedClose), ops: OPS, pairs: [['close', 'close']], invariants: closesOnce }), { match: /I-4: stake_000001 was closed successfully 2 times/ })
  assert.match(err.message, /stake\.closed fired 2 times/)
  assert.deepEqual(err.failures.map((f) => f.pattern).sort(), ['a||b', 'b||a'])
})

test('mutation: property() finds the live-terms close from random sequences and shrinks it to tierChange, close', async () => {
  class LiveTerms extends StakingService {
    position(id) {
      const p = super.position(id)
      const live = tierById(this.tiers, p.tierId)
      return { ...p, terms: { aprBasisPoints: live.aprBasisPoints, termDays: live.termDays } }
    }
  }
  const err = await expectViolation(() => property({
    setup: () => build(LiveTerms),
    commands: [
      { name: 'lock', gen: (r) => ({ amount: r.pick(['300000', '400000']) }), run: (sys, { amount }) => lock(amount, `k${sys.log.length}`)(sys) },
      { name: 'close', gen: () => ({}), run: (sys) => closeNewest(sys) },
      { name: 'tierChange', gen: () => ({}), run: tierChange() },
    ],
    invariants: termsFixed,
    tick,
    runs: 100, maxLen: 8, seed: 7,
  }), { match: /I-3/ })
  assert.deepEqual(err.sequence.map((s) => s.name), ['tierChange', 'close'], 'the minimal failing sequence is the defect itself')
  assert.equal(err.seed, 7)
})

// ── the document ────────────────────────────────────────────────────────────

test('INVARIANTS.md holds: numbered from I-1 without a gap, four parts each, and every cited test exists verbatim in the suite', () => {
  const doc = readFileSync(join(ROOT, 'INVARIANTS.md'), 'utf8')
  const sources = readdirSync(join(ROOT, 'test')).filter((f) => f.endsWith('.test.mjs')).map((f) => readFileSync(join(ROOT, 'test', f), 'utf8')).join('\n')
  const r = checkInvariantsDoc(doc, sources)
  assert.deepEqual(r.problems, [])
  assert.equal(r.valid, true)
  assert.deepEqual(r.invariants.map((i) => i.id), ['I-1', 'I-2', 'I-3', 'I-4'])
  assert.ok(r.citations.length >= 8, `${r.citations.length} citations`)
})
