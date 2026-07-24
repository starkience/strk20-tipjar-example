# Advanced: private swap-tips with an AVNU anonymizer contract

> **⚠️ Reference only. Not audited. Not for mainnet.** This module moves funds.
> It is built and unit-tested against a *mock* AVNU exchange to demonstrate the
> anonymizer pattern. Deploying it to mainnet requires a security audit owned by
> the integrating team. Deployment is intentionally **not** done in this repo.

> **Reference status: complete.** The contract is written, its on-chain ABI
> surface is verified against real source (see the table below), and it passes
> unit tests against a mock AVNU. What remains is the integrating team's phase:
> a security **audit**, a **local-devnet integration test** (path documented
> below), AVNU routing wiring, and deployment. Everything past this point is
> owner-owned; this repo goes no further.

## The goal

The simple tip jar sends a tip in the same token. This module explores a harder
feature: **tip in one token, and the creator privately receives another** — e.g.
tip STRK, creator gets **USDC**, with the tipper→creator link hidden.

## Why this needs an anonymizer contract (the DeFi boundary)

A plain private transfer (the [main integration](STRK20_INTEGRATION.md)) is a
native pool primitive — **app code only, no Cairo**. But the moment value must be
**transformed on-chain** (a swap, a lend, a vault deposit), the pool has to call
an external contract on behalf of a hidden user. That adapter is an **anonymizer
contract** — a Cairo `privacy_invoke` helper. This is the one case that crosses
out of "app code only." (The STRK20 agent skill routes here but, by design, will
not write the Cairo — it points at the public reference examples, which is what
this module adapts.)

## The pattern: the `privacy_invoke` sandwich

The pool calls the anonymizer **atomically** as the final step of the user's
private transaction. If anything reverts, the whole thing rolls back — no funds
stranded.

```
pool withdraws sell_token → anonymizer.privacy_invoke():
    approve the venue to pull the input
    swap on the venue (input → output)
    measure output by BALANCE DELTA   ← never trust the venue's return value
    approve the pool to pull the output
    return Span<OpenNoteDeposit>       ← "credit `out_amount` of output to note N"
→ pool credits the output into the creator's private (open) note
```

The **balance-delta idiom** is what makes it robust: the helper records the
output-token balance before and after the swap and credits exactly what arrived,
regardless of the venue's interface, fees, or return value.

## The contract — `contracts/src/avnu_swap_anonymizer.cairo`

`privacy_invoke(avnu_exchange, sell_token, sell_amount, buy_token, buy_min_amount,
routes, note_id) -> Span<OpenNoteDeposit>`:

1. Validate inputs (non-zero exchange/tokens/amount).
2. `approve` AVNU to pull `sell_amount` of `sell_token` (the pool already
   withdrew it to this contract).
3. Snapshot `buy_token` balance, call AVNU `multi_route_swap` with
   `beneficiary = self` so the output lands here, snapshot again.
4. `out_amount = balance_after - balance_before` (u256→u128, checked); revert if
   zero (`ZERO_OUT_AMOUNT`).
5. `approve` the pool (the caller) to pull `out_amount` of `buy_token`.
6. Return `[OpenNoteDeposit { note_id, token: buy_token, amount: out_amount }]`.

