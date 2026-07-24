// Spawns a pixel coin that spins and arcs from the tip button into the wallet,
// then makes the wallet "chomp". Uses the Web Animations API so no per-frame
// React state is needed; the coin element is created on <body> and removed when
// the flight finishes. Respects prefers-reduced-motion.

import { COIN_SVG } from "./pixelArt";

const reducedMotion = () =>
  typeof window !== "undefined" &&
  window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

export function launchCoinFlight(
  origin: HTMLElement | null,
  target: HTMLElement | null,
): void {
  if (!origin || !target) return;
  if (reducedMotion()) {
    chomp(target);
    return;
  }

  const o = origin.getBoundingClientRect();
  const t = target.getBoundingClientRect();
  const startX = o.left + o.width / 2;
  const startY = o.top + o.height / 2;
  const endX = t.left + t.width / 2;
  const endY = t.top + t.height / 2;
  const dx = endX - startX;
  const dy = endY - startY;
  // Rise well above both points before dropping into the wallet.
  const peak = Math.min(dy, 0) - 150;

  const coin = document.createElement("div");
  coin.className = "coin-flight";
  coin.style.left = `${startX}px`;
  coin.style.top = `${startY}px`;

  const spinner = document.createElement("div");
  spinner.className = "coin-flight__spin";
  spinner.innerHTML = COIN_SVG;
  coin.appendChild(spinner);
  document.body.appendChild(coin);

  const duration = 720;

  // Outer: parabolic arc from button to wallet, shrinking as it drops in.
  const flight = coin.animate(
    [
      { transform: "translate(-50%,-50%) translate(0px,0px) scale(1)", offset: 0 },
      {
        transform: `translate(-50%,-50%) translate(${dx * 0.5}px, ${peak}px) scale(1.15)`,
        offset: 0.5,
      },
      {
        transform: `translate(-50%,-50%) translate(${dx}px, ${dy}px) scale(0.35)`,
        offset: 1,
      },
    ],
    { duration, easing: "cubic-bezier(.45,0,.55,1)", fill: "forwards" },
  );

  // Inner: chunky coin flip — squash on X in discrete steps.
  spinner.animate(
    [
      { transform: "scaleX(1)" },
      { transform: "scaleX(0.12)" },
      { transform: "scaleX(1)" },
      { transform: "scaleX(0.12)" },
      { transform: "scaleX(1)" },
      { transform: "scaleX(0.12)" },
      { transform: "scaleX(1)" },
    ],
    { duration, easing: "steps(1, end)", iterations: 1 },
  );

  flight.onfinish = () => {
    coin.remove();
    chomp(target);
  };
  flight.oncancel = () => coin.remove();
}

function chomp(target: HTMLElement): void {
  target.animate(
    [
      { transform: "scale(1)" },
      { transform: "scale(1.3) rotate(-4deg)" },
      { transform: "scale(1)" },
    ],
    { duration: 240, easing: "steps(3, end)" },
  );
}
