// Single source of truth for all on-chain addresses and network settings.
// Point `tipJarAddress`/`ownerAddress`/`deployBlock` at your own deployment
// (see docs/DEPLOYMENT.md) to run this against a jar you control.

export type Token = {
  symbol: string;
  address: string;
  decimals: number;
};

/** Tokens a tipper can pay with. Addresses + decimals verified on mainnet. */
export const TOKENS: Token[] = [
  {
    symbol: "STRK",
    address:
      "0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d",
    decimals: 18,
  },
  {
    symbol: "ETH",
    address:
      "0x049d36570d4e46f48e99674bd3fcc84644ddd6b96f7c741b1562b82f9e004dc7",
    decimals: 18,
  },
  {
    symbol: "USDC",
    address:
      "0x053c91253bc9682c04929ca02ed00b3e423f6710d2ee7e0d5ebb06f3ecf368a8",
    decimals: 6,
  },
  {
    symbol: "USDT",
    address:
      "0x068f5c6a61780768455de69077e07e89787839bf8166decfbf92b645209c0fb8",
    decimals: 6,
  },
  {
    symbol: "WBTC",
    address:
      "0x03fe2b97c1fd336e750087d68b9b867997fd64a2661ff3ca5a7c771641e8e7ac",
    decimals: 8,
  },
];

export const STRK = TOKENS[0];

export const CONFIG = {
  rpcUrl: "https://rpc.starknet.lava.build/rpc/v0_9",
  strkAddress: STRK.address,
  // Live mainnet deployment (Task 6):
  tipJarAddress:
    "0x03ade0d029152e3b52188b5a32eac1f8b6f14d2fc3bdae1b94d9f6c545b8a64f",
  deployBlock: 12234555,
  ownerAddress:
    "0x06196AFC75E23edc79ecF3982F84dDB9142EcA19CDcE678b42Cface67F063eAa",
  // AVNU paymaster key, used to sponsor gas on private swaps. Supplied via
  // .env.local (gitignored) — NEVER commit it. Note that any value bundled into
  // a browser app is publicly readable; proxy it server-side for production.
  avnuPaymasterApiKey: import.meta.env.VITE_AVNU_PAYMASTER_API_KEY ?? "",
};
