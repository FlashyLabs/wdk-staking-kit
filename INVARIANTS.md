# Invariants — `@flashylabs/wdk-staking-kit`

What this component guarantees about money, each enforced by a named piece of
code and proved by a named test. The document is itself checked:
`node vendor-invariants.mjs check .` (the estate's `invariants/1` harness,
vendored byte-for-byte from spec-kit) fails when a heading, a part or a
citation below is missing, or when a citation names a test that does not exist
in `test/`. `test/invariants.test.mjs` drives the real `StakingService` through
every ordered pair of operations under every schedule, through random command
sequences across a 400-day clock, and — for each invariant — through a
deliberately broken variant the harness must refuse. A harness that has never
failed has proved nothing.

Every one of the four was, or would have been, a passing suite with a defect
behind it. The first three were reproduced by an external audit on
2026-10-10 and fixed at 0.2.0; the fourth was found by this harness the same
day, on the code that had just fixed the other three.

## I-1 · Never over-reserve

**Claim.** The sum of a holder's open locks never exceeds the balance the
provider reports for them, under any interleaving of `lock()` calls.

**Why.** A lock earmarks a balance the provider already holds; the whole point
of `available()` is that a wallet can trust it. Two locks of 80 against a
balance of 100 both succeeded before 0.2.0, because both read the balance
before either was recorded — the guarantee held for one lock at a time and
broke for a pair.

**Enforced by.** `lock()` runs its body through `_serial(holderId, …)`
(`src/staking.js`), a per-holder promise chain: the read of `available()` and
the recording of the position are one step, so no second lock for the same
holder reads the balance before the first is recorded. Different holders do
not wait on each other.

**Proved by.** `test/staking.test.mjs` › *lock: two concurrent locks cannot reserve more than the balance — 80 + 80 against 100 admits exactly one*
and › *lock: many concurrent locks never earmark past the balance, and locks for different holders do not wait on each other*;
`test/invariants.test.mjs` › *interleave: every pair of lock, same-key lock, conflicting lock, close and tierChange holds every invariant under every schedule, across the clock too*,
› *property: random lock / close / tierChange / tick sequences hold every invariant (seeded, so a failure replays)*,
and the mutation check › *mutation: a lock whose body runs outside the per-holder chain over-reserves, and the harness sees it in exactly the started-together schedules*.

## I-2 · Idempotent lock

**Claim.** A `(holderId, idempotencyKey)` opens at most one position. The same
key with the same command — however many times, however interleaved — returns
that one position and emits no second `stake.locked`. The same key with a
different tier or amount is refused with `IdempotencyConflictError`
(`IDEMPOTENCY_CONFLICT`) and nothing is created or overwritten.

**Why.** An idempotency key exists for the retry after a dropped response. A
retry that opens a second lock earmarks the holder's balance twice for one
intent; a retry that silently overwrites the first turns a stale client into
a way to change what was agreed.

**Enforced by.** `_lock()` consults `byKey` (`` `${holderId}|${idempotencyKey}` ``
→ position id) before it reads the balance, returns the recorded position when
the tier and amount match, throws `IdempotencyConflictError` when they do not,
and records the key in the same step as the position — inside the per-holder
chain of I-1, so two replays cannot both miss the map.

**Proved by.** `test/staking.test.mjs` › *lock: the same idempotency key repeated returns the same position and opens no second lock*,
› *lock: the same idempotency key with a different command is a conflict, not a silent second lock*
and › *lock: the same idempotency key is scoped to the holder*;
`test/invariants.test.mjs` › *interleave: a replayed lock answers the same position in every schedule, and a conflicting replay is refused without opening anything*
and the mutation check › *mutation: a dedupe map that is never consulted opens a second lock for a replayed key, and the harness sees it in every schedule*.

## I-3 · Terms fixed at agreement

**Claim.** The yield a position pays at `close()` is computed from the tier
terms (`aprBasisPoints`, `termDays`) in force at the moment the lock was
recorded. A later change to the tier list changes no existing position's
yield.

**Why.** A lock is a bargain: this amount, this term, this rate. Before 0.2.0
`close()` priced from the tier list as it stood at close, so a rate raised
tenfold after the lock paid tenfold — and a rate cut would have paid a holder
less than they were promised.

**Enforced by.** `_lock()` freezes `terms: { aprBasisPoints, termDays }` into
the position (`Object.freeze`), and `_close()` prices with
`yieldForAmount(p.terms, p.amount)` — never from `this.tiers`.

**Proved by.** `test/staking.test.mjs` › *close: yield is priced from the terms frozen into the position, not the tier list as it stands at close*
and › *close: pays yield through provider.credit(), computed from the tier at lock time, and frees the earmark*;
`test/invariants.test.mjs` › *interleave: every pair of lock, same-key lock, conflicting lock, close and tierChange holds every invariant under every schedule, across the clock too*,
the mutation check › *mutation: a close that prices from the live tier list pays the changed rate, and the harness sees it wherever the change lands before the pricing*,
and › *mutation: property() finds the live-terms close from random sequences and shrinks it to tierChange, close*.

## I-4 · A position closes once

**Claim.** Of any number of `close()` calls for one position, however
interleaved, exactly one succeeds; every other is refused with
`AlreadyClosedError`. The yield is credited once and `stake.closed` fires once.

**Why.** Found by this harness on 2026-10-10: two closes of one matured
position started together both passed the `status === 'closed'` check, both
awaited the provider's `credit()`, both fulfilled, and `stake.closed` fired
twice — the same shape as I-1, a check and a write either side of an await.
Only the provider's idempotency key stood between the holder and a second
payment, and a subscriber acting on `stake.closed` would have acted twice.

**Enforced by.** `close()` runs `_close()` through the same per-holder chain
`lock()` uses, `_serial(holderId, …)`, so the status check and the write are
one step and the second close reads `closed`. The provider's own idempotency on
`staking-yield:${positionId}` remains a second, independent guard.

**Proved by.** `test/staking.test.mjs` › *close: two concurrent closes of one position admit exactly one — the yield is credited once and stake.closed fires once*
and › *close: refuses to close the same position twice*;
`test/invariants.test.mjs` › *interleave: every pair of lock, same-key lock, conflicting lock, close and tierChange holds every invariant under every schedule, across the clock too*
and the mutation check › *mutation: a close that bypasses the per-holder chain fulfils twice and announces twice, and the harness sees it in exactly the started-together schedules*.
