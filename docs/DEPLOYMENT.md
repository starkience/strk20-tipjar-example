# Deployment record (Part 1 — public tip jar)

The live mainnet deployment this repo points at, plus exactly how to reproduce
it for your own creator address.

## Live addresses (Starknet mainnet)

| | |
| --- | --- |
| TipJar contract | `0x03ade0d029152e3b52188b5a32eac1f8b6f14d2fc3bdae1b94d9f6c545b8a64f` |
| Class hash | `0x22ee61506d0c146e3eb2f4a6b3665bdc8cc349c45ed280ed690e6145003a039` |
| Owner (creator, tips forward here) | `0x06196AFC75E23edc79ecF3982F84dDB9142EcA19CDcE678b42Cface67F063eAa` |
| STRK token | `0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d` |
| Deploy block | `12234555` |

Transactions:
- Declare: [`0x6bec224e…c4ed01`](https://starkscan.co/tx/0x06bec224efeea87f7ea9868410a3920c05d01d734a2bdf2201beb07cd6c4ed01)
- Deploy: [`0x003aae0e…dff45`](https://starkscan.co/tx/0x003aae0e0d290eda31dcc576fb21b864da42b41a7ca10514f6226da2738dff45)

First public tip (proof the flow works, and that it's fully public):
- Tip tx: [`0x24d670ad…d8228`](https://starkscan.co/tx/0x24d670ad892cae9c58058f4a1ad28a0a320eb6e3c6ca8ec5c279ecba80d8228)
- Tipper `0x463f…d30f`, 1 STRK — visible to anyone on the explorer. This is the
  "everything is public" motivation for the STRK20 part.

These values live in code at [`app/src/config.ts`](../app/src/config.ts).

## Deploy your own

So tips go to *your* address, deploy a fresh jar:

```bash
cd contracts
scarb build

# 1) Declare the class (one-time per class; skip if already declared)
sncast --account <your_account> declare \
  --contract-name TipJar --url <rpc_url>

# 2) Deploy with your creator address + the STRK token
sncast --account <your_account> deploy \
  --class-hash <class_hash_from_step_1> \
  --arguments '<your_owner_address>, 0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d' \
  --url <rpc_url>

# 3) Sanity check
sncast call --contract-address <deployed_address> --function get_total --url <rpc_url>   # -> (0, 0)
```

Then update `app/src/config.ts`: set `tipJarAddress`, `ownerAddress`, and
`deployBlock` (the block of the deploy tx).

## Gotchas we hit (so you don't have to)

- **RPC spec version.** `sncast` 0.56 expects RPC spec `0.10.0`. A stable
  `0.9.0` endpoint (e.g. `https://rpc.starknet.lava.build/rpc/v0_9`) works with a
  harmless version warning; a `0.10.x-rc` endpoint returned a **bogus inflated
  fee estimate**, so prefer a stable node.
- **Blast public RPC is discontinued.** `starknet-mainnet.public.blastapi.io`
  now errors; the app uses the lava endpoint instead. Pick any reliable node.
- **Declaring the class is the expensive step** (~165M L2 gas — several STRK
  while mainnet L2 gas is elevated). Deploying is cheap. Fund the deployer
  accordingly (we topped up to ~10 STRK to be safe).
- **Deploy after the declare confirms.** Wait for the declare tx to reach
  `ACCEPTED_ON_L2` before deploying, or you get "Class … is not declared".
