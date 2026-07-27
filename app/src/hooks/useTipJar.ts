// useTipJar — all of the app's Starknet wiring in one hook.
//
// Part 2 (STRK20) migrated wallet discovery + connection to get-starknet v6 and
// starknet.js WalletAccountV6. WalletAccountV6 keeps the normal account API
// (`execute`, `address`), so the PUBLIC tip path (`sendTip`) is unchanged — it
// ALSO exposes STRK20 actions (`strk20InvokeTransaction`) that the private path
// (Phase 2) uses. `privacySupported` is a runtime capability check so the UI can
// degrade gracefully on wallets without STRK20 support.

import { useCallback, useEffect, useRef, useState } from "react";
import { RpcProvider, WalletAccountV6, walletV6 } from "starknet";
import type { WalletWithStarknetFeatures } from "@starknet-io/get-starknet-wallet-standard/features";
import type { STRK20_ACTION } from "@starknet-io/types-js";
import { CONFIG } from "../config";
import {
  buildTipCalls,
  parseStrk,
  parseTippedEvent,
  TIPPED_SELECTOR,
  type TipEvent,
} from "../lib/tipjar";

const provider = new RpcProvider({ nodeUrl: CONFIG.rpcUrl });

/** Notes mature 10 blocks after creation — they cannot be spent before that. */
export const MATURITY_BLOCKS = 10;

// Capability check that NEVER touches balances or keys: ask the wallet which
// Wallet-API versions it supports. STRK20 (the Privacy Wallet API) ships in
// v0.10.3, so a wallet advertising >= 0.10 supports the private actions. This
// is a plain "what do you support?" query — the dapp reads no private data.
async function walletSupportsStrk20(
  wallet: WalletWithStarknetFeatures,
): Promise<boolean> {
  try {
    const versions = await walletV6.supportedWalletApi(wallet);
    return versions.some((v) => {
      const [major, minor] = v.split(".").map((n) => parseInt(n, 10));
      return major > 0 || (major === 0 && minor >= 10);
    });
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
  // The connected account's PUBLIC STRK balance. This is ordinary public chain
  // data read over RPC (like the jar's totals) — no wallet involvement and no
  // consent prompt, unlike shielded balances which the app never reads.
  const [publicBalance, setPublicBalance] = useState<bigint | null>(null);
  const [tips, setTips] = useState<TipEvent[]>([]);
  const [total, setTotal] = useState<bigint>(0n);
  const [count, setCount] = useState<number>(0);
  const [txPending, setTxPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Synchronous re-entrancy lock: the `txPending` state disables the button, but
  // React state lags a render, so a fast double-click can slip a second tx
  // through. A ref updates immediately and blocks that. Prevents double-shields.
  const submittingRef = useRef(false);

  // Public STRK balance of an address, over RPC. Public data — no wallet call.
  const refreshPublicBalance = useCallback(async (addr: string) => {
    try {
      const [low, high] = await provider.callContract({
        contractAddress: CONFIG.strkAddress,
        entrypoint: "balanceOf",
        calldata: [addr],
      });
      setPublicBalance(BigInt(low) + (BigInt(high) << 128n));
    } catch {
      // Non-fatal: the amount field still works without a balance readout.
    }
  }, []);

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
    setPublicBalance(null);
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
    async (amountStrk: string) => {
      if (!account) throw new Error("connect a wallet first");
      if (!privacySupported) {
        throw new Error("this wallet does not support STRK20");
      }
      if (submittingRef.current) return undefined;
      submittingRef.current = true;
      setError(null);
      setTxPending(true);
      try {
        const amount = parseStrk(amountStrk);
        const actions: STRK20_ACTION[] = [
          {
            type: "deposit",
            token: CONFIG.strkAddress,
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
    blocksRemaining,
    publicBalance,
    tips,
    total,
    count,
    refresh,
    txPending,
    error,
  };
}
