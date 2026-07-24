import { useRef } from "react";
import { useTipJar } from "./hooks/useTipJar";
import { TipForm } from "./components/TipForm";
import { TipWall } from "./components/TipWall";
import { COIN_SVG, WALLET_SVG } from "./lib/pixelArt";
import { playCoinSound } from "./lib/coinSound";
import { launchCoinFlight } from "./lib/coinFlight";
import "./App.css";

export default function App() {
  const jar = useTipJar();
  const tipButtonRef = useRef<HTMLButtonElement>(null);
  const walletRef = useRef<HTMLDivElement>(null);

  // Fire the retro feedback the instant the player commits a tip: coin blip +
  // a pixel coin that flips up into the wallet. The on-chain tx runs after.
  const handleTip = (amount: string) => {
    playCoinSound();
    launchCoinFlight(tipButtonRef.current, walletRef.current);
    return jar.sendTip(amount);
  };

  const shortAddr = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

  return (
    <div className="screen">
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
          <button className="btn btn--connect" onClick={jar.connectWallet}>
            {jar.address ? shortAddr(jar.address) : "CONNECT"}
          </button>
        </header>

        <p className="marquee" aria-hidden>
          ★ INSERT COIN ★ EVERY TIP IS PUBLIC ★ WHO · HOW MUCH · WHEN ★ VISIBLE
          TO ANYONE ★
        </p>

        <div className="collector">
          <div
            className="collector__wallet"
            ref={walletRef}
            aria-hidden
            dangerouslySetInnerHTML={{ __html: WALLET_SVG }}
          />
          <p className="collector__caption">DROP A COIN IN THE CREATOR'S WALLET</p>
        </div>

        <TipForm
          disabled={!jar.address}
          pending={jar.txPending}
          onTip={handleTip}
          buttonRef={tipButtonRef}
        />

        {!jar.address && (
          <p className="hint">▲ CONNECT A WALLET TO PLAY</p>
        )}
        {jar.error && <p className="error">✖ {jar.error}</p>}

        <TipWall tips={jar.tips} total={jar.total} count={jar.count} />
      </main>
      <p className="footer-credit">PUBLIC EDITION · POWERED BY STARKNET</p>
    </div>
  );
}
