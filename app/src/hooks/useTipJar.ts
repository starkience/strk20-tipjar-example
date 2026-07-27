// useTipJar — all of the app's Starknet wiring in one hook.
//
// Part 2 (STRK20) migrated wallet discovery + connection to get-starknet v6 and
// starknet.js WalletAccountV6. WalletAccountV6 keeps the normal account API
// (`execute`, `address`), so the PUBLIC tip path (`sendTip`) is unchanged — it
// ALSO exposes STRK20 actions (`strk20InvokeTransaction`) that the private path
// (Phase 2) uses. `privacySupported` is a runtime capability check so the UI can
// degrade gracefully on wallets without STRK20 support.

import { useCallback, useEffect, useRef, useState } from "react";
import {
  compareVersions,
  RpcProvider,
  WalletAccountV6,
  walletV6,
} from "starknet";
import type { WalletWithStarknetFeatures } from "@starknet-io/get-starknet-wallet-standard/features";
import type { STRK20_ACTION } from "@starknet-io/types-js";
import {
  createStrk20WalletProver,
  executePrivateSwap,
  getQuotes,
  PRIVACY_POOL_ADDRESS,
} from "@avnu/avnu-sdk";
import { CONFIG, STRK, TOKENS, type Token } from "../config";
import { fetchBalances, fetchTokens } from "../lib/tokens";
import {
  buildTipCalls,
  parseStrk,
  parseUnits,
  parseTippedEvent,
  TIPPED_SELECTOR,
  type TipEvent,
} from "../lib/tipjar";

const provider = new RpcProvider({ nodeUrl: CONFIG.rpcUrl });

/** Notes mature 10 blocks after creation — they cannot be spent before that. */
export const MATURITY_BLOCKS = 10;

// Capability check that NEVER touches balances or keys: ask the wallet which
// Wallet-API versions it supports. The STRK20 methods ship in wallet API
// >= 0.10.3 (Ready, Xverse) — the same probe AVNU documents. Wallets predating
// `supportedWalletApi` throw, and are treated as not capable.
async function walletSupportsStrk20(
  wallet: WalletWithStarknetFeatures,
): Promise<boolean> {
  try {
    const versions = await walletV6.supportedWalletApi(wallet);
    return versions.some((v) => compareVersions(v, "0.10.3") >= 0);
  } catch {
    return false;
  }
}

