# app — TipJar frontend (React + TypeScript + Vite)

The frontend for [strk20-tipjar-example](../README.md). A retro 8-bit tip jar
that connects a Starknet wallet, sends a public tip, and shows a live "LATEST
TIPS" wall read from on-chain events.

## Run

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # vitest — pure-helper unit tests
npm run build      # tsc -b && vite build (typecheck + prod build)
```

Out of the box it talks to the live mainnet `TipJar` in `src/config.ts`.

## How it's wired (start here)

The entire Starknet integration is small and lives in three files:

| File | Role |
| --- | --- |
| `src/config.ts` | **All** addresses/network config. Single source of truth. |
| `src/hooks/useTipJar.ts` | All chain wiring: `connectWallet`, `refresh` (read totals + Tipped events), `sendTip` (approve + tip multicall, wait, refresh). |
| `src/lib/tipjar.ts` | Pure, unit-tested helpers: `buildTipCalls`, `parseStrk`/`formatStrk`, `parseTippedEvent`, `TIPPED_SELECTOR`. |

The tip flow: `TipForm` → `useTipJar.sendTip` → wallet signs `approve(STRK) +
tip(jar)` as one multicall → wait for confirmation → re-read totals and events →
`TipWall` re-renders. The coin-flip animation and NES-style sound
(`src/lib/coinFlight.ts`, `src/lib/coinSound.ts`) fire only *after* the tx is
confirmed.

## Where STRK20 will plug in (Part 2)

The private "Tip privately" path will be added as a **new action** using the
STRK20 Wallet API — a pool-internal private transfer to the creator's wallet.
It sits alongside `sendTip` and does **not** modify the public path. Because a
private tip never calls the contract, it never emits `Tipped`, so it never
appears in `TipWall`. See [`../docs/STRK20_INTEGRATION.md`](../docs/STRK20_INTEGRATION.md).

## Stack

Vite + React 19 + TypeScript, [starknet.js](https://starknetjs.com) v10,
[get-starknet](https://github.com/starknet-io/get-starknet) v4. Pixel art is
inline SVG; the coin sound is synthesized with the Web Audio API (no asset).
