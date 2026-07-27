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
  // The user's own shielded balance — only populated when they explicitly ask
  // (readShieldedBalance), since that read prompts the wallet for consent.
  const [shieldedBalance, setShieldedBalance] = useState<bigint | null>(null);
  const [tips, setTips] = useState<TipEvent[]>([]);
  const [total, setTotal] = useState<bigint>(0n);
  const [count, setCount] = useState<number>(0);
  const [txPending, setTxPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Synchronous re-entrancy lock: the `txPending` state disables the button, but
  // React state lags a render, so a fast double-click can slip a second tx
  // through. A ref updates immediately and blocks that. Prevents double-shields.
  const submittingRef = useRef(false);

  // Attach to the wallet the user picked in the get-starknet modal: build a
  // WalletAccountV6 for sending, then check STRK20 capability.
  const selectWallet = useCallback(async (wallet: WalletWithStarknetFeatures) => {
    setError(null);
    try {
      const wa = await WalletAccountV6.connect(provider, wallet);
      setAccount(wa);
      setAddress(wa.address);
      // Detect STRK20 support via the wallet's advertised Wallet-API versions —
      // no balance query, no viewing key, no private data read.
      setPrivacySupported(await walletSupportsStrk20(wallet));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  // Called when the modal reports a disconnect.
  const clearWallet = useCallback(() => {
    setAccount(null);
    setAddress(null);
    setPrivacySupported(false);
    setShieldedBalance(null);
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
        return transaction_hash;
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
        throw e;
      } finally {
        submittingRef.current = false;
        setTxPending(false);
      }
    },
    [account, refresh],
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

  // Read the user's OWN shielded balance — wallet-mediated, so it prompts for
  // consent. Deliberately NOT called automatically: it runs only when the user
  // explicitly asks, so the prompt is never a surprise. The dapp never sees a
  // viewing key; the wallet returns only balances for the tokens we name.
  const readShieldedBalance = useCallback(async () => {
    if (!account) throw new Error("connect a wallet first");
    setError(null);
    try {
      const entries = await account.strk20Balances([CONFIG.strkAddress]);
      const entry = entries.find(
        (e) => BigInt(e.token) === BigInt(CONFIG.strkAddress),
      );
      const bal = entry ? BigInt(entry.balance) : 0n;
      setShieldedBalance(bal);
      return bal;
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      throw e;
    }
  }, [account]);

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

  return {
    address,
    selectWallet,
    clearWallet,
    privacySupported,
    sendTip,
    sendPrivateTip,
    shield,
    shieldedBalance,
    readShieldedBalance,
    tips,
    total,
    count,
    refresh,
    txPending,
    error,
  };
}
