// FlowDiagram — shows what the selected mode actually does on-chain.
//
//   PUBLIC   YOU ──tip──▶ JAR ──▶ CREATOR              (all visible, 1 tx)
//   PRIVATE  YOU ··shield··▶ POOL ──send──▶ CREATOR     (two SEPARATE txs)
//
// This is the app's main teaching surface. The private path is deliberately
// DECOUPLED: shielding happens in its own earlier transaction (drawn dashed),
// so the tip itself carries no public leg linking it to the tipper. Bundling
// them would let an observer correlate the deposit with the transfer.
// The forwarded ref marks the CREATOR node — the coin-flight animation target.
import { forwardRef } from "react";
import { COIN_SVG, JAR_SVG, VAULT_SVG, WALLET_SVG } from "../lib/pixelArt";

export const FlowDiagram = forwardRef<HTMLDivElement, { isPrivate: boolean }>(
  function FlowDiagram({ isPrivate }, creatorRef) {
    return (
      <div className={`flow ${isPrivate ? "flow--private" : ""}`}>
        <div className="flow__node">
          <span
            className="flow__sprite"
            aria-hidden
            dangerouslySetInnerHTML={{ __html: COIN_SVG }}
          />
          <span className="flow__label">YOU</span>
        </div>

        <div className="flow__arrow">
          <span className="flow__step">{isPrivate ? "SHIELD ⏱" : "TIP"}</span>
          <span className="flow__line" aria-hidden>
            {isPrivate ? "··▶" : "──▶"}
          </span>
        </div>

        <div className="flow__node">
          <span
            className="flow__sprite"
            aria-hidden
            dangerouslySetInnerHTML={{ __html: isPrivate ? VAULT_SVG : JAR_SVG }}
          />
          <span className="flow__label">{isPrivate ? "POOL" : "JAR"}</span>
        </div>

        <div className="flow__arrow">
          <span className="flow__step">{isPrivate ? "SEND" : ""}</span>
          <span className="flow__line" aria-hidden>
            ──▶
          </span>
        </div>

        <div className="flow__node" ref={creatorRef}>
          <span
            className="flow__sprite"
            aria-hidden
            dangerouslySetInnerHTML={{ __html: WALLET_SVG }}
          />
          <span className="flow__label">CREATOR</span>
        </div>

        <p className="flow__caption">
          {isPrivate
            ? "SHIELD EARLIER (⏱ SEPARATE TX) · THE TIP LEAKS NOTHING"
            : "1 TX · SENDER & AMOUNT PUBLIC"}
        </p>
      </div>
    );
  },
);
