// Stepper — the private flow: shield, check, wait, swap to STRK, tip.
// The structure is the explanation; no prose beyond the labels.
//
// Information hierarchy: exactly one step is "now". The active step shows its
// full controls; finished steps collapse to a one-line summary (click to reopen
// and redo one); steps that aren't reachable yet are a dimmed label. That keeps
// the frame small and makes the current action unmistakable.
//
// Step 2 is the ONE place the app reads private state, and only because the user
// pressed SHOW. Everything else derives from what the app itself did (a shield
// this session, block maturity) or from PUBLIC balances. Tipping is always
// available; the wallet enforces sufficient funds.
import { useEffect, useRef, useState, type Ref } from "react";
import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { POOL_FEE_STRK, STRK, type Token } from "../config";
import { sameAddress } from "../lib/address";
import { formatDisplay, parseUnits, toInputAmount } from "../lib/tipjar";
import { TokenSelect } from "./TokenSelect";
import { Pills } from "./Pills";

const SECONDS_PER_BLOCK = 2.1;
// Every private operation costs a flat pool fee, charged on top of the amount.
const POOL_FEE_LABEL = formatDisplay(POOL_FEE_STRK, STRK.decimals);

type StepState = "done" | "active" | "locked";

function Step(props: {
  n: number;
  label: React.ReactNode;
  state: StepState;
  /** Shown when the step is finished and collapsed. */
  summary?: React.ReactNode;
  open?: boolean;
  onToggle?: () => void;
  children?: React.ReactNode;
}) {
  const badgeRef = useRef<HTMLSpanElement>(null);
  const expanded = props.state === "active" || props.open;

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

  const collapsible = props.state === "done" && props.onToggle;

  return (
    <li className={`step step--${props.state} ${expanded ? "is-open" : ""}`}>
      <span className="step__badge" ref={badgeRef}>
        {props.state === "done" ? "✓" : props.n}
      </span>
      <div className="step__body">
        <div
          className={`step__head ${collapsible ? "is-clickable" : ""}`}
          onClick={collapsible ? props.onToggle : undefined}
          role={collapsible ? "button" : undefined}
          tabIndex={collapsible ? 0 : undefined}
          onKeyDown={
            collapsible
              ? (e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    props.onToggle?.();
                  }
                }
              : undefined
          }
        >
          <span className="step__label">{props.label}</span>
          {!expanded && props.summary !== undefined && (
            <span className="step__summary">{props.summary}</span>
          )}
        </div>
        {expanded && props.children}
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
  const [lastShielded, setLastShielded] = useState<Token | null>(null);
  const [lastShieldedAmount, setLastShieldedAmount] = useState<string | null>(
    null,
  );
  // A finished step the user reopened to redo it.
  const [openStep, setOpenStep] = useState<number | null>(null);

  const held = props.tokens.filter(
    (t) => (props.publicBalances[t.address] ?? 0n) > 0n,
  );
  const available = held.length > 0 ? held : props.tokens;

  useEffect(() => {
    if (!available.some((t) => sameAddress(t.address, token.address))) {
      setToken(available[0]);
      setSwapped(false);
    }
  }, [available, token.address]);

  const shieldedNow = props.blocksRemaining !== null;
  const maturing = shieldedNow && props.blocksRemaining! > 0;

  // Rough ETA alongside the block count. Mainnet blocks land ~2.1s apart.
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
  const subject = lastShielded ?? token;
  const shieldedOf = (t: Token) => props.shieldedBalances?.[t.address];

  // The pool fee is denominated in STRK. Shielding STRK therefore nets out to
  // less than you typed; shielding any other token pays the fee separately, so
  // the full amount lands. Preview it rather than let the wallet surprise them.
  const netShielded = (amountStr: string, t: Token): string | null => {
    try {
      const raw = parseUnits(amountStr, t.decimals);
      if (!sameAddress(t.address, STRK.address)) return null;
      const net = raw - POOL_FEE_STRK;
      return formatDisplay(net > 0n ? net : 0n, t.decimals);
    } catch {
      return null;
    }
  };
  const shieldPreview = netShielded(shieldAmount, token);

  const s1: StepState = shieldedNow ? "done" : "active";
  const s2: StepState = checked ? "done" : "active";
  const s3: StepState = maturing ? "active" : shieldedNow ? "done" : "locked";
  const s4: StepState =
    isStrk || swapped ? "done" : shieldedNow ? "active" : "locked";
  const s5: StepState = "active";

  const toggle = (n: number) => () =>
    setOpenStep((cur) => (cur === n ? null : n));

  return (
    <ol className="stepper">
      <Step
        n={1}
        label="SHIELD"
        state={s1}
        open={openStep === 1}
        onToggle={toggle(1)}
        summary={
          lastShieldedAmount ? (
            <>
              {netShielded(lastShieldedAmount, subject) ?? lastShieldedAmount}{" "}
              {subject.symbol}
              <span className="step__fee">
                {" "}
                {sameAddress(subject.address, STRK.address)
                  ? `−${POOL_FEE_LABEL} FEE`
                  : "− POOL FEE"}
              </span>
            </>
          ) : undefined
        }
      >
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
            className="btn btn--dark btn--act"
            type="button"
            disabled={props.disabled || props.pending}
            onClick={() =>
              props
                .onShield(token, shieldAmount)
                .then(() => {
                  setLastShielded(token);
                  setLastShieldedAmount(shieldAmount);
                  setOpenStep(null);
                })
                .catch(() => {})
            }
          >
            SHIELD
          </button>
        </div>
        <Pills
          balance={balance}
          decimals={token.decimals}
          reserve={isStrk ? POOL_FEE_STRK : 0n}
          onPick={setShieldAmount}
        />
        <div className="step__note">
          <span className="step__note-label">YOU SHIELD</span>
          <span className="step__net">
            {shieldPreview ?? shieldAmount} {token.symbol}
          </span>
          <span className="step__fee">
            {isStrk ? `−${POOL_FEE_LABEL} STRK FEE` : "− POOL FEE"}
          </span>
        </div>
        <div className="step__note">
          <span className="step__note-label">PUBLIC</span>
          {balance !== undefined ? (
            <button
              className="step__max"
              type="button"
              onClick={() =>
                setShieldAmount(toInputAmount(balance, token.decimals))
              }
            >
              {formatDisplay(balance, token.decimals)} {token.symbol}
            </button>
          ) : (
            <span className="step__max">—</span>
          )}
        </div>
      </Step>

      <Step
        n={2}
        label="PRIVATE BALANCE"
        state={s2}
        open={openStep === 2}
        onToggle={toggle(2)}
        summary={
          props.shieldedBalances
            ? `${formatDisplay(
                props.shieldedBalances[subject.address] ?? 0n,
                subject.decimals,
              )} ${subject.symbol}`
            : undefined
        }
      >
        <div className="step__row">
          <span className="step__balances">
            {props.shieldedBalances
              ? `${formatDisplay(
                  props.shieldedBalances[subject.address] ?? 0n,
                  subject.decimals,
                )} ${subject.symbol}`
              : "—"}
          </span>
          <button
            className="btn btn--act"
            type="button"
            disabled={props.disabled}
            onClick={() => props.onShowShielded([subject]).catch(() => {})}
          >
            SHOW
          </button>
        </div>
      </Step>

      <Step
        n={3}
        label="RECOMMENDED WAIT"
        state={s3}
        summary={shieldedNow ? "READY" : undefined}
      >
        <span className="step__countline">
          <span className="step__count">
            {maturing ? `${props.blocksRemaining} BLOCKS` : "READY"}
          </span>
          {maturing && eta !== null && <span className="step__eta">~{eta}s</span>}
        </span>
      </Step>

      <Step
        n={4}
        label={
          <>
            PRIVATE SWAP <span className="step__arrow">▶</span> {STRK.symbol}
          </>
        }
        state={s4}
        summary={isStrk ? "NOT NEEDED" : swapped ? "SWAPPED" : undefined}
      >
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
            className="btn btn--dark btn--act"
            type="button"
            disabled={props.disabled || props.pending || maturing}
            onClick={() =>
              props
                .onSwap(token, swapAmount)
                .then(() => setSwapped(true))
                .catch(() => {})
            }
          >
            SWAP
          </button>
        </div>
        <Pills
          balance={shieldedOf(token)}
          decimals={token.decimals}
          onPick={setSwapAmount}
        />
      </Step>

      <Step n={5} label="TIP" state={s5}>
        <div className="step__note">
          <span className="step__note-label">SHIELDED</span>
          <span className="step__net">
            {props.shieldedBalances
              ? `${formatDisplay(
                  props.shieldedBalances[STRK.address] ?? 0n,
                  STRK.decimals,
                )} ${STRK.symbol}`
              : "—"}
          </span>
          <button
            className="step__max"
            type="button"
            disabled={props.disabled}
            onClick={() => props.onShowShielded([STRK]).catch(() => {})}
          >
            SHOW
          </button>
        </div>
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
            className="btn btn--dark btn--act"
            type="button"
            disabled={props.disabled || props.pending}
            onClick={() => props.onTip(tipAmount).catch(() => {})}
          >
            {props.pending ? "…" : "TIP"}
          </button>
        </div>
        <Pills
          balance={shieldedOf(STRK)}
          decimals={STRK.decimals}
          reserve={POOL_FEE_STRK}
          onPick={setTipAmount}
        />
      </Step>
    </ol>
  );
}
