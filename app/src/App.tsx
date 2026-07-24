import { useRef, useState } from "react";
import { useTipJar } from "./hooks/useTipJar";
import { TipForm } from "./components/TipForm";
import { TipWall } from "./components/TipWall";
import { TxLog } from "./components/TxLog";
import { COIN_SVG, WALLET_SVG } from "./lib/pixelArt";
import { playCoinSound } from "./lib/coinSound";
import { launchCoinFlight } from "./lib/coinFlight";
import "./App.css";

export default function App() {
  const jar = useTipJar();
  const tipButtonRef = useRef<HTMLButtonElement>(null);
  const walletRef = useRef<HTMLDivElement>(null);
  const [showLog, setShowLog] = useState(true);

  // Fire the retro feedback only once the tip is actually executed on-chain:
  // the send resolves after the tx is confirmed. On failure it throws, so the
  // coin never flips for a rejected or reverted tip. Both paths launch the coin
  // from the single tip button.
  const handleTip = async (amount: string) => {
    const result = await jar.sendTip(amount);
    playCoinSound();
    launchCoinFlight(tipButtonRef.current, walletRef.current);
    return result;
  };

  const handlePrivateTip = async (amount: string) => {
    const result = await jar.sendPrivateTip(amount);
    playCoinSound();
    launchCoinFlight(tipButtonRef.current, walletRef.current);
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
                {showLog ? "HIDE LOG" : "TX LOG"}
              </button>
              <button className="btn btn--connect" onClick={jar.connectWallet}>
                {jar.address ? shortAddr(jar.address) : "CONNECT"}
              </button>
            </div>
          </header>

          {jar.wallets.length > 0 && !jar.address && (
            <div className="wallet-picker">
              <span className="wallet-picker__label">▸ CHOOSE A WALLET</span>
              <div className="wallet-picker__list">
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
            </div>
          )}

          <p className="marquee" aria-hidden>
            ★ INSERT COIN ★ PUBLIC TIPS ARE VISIBLE TO ANYONE ★ TIP PRIVATELY TO
            HIDE WHO &amp; HOW MUCH ★ POWERED BY STRK20 ★
          </p>

          <div className="collector">
            <div
              className="collector__wallet"
              ref={walletRef}
              aria-hidden
              dangerouslySetInnerHTML={{ __html: WALLET_SVG }}
            />
            <p className="collector__caption">
              DROP A COIN IN THE CREATOR'S WALLET
            </p>
          </div>

          <TipForm
            disabled={!jar.address}
            pending={jar.txPending}
            onTip={handleTip}
            onPrivateTip={handlePrivateTip}
            privateEnabled={jar.privacySupported}
            buttonRef={tipButtonRef}
          />

          {!jar.address && <p className="hint">▲ CONNECT A WALLET TO PLAY</p>}
          {jar.address && jar.privacySupported && (
            <p className="hint hint--ok">🔒 PRIVATE TIPPING AVAILABLE</p>
          )}
          {jar.address && !jar.privacySupported && (
            <p className="hint">🔓 PUBLIC ONLY — USE READY FOR PRIVATE</p>
          )}
          {jar.error && <p className="error">✖ {jar.error}</p>}

          <TipWall total={jar.total} count={jar.count} />
        </main>

        {showLog && (
          <TxLog tips={jar.tips} onClose={() => setShowLog(false)} />
        )}
      </div>
      <p className="footer-credit">
        STRK20 PRIVACY DEMO · PUBLIC + PRIVATE TIPS · POWERED BY STARKNET
      </p>
    </div>
  );
}
