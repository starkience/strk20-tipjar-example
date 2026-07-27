// Wallet and protocol errors surface as opaque codes ("USER_REFUSED_OP",
// "Paymaster error 156"). This maps the ones users actually hit onto plain
// language, and falls back to a trimmed version of anything unrecognised.

const RULES: [RegExp, string][] = [
  [/user_refused|user rejected|rejected by user|declined/i, "REJECTED IN WALLET"],
  // execute_from_outside carries a replay-protection nonce. This means the same
  // signed payload was submitted twice: the FIRST one consumed the nonce and
  // very likely succeeded, so this is a duplicate being rejected — not a
  // failure of the operation the user asked for.
  [/duplicated[-_ ]?outside[-_ ]?nonce/i,
   "ALREADY SUBMITTED — THE FIRST ONE LIKELY WENT THROUGH. CHECK YOUR BALANCE BEFORE RETRYING"],
  // A prompt dismissed without a decision never settles — see withWalletTimeout.
  [/wallet_no_response/i, "NO RESPONSE FROM WALLET — CHECK IT BEFORE RETRYING"],
  // Underscored protocol codes (INSUFFICIENT_PRIVATE_BALANCE) as well as prose.
  [/insufficient[_ ]?private/i, "NOT ENOUGH SHIELDED BALANCE"],
  [/insufficient|not enough/i, "NOT ENOUGH BALANCE"],
  [/maturity|not mature|too recent|10 blocks/i, "FUNDS NOT SPENDABLE YET — WAIT"],
  [/not registered|register/i, "ACCOUNT NOT REGISTERED IN THE POOL"],
  [/no route|no liquidity/i, "NO SWAP ROUTE FOR THIS PAIR"],
  [/slippage/i, "PRICE MOVED — TRY AGAIN"],
  // Paymaster 156 is generic: it means the simulation reverted. In this flow
  // that is nearly always an immature note (a shield or swap less than ~10
  // blocks old) or too little shielded balance once the pool fee is added.
  [/paymaster|transaction_execution_error|execution error/i,
   "WOULD FAIL — WAIT FOR THE NOTE TO MATURE, OR CHECK BALANCE + POOL FEE"],
  [/does not support strk20|not support/i, "THIS WALLET DOESN'T SUPPORT STRK20"],
  [/connect a wallet/i, "CONNECT A WALLET FIRST"],
  [/already strk/i, "ALREADY STRK — NO SWAP NEEDED"],
  [/network|fetch|timeout|econnrefused/i, "NETWORK PROBLEM — TRY AGAIN"],
];

export function friendlyError(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err ?? "");
  for (const [pattern, message] of RULES) {
    if (pattern.test(raw)) return message;
  }
  // Unrecognised: keep it short and readable rather than dumping a stack.
  const first = raw.split("\n")[0].trim();
  return (first.length > 90 ? `${first.slice(0, 90)}…` : first) || "SOMETHING WENT WRONG";
}
