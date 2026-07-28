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
import {
  createStrk20WalletProver,
  executePrivateSwap,
  getQuotes,
  PRIVACY_POOL_ADDRESS,
} from "@avnu/avnu-sdk";
import { CONFIG, POOL_FEE_STRK, STRK, TOKENS, type Token } from "../config";
import { fetchAllowance, fetchBalances, fetchTokens } from "../lib/tokens";
import { friendlyError } from "../lib/errors";
import type { LogPatch } from "../lib/txlog";
import {
  buildPrivateTipActions,
  buildShieldActions,
  supportsStrk20,
} from "../lib/strk20";
import {
  buildTipCalls,
  formatUnits,
  parseStrk,
  parseUnits,
  parseTippedEvent,
  TIPPED_SELECTOR,
  type TipEvent,
} from "../lib/tipjar";

const provider = new RpcProvider({ nodeUrl: CONFIG.rpcUrl });

/**
 * Wait for confirmation, but never block the UI forever. Paymaster-relayed
 * transactions can take a while to become visible to our RPC, and a hung await
 * would leave buttons disabled with no feedback.
 */
// Note: there is deliberately NO automatic timeout on wallet calls. Proving a
// private transaction legitimately takes minutes, and auto-releasing the lock
// mid-proof would re-enable the button while the request is still live — which
// is how a user ends up submitting the same operation twice. The visible
// CANCEL control is the escape hatch instead: a human decides, having been told
// the request may still be in flight.

export type TxStatus = "pending" | "ok" | "reverted";

/**
 * Wait for confirmation and report what actually happened. A transaction can be
 * accepted on-chain and still REVERT — the relayer retried our swap and the
 * first attempt reverted in the same block — so "submitted" is not "worked".
 * Never blocks forever: paymaster-relayed hashes can take a while to become
 * visible, and an unbounded await would strand the UI.
 */
async function settle(hash: string, ms = 60_000): Promise<TxStatus> {
  try {
    await Promise.race([
      provider.waitForTransaction(hash),
      new Promise((resolve) => setTimeout(resolve, ms)),
    ]);
  } catch {
    // waitForTransaction rejects on revert — the receipt below tells us which.
  }
  try {
    const receipt = (await provider.getTransactionReceipt(hash)) as {
      execution_status?: string;
    };
    if (receipt?.execution_status === "REVERTED") return "reverted";
    if (receipt?.execution_status === "SUCCEEDED") return "ok";
  } catch {
    // Not visible yet — leave it pending rather than claiming success.
  }
  return "pending";
}

/** Notes mature 10 blocks after creation — they cannot be spent before that. */
export const MATURITY_BLOCKS = 10;

/**
 * Advance a pending row's detail while a private transaction proves. Proving can
 * take a minute, and the wallet returns the hash only when it's done — so
 * without this the row would sit at "waiting for wallet" and look frozen. Purely
 * cosmetic; returns a clear function to call once the hash arrives or it fails.
 */
function startProvingHints(
  log: (patch: LogPatch) => void,
  id: string,
  base: string,
): () => void {
  const t1 = setTimeout(() => log({ id, detail: `${base} — proving…` }), 8_000);
  const t2 = setTimeout(
    () => log({ id, detail: `${base} — still proving, this can take a minute` }),
    30_000,
  );
  return () => {
    clearTimeout(t1);
    clearTimeout(t2);
  };
}

/**
 * Poll the public balance until it drops by at least `atLeast`, or give up.
 *
 * This is how a shield is confirmed against the CHAIN rather than against the
 * wallet's reply. A wallet can mine a shield and then fail to return the hash to
 * the dapp (a hung or dropped response). Watching the public balance fall — the
 * tokens visibly leaving the account for the pool — proves the shield landed
 * without needing that reply. Resolves true on the drop, false on timeout.
 */
async function waitForBalanceDrop(
  owner: string,
  token: Token,
  before: bigint,
  atLeast: bigint,
  ms = 45_000,
): Promise<boolean> {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 3000));
    try {
      const bal = await fetchBalances(CONFIG.rpcUrl, owner, [token]);
      const now = bal[token.address];
      if (now !== undefined && before - now >= atLeast) return true;
    } catch {
      // Transient RPC error — keep polling until the deadline.
    }
  }
  return false;
}

