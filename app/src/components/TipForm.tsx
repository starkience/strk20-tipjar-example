// TipForm — amount input + the tip buttons. Pure presentation: it calls
// props.onTip / props.onPrivateTip with the entered amount and owns no chain
// logic. The button refs let the parent use a button as the launch origin for
// the coin-flip animation. The private button only renders when the connected
// wallet supports STRK20 (props.privateEnabled).
import { useState, type Ref } from "react";

export function TipForm(props: {
  disabled: boolean;
  pending: boolean;
  onTip: (amount: string) => Promise<unknown>;
  onPrivateTip: (amount: string) => Promise<unknown>;
  privateEnabled: boolean;
  buttonRef?: Ref<HTMLButtonElement>;
  privateButtonRef?: Ref<HTMLButtonElement>;
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
      <div className="tip-form__actions">
        <button
          ref={props.buttonRef}
          className="btn btn--tip"
          type="submit"
          disabled={props.disabled || props.pending}
        >
          {props.pending ? "SENDING…" : "▸ INSERT TIP"}
        </button>
        {props.privateEnabled && (
          <button
            ref={props.privateButtonRef}
            className="btn btn--private"
            type="button"
            disabled={props.disabled || props.pending}
            onClick={() => props.onPrivateTip(amount).catch(() => {})}
          >
            🔒 TIP PRIVATELY
          </button>
        )}
      </div>
    </form>
  );
}
