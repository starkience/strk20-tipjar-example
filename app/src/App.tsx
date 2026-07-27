import { useEffect, useMemo, useRef, useState } from "react";
import { WalletConnectModal, useConnect } from "@starknet-io/get-starknet-ui";
import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { useTipJar } from "./hooks/useTipJar";
import { ModeToggle } from "./components/ModeToggle";
import { Stepper } from "./components/Stepper";
import { TipForm } from "./components/TipForm";
import { TipWall } from "./components/TipWall";
import { TxLog, type LogEntry } from "./components/TxLog";
import { COIN_SVG } from "./lib/pixelArt";
import { formatStrk } from "./lib/tipjar";
import type { Token } from "./config";
import { playCoinSound } from "./lib/coinSound";
import { launchCoinFlight } from "./lib/coinFlight";
import "./App.css";

export default function App() {
  const jar = useTipJar();
  const { connected } = useConnect();
  const tipButtonRef = useRef<HTMLButtonElement>(null);
  const coinTargetRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const [showLog, setShowLog] = useState(true);
  const [mode, setMode] = useState<"public" | "private">("public");
  // Transactions made in this session, newest first — the log fills as the
  // stepper advances.
  const [session, setSession] = useState<LogEntry[]>([]);

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

  const log = (kind: string, hash: string, detail?: string) =>
    setSession((s) => [{ kind, hash, time: Date.now(), detail }, ...s]);

  const celebrate = () => {
    playCoinSound();
    launchCoinFlight(tipButtonRef.current, coinTargetRef.current);
  };

  const handlePublicTip = async (amount: string) => {
    const hash = await jar.sendTip(amount);
    if (!hash) return hash;
    log("PUBLIC TIP", hash, `${amount} STRK`);
    celebrate();
    return hash;
  };

  const handleShield = async (token: Token, amount: string) => {
    const hash = await jar.shield(token, amount);
    if (!hash) return hash;
    log("SHIELD", hash, `${amount} ${token.symbol}`);
    return hash;
  };

  const handleSwap = async (token: Token, amount: string) => {
    const hash = await jar.privateSwapToStrk(token, amount);
    if (!hash) return hash;
    log("PRIVATE SWAP", hash, `${amount} ${token.symbol} → STRK`);
    return hash;
  };

  const handlePrivateTip = async (amount: string) => {
    const hash = await jar.sendPrivateTip(amount);
    if (!hash) return hash;
    log("PRIVATE TIP", hash, `${amount} STRK`);
    celebrate();
    return hash;
  };

  // Session transactions first, then public tips already on-chain.
  const entries = useMemo<LogEntry[]>(
    () => [
      ...session,
      ...jar.tips.map((t) => ({
        kind: "PUBLIC TIP",
        hash: t.txHash,
        time: t.timestamp * 1000,
        detail: `${formatStrk(t.amount)} STRK`,
      })),
    ],
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
                onShield={handleShield}
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
            {jar.error && <p className="error">{jar.error}</p>}
            <TipWall total={jar.total} count={jar.count} />
          </div>
        </main>

        {showLog && <TxLog entries={entries} onClose={() => setShowLog(false)} />}
      </div>
    </div>
  );
}
