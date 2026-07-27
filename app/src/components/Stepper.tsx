// Stepper — the private flow as three vertical steps: shield, wait, tip.
// The structure is the explanation; no prose beyond the labels.
//
// The stepper shows the recommended ORDER; it does not gate on private data.
// Tipping is always available — someone who already holds shielded STRK should
// not have to shield again, and the wallet enforces sufficient funds anyway.
// Reading your shielded balance is a disclosure action (it prompts the wallet),
// so it is an optional readout in the header, never a prerequisite.
// The only real constraint is note maturity: funds shielded just now become
// spendable after 10 blocks, which step 2 counts down.
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
  const shieldedNow = props.blocksRemaining !== null;
  const maturing = shieldedNow && props.blocksRemaining! > 0;

  // Step 1 reads as done once there is anything to tip with; step 2 is only
  // meaningful while a fresh note matures; step 3 is always available.
  const s1: StepState = funded || shieldedNow ? "done" : "active";
  const s2: StepState = maturing ? "active" : shieldedNow || funded ? "done" : "locked";
  const s3: StepState = "active";

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
            {maturing
              ? `${props.blocksRemaining} BLOCKS`
              : shieldedNow || funded
                ? "READY"
                : "—"}
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
