import { useEffect, useRef, useState } from "react";
import { WalletConnectModal, useConnect } from "@starknet-io/get-starknet-ui";
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
  // Wallet discovery + selection is handled by the standard get-starknet modal;
  // we just react to which wallet it connected.
  const { connected } = useConnect();
  const tipButtonRef = useRef<HTMLButtonElement>(null);
  const creatorRef = useRef<HTMLDivElement>(null);
  const [showLog, setShowLog] = useState(true);
  const [mode, setMode] = useState<"public" | "private">("public");

  const { selectWallet, clearWallet } = jar;
  useEffect(() => {
    if (connected) void selectWallet(connected);
    else clearWallet();
  }, [connected, selectWallet, clearWallet]);

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
              {/* Stock get-starknet connect button + popup, exactly as
                  documented — no styling overrides. */}
              <WalletConnectModal />
            </div>
          </header>

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