// Capability check that NEVER touches balances or keys: ask the wallet which
// Wallet-API versions it supports. The STRK20 methods ship in wallet API
// >= 0.10.3 (Ready, Xverse) — the same probe AVNU documents. Wallets predating
// `supportedWalletApi` throw, and are treated as not capable.
async function walletSupportsStrk20(
  wallet: WalletWithStarknetFeatures,
): Promise<boolean> {
  try {
    return supportsStrk20(await walletV6.supportedWalletApi(wallet));
  } catch {
    return false;
  }
}

export type TxKind = "PUBLIC TIP" | "SHIELD" | "PRIVATE SWAP" | "PRIVATE TIP";

let logSeq = 0;
/** A client id for a log row, assigned before the tx is even sent. */
const nextLogId = () => `tx-${(logSeq += 1)}`;

export function useTipJar(opts?: {
  /**
   * Create-or-patch a log row, addressed by `id`. Called first at submit time
   * (status "pending", no hash) so the row appears immediately, then again to
   * fill in the hash and final status. Decoupling the row from the hash is what
   * keeps a transaction visible even when the wallet never returns its hash.
   */
  onLog?: (patch: LogPatch) => void;
}) {
  const onLogRef = useRef(opts?.onLog);
  onLogRef.current = opts?.onLog;
  const log = useCallback((patch: LogPatch) => onLogRef.current?.(patch), []);
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
  // Tokens the pool is already approved to pull. A token missing here needs an
  // approve first, which is a second wallet prompt and a slower first shield.
  const [approved, setApproved] = useState<Record<string, boolean>>({});
  // The user's SHIELDED balances, keyed by token address. Populated only when
  // they explicitly ask (step 2) — reading these is wallet-mediated and prompts
  // for consent, so it never happens on its own.
  const [shieldedBalances, setShieldedBalances] = useState<Record<
    string,
    bigint
  > | null>(null);
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
      setError(friendlyError(e));
    }
    },
    [refreshPublicBalance],
  );

  const dismissError = useCallback(() => setError(null), []);

  /** Public read — no wallet call. Tells the UI whether a shield needs approving. */
  const checkApproval = useCallback(
    async (token: Token) => {
      if (!address) return;
      const allowance = await fetchAllowance(
        CONFIG.rpcUrl,
        address,
        token.address,
        PRIVACY_POOL_ADDRESS,
      );
      if (allowance === null) return;
      // Each deposit spends the allowance it was given, so this is not a
      // one-time setup: a fresh approve is needed whenever the remaining
      // allowance no longer covers the amount being shielded.
      setApproved((a) => ({ ...a, [token.address]: allowance > 0n }));
    },
    [address],
  );

  // Manual escape hatch for a wallet prompt that never comes back. This only
  // releases the UI — it cannot cancel a request the wallet may still be
  // holding, so warn rather than pretend the operation was stopped.
  const cancelPending = useCallback(() => {
    submittingRef.current = false;
    setTxPending(false);
    setError(
      "STOPPED WAITING. THE TRANSACTION MAY STILL COMPLETE — PRESS SHOW TO CHECK YOUR BALANCE BEFORE RETRYING",
    );
  }, []);

  // Called when the modal reports a disconnect.
  const clearWallet = useCallback(() => {
    setAccount(null);
    setAddress(null);
    setPrivacySupported(false);
    setPublicBalances({});
    setShieldedBalances(null);
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
      setError(friendlyError(e));
    }
  }, []);

  // Ask the WALLET for the user's own shielded balances. This is a disclosure:
  // the wallet prompts for consent before answering. Wired to an explicit button
  // so it is always the user's decision — the dapp still never sees a viewing
  // key, only the numbers for the tokens it names.
  const readShieldedBalances = useCallback(
    async (wanted: Token[]) => {
      if (!account) throw new Error("connect a wallet first");
      setError(null);
      try {
        const entries = await account.strk20Balances(
          wanted.map((t) => t.address),
        );
        const map: Record<string, bigint> = {};
        for (const t of wanted) {
          const hit = entries.find(
            (e) => BigInt(e.token) === BigInt(t.address),
          );
          map[t.address] = hit ? BigInt(hit.balance) : 0n;
        }
        setShieldedBalances(map);
        return map;
      } catch (e) {
        setError(friendlyError(e));
        throw e;
      }
    },
    [account],
  );

  // Deliberately NO automatic refresh after actions. Ready re-prompts for
  // consent on every strk20Balances call — it does not remember a previous
  // grant — so refreshing "helpfully" after each shield or swap turned into a
  // consent dialog after every operation. Reading balances stays strictly
  // manual: it happens when the user presses SHOW, and at no other time.

  // PUBLIC tip: unchanged. approve + tip multicall through the normal account
  // API (WalletAccountV6 inherits `execute`), then wait and refresh.
  const sendTip = useCallback(
    async (amountStrk: string) => {
      if (!account) throw new Error("connect a wallet first");
      if (submittingRef.current) return undefined; // a tip is already in flight
      submittingRef.current = true;
      setError(null);
      setTxPending(true);
      const id = nextLogId();
      log({ id, kind: "PUBLIC TIP", detail: `${amountStrk} STRK`, status: "pending", time: Date.now() });
      try {
        const amount = parseStrk(amountStrk);
        const calls = buildTipCalls(
          CONFIG.strkAddress,
          CONFIG.tipJarAddress,
          amount,
        );
        const { transaction_hash } = await account.execute(calls);
        log({ id, hash: transaction_hash });
        log({ id, status: await settle(transaction_hash) });
        await refresh();
        void refreshPublicBalance(account.address);
        return transaction_hash;
      } catch (e) {
        log({ id, status: "reverted" });
        setError(friendlyError(e));
        throw e;
      } finally {
        submittingRef.current = false;
        setTxPending(false);
      }
    },
    [account, refresh, refreshPublicBalance, log],
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

      // Log the row NOW, before sending — so the shield is visible even if the
      // wallet never returns its hash.
      const id = nextLogId();
      const detail = `${amountStr} ${token.symbol}`;
      log({ id, kind: "SHIELD", detail, status: "pending", time: Date.now() });

      const anchorMaturity = async () => {
        const head = await provider.getBlockNumber().catch(() => null);
        if (head !== null) {
          setShieldedAtBlock(head);
          setCurrentBlock(head);
        }
      };

      try {
        const amount = parseUnits(amountStr, token.decimals);
        const balances = await fetchBalances(CONFIG.rpcUrl, account.address, [
          token,
        ]).catch((): Record<string, bigint> => ({}));
        const before = balances[token.address] ?? null;

        const actions = buildShieldActions(token.address, amount);
        const walletCall = account.strk20InvokeTransaction(actions);

        // Confirm the shield against whichever proves it first: the wallet's
        // reply, or the tokens visibly leaving the public account on-chain.
        //
        // A wallet ERROR must NOT win this race. The failure we are fixing is a
        // wallet that mines the shield and then reports a network error anyway —
        // concluding "failed" on that error would be exactly wrong. So a wallet
        // error is captured and only consulted if the chain also shows no drop.
        type Outcome = { hash: string } | { chain: boolean };
        let walletErr: unknown;
        const walletHash: Promise<Outcome> = walletCall.then(
          (r) => ({ hash: r.transaction_hash }),
          (err) => {
            walletErr = err;
            return new Promise<Outcome>(() => {}); // an error never wins
          },
        );
        const chain: Promise<Outcome> =
          before === null
            ? new Promise<Outcome>((resolve) =>
                setTimeout(() => resolve({ chain: false }), 45_000),
              )
            : waitForBalanceDrop(
                account.address,
                token,
                before,
                (amount * 9n) / 10n,
              ).then((dropped) => ({ chain: dropped }));

        const outcome = await Promise.race<Outcome>([walletHash, chain]);

        if ("hash" in outcome) {
          log({ id, hash: outcome.hash });
          log({ id, status: await settle(outcome.hash) });
          await anchorMaturity();
          void refreshPublicBalance(account.address);
          return outcome.hash;
        }

        if (outcome.chain) {
          // The shield landed on-chain but the wallet was slow or errored.
          // Proceed now; backfill the hash if the wallet ever answers. The copy
          // must NOT invite a re-shield — this branch re-enables the button.
          log({ id, status: "ok", detail: `${detail} — done, don't re-shield` });
          await anchorMaturity();
          void refreshPublicBalance(account.address);
          walletCall
            .then((r) => log({ id, hash: r.transaction_hash, detail }))
            .catch(() => {});
          return undefined;
        }

        // No hash and no on-chain drop within the window: a real failure.
        log({ id, status: "reverted" });
        const err = walletErr ?? new Error("shield not confirmed");
        setError(friendlyError(err));
        throw err;
      } catch (e) {
        setError(friendlyError(e));
        throw e;
      } finally {
        submittingRef.current = false;
        setTxPending(false);
      }
    },
    [account, privacySupported, refreshPublicBalance, log],
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
      const id = nextLogId();
      const swapDetail = `${amountStr} ${token.symbol} → STRK`;
      log({ id, kind: "PRIVATE SWAP", detail: swapDetail, status: "pending", time: Date.now() });
      const clearHints = startProvingHints(log, id, swapDetail);
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

        const { transactionHash } = await executePrivateSwap(
          {
            quote,
            slippage: 0.05,
            takerAddress: account.address,
            poolAddress: PRIVACY_POOL_ADDRESS,
            feeMode: { poolFeeToken: STRK.address },
            prover: createStrk20WalletProver(account),
            // Empty in production: the key is attached by our proxy instead.
            paymasterApiKey: CONFIG.avnuPaymasterApiKey || undefined,
          },
          // Route paymaster calls through our own serverless function so the
          // API key never ships in the bundle. Undefined in dev, where the SDK
          // talks to AVNU directly using the key above.
          { paymasterBaseUrl: CONFIG.avnuPaymasterBaseUrl },
        );
        clearHints();
        log({ id, hash: transactionHash, detail: swapDetail });
        const status = await settle(transactionHash);
        log({ id, status });

        // Only claim the swap succeeded when the chain confirms it did.
        // Returning the hash regardless made the UI mark "SWAPPED" even on a
        // revert, and AVNU's paymaster can revert-and-retry, so a hash is not
        // proof. On anything but a confirmed success, return undefined so the
        // step does not advance and the user is told to verify.
        if (status === "reverted") {
          setError(
            "PRIVATE SWAP REVERTED — CHECK YOUR SHIELDED STRK (SHOW) BEFORE RETRYING",
          );
          return undefined;
        }
        if (status === "pending") {
          setError(
            "SWAP SUBMITTED BUT NOT YET CONFIRMED — PRESS SHOW TO CHECK YOUR SHIELDED STRK BEFORE TIPPING",
          );
          return undefined;
        }
        // Confirmed. A swap credits a NEW note, subject to the same ~10-block
        // maturity as a shield — re-anchor the countdown so tipping straight
        // after does not spend an immature note.
        const head = await provider.getBlockNumber();
        setShieldedAtBlock(head);
        setCurrentBlock(head);
        return transactionHash;
      } catch (e) {
        clearHints();
        log({ id, status: "reverted" });
        setError(friendlyError(e));
        throw e;
      } finally {
        submittingRef.current = false;
        setTxPending(false);
      }
    },
    [account, privacySupported, log],
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

      // Every private operation also pays the pool fee out of the shielded
      // balance, so a 1 STRK tip actually needs 1 + fee. Check it here when the
      // balance is known: otherwise the shortfall only appears as a generic
      // paymaster execution error, after the user has already signed.
      const amount = parseStrk(amountStrk);
      const shieldedStrk = shieldedBalances?.[STRK.address];
      if (shieldedStrk !== undefined && amount + POOL_FEE_STRK > shieldedStrk) {
        setError(
          `NEEDS ${formatUnits(amount + POOL_FEE_STRK, 18)} STRK SHIELDED ` +
            `(TIP + ${formatUnits(POOL_FEE_STRK, 18)} POOL FEE) — YOU HAVE ` +
            `${formatUnits(shieldedStrk, 18)}`,
        );
        return undefined;
      }

      submittingRef.current = true;
      setError(null);
      setTxPending(true);
      const id = nextLogId();
      const base = `${amountStrk} STRK`;
      log({ id, kind: "PRIVATE TIP", detail: base, status: "pending", time: Date.now() });
      const clearHints = startProvingHints(log, id, base);
      try {
        const actions = buildPrivateTipActions(
          CONFIG.strkAddress,
          amount,
          CONFIG.ownerAddress,
        );
        const { transaction_hash } =
          await account.strk20InvokeTransaction(actions);
        clearHints();
        log({ id, hash: transaction_hash, detail: base });
        log({ id, status: await settle(transaction_hash) });
        // No refresh(): a private tip emits no public event, so there is
        // nothing for the public wall to pick up — by design.
        return transaction_hash;
      } catch (e) {
        clearHints();
        log({ id, status: "reverted" });
        setError(friendlyError(e));
        throw e;
      } finally {
        submittingRef.current = false;
        setTxPending(false);
      }
    },
    [account, privacySupported, shieldedBalances, log],
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
    approved,
    checkApproval,
    tokens,
    shieldedBalances,
    readShieldedBalances,
    tips,
    total,
    count,
    refresh,
    txPending,
    error,
    dismissError,
    cancelPending,
  };
}
