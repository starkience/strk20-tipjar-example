# Architecture

How the pieces fit today (Part 1, public), and exactly what STRK20 changes
(Part 2, private).

## Components

```
┌─────────────────────────────────────────────────────────────┐
│  app/ (React + starknet.js)                                  │
│                                                              │
│  TipForm ──▶ useTipJar.sendTip ──▶ wallet signs multicall    │
│                     │                                        │
│                     ▼                                        │
│         approve(STRK, jar, amount)                           │
│         tip(jar, amount)          ── one transaction ──┐     │
│                                                        │     │
│  TipWall ◀── useTipJar.refresh ◀── read get_total()    │     │
│                              ◀── read Tipped events    │     │
└────────────────────────────────────────────────────────┼────┘
                                                         ▼
┌─────────────────────────────────────────────────────────────┐
│  contracts/ TipJar (Cairo, on mainnet)                       │
│                                                              │
│  tip(amount):                                                │
│    STRK.transfer_from(caller → owner, amount)  (no custody)  │
│    total += amount; count += 1                               │
│    emit Tipped { tipper, amount, timestamp }                 │
└─────────────────────────────────────────────────────────────┘
```

## Data flow (public tip)

1. User enters an amount and submits `TipForm`.
2. `useTipJar.sendTip` builds a **multicall** with `buildTipCalls`:
   `approve(STRK → jar)` then `tip(jar)`. Approve is required because a contract
   cannot pull your ERC-20 without prior allowance.
3. The wallet signs once; the tx is submitted and awaited to confirmation.
4. `refresh` re-reads `get_total()` (storage) and the `Tipped` events (log), and
   `TipWall` re-renders. Totals come from storage; the list comes from events.

## Why this shape

- **All chain logic in one hook (`useTipJar`).** Everything Starknet-specific is
  in one place, so the STRK20 addition has an obvious home and the "diff" is
  legible.
- **Pure helpers are isolated and tested (`lib/tipjar.ts`).** Calldata encoding,
  STRK↔wei math, and event decoding have no React or network dependency, so
  they're unit-tested directly.
- **Addresses in one file (`config.ts`).** Re-point the app at any deployment by
  editing one object.

## What STRK20 changes (Part 2)

The public path above is untouched. A **second, parallel** action is added:

```
"Tip privately":
  useTipJar (or a sibling hook) ──▶ STRK20 Wallet API (via the user's wallet)
                                     │
                                     ▼
                     pool-internal private transfer  ──▶ creator's registered wallet
```

Key properties, and the invariants Part 2 must preserve:

- The private path uses the **Starknet Wallet API** — the wallet manages viewing
  keys, notes, and proofs. **No custom Cairo, no anonymizer contract** for this
  flow (a plain private transfer to a wallet is a pure Wallet-API primitive).
- It **does not call `TipJar`** and **emits no `Tipped` event** → private tips
  never appear in `TipWall`. The public "LATEST TIPS" wall keeps showing only
  public tips.
- The public `sendTip` path keeps working exactly as before.

What stays visible even for private tips: the pool's public edges (a shield
deposit or a withdraw are public ERC-20 legs) and timing. What's hidden: the
link between tipper and creator, and the amount of the private transfer.

The blow-by-blow implementation is logged in
[`STRK20_INTEGRATION.md`](STRK20_INTEGRATION.md).
