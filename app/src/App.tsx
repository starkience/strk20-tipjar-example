import { useTipJar } from "./hooks/useTipJar";
import { TipForm } from "./components/TipForm";
import { TipWall } from "./components/TipWall";
import "./App.css";

export default function App() {
  const jar = useTipJar();
  return (
    <main>
      <header>
        <h1>☕ Tip Jar</h1>
        <button onClick={jar.connectWallet}>
          {jar.address
            ? `${jar.address.slice(0, 6)}…${jar.address.slice(-4)}`
            : "Connect wallet"}
        </button>
      </header>
      <p className="tagline">
        Every tip is public: who, how much, and when — visible to anyone.
      </p>
      <TipForm
        disabled={!jar.address}
        pending={jar.txPending}
        onTip={jar.sendTip}
      />
      {jar.error && <p className="error">{jar.error}</p>}
      <TipWall tips={jar.tips} total={jar.total} count={jar.count} />
    </main>
  );
}
