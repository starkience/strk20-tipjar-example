import { hash, uint256 } from "starknet";
import type { Call } from "starknet";

const DECIMALS = 18n;
const ONE = 10n ** DECIMALS;

export const TIPPED_SELECTOR = hash.getSelectorFromName("Tipped");

export interface RawTippedEvent {
  keys: string[];
  data: string[];
  transaction_hash: string;
}

export interface TipEvent {
  tipper: string;
  amount: bigint;
  timestamp: number;
  txHash: string;
}

/** "1.5" + 6 decimals -> 1500000n. Throws on empty/negative/non-numeric input. */
export function parseUnits(input: string, decimals: number): bigint {
  const re = new RegExp(`^(\\d+)(?:\\.(\\d{1,${decimals}}))?$`);
  const m = re.exec(input.trim());
  if (!m) throw new Error(`invalid amount: "${input}"`);
  const whole = BigInt(m[1]);
  const frac = m[2] ? BigInt(m[2].padEnd(decimals, "0")) : 0n;
  return whole * 10n ** BigInt(decimals) + frac;
}

/** 1500000n + 6 decimals -> "1.5" (trailing zeros trimmed). */
export function formatUnits(value: bigint, decimals: number): string {
  const base = 10n ** BigInt(decimals);
  const whole = value / base;
  const frac = (value % base)
    .toString()
    .padStart(decimals, "0")
    .replace(/0+$/, "");
  return frac ? `${whole}.${frac}` : whole.toString();
}

/**
 * Human-readable amount: 2 decimals, trailing zeros trimmed. Very small
 * non-zero balances fall back to significant digits so they never render as
 * "0" (e.g. 0.00005 WBTC).
 */
export function formatDisplay(value: bigint, decimals: number): string {
  if (value === 0n) return "0";
  const n = Number(formatUnits(value, decimals));
  if (n >= 0.01) {
    return n.toFixed(2).replace(/\.?0+$/, "");
  }
  return n.toPrecision(2).replace(/0+$/, "").replace(/\.$/, "");
}

/** "1.5" -> 1500000000000000000n. Throws on empty/negative/non-numeric input. */
export function parseStrk(input: string): bigint {
  const m = /^(\d+)(?:\.(\d{1,18}))?$/.exec(input.trim());
  if (!m) throw new Error(`invalid STRK amount: "${input}"`);
  const whole = BigInt(m[1]);
  const frac = m[2] ? BigInt(m[2].padEnd(18, "0")) : 0n;
  return whole * ONE + frac;
}

/** 1500000000000000000n -> "1.5" (trailing zeros trimmed). */
export function formatStrk(wei: bigint): string {
  const whole = wei / ONE;
  const frac = (wei % ONE).toString().padStart(18, "0").replace(/0+$/, "");
  return frac ? `${whole}.${frac}` : whole.toString();
}

/** approve(jar, amount) on STRK + tip(amount) on the jar, as one multicall. */
export function buildTipCalls(
  strkAddress: string,
  tipJarAddress: string,
  amount: bigint,
): Call[] {
  const u = uint256.bnToUint256(amount);
  const low = BigInt(u.low).toString();
  const high = BigInt(u.high).toString();
  return [
    {
      contractAddress: strkAddress,
      entrypoint: "approve",
      calldata: [tipJarAddress, low, high],
    },
    {
      contractAddress: tipJarAddress,
      entrypoint: "tip",
      calldata: [low, high],
    },
  ];
}

/** Event layout: keys = [selector("Tipped"), tipper], data = [amount.low, amount.high, timestamp]. */
export function parseTippedEvent(raw: RawTippedEvent): TipEvent {
  return {
    tipper: raw.keys[1],
    amount: uint256.uint256ToBN({ low: raw.data[0], high: raw.data[1] }),
    timestamp: Number(BigInt(raw.data[2])),
    txHash: raw.transaction_hash,
  };
}
