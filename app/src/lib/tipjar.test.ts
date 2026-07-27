import { describe, it, expect } from "vitest";
import {
  buildTipCalls,
  formatDisplay,
  parseStrk,
  formatStrk,
  parseTippedEvent,
  TIPPED_SELECTOR,
} from "./tipjar";
import { hash } from "starknet";
import { friendlyError } from "./errors";

const STRK = "0x4718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d";
const JAR = "0x1234";

describe("parseStrk / formatStrk", () => {
  it("parses whole and fractional STRK to wei", () => {
    expect(parseStrk("1")).toBe(10n ** 18n);
    expect(parseStrk("1.5")).toBe(15n * 10n ** 17n);
    expect(parseStrk("0.000000000000000001")).toBe(1n);
  });
  it("rejects bad input", () => {
    expect(() => parseStrk("")).toThrow();
    expect(() => parseStrk("abc")).toThrow();
    expect(() => parseStrk("-1")).toThrow();
  });
  it("formats wei back to STRK, round-trip", () => {
    expect(formatStrk(15n * 10n ** 17n)).toBe("1.5");
    expect(formatStrk(10n ** 18n)).toBe("1");
    expect(parseStrk(formatStrk(123456n))).toBe(123456n);
  });
});

describe("buildTipCalls", () => {
  it("builds approve + tip multicall with u256 calldata", () => {
    const calls = buildTipCalls(STRK, JAR, 15n * 10n ** 17n);
    expect(calls).toHaveLength(2);
    expect(calls[0]).toEqual({
      contractAddress: STRK,
      entrypoint: "approve",
      calldata: [JAR, "1500000000000000000", "0"],
    });
    expect(calls[1]).toEqual({
      contractAddress: JAR,
      entrypoint: "tip",
      calldata: ["1500000000000000000", "0"],
    });
  });
});

describe("parseTippedEvent", () => {
  it("uses the sn_keccak of the event variant name as selector", () => {
    expect(TIPPED_SELECTOR).toBe(hash.getSelectorFromName("Tipped"));
  });
  it("parses keys and data into a TipEvent", () => {
    const tipper = "0xabc";
    const raw = {
      keys: [TIPPED_SELECTOR, tipper],
      data: ["0x14d1120d7b160000", "0x0", "0x6553f100"], // 1.5e18 low, high, ts
      transaction_hash: "0xdead",
    };
    const evt = parseTippedEvent(raw);
    expect(evt.tipper).toBe(tipper);
    expect(evt.amount).toBe(15n * 10n ** 17n);
    expect(evt.timestamp).toBe(0x6553f100);
    expect(evt.txHash).toBe("0xdead");
  });
});

describe("formatDisplay", () => {
  it("rounds to 2 decimals and trims trailing zeros", () => {
    // Values seen in the app before rounding was added.
    expect(formatDisplay(70935405407550215760n, 18)).toBe("70.94");
    expect(formatDisplay(9000000127448484824n, 18)).toBe("9");
    expect(formatDisplay(3000000000000000000n, 18)).toBe("3");
  });
  it("keeps tiny non-zero balances visible instead of showing 0", () => {
    expect(formatDisplay(5000n, 8)).toBe("0.00005"); // 0.00005 WBTC
  });
  it("formats zero", () => {
    expect(formatDisplay(0n, 18)).toBe("0");
  });
});

describe("friendlyError", () => {
  it("translates the codes users actually hit", () => {
    expect(friendlyError(new Error("An error occurred (USER_REFUSED_OP)"))).toBe(
      "REJECTED IN WALLET",
    );
    expect(
      friendlyError("PaymasterV2Error: Paymaster error 156: TRANSACTION_EXECUTION_ERROR"),
    ).toBe("TRANSACTION WOULD FAIL — CHECK BALANCE AND FEES");
    expect(friendlyError(new Error("insufficient balance"))).toBe(
      "NOT ENOUGH BALANCE",
    );
  });
  it("shortens anything unrecognised instead of dumping it", () => {
    const long = "x".repeat(200);
    expect(friendlyError(new Error(long)).length).toBeLessThanOrEqual(91);
  });
  it("never returns empty", () => {
    expect(friendlyError(undefined)).toBe("SOMETHING WENT WRONG");
  });
});
