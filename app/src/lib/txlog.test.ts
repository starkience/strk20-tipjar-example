import { describe, expect, it } from "vitest";
import { mergeLog, upsertTx, type LogEntry } from "./txlog";

const row = (over: Partial<LogEntry> & { id: string }): LogEntry => ({
  kind: "SHIELD",
  time: 0,
  ...over,
});

describe("upsertTx", () => {
  it("creates a row the moment a tx is submitted — before any hash", () => {
    const s = upsertTx([], { id: "a", kind: "SHIELD", status: "pending" });
    expect(s).toHaveLength(1);
    expect(s[0].hash).toBeUndefined();
    expect(s[0].status).toBe("pending");
  });

  it("patches the same row with its hash later, without duplicating it", () => {
    let s = upsertTx([], { id: "a", kind: "SHIELD", status: "pending" });
    s = upsertTx(s, { id: "a", hash: "0xabc", status: "ok" });
    expect(s).toHaveLength(1);
    expect(s[0]).toMatchObject({ id: "a", hash: "0xabc", status: "ok" });
  });

  it("keeps distinct transactions distinct, newest first", () => {
    let s = upsertTx([], { id: "a", kind: "SHIELD" });
    s = upsertTx(s, { id: "b", kind: "PRIVATE TIP" });
    expect(s.map((e) => e.id)).toEqual(["b", "a"]);
  });

  // The failure this whole model exists to prevent: a successful tx whose hash
  // never came back must still be a visible row.
  it("a hash-less row survives — a missing hash never drops it", () => {
    let s = upsertTx([], { id: "a", kind: "SHIELD", status: "ok" });
    s = upsertTx(s, { id: "b", kind: "SHIELD", status: "ok" }); // also hash-less
    expect(s).toHaveLength(2);
  });

  // The reported bug, end to end: shield submitted (pending row), the wallet
  // never returns a hash, but the chain confirms the drop → the row flips to a
  // visible, successful SHIELD with no hash. One row throughout, never lost.
  it("shield confirmed by chain with no wallet hash → one visible ok row", () => {
    let s = upsertTx([], {
      id: "shield-1",
      kind: "SHIELD",
      detail: "5 STRK",
      status: "pending",
    });
    s = upsertTx(s, {
      id: "shield-1",
      status: "ok",
      detail: "5 STRK — confirm in wallet",
    });
    expect(s).toHaveLength(1);
    expect(s[0]).toMatchObject({ kind: "SHIELD", status: "ok" });
    expect(s[0].hash).toBeUndefined();
  });
});

describe("mergeLog", () => {
  it("drops a chain tip whose hash a session row already carries", () => {
    const session = [row({ id: "a", kind: "PUBLIC TIP", hash: "0xabc", session: true })];
    const chain = [
      { kind: "PUBLIC TIP", time: 0, hash: "0xabc" },
      { kind: "PUBLIC TIP", time: 0, hash: "0xold" },
    ];
    const merged = mergeLog(session, chain);
    const hashes = merged.map((e) => e.hash);
    expect(hashes).toEqual(["0xabc", "0xold"]);
    expect(new Set(merged.map((e) => e.id)).size).toBe(merged.length); // unique keys
  });

  it("keeps a session row that has no hash yet alongside chain tips", () => {
    const session = [row({ id: "pending-shield", kind: "SHIELD", status: "pending" })];
    const chain = [{ kind: "PUBLIC TIP", time: 0, hash: "0xold" }];
    const merged = mergeLog(session, chain);
    expect(merged.map((e) => e.id)).toEqual(["pending-shield", "0xold"]);
  });

  it("gives chain tips a stable id derived from their hash", () => {
    const merged = mergeLog([], [{ kind: "PUBLIC TIP", time: 0, hash: "0xold" }]);
    expect(merged[0].id).toBe("0xold");
  });
});
