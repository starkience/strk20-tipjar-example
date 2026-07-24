import { useState, type Ref } from "react";

export function TipForm(props: {
  disabled: boolean;
  pending: boolean;
  onTip: (amount: string) => Promise<unknown>;
  buttonRef?: Ref<HTMLButtonElement>;
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
      <label className="tip-form__label">
        <span className="tip-form__label-text">AMOUNT</span>
        <span className="tip-form__field">
          <input
            className="tip-form__input"
            type="text"
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            aria-label="Tip amount in STRK"
          />
          <span className="tip-form__unit">STRK</span>
        </span>
      </label>
      <button
        ref={props.buttonRef}
        className="btn btn--tip"
        type="submit"
        disabled={props.disabled || props.pending}
      >
        {props.pending ? "SENDING…" : "▸ INSERT TIP"}
      </button>
    </form>
  );
}
