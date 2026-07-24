// TipForm — a PUBLIC/PRIVATE mode toggle above the amount, then one tip button
// that follows the selected mode. Pure presentation: it calls props.onTip /
// props.onPrivateTip and owns no chain logic. The PRIVATE option is disabled
// unless the connected wallet supports STRK20 (props.privateEnabled). The button
// ref lets the parent use the button as the coin-flip launch origin.
import { useState, type Ref } from "react";

export function TipForm(props: {
  disabled: boolean;
  pending: boolean;
  onTip: (amount: string) => Promise<unknown>;
  onPrivateTip: (amount: string) => Promise<unknown>;
  privateEnabled: boolean;
  buttonRef?: Ref<HTMLButtonElement>;
}) {
  const [amount, setAmount] = useState("1");
  const [mode, setMode] = useState<"public" | "private">("public");
  // Fall back to public if the private option isn't available on this wallet.
  const isPrivate = mode === "private" && props.privateEnabled;

  return (
    <form
      className="tip-form"
      onSubmit={(e) => {
        e.preventDefault();
        (isPrivate ? props.onPrivateTip(amount) : props.onTip(amount)).catch(
          () => {},
        );
      }}
    >
      <div className="mode-toggle" role="group" aria-label="Tip mode">
        <button
          type="button"
          className={`mode-toggle__opt ${mode === "public" ? "is-active" : ""}`}
          onClick={() => setMode("public")}
        >
          PUBLIC
        </button>
        <button
          type="button"
          className={`mode-toggle__opt mode-toggle__opt--private ${
            isPrivate ? "is-active" : ""
          }`}
          onClick={() => setMode("private")}
          disabled={!props.privateEnabled}
          title={props.privateEnabled ? "" : "Connect a privacy wallet (Ready)"}
        >
          🔒 PRIVATE
        </button>
      </div>

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
        className={`btn ${isPrivate ? "btn--private" : "btn--tip"}`}
        type="submit"
        disabled={props.disabled || props.pending}
      >
        {props.pending
          ? "SENDING…"
          : isPrivate
            ? "🔒 TIP PRIVATELY"
            : "▸ INSERT TIP"}
      </button>
    </form>
  );
}
