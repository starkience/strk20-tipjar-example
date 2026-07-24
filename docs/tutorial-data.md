# Tutorial evidence (captured during the real run)

## Part 1 — public deployment (Task 6)
- Network: Starknet mainnet
- Contract: `TipJar` (contracts/src/tipjar.cairo)
- Class hash: `0x22ee61506d0c146e3eb2f4a6b3665bdc8cc349c45ed280ed690e6145003a039`
- Declare tx: `0x6bec224efeea87f7ea9868410a3920c05d01d734a2bdf2201beb07cd6c4ed01`
- TipJar address: `0x03ade0d029152e3b52188b5a32eac1f8b6f14d2fc3bdae1b94d9f6c545b8a64f`
- Deploy tx: `0x003aae0e0d290eda31dcc576fb21b864da42b41a7ca10514f6226da2738dff45`
- Deploy block: `12234555`
- Owner (creator, tips forward here): `0x06196AFC75E23edc79ecF3982F84dDB9142EcA19CDcE678b42Cface67F063eAa`
- Deployer account: `winky_deployer` (`0x7f5914da94a04f48d3e6a4d476897952b78bf5d4330171c307b7e97da4d80e1`)
- STRK token: `0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d`
- Post-deploy smoke test: `get_total()` -> `(0, 0)`; `get_owner()` -> owner address above. ✅
- Explorer: https://starkscan.co/contract/0x03ade0d029152e3b52188b5a32eac1f8b6f14d2fc3bdae1b94d9f6c545b8a64f

### Notes / gotchas worth putting in the tutorial
- Blast public RPC (`starknet-mainnet.public.blastapi.io`) is shut down ("no longer
  available, use Alchemy"). App RPC repointed to `https://rpc.starknet.lava.build/rpc/v0_9`.
- sncast 0.56 expects RPC spec 0.10.0; lava v0_9 (0.9.0) works with a non-fatal
  version warning. A flaky `0.10.3-rc` endpoint returned a bogus inflated fee estimate.
- Declaring the class is the expensive step (~165M L2 gas; several STRK while mainnet
  L2 gas is elevated). Deploy is cheap. Fund the deployer accordingly.
- Deploy must wait for the declare tx to reach `ACCEPTED_ON_L2` before the class is
  usable, else "Class ... is not declared".

## Part 1 — public tip (Task 7)
- Tip tx: (pending)
- Tipper address: (pending)
- Amount: (pending)

## Part 2 — private instance (Tasks 8-10)
- Wallet used: (decided at Task 9)
- Agent skill plan file: (pending)
- Private tip evidence: (pending)
