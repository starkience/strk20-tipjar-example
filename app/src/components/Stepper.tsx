// Stepper — the private flow as three vertical steps: shield, wait, tip.
// The structure is the explanation; no prose beyond the labels.
//
// Step state is driven by the user's ACTUAL shielded balance, not by whether
// they shielded in this session: someone who already holds shielded STRK has
// nothing to do in step 1 and can tip immediately. Shielding is a top-up, and
// the wait only gates funds shielded just now (notes mature after 10 blocks).
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
  balance: bigint | null;
  blocksRemaining: number | null;
  onShield: (amount: string) => Promise<unknown>;
  onCheckBalance: () => Promise<unknown>;
  onTip: (amount: string) => Promise<unknown>;
  tipButtonRef?: Ref<HTMLButtonElement>;
}) {
  const [shieldAmount, setShieldAmount] = useState("5");
  const [tipAmount, setTipAmount] = useState("1");

  const funded = props.balance !== null && props.balance > 0n;
  const maturing = props.blocksRemaining !== null && props.blocksRemaining > 0;
  const justMatured = props.blocksRemaining === 0;
  // Spendable if they already hold shielded STRK, or what they shielded now has
  // matured.
  const canTip = funded || justMatured;

  const s1: StepState = funded || props.blocksRemaining !== null ? "done" : "active";
  const s2: StepState = maturing ? "active" : canTip ? "done" : "locked";
  const s3: StepState = canTip ? "active" : "locked";

  return (
    <div className="stepper-wrap">
      <div className="stepper__head">
        <button
          className="btn btn--ghost"
          type="button"
          disabled={props.disabled}
          onClick={() => props.onCheckBalance().catch(() => {})}
        >
          BALANCE
        </button>
        <span className="stepper__balance">
          {props.balance === null ? "—" : `${formatStrk(props.balance)} STRK`}
        </span>
      </div>

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
        </Step>

        <Step n={2} label="RECOMMENDED WAIT" state={s2}>
          <span className="step__count">
            {maturing ? `${props.blocksRemaining} BLOCKS` : canTip ? "READY" : "—"}
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
    </div>
  );
}
