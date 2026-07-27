// Token list + public balance reads.
//
// The list comes from AVNU's verified-token API rather than a hardcoded array:
// it stays current, covers what AVNU can actually route (so the private swap has
// a path), and avoids look-alike mistakes — the legacy bridged USDC.e and real
// USDC are different contracts.
//
// Balances are plain ERC-20 `balanceOf` reads: PUBLIC chain data. They are
// fetched in a single JSON-RPC batch, and involve no wallet call and no consent
// prompt — unlike shielded balances, which this app never reads.
import type { Token } from "../config";

const AVNU_TOKENS_URL =
  "https://starknet.api.avnu.fi/v1/starknet/tokens?tag=Verified&size=60&sort=lastDailyVolumeUsd,desc";

/** sn_keccak("balanceOf") */
const BALANCE_OF = "0x02e4263afad30923c891518314c3c95dbe830a16874e8abc5777a9a20b54c76e";

type AvnuToken = { address: string; symbol: string; decimals: number };

/** Verified tokens, most-traded first. Falls back to the caller's defaults. */
export async function fetchTokens(fallback: Token[]): Promise<Token[]> {
  try {
    const res = await fetch(AVNU_TOKENS_URL);
    if (!res.ok) return fallback;
    const body = (await res.json()) as { content?: AvnuToken[] };
    const list = (body.content ?? [])
      .filter((t) => t.address && t.symbol && Number.isFinite(t.decimals))
      .map((t) => ({
        symbol: t.symbol,
        address: t.address,
        decimals: t.decimals,
      }));
    return list.length > 0 ? list : fallback;
  } catch {
    return fallback;
  }
}

/**
 * Public balances for many tokens in one JSON-RPC batch request.
 * Returns a map of token address -> balance (missing/failed reads are omitted).
 */
export async function fetchBalances(
  rpcUrl: string,
  owner: string,
  tokens: Token[],
): Promise<Record<string, bigint>> {
  if (tokens.length === 0) return {};
  const payload = tokens.map((t, i) => ({
    jsonrpc: "2.0",
    id: i,
    method: "starknet_call",
    params: [
      {
        contract_address: t.address,
        entry_point_selector: BALANCE_OF,
        calldata: [owner],
      },
      "latest",
    ],
  }));

  const res = await fetch(rpcUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const json = await res.json();
  // A single-element batch may come back unwrapped.
  const rows: { id: number; result?: string[] }[] = Array.isArray(json)
    ? json
    : [json];

  const out: Record<string, bigint> = {};
  for (const row of rows) {
    const token = tokens[row.id];
    if (!token || !row.result) continue;
    const [low, high] = row.result;
    try {
      out[token.address] = BigInt(low) + (BigInt(high ?? "0x0") << 128n);
    } catch {
      // Non-standard return shape — skip this token.
    }
  }
  return out;
}
