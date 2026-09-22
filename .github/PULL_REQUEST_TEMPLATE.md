## What this changes

<!-- One or two sentences. If this touches yield math or lock/close semantics, say exactly what changes. -->

## Why

<!-- The real scenario this was written against. -->

## Checklist

- [ ] `npm test` passes (`node --test`, no external services)
- [ ] `npm run check` passes (generated manifest is current — run `node src/manifest.js --write` if not)
- [ ] Any change to yield math uses `yieldForAmount()` (BigInt), never `yieldFor()` (Number) — see `ARCHITECTURE.md`
- [ ] `lock()`/`close()` idempotency is preserved — a retried call must not double-lock or double-pay
- [ ] README / `ARCHITECTURE.md` updated if this changes documented behaviour