export function useTipJar() {
  const [account, setAccount] = useState<WalletAccountV6 | null>(null);
  const [address, setAddress] = useState<string | null>(null);
  const [privacySupported, setPrivacySupported] = useState(false);
  // Block of the last shield, and the chain head — together they drive the
  // maturity countdown (a note is spendable MATURITY_BLOCKS after creation).
  const [shieldedAtBlock, setShieldedAtBlock] = useState<number | null>(null);
  const [currentBlock, setCurrentBlock] = useState<number | null>(null);
  // The connected account's PUBLIC token balances, keyed by token address.
  // Ordinary public chain data read over RPC (like the jar's totals) — no wallet
  // involvement and no consent prompt, unlike shielded balances which the app
  // never reads.
  const [publicBalances, setPublicBalances] = useState<Record<string, bigint>>(
    {},
  );
  // Verified token list from AVNU (falls back to the built-in defaults).
  const [tokens, setTokens] = useState<Token[]>(TOKENS);
  const [tips, setTips] = useState<TipEvent[]>([]);
  const [total, setTotal] = useState<bigint>(0n);
  const [count, setCount] = useState<number>(0);
  const [txPending, setTxPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Synchronous re-entrancy lock: the `txPending` state disables the button, but
  // React state lags a render, so a fast double-click can slip a second tx
  // through. A ref updates immediately and blocks that. Prevents double-shields.
  const submittingRef = useRef(false);

  // Public balances for every listed token, in ONE batched RPC request.
  const refreshPublicBalance = useCallback(
    async (addr: string) => {
      try {
        setPublicBalances(await fetchBalances(CONFIG.rpcUrl, addr, tokens));
      } catch {
        // Non-fatal: amounts still work without a balance readout.
      }
    },
    [tokens],
  );

  // Attach to the wallet the user picked in the get-starknet modal: build a
  // WalletAccountV6 for sending, then check STRK20 capability.
  const selectWallet = useCallback(
    async (wallet: WalletWithStarknetFeatures) => {
    setError(null);
    try {
      const wa = await WalletAccountV6.connect(provider, wallet);
      setAccount(wa);
      setAddress(wa.address);
      void refreshPublicBalance(wa.address);
      // Detect STRK20 support via the wallet's advertised Wallet-API versions —
      // no balance query, no viewing key, no private data read.
      setPrivacySupported(await walletSupportsStrk20(wallet));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
    },
    [refreshPublicBalance],
  );

  // Called when the modal reports a disconnect.
  const clearWallet = useCallback(() => {
    setAccount(null);
    setAddress(null);
    setPrivacySupported(false);
    setPublicBalances({});
  }, []);

  const refresh = useCallback(async () => {
    if (!CONFIG.tipJarAddress) return; // not deployed yet
    try {
      // Totals from storage.
      const [low, high, cnt] = await provider.callContract({
        contractAddress: CONFIG.tipJarAddress,
        entrypoint: "get_total",
      });
      setTotal(BigInt(low) + (BigInt(high) << 128n));
      setCount(Number(BigInt(cnt)));

      // Wall from events.
      const res = await provider.getEvents({
        address: CONFIG.tipJarAddress,
        keys: [[TIPPED_SELECTOR]],
        from_block: { block_number: CONFIG.deployBlock },
        to_block: "latest",
        chunk_size: 100,
      });
      setTips(res.events.map(parseTippedEvent).reverse());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  // PUBLIC tip: unchanged. approve + tip multicall through the normal account
  // API (WalletAccountV6 inherits `execute`), then wait and refresh.
  const sendTip = useCallback(
    async (amountStrk: string) => {
      if (!account) throw new Error("connect a wallet first");
      if (submittingRef.current) return undefined; // a tip is already in flight
      submittingRef.current = true;
      setError(null);
      setTxPending(true);
      try {
        const amount = parseStrk(amountStrk);
        const calls = buildTipCalls(
          CONFIG.strkAddress,
          CONFIG.tipJarAddress,
          amount,
        );
        const { transaction_hash } = await account.execute(calls);
        await provider.waitForTransaction(transaction_hash);
        await refresh();
        void refreshPublicBalance(account.address);
        return transaction_hash;
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
        throw e;
      } finally {
        submittingRef.current = false;
        setTxPending(false);
      }
    },
    [account, refresh, refreshPublicBalance],
  );

  // SHIELD: deposit public STRK into the pool, as its own transaction.
  //
  // This is step 1 of the DECOUPLED flow. Shielding separately (rather than
  // bundling it into the tip) is what breaks the on-chain link: the deposit is a
  // public leg from your address, so keeping it in the same transaction as the
  // tip lets an observer correlate the two. Shield now, tip later, and the tip
  // transaction carries no public leg at all.
  //
  // Note maturity: the note this creates is spendable ~10 blocks after creation.
  const shield = useCallback(
    async (token: Token, amountStr: string) => {
      if (!account) throw new Error("connect a wallet first");
      if (!privacySupported) {
        throw new Error("this wallet does not support STRK20");
      }
      if (submittingRef.current) return undefined;
      submittingRef.current = true;
      setError(null);
      setTxPending(true);
      try {
        const amount = parseUnits(amountStr, token.decimals);
        const actions: STRK20_ACTION[] = [
          {
            type: "deposit",
            token: token.address,
            amount: `0x${amount.toString(16)}`,
          },
        ];
        const { transaction_hash } =
          await account.strk20InvokeTransaction(actions);
        await provider.waitForTransaction(transaction_hash);
        // Anchor the maturity countdown at the block the shield landed in.
        const head = await provider.getBlockNumber();
        setShieldedAtBlock(head);
        setCurrentBlock(head);
        void refreshPublicBalance(account.address);
        return transaction_hash;
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
        throw e;
      } finally {
        submittingRef.current = false;
        setTxPending(false);
      }
    },
    [account, privacySupported, refreshPublicBalance],
  );

  // PRIVATE SWAP: trade a shielded token for shielded STRK, via AVNU.
  //
  // Both sides stay inside the pool: AVNU withdraws the sell amount to its
  // executor, routes the swap, and the bought STRK lands back as a new private
  // note. No anonymizer contract of our own is needed — AVNU deploys the
  // executor and its SDK orchestrates the privacy_invoke flow.
  //
  // The wallet is the prover: it holds keys and notes and generates the proof
  // (createStrk20WalletProver -> strk20PrepareInvoke). The dapp only describes
  // the trade. AVNU's paymaster relays it, so gas is sponsored and the user pays
  // only the pool fee, from their private balance.
  //
  // Requires the sell token to already be shielded and matured (steps 1-2).
  const privateSwapToStrk = useCallback(
    async (token: Token, amountStr: string) => {
      if (!account) throw new Error("connect a wallet first");
      if (!privacySupported) {
        throw new Error("this wallet does not support STRK20");
      }
      if (token.address === STRK.address) {
        throw new Error("already STRK — no swap needed");
      }
      if (submittingRef.current) return undefined;
      submittingRef.current = true;
      setError(null);
      setTxPending(true);
      try {
        const sellAmount = parseUnits(amountStr, token.decimals);
        const [quote] = await getQuotes({
          sellTokenAddress: token.address,
          buyTokenAddress: STRK.address,
          sellAmount,
          takerAddress: account.address,
          size: 1,
        });
        if (!quote) throw new Error("no route found for this pair");

        const { transactionHash } = await executePrivateSwap({
          quote,
          slippage: 0.05,
          takerAddress: account.address,
          poolAddress: PRIVACY_POOL_ADDRESS,
          feeMode: { poolFeeToken: STRK.address },
          prover: createStrk20WalletProver(account),
          paymasterApiKey: CONFIG.avnuPaymasterApiKey || undefined,
        });
        await provider.waitForTransaction(transactionHash);
        return transactionHash;
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
        throw e;
      } finally {
        submittingRef.current = false;
        setTxPending(false);
      }
    },
    [account, privacySupported],
  );

  // PRIVATE tip: a transfer-only action spending funds ALREADY shielded.
  //
  // Step 2 of the decoupled flow. Because there is no deposit leg, this
  // transaction has no public sender, amount, or recipient — and the wallet
  // submits it via a paymaster, so the tx sender isn't the tipper either.
  // It calls NO contract and emits NO `Tipped` event, so it never appears in
  // the public tip wall. Requires a matured shielded balance (see `shield`).
  const sendPrivateTip = useCallback(
    async (amountStrk: string) => {
      if (!account) throw new Error("connect a wallet first");
      if (!privacySupported) {
        throw new Error("this wallet does not support STRK20 private tips");
      }
      if (submittingRef.current) return undefined; // a tip is already in flight
      submittingRef.current = true;
      setError(null);
      setTxPending(true);
      try {
        const amount = parseStrk(amountStrk);
        const actions: STRK20_ACTION[] = [
          {
            type: "transfer",
            token: CONFIG.strkAddress,
            amount: `0x${amount.toString(16)}`,
            recipient: CONFIG.ownerAddress,
          },
        ];
        const { transaction_hash } =
          await account.strk20InvokeTransaction(actions);
        await provider.waitForTransaction(transaction_hash);
        // No refresh(): a private tip emits no public event, so there is
        // nothing for the public wall to pick up — by design.
        return transaction_hash;
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
        throw e;
      } finally {
        submittingRef.current = false;
        setTxPending(false);
      }
    },
    [account, privacySupported],
  );

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Load the verified token list once, then (re)read balances against it.
  useEffect(() => {
    void fetchTokens(TOKENS).then(setTokens);
  }, []);

  useEffect(() => {
    if (address) void refreshPublicBalance(address);
  }, [address, refreshPublicBalance]);

  // Poll the chain head while a shielded note is still maturing, so the
  // countdown advances. Stops once the note is spendable.
  useEffect(() => {
    if (shieldedAtBlock === null) return;
    if (currentBlock !== null && currentBlock - shieldedAtBlock >= MATURITY_BLOCKS) {
      return;
    }
    const id = setInterval(() => {
      provider
        .getBlockNumber()
        .then(setCurrentBlock)
        .catch(() => {});
    }, 5000);
    return () => clearInterval(id);
  }, [shieldedAtBlock, currentBlock]);

  // Blocks left before the shielded note can be spent. null = nothing shielded
  // in this session yet.
  const blocksRemaining =
    shieldedAtBlock === null || currentBlock === null
      ? null
      : Math.max(0, MATURITY_BLOCKS - (currentBlock - shieldedAtBlock));

  return {
    address,
    selectWallet,
    clearWallet,
    privacySupported,
    sendTip,
    sendPrivateTip,
    shield,
    privateSwapToStrk,
    blocksRemaining,
    publicBalances,
    tokens,
    tips,
    total,
    count,
    refresh,
    txPending,
    error,
  };
}
