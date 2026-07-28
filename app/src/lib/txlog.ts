// TX-log data model and merge.
//
// The panel shows two sources: transactions started in THIS session and public
// tips already on-chain (from `Tipped` events). Two hard-won lessons shape this
// model:
//
//  1. A row must be able to exist BEFORE its hash does. A wallet can mine a
//     transaction and then fail to return the hash to the dapp (a dropped or
//     hung response over the wallet channel). If logging waited for the hash,
//     that successful transaction would never appear — which is exactly the
//     "some transactions aren't showing up" bug. So every session row is
//     identified by a client `id` assigned at submit time; the `hash` is filled
//     in later, if and when it arrives.
//
//  2. One row per hash on screen. A public tip made this session is in both the
//     session list and, after a refresh, the on-chain tips. The panel renders
//     keyed rows, and duplicate keys render unreliably (a row can end up
//     collapsed/invisible), so `mergeLog` drops any chain tip whose hash a
//     session row already carries. Hashes are felts, so they are compared by
//     canonical value (`normalizeHash`), never as raw strings — the wallet and
//     the RPC can spell the same hash with different leading-zero padding, and a
//     raw compare would miss the match and render the tip twice.

import { normalizeHash } from "./address";

// A row's status is FOUR distinct truths, not one. Conflating them is what made
// the log lie: a wallet rejection is not a revert, and "we couldn't confirm" is
// not "it failed". Each maps to different advice for the user.
//
//   pending      — submitted (or submitting); no on-chain result yet.
//   ok           — the chain confirmed it SUCCEEDED.
//   reverted     — the chain confirmed it was accepted but REVERTED on execution.
//   failed       — it never went through (rejected in wallet, or errored before
//                  any tx existed). Nothing happened; safe to retry.
//   unconfirmed  — a hash came back but we could not confirm it within the
//                  window. It MIGHT have landed (a paymaster can relay it under a
//                  different hash, or inclusion is just slow) — verify before
//                  retrying, don't assume failure.
export type TxStatus =
  | "pending"
  | "ok"
  | "reverted"
  | "failed"
  | "unconfirmed";

export type LogEntry = {
  /** Client id, assigned at submit time. Stable across hash/status patches. */
  id: string;
  kind: string;
  /** Filled in once the wallet returns it — may lag the row, or never arrive. */
  hash?: string;
  time: number;
  detail?: string;
  /** Made in this session — highlighted so it stands out from chain history. */
  session?: boolean;
  /** Outcome once known. A transaction can be accepted on-chain and still revert. */
  status?: TxStatus;
};

/** A create-or-patch for a session row, addressed by `id`. */
export type LogPatch = Partial<LogEntry> & { id: string };

/**
 * Upsert a session row by id: create it (newest first) if unseen, otherwise
 * merge the patch onto the existing row. This is what lets a row appear the
 * moment a transaction is submitted and gain its hash/status afterwards.
 */
export function upsertTx(session: LogEntry[], patch: LogPatch): LogEntry[] {
  const i = session.findIndex((e) => e.id === patch.id);
  if (i === -1) {
    return [{ time: 0, kind: "", ...patch } as LogEntry, ...session];
  }
  const next = session.slice();
  next[i] = { ...next[i], ...patch };
  return next;
}

/**
 * Merge session rows with on-chain public tips. Session rows come first (newest
 * first); a chain tip is dropped when a session row already carries its hash, so
 * the same transaction never renders twice. Chain tips always have a hash;
 * session rows may not yet, and are never dropped for lacking one.
 */
export function mergeLog(
  session: LogEntry[],
  chainTips: Array<Omit<LogEntry, "id"> & { hash: string }>,
): LogEntry[] {
  // Key by canonical felt, not the raw string: the wallet's `transaction_hash`
  // and the RPC event's `transaction_hash` can differ only in leading-zero
  // padding, and a raw compare would fail to dedup and render the tip twice. A
  // hash that can't be parsed as a felt falls back to its raw form rather than
  // throwing.
  const key = (h: string): string => {
    try {
      return normalizeHash(h);
    } catch {
      return h;
    }
  };
  const seen = new Set(
    session.filter((e) => e.hash).map((e) => key(e.hash as string)),
  );
  const chainOnly = chainTips
    .filter((t) => !seen.has(key(t.hash)))
    .map((t) => ({ ...t, id: t.hash }));
  return [...session, ...chainOnly];
}

// ---------------------------------------------------------------------------
// Persistence.
//
// The panel is the ONLY record of a private transaction: it calls no contract
// and emits no event, so nothing on-chain can reconstruct it after a reload.
// Kept purely in React state, every shield / private swap / private tip
// vanished the moment the tab refreshed — the literal "my transactions aren't
// reflected" complaint. So session rows are persisted to localStorage, scoped
// to the connected address (switching wallets must not show another account's
// history), and rehydrated on load.
//
// This is a LOCAL, per-device convenience — amounts and hashes only, on the
// user's own machine. It stores no keys and discloses nothing to anyone.

const STORAGE_PREFIX = "tipjar.txlog.v1";

/** Newest rows are prepended, so the newest `max` are simply the first `max`. */
export function capSession(session: LogEntry[], max: number): LogEntry[] {
  return session.length > max ? session.slice(0, max) : session;
}

/** Per-address key so one wallet's log never leaks into another's view. */
export function storageKey(address: string): string {
  return `${STORAGE_PREFIX}:${normalizeHash(address)}`;
}

/** Rehydrate this address's session rows. Returns [] on anything unexpected. */
export function loadSession(address: string): LogEntry[] {
  try {
    const raw = globalThis.localStorage?.getItem(storageKey(address));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as LogEntry[]) : [];
  } catch {
    return [];
  }
}

/** Persist this address's session rows, capped so storage cannot grow forever. */
export function saveSession(address: string, session: LogEntry[]): void {
  try {
    globalThis.localStorage?.setItem(
      storageKey(address),
      JSON.stringify(capSession(session, 50)),
    );
  } catch {
    // Storage unavailable/full — non-fatal; the log still works in-memory.
  }
}
