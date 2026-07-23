import { useState } from "react";

export function TipForm(props: {
  disabled: boolean;
  pending: boolean;
  onTip: (amount: string) => Promise<unknown>;
}) {
  const [amount, setAmount] = useState("1");
  return (
    <form
      className="tip-form"
      onSubmit={(e) => {
        e.preventDefault();
        props.onTip(amount).catch(() => {});
      }}
    >
      <input
        type="text"
        inputMode="decimal"
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
        aria-label="Tip amount in STRK"
      />
      <span className="unit">STRK</span>
      <button type="submit" disabled={props.disabled || props.pending}>
        {props.pending ? "Sending…" : "Tip publicly"}
      </button>
    </form>
  );
}
