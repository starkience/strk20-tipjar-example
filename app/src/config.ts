// Single source of truth for all on-chain addresses and network settings.
// Point `tipJarAddress`/`ownerAddress`/`deployBlock` at your own deployment
// (see docs/DEPLOYMENT.md) to run this against a jar you control.

import { normalizeAddress } from "./lib/address";

export type Token = {
  symbol: string;
  address: string;
  decimals: number;
};

/**
 * Offline fallback only. The live list is fetched per-wallet from AVNU's
 * verified tokens (see lib/tokens.ts) and filtered to what the user holds.
 * Addresses + decimals verified on mainnet.
 */
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
      "0x033068f6539f8e6e6b131e6b2b814e6c34a5224bc66947c47dab9dfee93b35fb",
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

// Canonical (zero-padded) form so comparisons against API-sourced addresses work.
TOKENS.forEach((t) => {
  t.address = normalizeAddress(t.address);
});

export const STRK = TOKENS[0];

/**
 * The pool charges a flat fee per private operation, denominated in STRK
 * (measured on mainnet). MAX on STRK leaves it behind, or the follow-up
 * operation can't pay for itself.
 */
export const POOL_FEE_STRK = 4n * 10n ** 18n;

/**
 * NOTE — never write `const env = import.meta.env` and read fields off it.
 * Vite statically replaces individual `import.meta.env.X` accesses, but
 * aliasing the object forces it to inline the WHOLE env — every VITE_ variable,
 * including secrets — into the bundle, defeating the dead-code elimination that
 * keeps the paymaster key out. Always access fields directly, as below.
 *
 * Which chain the app talks to. Mainnet is the default because that is where
 * the demo jar and the verified evidence live.
 *
 * A note on switching, because it is less mechanical than it looks: on the
 * Wallet API route the dapp **never passes a pool address**. `shield` and
 * `sendPrivateTip` send actions, and the user's wallet picks the pool for
 * whichever network it is connected to. So the settings below only move the
 * *public* half of the app (RPC, jar, tokens) — whether the *private* half
 * works on Sepolia is a question about the wallet, not about this file.
 * See docs/DEPLOYMENT.md → "Running on Sepolia".
 */
export const CONFIG = {
  // Public JSON-RPC endpoint — mainnet, pinned to RPC spec v0.10 (starknet.js
  // 10.4 speaks 0.10.3). The Alchemy key in this URL is a READ-ONLY, rate-
  // limited PROVIDER key: it can only read a public chain, so it is safe to ship
  // in the client — unlike the AVNU paymaster SPEND key, which stays server-side
  // (see app/api/paymaster.ts). Override per deployment with VITE_RPC_URL (your
  // own Alchemy/Infura/Lava endpoint) — e.g. to raise rate limits or change spec.
  rpcUrl:
    import.meta.env.VITE_RPC_URL ??
    "https://starknet-mainnet.g.alchemy.com/starknet/version/rpc/v0_10/6e6ntRee9DYgQFYqVffLB",
  strkAddress: STRK.address,
  // Live mainnet deployment (Task 6). Point these at your own jar — see
  // docs/DEPLOYMENT.md — or override without editing code via .env.local.
  tipJarAddress:
    import.meta.env.VITE_TIPJAR_ADDRESS ??
    "0x03ade0d029152e3b52188b5a32eac1f8b6f14d2fc3bdae1b94d9f6c545b8a64f",
  deployBlock: Number(import.meta.env.VITE_DEPLOY_BLOCK ?? 12234555),
  /**
   * Where tips land. This is the demo creator's wallet, so a cloned copy pays
   * the demo author until you change it — the app says so in its footer.
   */
  ownerAddress:
    import.meta.env.VITE_OWNER_ADDRESS ??
    "0x06196AFC75E23edc79ecF3982F84dDB9142EcA19CDcE678b42Cface67F063eAa",
  // Private swaps go through AVNU's paymaster, which requires an API key.
  //
  // A key bundled into a browser app is publicly readable, so in production the
  // key stays server-side: the SDK is pointed at our own /api/paymaster route
  // (see app/api/paymaster.ts), which attaches the key and forwards the request.
  //
  // `vite dev` serves no serverless functions, so local development instead
  // reads a key from .env.local (gitignored, never committed).
  avnuPaymasterApiKey: import.meta.env.DEV
    ? (import.meta.env.VITE_AVNU_PAYMASTER_API_KEY ?? "")
    : "",
  avnuPaymasterBaseUrl:
    import.meta.env.DEV || typeof window === "undefined"
      ? undefined
      : `${window.location.origin}/api/paymaster`,
};
