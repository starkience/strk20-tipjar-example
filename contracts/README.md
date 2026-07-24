# contracts — TipJar (Cairo)

The public tipping contract for the [strk20-tipjar-example](../README.md).
Scarb + Starknet Foundry.

## The contract: `src/tipjar.cairo`

A deliberately tiny, **non-custodial** tip jar:

- `tip(amount)` — pulls `amount` STRK from the caller via `transfer_from` and
  forwards it **straight to the fixed `owner`** (the creator). Increments
  `total_tipped` / `tip_count`, emits `Tipped { tipper, amount, timestamp }`.
  Reverts on zero amount.
- `get_total() -> (u256, u64)` — `(total tipped, tip count)`.
- `get_owner() -> ContractAddress` — the creator, set once in the constructor.

Design choices worth noting (all in service of "simple to read"):

- **No custody.** Funds are never held by the contract — they move tipper →
  owner in the same call. So there is no `withdraw`, no admin, no upgrade path,
  and nothing to steal.
- **`owner` is fixed at deploy.** One deployed jar = one creator. Tippers can't
  redirect a tip; `tip()` always forwards to that address.
- **`Tipped` is public.** It's exactly what the frontend's "LATEST TIPS" wall
  reads. This is the public baseline that Part 2's STRK20 private path
  contrasts with.
- **`mock_erc20.cairo` is test-only.** It backs the unit tests; it is never
  deployed to mainnet. The contract reuses its dispatcher as a minimal ERC-20
  client (only `transfer_from` is ever called) to avoid declaring a second
  interface — see the comment at the call site.

## Build & test

```bash
scarb build
snforge test          # 7 passing (3 mock_erc20 + 4 tipjar)
```

## Deploy

The canonical, real-mainnet deployment (addresses, tx hashes, and the exact
`sncast` commands, including the gas/RPC gotchas we hit) is documented in
[`../docs/DEPLOYMENT.md`](../docs/DEPLOYMENT.md). In short:

```bash
scarb build
sncast --account <you> declare --contract-name TipJar --url <rpc>
sncast --account <you> deploy  --class-hash <hash> \
  --arguments '<owner_address>, <strk_token_address>' --url <rpc>
```

Then put the resulting contract address into `app/src/config.ts`.
