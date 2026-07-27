import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { GetStarknetProvider } from "@starknet-io/get-starknet-ui";
import gsap from "gsap";
import { walletStore } from "./lib/walletStore";
import "./index.css";
import App from "./App.tsx";

// Respect the OS "reduce motion" setting: make every GSAP tween instant.
if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
  gsap.globalTimeline.timeScale(1000);
}

// GetStarknetProvider powers the standard get-starknet wallet-connect modal
// (rendered by <WalletConnectModal/> in the header). It shares our discovery
// store so the modal and the tip hook see the same wallets.
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <GetStarknetProvider store={walletStore}>
      <App />
    </GetStarknetProvider>
  </StrictMode>,
);
