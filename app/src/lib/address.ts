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
