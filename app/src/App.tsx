import { useEffect, useMemo, useRef, useState } from "react";
import { WalletConnectModal, useConnect } from "@starknet-io/get-starknet-ui";
import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { useTipJar } from "./hooks/useTipJar";
import { ModeToggle } from "./components/ModeToggle";
import { Stepper } from "./components/Stepper";
import { TipForm } from "./components/TipForm";
import { TipWall } from "./components/TipWall";
import { TxLog } from "./components/TxLog";
import {
  loadSession,
  mergeLog,
  saveSession,
  upsertTx,
  type LogEntry,
} from "./lib/txlog";
import { COIN_SVG } from "./lib/pixelArt";
import { formatDisplay } from "./lib/tipjar";
import type { Token } from "./config";
import { playCoinSound } from "./lib/coinSound";
import { launchCoinFlight } from "./lib/coinFlight";
import "./App.css";

export default function App() {
  const [session, setSession] = useState<LogEntry[]>([]);
  // Log the moment a transaction is submitted, so the panel fills immediately
  // rather than after confirmation.
  const jar = useTipJar({
    // Create-or-patch a session row by id. The row is created at submit time
    // (pending, no hash) and patched with its hash and final status as those
    // arrive — so a transaction is visible even if its hash never comes back.
    onLog: (patch) => setSession((s) => upsertTx(s, { session: true, ...patch })),
  });
  const { connected } = useConnect();

  // Persist the log so it survives a reload. The panel is the ONLY record of a
  // private transaction (no contract, no event), so without this every shield,
  // swap and private tip vanished on refresh — the "my transactions aren't
  // reflected" report. Rows are scoped to the connected address: rehydrate that
  // address's rows on connect, and save on every change. On disconnect we clear
  // the view but DON'T wipe storage, so reconnecting restores the history.
  const jarAddress = jar.address;
  useEffect(() => {
    setSession(jarAddress ? loadSession(jarAddress) : []);
  }, [jarAddress]);
  useEffect(() => {
    if (jarAddress) saveSession(jarAddress, session);
  }, [jarAddress, session]);

  const tipButtonRef = useRef<HTMLButtonElement>(null);
  const coinTargetRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const [showLog, setShowLog] = useState(true);
  const [mode, setMode] = useState<"public" | "private">("public");
  // Proving a private transaction takes a while. Offering CANCEL immediately
  // invites people to kill a request that is working — and cancelling cannot
  // stop it, so the transaction lands while the app shows nothing. Hold the
  // button back until waiting is genuinely unusual.
  const [canCancel, setCanCancel] = useState(false);
  useEffect(() => {
    if (!jar.txPending) {
      setCanCancel(false);
      return;
    }
    const id = setTimeout(() => setCanCancel(true), 45_000);
    return () => clearTimeout(id);
  }, [jar.txPending]);
  const { selectWallet, clearWallet } = jar;
  useEffect(() => {
    if (connected) void selectWallet(connected);
    else clearWallet();
  }, [connected, selectWallet, clearWallet]);

  const isPrivate = mode === "private" && jar.privacySupported;

  // Stepped easing keeps the motion in the 8-bit register — no smooth glides.
  useGSAP(
    () => {
      gsap.fromTo(
        stageRef.current,
        { autoAlpha: 0, y: 6 },
        { autoAlpha: 1, y: 0, duration: 0.22, ease: "steps(4)" },
      );
      gsap.from(".step, .tip-form", {
        autoAlpha: 0,
        x: -8,
        duration: 0.2,
        stagger: 0.045,
        ease: "steps(3)",
        clearProps: "all",
      });
    },
    { dependencies: [isPrivate], scope: stageRef },
  );

  const celebrate = () => {
    playCoinSound();
    launchCoinFlight(tipButtonRef.current, coinTargetRef.current);
  };

  const handlePublicTip = async (amount: string) => {
    const hash = await jar.sendTip(amount);
    if (!hash) return hash;
    celebrate();
    return hash;
  };

  const handleShield = async (token: Token, amount: string) => {
    const hash = await jar.shield(token, amount);
    if (!hash) return hash;
    return hash;
  };

  const handleSwap = async (token: Token, amount: string) => {
    const hash = await jar.privateSwapToStrk(token, amount);
    if (!hash) return hash;
    return hash;
  };

  const handlePrivateTip = async (amount: string) => {
    const hash = await jar.sendPrivateTip(amount);
    if (!hash) return hash;
    celebrate();
    return hash;
  };

  // Session transactions first, then public tips already on-chain. mergeLog
  // dedupes by hash: a public tip made this session is in both lists, and two
  // rows with the same key render unreliably (see lib/txlog.ts).
  const entries = useMemo<LogEntry[]>(
    () =>
      mergeLog(
        session,
        jar.tips.map((t) => ({
          kind: "PUBLIC TIP",
          hash: t.txHash,
          time: t.timestamp * 1000,
          detail: `${formatDisplay(t.amount, 18)} STRK`,
        })),
      ),
    [session, jar.tips],
  );

  return (
    <div className="screen">
      <div className="layout">
        <main className="cabinet">
          <header className="cabinet__top">
            <div className="brand" ref={coinTargetRef}>
              <span
                className="brand__coin"
                aria-hidden
                dangerouslySetInnerHTML={{ __html: COIN_SVG }}
              />
              <h1 className="brand__title">TIP&nbsp;JAR</h1>
            </div>
            <div className="header-actions">
              <button
                className="btn btn--log"
                onClick={() => setShowLog((v) => !v)}
              >
                {showLog ? "HIDE" : "LOG"}
              </button>
              <WalletConnectModal />
            </div>
          </header>

          <ModeToggle
            mode={mode}
            onChange={setMode}
            privateEnabled={jar.privacySupported}
          />

          {/* Fixed-height stage so PUBLIC and PRIVATE occupy the same space and
              nothing below shifts when the mode changes. */}
          <div className="stage" ref={stageRef}>
            {isPrivate ? (
              <Stepper
                disabled={!jar.address}
                pending={jar.txPending}
                blocksRemaining={jar.blocksRemaining}
                publicBalances={jar.publicBalances}
                approved={jar.approved}
                onCheckApproval={jar.checkApproval}
                shieldedBalances={jar.shieldedBalances}
                tokens={jar.tokens}
                onShield={handleShield}
                onShowShielded={jar.readShieldedBalances}
                onSwap={handleSwap}
                onTip={handlePrivateTip}
                tipButtonRef={tipButtonRef}
              />
            ) : (
              <TipForm
                disabled={!jar.address}
                pending={jar.txPending}
                isPrivate={false}
                onSubmit={handlePublicTip}
                buttonRef={tipButtonRef}
              />
            )}
          </div>

          <div className="cabinet__foot">
            {/* Reserved slot: always occupies the same height, so a status
                message never overlaps the scoreboard or resizes the frame. */}
            <div className="status">
              {jar.txPending ? (
                <div className="status__bar status__bar--pending">
                  <span>
                    WORKING… PROVING A PRIVATE TX CAN TAKE A MINUTE — KEEP THIS
                    TAB OPEN
                  </span>
                  {canCancel && (
                    <button
                      className="status__action"
                      onClick={jar.cancelPending}
                    >
                      STOP WAITING
                    </button>
                  )}
                </div>
              ) : jar.error ? (
                <button
                  className="status__bar status__bar--error"
                  onClick={jar.dismissError}
                  title="Dismiss"
                >
                  {jar.error}
                </button>
              ) : (
                /* Idle. This is a public demo jar, so say plainly where the
                   money goes — a learner's first tip should not silently pay
                   the author. Lives in the reserved slot, so it costs no
                   layout and can never introduce a scrollbar. */
                <div className="status__bar status__bar--note">
                  <span>
                    DEMO JAR — TIPS GO TO THE DEMO CREATOR · DEPLOY YOUR OWN TO
                    REDIRECT
                  </span>
                </div>
              )}
            </div>
            <TipWall total={jar.total} count={jar.count} />
          </div>
        </main>

        {showLog && <TxLog entries={entries} onClose={() => setShowLog(false)} />}
      </div>
    </div>
  );
}
