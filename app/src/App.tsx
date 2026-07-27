import { useRef, useState } from "react";
import { useTipJar } from "./hooks/useTipJar";
import { ModeToggle } from "./components/ModeToggle";
import { FlowDiagram } from "./components/FlowDiagram";
import { TipForm } from "./components/TipForm";
import { TipWall } from "./components/TipWall";
import { TxLog } from "./components/TxLog";
import { COIN_SVG } from "./lib/pixelArt";
import { playCoinSound } from "./lib/coinSound";
import { launchCoinFlight } from "./lib/coinFlight";
import "./App.css";

export default function App() {
  const jar = useTipJar();
  const tipButtonRef = useRef<HTMLButtonElement>(null);
  const creatorRef = useRef<HTMLDivElement>(null);
  const [showLog, setShowLog] = useState(true);
  const [mode, setMode] = useState<"public" | "private">("public");

  // Fall back to public if the connected wallet can't do STRK20.
  const isPrivate = mode === "private" && jar.privacySupported;

  // Send via the selected path, then fire the retro feedback — but only once the
  // tx is confirmed on-chain (both send fns resolve after confirmation and throw
  // on failure, so the coin never flips for a rejected or reverted tip).
  const handleSubmit = async (amount: string) => {
    const result = isPrivate
      ? await jar.sendPrivateTip(amount)
      : await jar.sendTip(amount);
    if (!result) return result; // guarded no-op (already in flight)
    playCoinSound();
    launchCoinFlight(tipButtonRef.current, creatorRef.current);
    return result;
  };

  const shortAddr = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

  return (
    <div className="screen">
      <div className="layout">
        <main className="cabinet">
          <header className="cabinet__top">
            <div className="brand">
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
              <button className="btn btn--connect" onClick={jar.connectWallet}>
                {jar.address ? shortAddr(jar.address) : "CONNECT"}
              </button>
            </div>
          </header>

          {jar.wallets.length > 0 && !jar.address && (
            <div className="wallet-picker">
              {jar.wallets.map((w) => (
                <button
                  key={w.name}
                  className="btn btn--connect"
                  onClick={() => jar.selectWallet(w)}
                >
                  {w.name}
                </button>
              ))}
            </div>
          )}

          <ModeToggle
            mode={mode}
            onChange={setMode}
            privateEnabled={jar.privacySupported}
          />

          <FlowDiagram isPrivate={isPrivate} ref={creatorRef} />

          <TipForm
            disabled={!jar.address}
            pending={jar.txPending}
            isPrivate={isPrivate}
            onSubmit={handleSubmit}
            buttonRef={tipButtonRef}
          />

          {jar.address && !jar.privacySupported && (
            <p className="note">PRIVATE NEEDS A READY WALLET</p>
          )}
          {jar.error && <p className="error">✖ {jar.error}</p>}

          <TipWall total={jar.total} count={jar.count} />
        </main>

        {showLog && <TxLog tips={jar.tips} onClose={() => setShowLog(false)} />}
      </div>
    </div>
  );
}
