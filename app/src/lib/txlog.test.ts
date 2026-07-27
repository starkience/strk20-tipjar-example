import { describe, expect, it } from "vitest";
import { addSessionTx, mergeLog, type LogEntry } from "./txlog";

const entry = (over: Partial<LogEntry>): LogEntry => ({
  kind: "PUBLIC TIP",
  hash: "0x0",
  time: 0,
  ...over,
});

describe("mergeLog", () => {
  it("produces a unique hash per row (the duplicate-key bug)", () => {
    // A public tip made this session is in BOTH the session list and, after a
    // refresh, the on-chain tips. Same hash in both. Before the fix this
    // yielded two rows with key=0xabc — duplicate React keys, and a row that
    // could render collapsed/invisible.
    const session = [entry({ hash: "0xabc", session: true, status: "ok" })];
    const chain = [entry({ hash: "0xabc" }), entry({ hash: "0xold" })];

    const merged = mergeLog(session, chain);

    const hashes = merged.map((e) => e.hash);
    expect(hashes).toEqual(["0xabc", "0xold"]);
    expect(new Set(hashes).size).toBe(hashes.length); // no duplicate keys
  });

  it("keeps the session copy on overlap — it has the status and highlight", () => {
    const session = [entry({ hash: "0xabc", session: true, status: "ok" })];
    const chain = [entry({ hash: "0xabc" })];

    const [row] = mergeLog(session, chain);

    expect(row.session).toBe(true);
    expect(row.status).toBe("ok");
  });

  it("keeps every distinct transaction", () => {
    const session = [
      entry({ hash: "0x3", kind: "PRIVATE TIP" }),
      entry({ hash: "0x2", kind: "PRIVATE SWAP" }),
      entry({ hash: "0x1", kind: "SHIELD" }),
    ];
    const merged = mergeLog(session, []);
    expect(merged.map((e) => e.hash)).toEqual(["0x3", "0x2", "0x1"]);
  });
});

describe("addSessionTx", () => {
  it("dedupes a repeated hash (a re-render or double-fire)", () => {
    const s = addSessionTx([], entry({ hash: "0xabc" }));
    expect(addSessionTx(s, entry({ hash: "0xabc" }))).toHaveLength(1);
  });

  it("prepends — newest first", () => {
    let s: LogEntry[] = [];
    s = addSessionTx(s, entry({ hash: "0x1" }));
    s = addSessionTx(s, entry({ hash: "0x2" }));
    expect(s.map((e) => e.hash)).toEqual(["0x2", "0x1"]);
  });

  // The trap this guards against: two DIFFERENT transactions both arriving with
  // a falsy hash must not collapse into one. `some(e => e.hash === undefined)`
  // would have dropped the second — silently losing a real transaction.
  it("never collapses two hash-less transactions into one", () => {
    let s = addSessionTx([], entry({ hash: "", kind: "SHIELD" }));
    s = addSessionTx(s, entry({ hash: "", kind: "PRIVATE TIP" }));
    expect(s).toHaveLength(2);
    expect(s.map((e) => e.kind)).toEqual(["PRIVATE TIP", "SHIELD"]);
  });
});
