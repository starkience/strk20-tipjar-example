// Stepper — the private flow as three vertical steps: shield, wait, tip.
// The structure is the explanation; no prose beyond the labels.
//
// This component reads NO private state. Step status comes only from what the
// app itself did (did you shield in this session, and has that note matured),
// never from your shielded balance — that lives in your wallet. Tipping is
// always available; the wallet enforces sufficient funds.
import { useState, type Ref } from "react";
import { formatStrk } from "../lib/tipjar";

type StepState = "done" | "active" | "locked";

function Step(props: {
  n: number;
  label: string;
  state: StepState;
  children?: React.ReactNode;
}) {
  return (
    <li className={`step step--${props.state}`}>
      <span className="step__badge">{props.state === "done" ? "✓" : props.n}</span>
      <div className="step__body">
        <span className="step__label">{props.label}</span>
        {props.children}
      </div>
    </li>
  );
}

export function Stepper(props: {
  disabled: boolean;
  pending: boolean;
  blocksRemaining: number | null;
  /** Public STRK balance — what's available to shield. Public chain data. */
  publicBalance: bigint | null;
  onShield: (amount: string) => Promise<unknown>;
  onTip: (amount: string) => Promise<unknown>;
  tipButtonRef?: Ref<HTMLButtonElement>;
}) {
  const [shieldAmount, setShieldAmount] = useState("5");
  const [tipAmount, setTipAmount] = useState("1");

  const shieldedNow = props.blocksRemaining !== null;
  const maturing = shieldedNow && props.blocksRemaining! > 0;

  const s1: StepState = shieldedNow ? "done" : "active";
  const s2: StepState = maturing ? "active" : shieldedNow ? "done" : "locked";
  const s3: StepState = "active";

  return (
    <ol className="stepper">
      <Step n={1} label="SHIELD" state={s1}>
        <div className="step__row">
          <span className="field">
            <input
              className="field__input"
              type="text"
              inputMode="decimal"
              value={shieldAmount}
              onChange={(e) => setShieldAmount(e.target.value)}
              aria-label="Amount to shield in STRK"
            />
            <span className="field__unit">STRK</span>
          </span>
          <button
            className="btn btn--dark"
            type="button"
            disabled={props.disabled || props.pending}
            onClick={() => props.onShield(shieldAmount).catch(() => {})}
          >
            SHIELD
          </button>
        </div>
        {props.publicBalance !== null && (
          <button
            className="step__max"
            type="button"
            onClick={() => setShieldAmount(formatStrk(props.publicBalance!))}
          >
            {formatStrk(props.publicBalance)} STRK
          </button>
        )}
      </Step>

      <Step n={2} label="RECOMMENDED WAIT" state={s2}>
        <span className="step__count">
          {maturing ? `${props.blocksRemaining} BLOCKS` : shieldedNow ? "READY" : "—"}
        </span>
      </Step>

      <Step n={3} label="TIP" state={s3}>
        <div className="step__row">
          <span className="field">
            <input
              className="field__input"
              type="text"
              inputMode="decimal"
              value={tipAmount}
              onChange={(e) => setTipAmount(e.target.value)}
              aria-label="Tip amount in STRK"
            />
            <span className="field__unit">STRK</span>
          </span>
          <button
            ref={props.tipButtonRef}
            className="btn btn--dark"
            type="button"
            disabled={props.disabled || props.pending}
            onClick={() => props.onTip(tipAmount).catch(() => {})}
          >
            {props.pending ? "…" : "TIP"}
          </button>
        </div>
      </Step>
    </ol>
  );
}
