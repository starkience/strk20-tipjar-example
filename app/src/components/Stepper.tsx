// Stepper — the private flow: shield, wait, swap to STRK, tip.
// The structure is the explanation; no prose beyond the labels.
//
// This component reads NO private state. Step status comes only from what the
// app itself did (did you shield in this session, has that note matured) and
// from PUBLIC token balances. Tipping is always available; the wallet enforces
// sufficient funds. The swap step is skipped when you shielded STRK already.
import { useEffect, useRef, useState, type Ref } from "react";
import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { STRK, type Token } from "../config";
import { TokenSelect } from "./TokenSelect";
import { formatUnits } from "../lib/tipjar";

type StepState = "done" | "active" | "locked";

function Step(props: {
  n: number;
  label: string;
  state: StepState;
  children?: React.ReactNode;
}) {
  const badgeRef = useRef<HTMLSpanElement>(null);

  // Pop the badge when the step completes.
  useGSAP(
    () => {
      if (props.state !== "done" || !badgeRef.current) return;
      gsap.fromTo(
        badgeRef.current,
        { scale: 1.6 },
        { scale: 1, duration: 0.26, ease: "steps(4)" },
      );
    },
    { dependencies: [props.state] },
  );

  return (
    <li className={`step step--${props.state}`}>
      <span className="step__badge" ref={badgeRef}>
        {props.state === "done" ? "✓" : props.n}
      </span>
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
  tokens: Token[];
  onShield: (token: Token, amount: string) => Promise<unknown>;
  onSwap: (token: Token, amount: string) => Promise<unknown>;
  onTip: (amount: string) => Promise<unknown>;
  tipButtonRef?: Ref<HTMLButtonElement>;
}) {
  const [token, setToken] = useState<Token>(STRK);
  const [shieldAmount, setShieldAmount] = useState("5");
  const [tipAmount, setTipAmount] = useState("1");
  const [swapped, setSwapped] = useState(false);

  // Only offer tokens the user actually holds. Before balances load (or if they
  // hold none) fall back to the full list so the control is never empty.
  const held = props.tokens.filter(
    (t) => (props.publicBalances[t.address] ?? 0n) > 0n,
  );
  const available = held.length > 0 ? held : props.tokens;

  // If the selected token isn't one they hold, move to the first that is.
  useEffect(() => {
    if (!available.some((t) => t.address === token.address)) {
      setToken(available[0]);
      setSwapped(false);
    }
  }, [available, token.address]);

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
          <TokenSelect
            tokens={available}
            value={token}
            disabled={props.disabled}
            onChange={(t) => {
              setToken(t);
              setSwapped(false);
            }}
          />
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
        <div className="step__balance">
          <span className="step__balance-label">PUBLIC BALANCE</span>
          {balance !== undefined ? (
            <button
              className="step__max"
              type="button"
              onClick={() =>
                setShieldAmount(formatUnits(balance, token.decimals))
              }
            >
              {formatUnits(balance, token.decimals)} {token.symbol}
            </button>
          ) : (
            <span className="step__max" aria-hidden>
              —
            </span>
          )}
        </div>
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
