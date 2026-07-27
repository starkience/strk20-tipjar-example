// PoolPanel — step 1 of the decoupled private flow: put STRK into the pool
// ahead of time, so the tip itself carries no public leg tying it to you.
//
// The BALANCE button is deliberately a manual action: reading your shielded
// balance is wallet-mediated and prompts for consent, so it only ever happens
// because you asked — never on page load.
import { useState } from "react";
import { formatStrk } from "../lib/tipjar";

export function PoolPanel(props: {
  disabled: boolean;
  pending: boolean;
  balance: bigint | null;
  onShield: (amount: string) => Promise<unknown>;
  onCheckBalance: () => Promise<unknown>;
}) {
  const [amount, setAmount] = useState("5");
  return (
    <section className="pool">
      <div className="pool__head">
        <span className="pool__title">POOL BALANCE</span>
        <span className="pool__value">
          {props.balance === null ? "—" : `${formatStrk(props.balance)} STRK`}
        </span>
      </div>

      <div className="pool__row">
        <span className="pool__field">
          <input
            className="pool__input"
            type="text"
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            aria-label="Amount to shield in STRK"
          />
        </span>
        <button
          className="btn btn--shield"
          type="button"
          disabled={props.disabled || props.pending}
          onClick={() => props.onShield(amount).catch(() => {})}
        >
          SHIELD
        </button>
        <button
          className="btn btn--ghost"
          type="button"
          disabled={props.disabled}
          onClick={() => props.onCheckBalance().catch(() => {})}
          title="Asks your wallet for your shielded balance"
        >
          BALANCE
        </button>
      </div>

      <p className="pool__note">
        Shield first, tip later — spendable after ~10 blocks. Tipping straight
        from your wallet would link you to the tip.
      </p>
    </section>
  );
}
