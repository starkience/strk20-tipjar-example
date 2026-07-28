// Starknet addresses are felts, so the same address has many valid spellings:
// AVNU's API returns `0x4718f5a…` while our config uses the zero-padded
// `0x04718f5a…`. String comparison between them fails, which silently broke
// token identity (STRK matched itself as two different tokens). Everything that
// compares or keys by address goes through this first.
export function normalizeAddress(address: string): string {
  return `0x${BigInt(address).toString(16).padStart(64, "0")}`;
}

export function sameAddress(a: string, b: string): boolean {
  try {
    return BigInt(a) === BigInt(b);
  } catch {
    return false;
  }
}

// Transaction hashes are felts too, and the same hash comes back spelled two
// ways: a wallet / RPC often returns the minimal `0xabc…` while another source
// returns the zero-padded `0x0abc…`. Comparing those as raw strings fails — the
// exact bug `normalizeAddress` fixes for token addresses — so the tx-log dedup
// must canonicalize a hash before using it as a key.
export const normalizeHash = normalizeAddress;
