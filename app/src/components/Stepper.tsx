// Stepper — the private flow: shield, check, wait, swap to STRK, tip.
//
// Every step shows its controls and its numbers at all times. Nothing hides
// behind a click: this is a teaching app, and a reader should see the whole
// flow — what each step costs and what it produces — in one glance.
//
// Fitting five open steps inside a fixed frame means each is compact by design:
// the label row carries that step's key number on the right, and the controls
// sit on one row beneath it. Height stays bounded without collapsing anything.
//
// Step 2 and the tip's SHOW are the only places the app reads private state,
// and only when pressed — the wallet re-prompts for consent on every such call.
import { useEffect, useRef, useState, type Ref } from "react";
import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { POOL_FEE_STRK, STRK, type Token } from "../config";
import { sameAddress } from "../lib/address";
import { formatDisplay, toInputAmount } from "../lib/tipjar";
import { TokenSelect } from "./TokenSelect";
import { Pills } from "./Pills";

const SECONDS_PER_BLOCK = 2.1;
const POOL_FEE_LABEL = formatDisplay(POOL_FEE_STRK, STRK.decimals);

type StepState = "done" | "active" | "todo";

function Step(props: {
  n: number;
  label: React.ReactNode;
  state: StepState;
  /** Right-aligned value on the label row — the step's key number. */
  value?: React.ReactNode;
  children?: React.ReactNode;
}) {
  const badgeRef = useRef<HTMLSpanElement>(null);
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
        <div className="step__head">
          <span className="step__label">{props.label}</span>
          {props.value !== undefined && (
            <span className="step__value">{props.value}</span>
          )}
        </div>
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
  approved: Record<string, boolean>;
  onCheckApproval: (token: Token) => Promise<void> | void;
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

  const held = props.tokens.filter(
    (t) => (props.publicBalances[t.address] ?? 0n) > 0n,
  );
  const available = held.length > 0 ? held : props.tokens;

  const { onCheckApproval } = props;
  useEffect(() => {
    void onCheckApproval(token);
  }, [token, onCheckApproval]);

  useEffect(() => {
    if (!available.some((t) => sameAddress(t.address, token.address))) {
      setToken(available[0]);
      setSwapped(false);
    }
  }, [available, token.address]);

  const shieldedNow = props.blocksRemaining !== null;
  const maturing = shieldedNow && props.blocksRemaining! > 0;

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
  const shieldedOf = (t: Token) => props.shieldedBalances?.[t.address];
  const needsApproval = props.approved[token.address] === false;

  // Deliberately not predicting the split. Observed wallet prompts itemise the
  // pool fee differently per token — added on top for STRK, taken out of the
  // amount (converted) for USDC — so any net figure the app computes would be
  // wrong half the time. The wallet states the exact numbers before you
  // confirm; the UI's job is to make sure the fee is never a surprise.

  // What is actually tippable once the pool fee is set aside.
  const tippable = (() => {
    const bal = shieldedOf(STRK);
    if (bal === undefined) return null;
    const net = bal - POOL_FEE_STRK;
    return formatDisplay(net > 0n ? net : 0n, STRK.decimals);
  })();

  const st = (done: boolean, active: boolean): StepState =>
    done ? "done" : active ? "active" : "todo";

  return (
    <ol className="stepper">
      <Step
        n={1}
        label="SHIELD"
        state={st(shieldedNow, !shieldedNow)}
        value={
          balance !== undefined ? (
            <button
              className="step__link"
              type="button"
              onClick={() =>
                setShieldAmount(toInputAmount(balance, token.decimals))
              }
            >
              {formatDisplay(balance, token.decimals)} {token.symbol}
            </button>
          ) : (
            "—"
          )
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
          <Pills
            balance={balance}
            decimals={token.decimals}
            reserve={isStrk ? POOL_FEE_STRK : 0n}
            onPick={setShieldAmount}
          />
          <button
            className="btn btn--dark btn--act"
            type="button"
            disabled={props.disabled || props.pending}
            onClick={() => props.onShield(token, shieldAmount).catch(() => {})}
          >
            SHIELD
          </button>
        </div>
        <p className="step__hint">
          {needsApproval && (
            <span className="step__fee">
              NEEDS AN APPROVAL FIRST — TWO PROMPTS ·{" "}
            </span>
          )}
          {`PLUS A POOL FEE (~${POOL_FEE_LABEL} STRK, CONVERTED FOR OTHER TOKENS)`}
        </p>
      </Step>

      <Step
        n={2}
        label="PRIVATE BALANCE"
        state={st(props.shieldedBalances !== null, false)}
        value={
          <>
            {props.shieldedBalances
              ? `${formatDisplay(shieldedOf(token) ?? 0n, token.decimals)} ${token.symbol}`
              : "—"}{" "}
            <button
              className="step__link"
              type="button"
              disabled={props.disabled}
              onClick={() => props.onShowShielded([token]).catch(() => {})}
            >
              SHOW
            </button>
          </>
        }
      />

      <Step
        n={3}
        label="NOTE MATURITY"
        state={st(shieldedNow && !maturing, maturing)}
        value={
          maturing ? (
            <>
              {props.blocksRemaining} BLOCKS{" "}
              {eta !== null && <span className="step__eta">~{eta}s</span>}
            </>
          ) : shieldedNow ? (
            "READY"
          ) : (
            "—"
          )
        }
      />

      <Step
        n={4}
        label={
          <>
            PRIVATE SWAP <span className="step__arrow">▶</span> {STRK.symbol}
          </>
        }
        state={st(isStrk || swapped, !isStrk && shieldedNow && !swapped)}
        value={isStrk ? "NOT NEEDED" : swapped ? "SWAPPED" : undefined}
      >
        {!isStrk && (
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
            <Pills
              balance={shieldedOf(token)}
              decimals={token.decimals}
              onPick={setSwapAmount}
            />
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
        )}
      </Step>

      <Step
        n={5}
        label="TIP"
        state="active"
        value={
          <>
            {props.shieldedBalances
              ? `${formatDisplay(shieldedOf(STRK) ?? 0n, STRK.decimals)} STRK`
              : "—"}{" "}
            <button
              className="step__link"
              type="button"
              disabled={props.disabled}
              onClick={() => props.onShowShielded([STRK]).catch(() => {})}
            >
              SHOW
            </button>
          </>
        }
      >
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
          <Pills
            balance={shieldedOf(STRK)}
            decimals={STRK.decimals}
            reserve={POOL_FEE_STRK}
            onPick={setTipAmount}
          />
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
        <p className="step__hint">
          {tippable === null
            ? `EACH PRIVATE TIP ALSO PAYS A ${POOL_FEE_LABEL} STRK POOL FEE`
            : `MOST YOU CAN TIP: ${tippable} STRK — THE REST COVERS THE ${POOL_FEE_LABEL} STRK POOL FEE`}
        </p>
      </Step>
    </ol>
  );
}
