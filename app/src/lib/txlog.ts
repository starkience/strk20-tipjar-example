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
//     session row already carries.

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
  status?: "pending" | "ok" | "reverted";
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
  const sessionHashes = new Set(
    session.filter((e) => e.hash).map((e) => e.hash),
  );
  const chainOnly = chainTips
    .filter((t) => !sessionHashes.has(t.hash))
    .map((t) => ({ ...t, id: t.hash }));
  return [...session, ...chainOnly];
}
