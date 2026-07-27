// Stepper — the private flow: shield, wait, swap to STRK, tip.
// The structure is the explanation; no prose beyond the labels.
//
// This component reads NO private state. Step status comes only from what the
// app itself did (did you shield in this session, has that note matured) and
// from PUBLIC token balances. Tipping is always available; the wallet enforces
// sufficient funds. The swap step is skipped when you shielded STRK already.
import { useState, type Ref } from "react";
import { STRK, TOKENS, type Token } from "../config";
import { formatUnits } from "../lib/tipjar";

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
  publicBalances: Record<string, bigint>;
  onShield: (token: Token, amount: string) => Promise<unknown>;
  onSwap: (token: Token, amount: string) => Promise<unknown>;
  onTip: (amount: string) => Promise<unknown>;
  tipButtonRef?: Ref<HTMLButtonElement>;
}) {
  const [token, setToken] = useState<Token>(STRK);
  const [shieldAmount, setShieldAmount] = useState("5");
  const [tipAmount, setTipAmount] = useState("1");
  const [swapped, setSwapped] = useState(false);

  const shieldedNow = props.blocksRemaining !== null;
  const maturing = shieldedNow && props.blocksRemaining! > 0;
  const isStrk = token.address === STRK.address;
  const balance = props.publicBalances[token.address];

  const s1: StepState = shieldedNow ? "done" : "active";
  const s2: StepState = maturing ? "active" : shieldedNow ? "done" : "locked";
  const s3: StepState = isStrk || swapped ? "done" : shieldedNow ? "active" : "locked";
  const s4: StepState = "active";

  return (
    <ol className="stepper">
      <Step n={1} label="SHIELD" state={s1}>
        <div className="step__row">
          <select
            className="select"
            value={token.address}
            onChange={(e) => {
              const t = TOKENS.find((x) => x.address === e.target.value);
              if (t) {
                setToken(t);
                setSwapped(false);
              }
            }}
            aria-label="Token to shield"
          >
            {TOKENS.map((t) => (
              <option key={t.address} value={t.address}>
                {t.symbol}
              </option>
            ))}
          </select>
          <span className="field">
            <input
              className="field__input"
              type="text"
              inputMode="decimal"
              value={shieldAmount}
              onChange={(e) => setShieldAmount(e.target.value)}
              aria-label="Amount to shield"
            />
          </span>
          <button
            className="btn btn--dark"
            type="button"
            disabled={props.disabled || props.pending}
            onClick={() => props.onShield(token, shieldAmount).catch(() => {})}
          >
            SHIELD
          </button>
        </div>
        {balance !== undefined && (
          <button
            className="step__max"
            type="button"
            onClick={() => setShieldAmount(formatUnits(balance, token.decimals))}
          >
            {formatUnits(balance, token.decimals)} {token.symbol}
          </button>
        )}
      </Step>

      <Step n={2} label="RECOMMENDED WAIT" state={s2}>
        <span className="step__count">
          {maturing ? `${props.blocksRemaining} BLOCKS` : shieldedNow ? "READY" : "—"}
        </span>
      </Step>

      <Step n={3} label={`SWAP → ${STRK.symbol}`} state={s3}>
        {isStrk ? (
          <span className="step__count">—</span>
        ) : (
          <div className="step__row">
            <button
              className="btn btn--dark"
              type="button"
              disabled={props.disabled || props.pending || maturing}
              onClick={() =>
                props
                  .onSwap(token, shieldAmount)
                  .then(() => setSwapped(true))
                  .catch(() => {})
              }
            >
              {props.pending ? "…" : `SWAP ${token.symbol}`}
            </button>
          </div>
        )}
      </Step>

      <Step n={4} label="TIP" state={s4}>
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
