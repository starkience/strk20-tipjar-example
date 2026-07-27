// TX-log data model and merge.
//
// The panel shows two sources: transactions made in THIS session (shield, swap,
// private tip, public tip — added optimistically the moment they are submitted)
// and public tips already on-chain (read from `Tipped` events). These overlap:
// a public tip made this session is in BOTH lists, under the same hash.
//
// `mergeLog` is the single place that reconciles them. It must guarantee one
// entry per hash, because the panel renders `key={hash}` — duplicate keys make
// React's reconciliation unreliable, and this list animates rows imperatively
// (height/opacity), so a duplicate key can leave a real row collapsed and
// invisible. That is the "some transactions aren't showing up" bug this fixes.

export type LogEntry = {
  kind: string;
  hash: string;
  time: number;
  detail?: string;
  /** Made in this session — highlighted so it stands out from chain history. */
  session?: boolean;
  /** Outcome once known. A transaction can be accepted on-chain and still revert. */
  status?: "pending" | "ok" | "reverted";
};

/**
 * Merge session entries with on-chain public tips into one list with a unique
 * hash per row. Session entries win on overlap: they carry the live status and
 * the this-session highlight, and they are what the user just watched happen.
 *
 * Order is preserved: session entries (newest first) then chain-only tips.
 */
export function mergeLog(
  session: LogEntry[],
  chainTips: LogEntry[],
): LogEntry[] {
  const seen = new Set<string>();
  const out: LogEntry[] = [];
  for (const e of [...session, ...chainTips]) {
    if (seen.has(e.hash)) continue;
    seen.add(e.hash);
    out.push(e);
  }
  return out;
}

/**
 * Add a just-submitted transaction to the session list. Deduped by hash so a
 * re-render or a double-fire cannot add the same row twice — but NEVER collapse
 * two genuinely different transactions that happen to lack a hash: an entry with
 * no hash is always kept, since a missing hash is not evidence of sameness.
 */
export function addSessionTx(session: LogEntry[], entry: LogEntry): LogEntry[] {
  if (entry.hash && session.some((e) => e.hash === entry.hash)) return session;
  return [entry, ...session];
}
