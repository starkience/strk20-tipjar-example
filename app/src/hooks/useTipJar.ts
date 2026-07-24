// useTipJar — all of the app's Starknet wiring in one hook.
//
// Part 2 (STRK20) migrated wallet discovery + connection to get-starknet v6 and
// starknet.js WalletAccountV6. WalletAccountV6 keeps the normal account API
// (`execute`, `address`), so the PUBLIC tip path (`sendTip`) is unchanged — it
// ALSO exposes STRK20 actions (`strk20Balances`, `strk20InvokeTransaction`) that
// the private path (Phase 2) uses. `privacySupported` is a runtime capability
// probe so the UI can degrade gracefully on wallets without STRK20 support.

import { useCallback, useEffect, useState } from "react";
import { RpcProvider, WalletAccountV6 } from "starknet";
import { createStore } from "@starknet-io/get-starknet-discovery";
import type { WalletWithStarknetFeatures } from "@starknet-io/get-starknet-wallet-standard/features";
import { CONFIG } from "../config";
import {
  buildTipCalls,
  parseStrk,
  parseTippedEvent,
  TIPPED_SELECTOR,
  type TipEvent,
} from "../lib/tipjar";

const provider = new RpcProvider({ nodeUrl: CONFIG.rpcUrl });
// Created once so get-starknet starts listening for wallet-standard wallets
// immediately (extensions can register after the page loads).
const walletStore = createStore();

export function useTipJar() {
  const [account, setAccount] = useState<WalletAccountV6 | null>(null);
  const [address, setAddress] = useState<string | null>(null);
  const [wallets, setWallets] = useState<WalletWithStarknetFeatures[]>([]);
  const [privacySupported, setPrivacySupported] = useState(false);
  const [tips, setTips] = useState<TipEvent[]>([]);
  const [total, setTotal] = useState<bigint>(0n);
  const [count, setCount] = useState<number>(0);
  const [txPending, setTxPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Connect to a specific discovered wallet, then probe STRK20 capability.
  const selectWallet = useCallback(async (wallet: WalletWithStarknetFeatures) => {
    setError(null);
    try {
      const wa = await WalletAccountV6.connect(provider, wallet);
      setAccount(wa);
      setAddress(wa.address);
      setWallets([]);
      // Capability probe: a read-only STRK20 call. It resolves on
      // privacy-enabled wallets (e.g. Ready) and throws on wallets without
      // STRK20 support — the dapp never sees a viewing key either way.
      try {
        await wa.strk20Balances([]);
        setPrivacySupported(true);
      } catch {
        setPrivacySupported(false);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  // Open the picker: discover wallets via get-starknet v6. Auto-connect when
  // there is exactly one; otherwise expose the list for the UI to choose from.
  const connectWallet = useCallback(async () => {
    setError(null);
    const found = walletStore.getWallets();
    if (found.length === 0) {
      setError("No Starknet wallet found. Install the Ready extension for private tips.");
      return;
    }
    if (found.length === 1) {
      await selectWallet(found[0]);
    } else {
      setWallets(found);
    }
  }, [selectWallet]);

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
        setTxPending(false);
      }
    },
    [account, refresh],
  );

  useEffect(() => {
    refresh();
  }, [refresh]);

  return {
    address,
    wallets,
    connectWallet,
    selectWallet,
    privacySupported,
    sendTip,
    tips,
    total,
    count,
    refresh,
    txPending,
    error,
  };
}
