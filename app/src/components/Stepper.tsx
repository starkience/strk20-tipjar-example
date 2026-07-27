// Stepper — the private flow: shield, check, wait, swap to STRK, tip.
// The structure is the explanation; no prose beyond the labels.
//
// Step 2 is the ONE place the app reads private state, and only because the
// user pressed SHOW: after shielding you want to confirm the funds landed.
// Everything else derives from what the app itself did (a shield this session,
// block maturity) or from PUBLIC balances. Tipping is always available; the
// wallet enforces sufficient funds. Swap is skipped when STRK was shielded.
import { useEffect, useRef, useState, type Ref } from "react";
import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { STRK, type Token } from "../config";
import { sameAddress } from "../lib/address";
import { TokenSelect } from "./TokenSelect";
import { formatDisplay, formatUnits } from "../lib/tipjar";

const SECONDS_PER_BLOCK = 2.1;

type StepState = "done" | "active" | "locked";

function Step(props: {
  n: number;
  label: React.ReactNode;
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
  shieldedBalances: Record<string, bigint> | null;
  tokens: Token[];
  onShield: (token: Token, amount: string) => Promise<unknown>;
  onShowShielded: (tokens: Token[]) => Promise<unknown>;
  onSwap: (token: Token, amount: string) => Promise<unknown>;
  onTip: (amount: string) => Promise<unknown>;
  tipButtonRef?: Ref<HTMLButtonElement>;
}) {
  const [token, setToken] = useState<Token>(STRK);
  const [shieldAmount, setShieldAmount] = useState("5");
  const [swapAmount, setSwapAmount] = useState("5");
  const [tipAmount, setTipAmount] = useState("1");
  const [swapped, setSwapped] = useState(false);
  // The token actually shielded, which may differ from the dropdown selection.
  const [lastShielded, setLastShielded] = useState<Token | null>(null);

  // Only offer tokens the user actually holds. Before balances load (or if they
  // hold none) fall back to the full list so the control is never empty.
  const held = props.tokens.filter(
    (t) => (props.publicBalances[t.address] ?? 0n) > 0n,
  );
  const available = held.length > 0 ? held : props.tokens;

  // If the selected token isn't one they hold, move to the first that is.
  useEffect(() => {
    if (!available.some((t) => sameAddress(t.address, token.address))) {
      setToken(available[0]);
      setSwapped(false);
    }
  }, [available, token.address]);

  const shieldedNow = props.blocksRemaining !== null;
  const maturing = shieldedNow && props.blocksRemaining! > 0;

  // Rough ETA alongside the block count. Mainnet blocks land ~2.1s apart, so
  // the 10-block maturity window is ~20s; the ticker keeps it feeling live.
  const [eta, setEta] = useState<number | null>(null);
  useEffect(() => {
    if (!maturing) {
      setEta(null);
      return;
    }
    setEta(Math.ceil(props.blocksRemaining! * SECONDS_PER_BLOCK));
    const id = setInterval(
      () => setEta((s) => (s !== null && s > 0 ? s - 1 : 0)),
      1000,
    );
    return () => clearInterval(id);
  }, [props.blocksRemaining, maturing]);
  const isStrk = sameAddress(token.address, STRK.address);
  const balance = props.publicBalances[token.address];
  const checked = props.shieldedBalances !== null;

  // Step 2 answers one question: did the shield land? So it reports the token
  // that was actually shielded (falling back to the current selection before
  // any shield), keeping the wallet query to a single token.
  const subject = lastShielded ?? token;

  const s1: StepState = shieldedNow ? "done" : "active";
  const s2: StepState = checked ? "done" : "active";
  const s3: StepState = maturing ? "active" : shieldedNow ? "done" : "locked";
  const s4: StepState =
    isStrk || swapped ? "done" : shieldedNow ? "active" : "locked";
  const s5: StepState = "active";

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
            onClick={() =>
              props
                .onShield(token, shieldAmount)
                .then(() => setLastShielded(token))
                .catch(() => {})
            }
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
              {formatDisplay(balance, token.decimals)} {token.symbol}
            </button>
          ) : (
            <span className="step__max" aria-hidden>
              —
            </span>
          )}
        </div>
      </Step>

      <Step n={2} label="PRIVATE BALANCE" state={s2}>
        <div className="step__row">
          <button
            className="btn btn--ghost"
            type="button"
            disabled={props.disabled}
            onClick={() => props.onShowShielded([subject]).catch(() => {})}
          >
            SHOW
          </button>
          <span className="step__balances">
            {props.shieldedBalances
              ? `${formatDisplay(
                  props.shieldedBalances[subject.address] ?? 0n,
                  subject.decimals,
                )} ${subject.symbol}`
              : "—"}
          </span>
        </div>
      </Step>

      <Step n={3} label="RECOMMENDED WAIT" state={s3}>
        <span className="step__countline">
          <span className="step__count">
            {maturing
              ? `${props.blocksRemaining} BLOCKS`
              : shieldedNow
                ? "READY"
                : "—"}
          </span>
          {maturing && eta !== null && (
            <span className="step__eta">~{eta}s</span>
          )}
        </span>
      </Step>

      <Step
        n={4}
        label={
          <>
            PRIVATE SWAP <span className="step__arrow">▶</span>{" "}
            {STRK.symbol}
          </>
        }
        state={s4}
      >
        {isStrk ? (
          <span className="step__count">—</span>
        ) : (
          <div className="step__row">
            <span className="field">
              <input
                className="field__input"
                type="text"
                inputMode="decimal"
                value={swapAmount}
                onChange={(e) => setSwapAmount(e.target.value)}
                aria-label={`Amount of ${token.symbol} to swap`}
              />
              <span className="field__unit">{token.symbol}</span>
            </span>
            <button
              className="btn btn--dark"
              type="button"
              disabled={props.disabled || props.pending || maturing}
              onClick={() =>
                props
                  .onSwap(token, swapAmount)
                  .then(() => setSwapped(true))
                  .catch(() => {})
              }
            >
              {props.pending ? "…" : "SWAP"}
            </button>
          </div>
        )}
      </Step>

      <Step n={5} label="TIP" state={s5}>
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
