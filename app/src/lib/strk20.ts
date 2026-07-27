// strk20 — the STRK20 action shapes, as pure functions.
//
// This is the whole privacy surface of the app, in one readable file. Every
// private operation is an array of `STRK20_ACTION` handed to the wallet via
// `WalletAccountV6.strk20InvokeTransaction(actions)`; the wallet holds the keys,
// finds the notes, proves, and submits. The app never touches a viewing key.
//
// These are kept pure and separate from the hook for two reasons: a reader can
// see the exact shapes without wading through React, and the decisions encoded
// here are pinned by tests in `strk20.test.ts` rather than living only in prose.

import type { STRK20_ACTION } from "@starknet-io/types-js";
import { compareVersions } from "starknet";

/**
 * The Wallet API version that introduced the STRK20 methods. A wallet
 * advertising this or later is treated as privacy-capable.
 */
export const MIN_STRK20_WALLET_API = "0.10.3";

/** Amounts cross the Wallet API as hex felts. */
const toFelt = (amount: bigint): string => `0x${amount.toString(16)}`;

/**
 * Decide STRK20 capability from a wallet's advertised Wallet-API versions.
 *
 * Deliberately a pure function over version strings: capability detection must
 * never read private state. The tempting shortcut — call `strk20Balances([])`
 * and see whether it throws — makes the wallet raise a "share your balances?"
 * consent prompt before the user has asked for anything private.
 */
export function supportsStrk20(versions: readonly string[]): boolean {
  return versions.some((v) => compareVersions(v, MIN_STRK20_WALLET_API) >= 0);
}

/**
 * Shield: move public ERC-20 into the pool.
 *
 * This is a public leg — the deposit names the depositor on-chain. That is
 * inherent to the pool's edge, and it is why it must be its own transaction
 * (see `buildPrivateTipActions`).
 */
export function buildShieldActions(
  tokenAddress: string,
  amount: bigint,
): STRK20_ACTION[] {
  return [{ type: "deposit", token: tokenAddress, amount: toFelt(amount) }];
}

/**
 * Private transfer: move value inside the pool, to the creator.
 *
 * **Exactly one action, and never a `deposit` alongside it.** Bundling the
 * shield into this transaction would be one click and one fee, and it would
 * destroy the privacy: the deposit is a public leg naming the sender, so an
 * observer seeing both in one transaction can correlate the two ends.
 *
 * Unlinkability comes from shielding *earlier, separately* — not from the
 * transfer itself. The extra transaction, the extra pool fee and the ~10-block
 * maturity wait are the price of that.
 */
export function buildPrivateTipActions(
  strkAddress: string,
  amount: bigint,
  recipient: string,
): STRK20_ACTION[] {
  return [
    {
      type: "transfer",
      token: strkAddress,
      amount: toFelt(amount),
      recipient,
    },
  ];
}
