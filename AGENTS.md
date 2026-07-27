# AGENTS.md

Orientation for coding agents (and humans in a hurry) working in this repo.
Read this before making changes.

Fetching this repo programmatically? [`llms.txt`](llms.txt) indexes every
document and key source file as raw URLs.

**If you are here to learn how STRK20 is integrated, read
[`TUTORIAL.md`](TUTORIAL.md) instead** — it is the deliverable this repo exists
to carry. This file is for changing the code.

## What this repo is

A teaching example of integrating **STRK20** (Starknet privacy) into an ordinary
app. It has two parts:

1. **Part 1 (done):** a public tip jar — `TipJar` Cairo contract + React
   frontend, live on Starknet mainnet.
2. **Part 2 (built):** a **private** tipping path via the STRK20 Wallet API,
   added with the STRK20 agent skill. It is deliberately **decoupled** —
   `shield()`, then a maturity wait, then an optional `privateSwapToStrk()` (AVNU
   SDK), then a transfer-only `sendPrivateTip()`. Bundling the shield into the
   tip would correlate the public deposit with the private transfer, so don't.
   Every step is logged in [`docs/STRK20_INTEGRATION.md`](docs/STRK20_INTEGRATION.md).

Optimize every change for a reader trying to learn *how STRK20 is integrated*.
Clarity and comments matter more than cleverness.

## Layout

| Path | What |
| --- | --- |
| `contracts/src/tipjar.cairo` | The TipJar contract (public tipping). No custody, no admin. |
| `contracts/src/mock_erc20.cairo` | Test-only ERC-20 for unit tests. Not deployed to mainnet. |
| `contracts/src/avnu_swap_anonymizer.cairo` | **Advanced/reference.** Private swap-tip helper (`privacy_invoke`). Moves funds — **not audited, do not deploy to mainnet.** See [`docs/ANONYMIZER.md`](docs/ANONYMIZER.md). |
| `contracts/src/mock_avnu_exchange.cairo` | Test-only mock AVNU exchange. |
| `contracts/tests/` | `snforge` tests. |
| `app/src/config.ts` | **All** on-chain addresses and network config. Single source of truth. |
| `app/src/hooks/useTipJar.ts` | All Starknet wiring: connect, read totals/events, send the tip multicall. |
| `app/src/lib/strk20.ts` | **The whole privacy surface**, pure and unit-tested: the STRK20 action shapes plus capability detection. Start here to see what STRK20 actually costs in code. |
| `app/src/lib/tipjar.ts` | Pure helpers (calldata, amounts, event decoding). Unit-tested. |
| `app/src/lib/tokens.ts` | Token list (AVNU verified) + batched public balance reads. |
| `app/src/lib/errors.ts` | Protocol error codes → plain language. |
| `app/src/lib/address.ts` | Felt address normalization — compare with these, not `===`. |
| `app/src/components/` | `Stepper`, `TokenSelect`, `Pills`, `TipForm`, `TxLog`, `ModeToggle`. Presentation only. |
| `app/api/paymaster.ts` | Server-side proxy for AVNU's paymaster. Keeps the API key out of the browser bundle. |
| `app/scripts/check-bundle.mjs` | Post-build gate: fails the build if a secret reaches `dist/`. |
| `docs/` | Architecture, deployment record, and the STRK20 integration log. |

## Commands

```bash
# Contracts (Scarb 2.16, Starknet Foundry 0.56)
cd contracts && scarb build && snforge test

# Frontend (Node 20+)
cd app && npm install
npm run dev        # http://localhost:5173
npm test           # vitest — pure helpers + the STRK20 action shapes
npm run build      # typecheck, bundle, and the secret check (see below)
```

If `snforge`/`sncast` are not on PATH, they are the Starknet Foundry binaries —
install via `asdf`/`snfoundryup` or invoke by absolute path.

## Conventions

- **TDD for logic.** Contract behavior and pure frontend helpers get a failing
  test first (see `contracts/tests/`, `app/src/lib/tipjar.test.ts`). UI/animation
  is verified by build + manual check, not unit tests.
- **Addresses only in `app/src/config.ts`.** Never hardcode an address elsewhere.
- **No key material in the repo, or in the bundle.** Viewing keys, private keys,
  secrets → env vars/placeholders only. Server-side keys get **no `VITE_`
  prefix**: that prefix is what inlines a value into the publicly-readable
  browser bundle. Never write `const env = import.meta.env` and read fields off
  it either — aliasing the object makes Vite inline *every* `VITE_` variable.
  `npm run build` fails if a secret reaches `dist/`.
- **Don't bundle a deposit with the transfer it funds.** `app/src/lib/strk20.ts`
  builds a private tip as a lone `transfer`, and a test asserts no `deposit`
  rides along. That test is the design decision, not a formality.
- **The public path stays working.** Part 2 adds the private path *alongside*
  `sendTip`; it must not break public tipping.
- **Keep it commented.** Every non-obvious file has a header comment explaining
  its role and how it relates to the STRK20 story.

## How the STRK20 integration works (Part 2, shipped)

Built on the **Starknet Wallet API** route: no custom Cairo, and the deployed
`TipJar` contract was never modified. Two tags bracket the work:

```bash
git diff --stat v1-public v2-private -- contracts/src/tipjar.cairo   # empty
```

The private path calls **no contract** and emits **no `Tipped` event**, so
private tips never appear in the public "LATEST TIPS" wall. Keep it that way:
if you find yourself adding a contract call to the private path, you have
probably left the Wallet API route by mistake.

Authoritative, agent-readable docs:
- Index of all pages as Markdown: <https://strk20-by-example.org/llms.txt>
- Whole site in one file: <https://strk20-by-example.org/llms-full.txt>
- Wallet API route: <https://strk20-by-example.org/starknet-wallet-api/overview>
- The STRK20 agent skill: <https://strk20-by-example.org/agent-skill>
  (`npx skills add starkience/strk20-agent-skills`, then ask it to
  "plan STRK20 privacy for this app").

Add the new tip-jar page to that list too:
<https://strk20-by-example.org/app/tip-jar>

Record each step and decision in `docs/STRK20_INTEGRATION.md` as you go.
