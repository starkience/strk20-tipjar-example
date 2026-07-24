# AGENTS.md

Orientation for coding agents (and humans in a hurry) working in this repo.
Read this before making changes.

## What this repo is

A teaching example of integrating **STRK20** (Starknet privacy) into an ordinary
app. It has two parts:

1. **Part 1 (done):** a public tip jar — `TipJar` Cairo contract + React
   frontend, live on Starknet mainnet.
2. **Part 2 (next):** add a **private** tipping path with the STRK20 Wallet API,
   documenting every step in [`docs/STRK20_INTEGRATION.md`](docs/STRK20_INTEGRATION.md).

Optimize every change for a reader trying to learn *how STRK20 is integrated*.
Clarity and comments matter more than cleverness.

## Layout

| Path | What |
| --- | --- |
| `contracts/src/tipjar.cairo` | The TipJar contract (public tipping). No custody, no admin. |
| `contracts/src/mock_erc20.cairo` | Test-only ERC-20 for unit tests. Not deployed to mainnet. |
| `contracts/tests/` | `snforge` tests. |
| `app/src/config.ts` | **All** on-chain addresses and network config. Single source of truth. |
| `app/src/hooks/useTipJar.ts` | All Starknet wiring: connect, read totals/events, send the tip multicall. |
| `app/src/lib/tipjar.ts` | Pure helpers (calldata, STRK parsing, event decoding). Unit-tested. |
| `app/src/components/` | `TipForm`, `TipWall`. Presentation only. |
| `docs/` | Architecture, deployment record, and the STRK20 integration log. |

## Commands

```bash
# Contracts (Scarb 2.16, Starknet Foundry 0.56)
cd contracts && scarb build && snforge test      # 7 tests

# Frontend (Node 20+)
cd app && npm install
npm run dev        # http://localhost:5173
npm test           # vitest — pure-helper unit tests
npm run build      # tsc -b && vite build (also the typecheck gate)
```

If `snforge`/`sncast` are not on PATH, they are the Starknet Foundry binaries —
install via `asdf`/`snfoundryup` or invoke by absolute path.

## Conventions

- **TDD for logic.** Contract behavior and pure frontend helpers get a failing
  test first (see `contracts/tests/`, `app/src/lib/tipjar.test.ts`). UI/animation
  is verified by build + manual check, not unit tests.
- **Addresses only in `app/src/config.ts`.** Never hardcode an address elsewhere.
- **No key material in the repo.** Viewing keys, private keys, secrets → env
  vars/placeholders only. This holds especially for the Part 2 STRK20 work.
- **The public path stays working.** Part 2 adds the private path *alongside*
  `sendTip`; it must not break public tipping.
- **Keep it commented.** Every non-obvious file has a header comment explaining
  its role and how it relates to the STRK20 story.

## Adding the STRK20 integration (Part 2)

The intended approach is the **Starknet Wallet API** route (no custom Cairo): a
"Tip privately" action that performs a pool-internal private transfer to the
creator's registered wallet. The private path must **not** call the `TipJar`
contract and must emit no `Tipped` event (so private tips never show in the
public "LATEST TIPS" wall).

Authoritative, agent-readable docs:
- Index of all pages as Markdown: <https://strk20-by-example.org/llms.txt>
- Whole site in one file: <https://strk20-by-example.org/llms-full.txt>
- Wallet API route: <https://strk20-by-example.org/starknet-wallet-api/overview>
- The STRK20 agent skill: <https://strk20-by-example.org/agent-skill>
  (`npx skills add starkience/strk20-agent-skills`, then ask it to
  "plan STRK20 privacy for this app").

Record each step and decision in `docs/STRK20_INTEGRATION.md` as you go.