Adapted from the public **Ekubo swap-anonymizer** reference
([monorepo](https://github.com/starkware-libs/starknet-privacy),
`packages/ekubo_swap_anonymizer`). The difference: Ekubo uses a
`swap` + `clear`/`clear_minimum` dance; AVNU pulls via `approve` +
`multi_route_swap(..., beneficiary)`, so the adapter approves instead of
transferring and reads the delta on itself.

`OpenNoteDeposit` is defined locally so this reference has no monorepo
dependency; its layout is **verified to match** the pool's real
`privacy::objects::OpenNoteDeposit` (`note_id: felt252, token, amount: u128`).

## ABI verification status

Checked against source so the reference is as deploy-ready as it can be
pre-audit:

| Item | Status | Source |
|---|---|---|
| `OpenNoteDeposit` layout | ✅ Exact match | `starkware-libs/starknet-privacy` `packages/privacy/src/objects.cairo` |
| `privacy_invoke` invoke convention | ✅ Confirmed (`InvokeInput { contract_address, calldata }`) | `.../src/actions.cairo` |
| Access control (permissionless OK for a stateless helper) | ✅ Confirmed vs. Ekubo/Vesu references | monorepo |
| AVNU `multi_route_swap` signature | ✅ Exact match (params, order, types) | `avnu-labs/avnu-contracts-v2` `src/exchange.cairo` |
| AVNU `Route` type | ✅ Vendored verbatim (nested `RouteSwap` + custom `Serde`) | `.../src/models.cairo` → `contracts/src/avnu_models.cairo` |
| AVNU deployed Exchange address | ⛳ Per-network integration input (not pinned) | — |
| Real STRK20 pool + testnet integration | ⛳ Gated (see below) | — |

## What's tested vs. not

**Tested** (`contracts/tests/test_avnu_swap_anonymizer.cairo`, `snforge`, against
`MockAvnuExchange`):
- The full sandwich: input pulled, output measured by delta, pool approved,
  correct `OpenNoteDeposit` returned.
- `ZERO_OUT_AMOUNT` revert on a zero-output swap.
- Input validation (`ZERO_SELL_AMOUNT`).

**NOT tested here (integration + audit work, gated on mainnet/testnet):**
- The real STRK20 pool calling `privacy_invoke` via `INVOKE_SELECTOR` and
  crediting the open note (the ABIs are verified above, but the live handshake
  is not exercised).
- Real AVNU **routing** — the ABI is now correct, but routes are computed
  off-chain by AVNU's API and the deployed Exchange address must be supplied.
- Atomic rollback within a real pool transaction.
- Slippage/fee behavior against live liquidity.

## Frontend integration recipe (documented, not wired)

With the Wallet API, a private swap-tip is a single `strk20InvokeTransaction`
composing three actions — shield the input, create the creator's open note, and
invoke the anonymizer to fill it:

```ts
// Pseudocode — verify against the WalletAccount guide + live pool before use.
const routes = await avnu.getRoutes(sellToken, buyToken, amount); // AVNU API, off-chain
await wallet.strk20InvokeTransaction([
  { type: "deposit",  token: sellToken, amount },
  // 'OPEN' creates open note #0, owned by the creator, to be filled by the invoke:
  { type: "transfer", token: buyToken, amount: "OPEN", recipient: CREATOR },
  { type: "invoke",   contract: ANONYMIZER, calldata: [
      AVNU_EXCHANGE, sellToken, amount, buyToken, minOut, ...encodeRoutes(routes),
      "${openNoteIds[0]}",   // the note_id arg — the wallet substitutes note #0's id
  ]},
]);
```

This is intentionally left as a documented recipe rather than shipped UI: it
cannot be verified without the live pool, and shipping unverified fund-flow code
would contradict the audit boundary. Wiring it is a post-audit step.

## Hidden vs. visible for this flow

| Private | Public |
|---|---|
| The tipper↔creator link | The swap itself: `pool → AVNU`, tokens and amounts |
| Which notes were spent / the creator's receipt | That the pool interacted with AVNU, and timing |

Honest limit: an anonymizer hides the **user's address** behind the DeFi action.
The **swap amounts and the fact a swap happened are public** (they touch a public
DEX). Don't imply otherwise in UI copy.

## Taking it to production (the owner's checklist)

1. **Audit** the contract — owner, budget, timing lined up before anything else.
   (This is now the primary blocker; the ABIs are verified above.)
2. Supply the **deployed AVNU Exchange address** (per network) and integrate
   AVNU's off-chain routing API to build the `routes` calldata. Optionally
   depend on AVNU's package instead of the vendored `avnu_models`.
3. **Integration-test against a local devnet** (no mainnet, pre-audit). The
   privacy monorepo ships an e2e harness that deploys the real pool + an
   anonymizer and runs the full withdraw→invoke→credit flow:
   - Install patched `starknet-devnet` v0.8.0-rc.3 + `@starkware-libs/starknet-privacy-sdk` (Node ≥ 24).
   - Use `createDevnetTestEnv`; adapt `e2e/scripts/deploy-ekubo.ts` →
     `deploy-avnu.ts` and `e2e/tests/devnet/swap-ekubo.test.ts` →
     `swap-avnu.test.ts` for this contract.
   This exercises the real pool `INVOKE_SELECTOR` handshake + open-note crediting
   + atomic rollback. (A StarkNet *integration-sepolia* pool also exists, targeted
   by the monorepo's `demo/` app via env config.) Production user flows still go
   through the Wallet API.
4. Test atomicity: success → output credited as a private note; revert → clean
   rollback, no stranded funds.
5. Deploy, then wire the frontend `strk20InvokeTransaction` flow above.

Deposit screening is enforced on-chain by the protocol and applies here too;
self-hosted proving does not bypass it.
