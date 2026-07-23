# Private Tip Jar — strk20 tutorial app design

**Date:** 2026-07-23
**Status:** Approved

## Goal

Produce a short tutorial that shows how simple it is to add STRK20 privacy to a
Starknet app using the [strk20 agent skill](https://strk20-by-example.org/agent-skill).
The tutorial is created by actually doing the work, in order:

1. **Build & deploy public** — a mainnet TipJar dapp: one Cairo contract, one page.
2. **Use it** — send a real public tip. The tx hash and tip wall become tutorial
   material, and the motivation: anyone can see who tipped whom, how much, when.
3. **Add privacy & use it** — install the strk20 agent skill, ask it to
   *"plan STRK20 privacy for this app"*, approve, execute. Send a real private
   tip. Same app; the tipper is now invisible.

**Deliverables:** this public example repo + a strk20-by-example.org-style
tutorial page (`TUTORIAL.md`).

**Constraints:** very simple; no liquidity; a single onchain action; mainnet.

## Decisions made

| Decision | Choice |
| --- | --- |
| Base app | Onchain Tip Jar |
| Private flow | Pool-internal private transfer to the creator's registered wallet (pure Wallet API; never touches the TipJar contract) |
| Frontend stack | Vite + React (enables the starknet-start `useStrk20` hooks in part 2) |
| Deliverable format | Site page + example repo |
| Contract shape | Forward + count: no custody, no withdraw, no admin |

## Repo layout

```
private-tipjar/
├── contracts/          # Scarb + Starknet Foundry
│   ├── src/tipjar.cairo
│   └── tests/test_tipjar.cairo
├── app/                # Vite + React
│   └── src/ (App, TipForm, TipWall, useTipJar)
└── TUTORIAL.md         # becomes the site page
```

## Part 1 — the contract

`TipJar` (Cairo, ~40 lines):

- `tip(amount: u256)` — `strk.transfer_from(caller, owner, amount)`, increments
  `total_tipped` and `tip_count` in storage, emits
  `Tipped { tipper, amount, timestamp }`. Reverts on zero amount.
- `get_total() -> (u256, u64)` — view returning `(total_tipped, tip_count)`.
- `owner` is fixed at deployment (constructor parameter). No custody, no
  withdraw, no admin, no upgradeability.
- STRK token address is a constructor parameter (mainnet STRK).

**Explicit exclusion:** no message field on tips. YAGNI; keeps the ABI minimal
and the privacy comparison focused on identity + amounts.

**Toolchain:** Scarb + Starknet Foundry. Tests with `snforge`
(happy path updates storage and emits event; zero-amount reverts;
missing-allowance reverts). Declare + deploy with `sncast` to mainnet.

## Part 1 — the frontend

Vite + React SPA, deliberately plain so part 2's diff is legible:

- `get-starknet` wallet connect.
- Tip form: amount input; submits `approve` + `tip` as one multicall.
- Tip wall: recent `Tipped` events fetched via RPC provider event queries.
- Totals banner: `get_total()` view call.

## Part 2 — the privacy integration (the showcase)

One manual prerequisite: the creator's wallet registers in the STRK20 pool
(one-time, handled wallet-side).

Then the agent skill drives everything else:

1. `npx skills add starkience/strk20-agent-skills`
2. Ask the agent: *"plan STRK20 privacy for this app."*
3. Expected route: **Starknet Wallet API via the starknet-start `useStrk20`
   hooks** (React dapp, no custom DeFi flow, so no anonymizer contract).
4. Expected result: a **"Tip privately"** button — the wallet checks
   registration, shields if needed, and private-transfers to the creator's
   registered wallet. The tip wall gains a line: *"Private tips don't appear
   here. That's the point."*
5. The tutorial reproduces the skill's interview answers and the generated
   `STRK20_INTEGRATION_PLAN.md` verbatim as the "look how simple" evidence.

Private tips are invisible to the app and all observers; only the creator's
wallet sees them. Public tips continue to work unchanged.

## Part 3 — the tutorial page

`TUTORIAL.md` in strk20-by-example voice, three acts:

1. Build the tip jar (contract + frontend + mainnet deploy).
2. Use it publicly — real tx hash; point out everything visible on-chain.
3. Add privacy with the agent skill — real private-tip evidence; a
   hidden-vs-visible table; ends with the skill install one-liner.

Slots into the site next to the "Anonymous Airdrop" placeholder page.

## Testing

- `snforge` unit tests for the contract (see Part 1).
- Frontend: manual wallet check on mainnet (connect, public tip, wall updates).
- Part 2: the agent skill's own per-phase headless checks + a manual private
  tip on mainnet, confirmed received in the creator's wallet.

## Risks / verification items

- **Wallet support:** part 2 requires a mainnet wallet exposing the STRK20
  Wallet API methods. The tutorial must name the wallet used and the app should
  detect capability before offering "Tip privately".
- **Mainnet costs:** declare + deploy + 2 tips + shield — small but real STRK,
  paid by the deployer wallet.
- **`useStrk20` hook surface:** exact hook names/params come from the
  starknet-start docs at integration time; the agent skill resolves this, we
  verify against upstream docs.
