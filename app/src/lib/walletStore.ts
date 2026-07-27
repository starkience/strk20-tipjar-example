// One get-starknet v6 discovery store, shared by the connect modal
// (GetStarknetProvider in main.tsx) and the tip hook, so both see the same
// wallets. Created at module scope so discovery starts listening immediately —
// extensions can register after the page loads.
import { createStore } from "@starknet-io/get-starknet-discovery";

export const walletStore = createStore();

// Why the rescan below is necessary.
//
// createStore() discovers wallets three ways, and they are not equal:
//
//   - wallet-standard: event-based. The store both listens for `register-wallet`
//     AND dispatches `app-ready`, so wallets present at any time are found.
//   - EIP-6963 (MetaMask): also event-based. Robust.
//   - legacy injected `window.starknet*` globals: a ONE-SHOT synchronous scan of
//     window at store-creation time. No listener, no retry — the library instead
//     exposes `_refreshInjectedWallets()` to scan again.
//
// A wallet that only exposes a legacy injected global — and injects it a beat
// after this module runs — is therefore missed until something calls refresh.
// This module runs early (module scope), so that race is easy to lose: the
// connect modal then lists the wallet under "install" instead of "available",
// even though the extension is right there. MetaMask is unaffected because it
// uses EIP-6963 — which is exactly why it can appear while an installed
// legacy-injecting wallet does not.
//
// The fix is to rescan when a late global is most likely to have appeared:
// shortly after load (injection lag) and whenever the tab regains focus (the
// user just unlocked or enabled the extension). Rescanning is cheap and
// idempotent — the store dedupes by wallet name and only emits on a real
// change — so extra passes do no harm.

/** Rescan for legacy injected wallets, then keep rescanning on the triggers
 *  that surface a late-appearing one. Returns a cleanup function. */
export function watchForInjectedWallets(): () => void {
  const rescan = () => walletStore._refreshInjectedWallets();

  // Injection lag: a handful of passes over the first ~2s covers the common
  // case where the content script writes its global just after page load.
  const timers = [0, 150, 400, 900, 1800].map((ms) => setTimeout(rescan, ms));

  // The user may unlock or enable the extension after the page is already open;
  // both surface as the tab regaining focus.
  const onFocus = () => rescan();
  const onVisible = () => {
    if (document.visibilityState === "visible") rescan();
  };
  window.addEventListener("focus", onFocus);
  document.addEventListener("visibilitychange", onVisible);

  return () => {
    timers.forEach(clearTimeout);
    window.removeEventListener("focus", onFocus);
    document.removeEventListener("visibilitychange", onVisible);
  };
}
