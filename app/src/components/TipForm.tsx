// TipForm — amount input + the send button. Mode-aware styling only; the parent
// owns the mode and decides which send path runs. No chain logic here.
import { useState, type Ref } from "react";

export function TipForm(props: {
  disabled: boolean;
  pending: boolean;
  isPrivate: boolean;
  onSubmit: (amount: string) => Promise<unknown>;
  buttonRef?: Ref<HTMLButtonElement>;
}) {
  const [amount, setAmount] = useState("1");
  return (
    <form
      className="tip-form"
      onSubmit={(e) => {
        e.preventDefault();
        props.onSubmit(amount).catch(() => {});
      }}
    >
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
      <button
        ref={props.buttonRef}
        className={`btn ${props.isPrivate ? "btn--private" : "btn--tip"}`}
        type="submit"
        disabled={props.disabled || props.pending}
      >
        {props.pending ? "SENDING…" : props.isPrivate ? "🔒 TIP" : "▸ TIP"}
      </button>
    </form>
  );
}
